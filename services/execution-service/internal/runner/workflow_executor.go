package runner

import (
	"context"
	"fmt"
	"net/http"
	"sync"
	"sync/atomic"
	"time"

	natsgo "github.com/nats-io/nats.go"
	"go.uber.org/zap"

	natsclient "github.com/endpointr/execution-service/internal/nats"
)

// WorkflowExecutor runs a React-Flow DAG with concurrent branch execution.
type WorkflowExecutor struct {
	nc  *natsgo.Conn
	log *zap.Logger
	hc  *http.Client
}

func NewWorkflowExecutor(nc *natsgo.Conn, log *zap.Logger) *WorkflowExecutor {
	return &WorkflowExecutor{
		nc:  nc,
		log: log,
		hc: &http.Client{
			Timeout: 30 * time.Second,
			Transport: &http.Transport{
				MaxIdleConns:        5000,
				MaxIdleConnsPerHost: 1000,
				IdleConnTimeout:     90 * time.Second,
				DisableKeepAlives:   false,
				ForceAttemptHTTP2:   true,
			},
		},
	}
}

type nodeResult struct {
	NodeID     string         `json:"node_id"`
	Status     string         `json:"status"` // passed | failed | skipped
	StatusCode int            `json:"status_code,omitempty"`
	DurationMs int64          `json:"duration_ms"`
	Assertions []assertResult `json:"assertions"`
	Error      string         `json:"error,omitempty"`
}

type assertResult struct {
	Type   string `json:"type"`
	Passed bool   `json:"passed"`
	Detail string `json:"detail,omitempty"`
}

// runResultEvent is published to results.run.completed.
type runResultEvent struct {
	RunID       string       `json:"run_id"`
	WorkflowID  string       `json:"workflow_id"`
	ProjectID   string       `json:"project_id"`
	Status      string       `json:"status"`
	StartedAt   time.Time    `json:"started_at"`
	FinishedAt  time.Time    `json:"finished_at"`
	NodeResults []nodeResult `json:"node_results"`
	TotalNodes  int          `json:"total_nodes"`
	PassedNodes int          `json:"passed_nodes"`
	FailedNodes int          `json:"failed_nodes"`
}

// node is an internal representation of a React-Flow node.
type node struct {
	ID   string
	Type string // "request" | "condition" | "delay"
	Data map[string]any
}

func (e *WorkflowExecutor) Execute(p WorkflowRunPayload) {
	startedAt := time.Now()

	// Publish "running" status update first
	_ = natsclient.Publish(e.nc, "results.run.status", map[string]any{
		"run_id": p.RunID, "status": "running", "started_at": startedAt,
	})

	nodeMap, inDegree, graph := parseDAG(p.Definition)
	totalNodes := len(nodeMap)
	if totalNodes == 0 {
		e.finishRun(p, startedAt, nil, 0, 0, "passed")
		return
	}

	var (
		mu          sync.Mutex
		nodeResults = make([]nodeResult, 0, totalNodes)
		passed      int32
		failed      int32
		wg          sync.WaitGroup
	)

	readyCh := make(chan string, totalNodes)

	// Identify root nodes (in-degree == 0)
	for id, deg := range inDegree {
		if deg == 0 {
			readyCh <- id
		}
	}

	ctx := context.Background()

	var processNode func(nodeID string)
	processNode = func(nodeID string) {
		defer wg.Done()

		n, exists := nodeMap[nodeID]
		if !exists {
			return
		}

		result := e.executeNode(ctx, n)

		mu.Lock()
		nodeResults = append(nodeResults, result)
		mu.Unlock()

		if result.Status == "passed" {
			atomic.AddInt32(&passed, 1)
		} else if result.Status == "failed" {
			atomic.AddInt32(&failed, 1)
		}

		// Stream per-node live metric update
		_ = natsclient.Publish(e.nc, "results.metric", map[string]any{
			"run_id":      p.RunID,
			"node_id":     result.NodeID,
			"status":      result.Status,
			"duration_ms": result.DurationMs,
		})

		// Decrement in-degree for downstream children and trigger ready nodes concurrently
		mu.Lock()
		children := graph[nodeID]
		for _, childID := range children {
			inDegree[childID]--
			if inDegree[childID] == 0 {
				wg.Add(1)
				go processNode(childID)
			}
		}
		mu.Unlock()
	}

	// Dispatch root nodes concurrently
	for len(readyCh) > 0 {
		rootID := <-readyCh
		wg.Add(1)
		go processNode(rootID)
	}

	wg.Wait()

	finalStatus := "passed"
	fCount := atomic.LoadInt32(&failed)
	pCount := atomic.LoadInt32(&passed)

	if fCount > 0 && pCount == 0 {
		finalStatus = "failed"
	} else if fCount > 0 {
		finalStatus = "partial"
	}

	e.finishRun(p, startedAt, nodeResults, int(pCount), int(fCount), finalStatus)
}

