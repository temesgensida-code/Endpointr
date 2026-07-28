// Package runner implements the NATS subscriber + concurrent request executor.
//
// Each inbound NATS message is dispatched to a worker goroutine.
// Results flow back via NATS and a REST PATCH to the Django control plane.
package runner

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"slices"
	"sync"
	"time"

	natsgo "github.com/nats-io/nats.go"
	"go.uber.org/zap"
)

// NATSConn is the subset of nats.Conn used by Runner (makes testing easy).
type NATSConn interface {
	Subscribe(subj string, cb natsgo.MsgHandler) (*natsgo.Subscription, error)
	Publish(subj string, data []byte) error
}

// Runner dispatches NATS events to a bounded worker pool.
type Runner struct {
	nc              NATSConn
	controlPlaneURL string
	log             *zap.Logger
	sem             chan struct{} // bounded concurrency
	httpClient      *http.Client
}

// New creates a Runner with workerCount concurrent slots.
func New(nc NATSConn, controlPlaneURL string, log *zap.Logger, workerCount int) *Runner {
	return &Runner{
		nc:              nc,
		controlPlaneURL: controlPlaneURL,
		log:             log,
		sem:             make(chan struct{}, workerCount),
		httpClient: &http.Client{
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

// SubscribeAll registers all NATS subject handlers.
func (r *Runner) SubscribeAll(ctx context.Context) error {
	subjects := map[string]func(context.Context, map[string]interface{}){
		"runs.workflow.requested": r.handleWorkflowRun,
		"runs.perf.requested":     r.handlePerfRun,
	}
	for subj, handler := range subjects {
		h := handler // capture loop variable
		subj := subj
		if _, err := r.nc.Subscribe(subj, func(msg *natsgo.Msg) {
			var payload map[string]interface{}
			if err := json.Unmarshal(msg.Data, &payload); err != nil {
				r.log.Error("Bad JSON on subject", zap.String("subject", subj), zap.Error(err))
				return
			}
			// Acquire worker slot (blocks if pool full)
			select {
			case r.sem <- struct{}{}:
			case <-ctx.Done():
				return
			}
			go func() {
				defer func() { <-r.sem }()
				h(ctx, payload)
			}()
		}); err != nil {
			return fmt.Errorf("subscribe %s: %w", subj, err)
		}
		r.log.Info("Subscribed to subject", zap.String("subject", subj))
	}
	return nil
}

// ─── Workflow run ─────────────────────────────────────────────────────────────

func (r *Runner) handleWorkflowRun(ctx context.Context, payload map[string]interface{}) {
	runID, _ := payload["run_id"].(string)
	definition, _ := payload["definition"].(map[string]interface{})

	r.log.Info("Workflow run starting", zap.String("run_id", runID))
	r.patchRunStatus(runID, "running", "workflow")

	results, err := r.executeWorkflowDefinition(ctx, definition)

	status := "passed"
	if err != nil {
		r.log.Error("Workflow run error", zap.String("run_id", runID), zap.Error(err))
		status = "failed"
	} else {
		for _, step := range results {
			if s, ok := step["status"].(string); ok && s == "failed" {
				status = "failed"
				break
			}
		}
	}

	summary := map[string]interface{}{
		"steps":  results,
		"status": status,
	}

	r.publishCompleted(runID, status, summary)
	r.patchRunStatus(runID, status, "workflow")
	r.log.Info("Workflow run complete", zap.String("run_id", runID), zap.String("status", status))
}

// executeWorkflowDefinition iterates over DAG nodes and executes HTTP requests.
func (r *Runner) executeWorkflowDefinition(ctx context.Context, definition map[string]interface{}) ([]map[string]interface{}, error) {
	nodes, _ := definition["nodes"].([]interface{})
	var results []map[string]interface{}
	var mu sync.Mutex
	var wg sync.WaitGroup
	errs := make([]error, 0)

	for _, nodeRaw := range nodes {
		node, ok := nodeRaw.(map[string]interface{})
		if !ok {
			continue
		}
		nodeType, _ := node["type"].(string)
		if nodeType != "request" {
			continue
		}
		data, _ := node["data"].(map[string]interface{})
		wg.Add(1)
		go func(n map[string]interface{}, d map[string]interface{}) {
			defer wg.Done()
			result := r.executeHTTPNode(ctx, n, d)
			mu.Lock()
			results = append(results, result)
			mu.Unlock()
		}(node, data)
	}
	wg.Wait()

	if len(errs) > 0 {
		return results, errs[0]
	}
	return results, nil
}

func (r *Runner) executeHTTPNode(ctx context.Context, node, data map[string]interface{}) map[string]interface{} {
	nodeID, _ := node["id"].(string)
	method, _ := data["method"].(string)
	url, _ := data["url"].(string)
	if method == "" {
		method = "GET"
	}

	start := time.Now()

	var bodyReader io.Reader
	if body, ok := data["body"].(string); ok && body != "" {
		bodyReader = bytes.NewBufferString(body)
	}

	req, err := http.NewRequestWithContext(ctx, method, url, bodyReader)
	if err != nil {
		return map[string]interface{}{"node_id": nodeID, "status": "failed", "error": err.Error()}
	}

	if headers, ok := data["headers"].(map[string]interface{}); ok {
		for k, v := range headers {
			if sv, ok := v.(string); ok {
				req.Header.Set(k, sv)
			}
		}
	}

	resp, err := r.httpClient.Do(req)
	latencyMs := time.Since(start).Milliseconds()
	if err != nil {
		return map[string]interface{}{"node_id": nodeID, "status": "failed", "error": err.Error(), "latency_ms": latencyMs}
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20)) // 1 MB cap

	status := "passed"
	if resp.StatusCode >= 400 {
		status = "failed"
	}

	// Evaluate assertions
	assertions, _ := data["assertions"].([]interface{})
	assertionResults := r.evaluateAssertions(assertions, resp.StatusCode, respBody)
	for _, ar := range assertionResults {
		if s, ok := ar["passed"].(bool); ok && !s {
			status = "failed"
		}
	}

	return map[string]interface{}{
		"node_id":    nodeID,
		"status":     status,
		"http_status": resp.StatusCode,
		"latency_ms": latencyMs,
		"assertions": assertionResults,
	}
}

func (r *Runner) evaluateAssertions(assertions []interface{}, statusCode int, body []byte) []map[string]interface{} {
	results := make([]map[string]interface{}, 0)
	for _, aRaw := range assertions {
		a, ok := aRaw.(map[string]interface{})
		if !ok {
			continue
		}
		aType, _ := a["type"].(string)
		cfg, _ := a["config"].(map[string]interface{})

		var passed bool
		switch aType {
		case "status_code":
			expected, _ := cfg["expected"].(float64)
			passed = statusCode == int(expected)
		default:
			passed = true // unknown assertions pass (non-blocking)
		}
		results = append(results, map[string]interface{}{
			"type":   aType,
			"passed": passed,
		})
	}
	return results
}

// ─── Perf run ────────────────────────────────────────────────────────────────

func (r *Runner) handlePerfRun(ctx context.Context, payload map[string]interface{}) {
	runID, _ := payload["run_id"].(string)
	perfType, _ := payload["type"].(string)
	cfg, _ := payload["config"].(map[string]interface{})

	r.log.Info("Perf run starting", zap.String("run_id", runID), zap.String("type", perfType))
	r.patchRunStatus(runID, "running", "perf")

	summary, err := r.executePerfTest(ctx, perfType, cfg)
	status := "completed"
	if err != nil {
		status = "failed"
		r.log.Error("Perf run error", zap.String("run_id", runID), zap.Error(err))
	}

	r.publishCompleted(runID, status, summary)
	r.patchPerfRunSummary(runID, status, summary)
	r.log.Info("Perf run complete", zap.String("run_id", runID), zap.String("status", status))
}

func (r *Runner) executePerfTest(ctx context.Context, testType string, cfg map[string]interface{}) (map[string]interface{}, error) {
	targetURL, _ := cfg["target_url"].(string)
	method, _ := cfg["method"].(string)
	if method == "" {
		method = "GET"
	}
	durationSec := int(floatOrDefault(cfg["duration_seconds"], 10))
	vus := int(floatOrDefault(cfg["vus"], 10))
	if testType == "rate_limit" {
		vus = 1
	}

	type result struct {
		latencyMs int64
		status    int
		err       error
	}

	resCh := make(chan result, vus*durationSec*10)
	var wg sync.WaitGroup
	deadline := time.Now().Add(time.Duration(durationSec) * time.Second)

	for i := 0; i < vus; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for time.Now().Before(deadline) {
				start := time.Now()
				req, err := http.NewRequestWithContext(ctx, method, targetURL, nil)
				if err != nil {
					resCh <- result{err: err}
					continue
				}
				resp, err := r.httpClient.Do(req)
				latency := time.Since(start).Milliseconds()
				if err != nil {
					resCh <- result{latencyMs: latency, err: err}
					continue
				}
				resp.Body.Close()
				resCh <- result{latencyMs: latency, status: resp.StatusCode}
			}
		}()
	}

	go func() {
		wg.Wait()
		close(resCh)
	}()

	var latencies []int64
	errors := 0
	total := 0
	for res := range resCh {
		total++
		if res.err != nil || res.status >= 500 {
			errors++
		} else {
			latencies = append(latencies, res.latencyMs)
		}
	}

	if len(latencies) == 0 {
		return map[string]interface{}{"error": "no successful requests"}, fmt.Errorf("all requests failed")
	}

	// Sort for percentiles
	sortInt64(latencies)
	n := len(latencies)
	p50 := latencies[n*50/100]
	p95 := latencies[int(float64(n)*0.95)]
	p99 := latencies[int(float64(n)*0.99)]
	errorRate := float64(errors) / float64(total) * 100

	summary := map[string]interface{}{
		"total_requests":    total,
		"successful":        total - errors,
		"error_count":       errors,
		"error_rate":        errorRate,
		"p50_latency_ms":    p50,
		"p95_latency_ms":    p95,
		"p99_latency_ms":    p99,
		"throughput_rps":    float64(total) / float64(durationSec),
		"duration_seconds":  durationSec,
		"vus":               vus,
	}
	return summary, nil
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

func (r *Runner) publishCompleted(runID, status string, summary map[string]interface{}) {
	payload := map[string]interface{}{
		"run_id":  runID,
		"status":  status,
		"summary": summary,
	}
	data, _ := json.Marshal(payload)
	if err := r.nc.Publish("results.run.completed", data); err != nil {
		r.log.Error("NATS publish error", zap.Error(err))
	}
}

func (r *Runner) patchRunStatus(runID, status, runType string) {
	path := fmt.Sprintf("/workflow-runs/%s/", runID)
	if runType == "perf" {
		path = fmt.Sprintf("/perf-runs/%s/", runID)
	}
	r.patchJSON(path, map[string]interface{}{"status": status})
}

func (r *Runner) patchPerfRunSummary(runID, status string, summary map[string]interface{}) {
	r.patchJSON(fmt.Sprintf("/perf-runs/%s/", runID), map[string]interface{}{
		"status":  status,
		"summary": summary,
	})
}

func (r *Runner) patchJSON(path string, body map[string]interface{}) {
	data, err := json.Marshal(body)
	if err != nil {
		return
	}
	url := r.controlPlaneURL + "/internal" + path
	req, err := http.NewRequest(http.MethodPatch, url, bytes.NewReader(data))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := r.httpClient.Do(req)
	if err != nil {
		r.log.Error("PATCH internal endpoint error", zap.String("url", url), zap.Error(err))
		return
	}
	defer resp.Body.Close()
}

func floatOrDefault(v interface{}, def float64) float64 {
	if f, ok := v.(float64); ok {
		return f
	}
	return def
}

func sortInt64(a []int64) {
	// Fast O(N log N) pattern-defeating quicksort
	slices.Sort(a)
}
