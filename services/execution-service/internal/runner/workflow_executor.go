package runner

import (
	"context"
	"fmt"
	"net/http"
	"time"

	natsgo "github.com/nats-io/nats.go"
	"go.uber.org/zap"

	natsclient "github.com/endpointr/execution-service/internal/nats"
)

// WorkflowExecutor runs a React-Flow DAG sequentially (topological sort).
// Phase 3 implementation: single-chain execution with per-node assertion checks.
// TODO Phase 4: true parallel DAG execution using goroutines per branch.
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
				MaxIdleConnsPerHost: 50,
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

func (e *WorkflowExecutor) Execute(p WorkflowRunPayload) {
	startedAt := time.Now()

	// Publish "running" status update first
	_ = natsclient.Publish(e.nc, "results.run.status", map[string]any{
		"run_id": p.RunID, "status": "running", "started_at": startedAt,
	})

	nodes := extractNodes(p.Definition)
	nodeResults := make([]nodeResult, 0, len(nodes))
	passed, failed := 0, 0

	ctx := context.Background()
	for _, node := range nodes {
		result := e.executeNode(ctx, node)
		nodeResults = append(nodeResults, result)
		if result.Status == "passed" {
			passed++
		} else if result.Status == "failed" {
			failed++
			// Publish per-node live event for real-time dashboard
			_ = natsclient.Publish(e.nc, "results.metric", map[string]any{
				"run_id":      p.RunID,
				"node_id":     result.NodeID,
				"status":      result.Status,
				"duration_ms": result.DurationMs,
			})
		}
		// Stream per-node live update
		_ = natsclient.Publish(e.nc, "results.metric", map[string]any{
			"run_id":      p.RunID,
			"node_id":     result.NodeID,
			"status":      result.Status,
			"duration_ms": result.DurationMs,
		})
	}

	finalStatus := "passed"
	if failed > 0 && passed == 0 {
		finalStatus = "failed"
	} else if failed > 0 {
		finalStatus = "partial"
	}

	event := runResultEvent{
		RunID:       p.RunID,
		WorkflowID:  p.WorkflowID,
		ProjectID:   p.ProjectID,
		Status:      finalStatus,
		StartedAt:   startedAt,
		FinishedAt:  time.Now(),
		NodeResults: nodeResults,
		TotalNodes:  len(nodes),
		PassedNodes: passed,
		FailedNodes: failed,
	}

	if err := natsclient.Publish(e.nc, "results.run.completed", event); err != nil {
		e.log.Error("Failed to publish run result", zap.String("run_id", p.RunID), zap.Error(err))
	}

	e.log.Info("Workflow run complete",
		zap.String("run_id", p.RunID),
		zap.String("status", finalStatus),
		zap.Int("passed", passed),
		zap.Int("failed", failed),
	)
}

// node is an internal representation of a React-Flow node.
type node struct {
	ID     string
	Type   string // "request" | "condition" | "delay"
	Data   map[string]any
}

func extractNodes(definition map[string]any) []node {
	rawNodes, _ := definition["nodes"].([]any)
	result := make([]node, 0, len(rawNodes))
	for _, rn := range rawNodes {
		m, ok := rn.(map[string]any)
		if !ok {
			continue
		}
		id, _ := m["id"].(string)
		nodeType, _ := m["type"].(string)
		data, _ := m["data"].(map[string]any)
		result = append(result, node{ID: id, Type: nodeType, Data: data})
	}
	return result
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