func (e *WorkflowExecutor) finishRun(p WorkflowRunPayload, startedAt time.Time, results []nodeResult, passed, failed int, finalStatus string) {
	event := runResultEvent{
		RunID:       p.RunID,
		WorkflowID:  p.WorkflowID,
		ProjectID:   p.ProjectID,
		Status:      finalStatus,
		StartedAt:   startedAt,
		FinishedAt:  time.Now(),
		NodeResults: results,
		TotalNodes:  len(results),
		PassedNodes: passed,
		FailedNodes: failed,
	}

	if err := natsclient.Publish(e.nc, "results.run.completed", event); err != nil {
		e.log.Error("Failed to publish run result", zap.String("run_id", p.RunID), zap.Error(err))
	}

	e.log.Info("Workflow run complete (parallel DAG execution)",
		zap.String("run_id", p.RunID),
		zap.String("status", finalStatus),
		zap.Int("passed", passed),
		zap.Int("failed", failed),
	)
}

func parseDAG(definition map[string]any) (map[string]node, map[string]int, map[string][]string) {
	nodeMap := make(map[string]node)
	inDegree := make(map[string]int)
	graph := make(map[string][]string)

	rawNodes, _ := definition["nodes"].([]any)
	for _, rn := range rawNodes {
		m, ok := rn.(map[string]any)
		if !ok {
			continue
		}
		id, _ := m["id"].(string)
		nodeType, _ := m["type"].(string)
		data, _ := m["data"].(map[string]any)
		if id != "" {
			nodeMap[id] = node{ID: id, Type: nodeType, Data: data}
			inDegree[id] = 0
		}
	}

	rawEdges, _ := definition["edges"].([]any)
	for _, re := range rawEdges {
		m, ok := re.(map[string]any)
		if !ok {
			continue
		}
		src, _ := m["source"].(string)
		target, _ := m["target"].(string)
		if src != "" && target != "" {
			graph[src] = append(graph[src], target)
			inDegree[target]++
		}
	}

	return nodeMap, inDegree, graph
}

func (e *WorkflowExecutor) executeNode(ctx context.Context, n node) nodeResult {
	switch n.Type {
	case "request":
		return e.executeRequestNode(ctx, n)
	case "delay":
		ms, _ := n.Data["delay_ms"].(float64)
		time.Sleep(time.Duration(ms) * time.Millisecond)
		return nodeResult{NodeID: n.ID, Status: "passed", DurationMs: int64(ms)}
	default:
		return nodeResult{NodeID: n.ID, Status: "skipped"}
	}
}

func (e *WorkflowExecutor) executeRequestNode(ctx context.Context, n node) nodeResult {
	url, _ := n.Data["url"].(string)
	method, _ := n.Data["method"].(string)
	if method == "" {
		method = "GET"
	}
	expectedStatus, _ := n.Data["expected_status"].(float64)

	if url == "" {
		return nodeResult{NodeID: n.ID, Status: "failed", Error: "no URL configured"}
	}

	req, err := http.NewRequestWithContext(ctx, method, url, nil)
	if err != nil {
		return nodeResult{NodeID: n.ID, Status: "failed", Error: fmt.Sprintf("bad request: %s", err)}
	}

	start := time.Now()
	resp, err := e.hc.Do(req)
	durationMs := time.Since(start).Milliseconds()

	if err != nil {
		return nodeResult{NodeID: n.ID, Status: "failed", DurationMs: durationMs, Error: err.Error()}
	}
	defer resp.Body.Close()

	assertions := []assertResult{}
	allPassed := true

	if expectedStatus > 0 {
		passed := resp.StatusCode == int(expectedStatus)
		if !passed {
			allPassed = false
		}
		assertions = append(assertions, assertResult{
			Type:   "status_code",
			Passed: passed,
			Detail: fmt.Sprintf("expected %d got %d", int(expectedStatus), resp.StatusCode),
		})
	}

	status := "passed"
	if !allPassed {
		status = "failed"
	}

	return nodeResult{
		NodeID:     n.ID,
		Status:     status,
		StatusCode: resp.StatusCode,
		DurationMs: durationMs,
		Assertions: assertions,
	}
}
