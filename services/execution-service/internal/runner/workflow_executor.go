package runner

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	natsgo "github.com/nats-io/nats.go"
	"go.uber.org/zap"

	natsclient "github.com/endpointr/execution-service/internal/nats"
)

type WorkflowExecutor struct {
	nc              *natsgo.Conn
	log             *zap.Logger
	hc              *http.Client
	controlPlaneURL string
}

func NewWorkflowExecutor(nc *natsgo.Conn, log *zap.Logger, controlPlaneURL string) *WorkflowExecutor {
	return &WorkflowExecutor{
		nc:              nc,
		log:             log,
		controlPlaneURL: controlPlaneURL,
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
	NodeID          string            `json:"node_id"`
	Status          string            `json:"status"` // passed | failed | skipped
	StatusCode      int               `json:"status_code,omitempty"`
	DurationMs      int64             `json:"duration_ms"`
	Assertions      []assertResult    `json:"assertions"`
	ExtractedVars   map[string]string `json:"extracted_vars,omitempty"`
	ResponsePreview string            `json:"response_preview,omitempty"`
	Error           string            `json:"error,omitempty"`
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
		"type": "status", "run_id": p.RunID, "project_id": p.ProjectID,
		"status": "running", "started_at": startedAt,
	})

	nodeMap, inDegree, graph := parseDAG(p.Definition)
	totalNodes := len(nodeMap)
	if totalNodes == 0 {
		e.finishRun(p, startedAt, nil, 0, 0, "passed")
		return
	}

	var (
		mu          sync.Mutex
		varCtx      = make(map[string]string)
		nodeResults = make([]nodeResult, 0, totalNodes)
		failedNodes = make(map[string]bool)
		passed      int32
		failed      int32
		skipped     int32
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

	// anyParentFailed checks whether any direct parent of childID has failed.
	anyParentFailed := func(childID string) bool {
		for parentID, children := range graph {
			for _, cid := range children {
				if cid == childID && failedNodes[parentID] {
					return true
				}
			}
		}
		return false
	}

	var processNode func(nodeID string)
	processNode = func(nodeID string) {
		defer wg.Done()

		n, exists := nodeMap[nodeID]
		if !exists {
			return
		}

		// Check if any parent of this node failed — skip if so
		mu.Lock()
		parentFailed := anyParentFailed(nodeID)
		mu.Unlock()

		if parentFailed {
			result := nodeResult{
				NodeID: nodeID,
				Status: "skipped",
				Error:  "skipped: upstream dependency failed",
			}
			mu.Lock()
			nodeResults = append(nodeResults, result)
			failedNodes[nodeID] = true // propagate failure downstream
			mu.Unlock()
			atomic.AddInt32(&skipped, 1)

			_ = natsclient.Publish(e.nc, "results.metric", map[string]any{
				"type": "metric", "run_id": p.RunID, "project_id": p.ProjectID,
				"node_id": nodeID, "status": "skipped", "duration_ms": 0,
			})

			// Still propagate to children so they also get skipped
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
			return
		}

		mu.Lock()
		ctxVars := make(map[string]string, len(varCtx))
		for k, v := range varCtx {
			ctxVars[k] = v
		}
		mu.Unlock()

		result := e.executeNode(ctx, n, ctxVars)

		mu.Lock()
		nodeResults = append(nodeResults, result)
		for k, v := range result.ExtractedVars {
			varCtx[k] = v
		}
		if result.Status == "failed" {
			failedNodes[nodeID] = true
		}
		mu.Unlock()

		if result.Status == "passed" {
			atomic.AddInt32(&passed, 1)
		} else if result.Status == "failed" {
			atomic.AddInt32(&failed, 1)
		}

		// Stream per-node live metric update
		_ = natsclient.Publish(e.nc, "results.metric", map[string]any{
			"type":             "metric",
			"run_id":           p.RunID,
			"project_id":       p.ProjectID,
			"node_id":          result.NodeID,
			"status":           result.Status,
			"duration_ms":      result.DurationMs,
			"status_code":      result.StatusCode,
			"error":            result.Error,
			"assertions":       result.Assertions,
			"extracted_vars":   result.ExtractedVars,
			"response_preview": result.ResponsePreview,
		})

		// Decrement in-degree for downstream children and trigger ready nodes
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
	sCount := atomic.LoadInt32(&skipped)

	if fCount > 0 && pCount == 0 {
		finalStatus = "failed"
	} else if fCount > 0 || sCount > 0 {
		finalStatus = "partial"
	}

	e.finishRun(p, startedAt, nodeResults, int(pCount), int(fCount), finalStatus)
}

func (e *WorkflowExecutor) finishRun(p WorkflowRunPayload, startedAt time.Time, results []nodeResult, passed, failed int, finalStatus string) {
	// Publish with "type": "completed" so frontend can detect completion events
	completedPayload := map[string]any{
		"type":         "completed",
		"run_id":       p.RunID,
		"workflow_id":  p.WorkflowID,
		"project_id":   p.ProjectID,
		"status":       finalStatus,
		"started_at":   startedAt,
		"finished_at":  time.Now(),
		"node_results": results,
		"total_nodes":  len(results),
		"passed_nodes": passed,
		"failed_nodes": failed,
	}

	if err := natsclient.Publish(e.nc, "results.run.completed", completedPayload); err != nil {
		e.log.Error("Failed to publish run result", zap.String("run_id", p.RunID), zap.Error(err))
	}
	e.patchRunStatus(p.RunID, finalStatus)

	e.log.Info("Workflow run complete (parallel DAG execution)",
		zap.String("run_id", p.RunID),
		zap.String("status", finalStatus),
		zap.Int("passed", passed),
		zap.Int("failed", failed),
	)
}

func (e *WorkflowExecutor) patchRunStatus(runID, status string) {
	body := map[string]interface{}{"status": status}
	data, err := json.Marshal(body)
	if err != nil {
		return
	}
	url := e.controlPlaneURL + "/internal/workflow-runs/" + runID + "/"
	req, err := http.NewRequest(http.MethodPatch, url, bytes.NewReader(data))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := e.hc.Do(req)
	if err != nil {
		e.log.Error("PATCH internal endpoint error", zap.String("url", url), zap.Error(err))
		return
	}
	defer resp.Body.Close()
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

func interpolateVars(input string, varCtx map[string]string) string {
	for k, v := range varCtx {
		pattern := "{{" + k + "}}"
		input = strings.ReplaceAll(input, pattern, v)
	}
	return input
}

func (e *WorkflowExecutor) executeNode(ctx context.Context, n node, varCtx map[string]string) nodeResult {
	switch n.Type {
	case "request":
		return e.executeRequestNode(ctx, n, varCtx)
	case "delay":
		ms, _ := n.Data["delay_ms"].(float64)
		time.Sleep(time.Duration(ms) * time.Millisecond)
		return nodeResult{NodeID: n.ID, Status: "passed", DurationMs: int64(ms)}
	case "condition":
		varName, _ := n.Data["var_name"].(string)
		expectedVal, _ := n.Data["expected_value"].(string)
		val, exists := varCtx[varName]
		status := "failed"
		if exists && (expectedVal == "" || val == expectedVal) {
			status = "passed"
		}
		return nodeResult{
			NodeID: n.ID,
			Status: status,
			Assertions: []assertResult{{
				Type:   "condition",
				Passed: status == "passed",
				Detail: fmt.Sprintf("var '%s' = '%s' (expected '%s')", varName, val, expectedVal),
			}},
		}
	default:
		return nodeResult{NodeID: n.ID, Status: "skipped"}
	}
}

func getJSONPath(data any, path string) string {
	if path == "" || data == nil {
		return ""
	}
	parts := strings.Split(path, ".")
	current := data
	for _, part := range parts {
		m, ok := current.(map[string]any)
		if !ok {
			return ""
		}
		current, ok = m[part]
		if !ok {
			return ""
		}
	}
	return fmt.Sprintf("%v", current)
}

func (e *WorkflowExecutor) executeRequestNode(ctx context.Context, n node, varCtx map[string]string) nodeResult {
	rawURL, _ := n.Data["url"].(string)
	rawURL = interpolateVars(rawURL, varCtx)
	if rawURL != "" && !strings.HasPrefix(rawURL, "http://") && !strings.HasPrefix(rawURL, "https://") {
		rawURL = "https://" + rawURL
	}
	method, _ := n.Data["method"].(string)
	if method == "" {
		method = "GET"
	}
	expectedStatus, _ := n.Data["expected_status"].(float64)

	if rawURL == "" {
		return nodeResult{NodeID: n.ID, Status: "failed", Error: "no URL configured"}
	}

	var reqBody *bytes.Buffer
	if bodyStr, ok := n.Data["body"].(string); ok && bodyStr != "" {
		interpolatedBody := interpolateVars(bodyStr, varCtx)
		reqBody = bytes.NewBufferString(interpolatedBody)
	} else {
		reqBody = bytes.NewBuffer(nil)
	}

	req, err := http.NewRequestWithContext(ctx, method, rawURL, reqBody)
	if err != nil {
		return nodeResult{NodeID: n.ID, Status: "failed", Error: fmt.Sprintf("bad request: %s", err)}
	}

	// Apply headers with interpolation
	if headersMap, ok := n.Data["headers"].(map[string]any); ok {
		for hK, hV := range headersMap {
			valStr, ok := hV.(string)
			if ok {
				req.Header.Set(hK, interpolateVars(valStr, varCtx))
			}
		}
	} else if headersSlice, ok := n.Data["headers"].([]any); ok {
		for _, item := range headersSlice {
			if hMap, ok := item.(map[string]any); ok {
				k, _ := hMap["key"].(string)
				v, _ := hMap["value"].(string)
				if k != "" {
					req.Header.Set(k, interpolateVars(v, varCtx))
				}
			}
		}
	}

	start := time.Now()
	resp, err := e.hc.Do(req)
	durationMs := time.Since(start).Milliseconds()

	if err != nil {
		return nodeResult{NodeID: n.ID, Status: "failed", DurationMs: durationMs, Error: err.Error()}
	}
	defer resp.Body.Close()

	buf := new(bytes.Buffer)
	_, _ = buf.ReadFrom(resp.Body)
	bodyBytes := buf.Bytes()
	previewStr := string(bodyBytes)
	if len(previewStr) > 500 {
		previewStr = previewStr[:500] + "..."
	}

	var jsonBody map[string]any
	_ = json.Unmarshal(bodyBytes, &jsonBody)

	extractedVars := make(map[string]string)
	if extractors, ok := n.Data["extractors"].([]any); ok {
		for _, item := range extractors {
			if exMap, ok := item.(map[string]any); ok {
				jsonPath, _ := exMap["json_path"].(string)
				varName, _ := exMap["var_name"].(string)
				if jsonPath != "" && varName != "" {
					val := getJSONPath(jsonBody, jsonPath)
					if val != "" {
						extractedVars[varName] = val
					}
				}
			}
		}
	}

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

	if assertionList, ok := n.Data["assertions"].([]any); ok {
		for _, item := range assertionList {
			if aMap, ok := item.(map[string]any); ok {
				aType, _ := aMap["type"].(string)
				switch aType {
				case "max_latency":
					maxMs, _ := aMap["max_ms"].(float64)
					passed := float64(durationMs) <= maxMs
					if !passed {
						allPassed = false
					}
					assertions = append(assertions, assertResult{
						Type:   "max_latency",
						Passed: passed,
						Detail: fmt.Sprintf("max %dms got %dms", int(maxMs), durationMs),
					})
				case "json_body":
					path, _ := aMap["path"].(string)
					exp, _ := aMap["expected"].(string)
					actual := getJSONPath(jsonBody, path)
					passed := actual == exp
					if !passed {
						allPassed = false
					}
					assertions = append(assertions, assertResult{
						Type:   "json_body",
						Passed: passed,
						Detail: fmt.Sprintf("path '%s' expected '%s' got '%s'", path, exp, actual),
					})
				}
			}
		}
	}

	status := "passed"
	if !allPassed {
		status = "failed"
	}

	return nodeResult{
		NodeID:          n.ID,
		Status:          status,
		StatusCode:      resp.StatusCode,
		DurationMs:      durationMs,
		Assertions:      assertions,
		ExtractedVars:   extractedVars,
		ResponsePreview: previewStr,
	}
}
