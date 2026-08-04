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
// NOTE: The Dispatcher in dispatcher.go is the active subscription path.
// This method is retained for backwards compatibility but workflow runs
// are handled by WorkflowExecutor via the Dispatcher.
func (r *Runner) SubscribeAll(ctx context.Context) error {
	subjects := map[string]func(context.Context, map[string]interface{}){
		"runs.perf.requested": r.handlePerfRun,
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

// ─── Perf run ────────────────────────────────────────────────────────────────

func (r *Runner) handlePerfRun(ctx context.Context, payload map[string]interface{}) {
	runID, _ := payload["run_id"].(string)
	projectID, _ := payload["project_id"].(string)
	perfType, _ := payload["type"].(string)
	cfg, _ := payload["config"].(map[string]interface{})

	r.log.Info("Perf run starting", zap.String("run_id", runID), zap.String("type", perfType))
	r.patchRunStatus(runID, "running", "perf")
	r.publishStatus(runID, "running", projectID)

	summary, err := r.executePerfTest(ctx, runID, projectID, perfType, cfg)
	status := "completed"
	if err != nil {
		status = "failed"
		r.log.Error("Perf run error", zap.String("run_id", runID), zap.Error(err))
	}

	r.publishCompleted(runID, status, summary)
	r.patchPerfRunSummary(runID, status, summary)
	r.log.Info("Perf run complete", zap.String("run_id", runID), zap.String("status", status))
}

func (r *Runner) executePerfTest(ctx context.Context, runID, projectID, testType string, cfg map[string]interface{}) (map[string]interface{}, error) {
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

	if targetURL == "" {
		return map[string]interface{}{"error": "target_url is required"}, fmt.Errorf("target_url is required")
	}

	// Parse headers
	headersMap := make(map[string]string)
	if hRaw, ok := cfg["headers"].(map[string]interface{}); ok {
		for k, v := range hRaw {
			if strVal, ok := v.(string); ok {
				headersMap[k] = strVal
			}
		}
	}
	if _, hasUA := headersMap["User-Agent"]; !hasUA {
		headersMap["User-Agent"] = "Endpointr-PerfEngine/1.0"
	}

	// Parse body
	bodyStr, _ := cfg["body"].(string)

	type result struct {
		latencyMs int64
		status    int
		err       error
	}

	resCh := make(chan result, vus*durationSec*50)
	var wg sync.WaitGroup
	startTime := time.Now()
	deadline := startTime.Add(time.Duration(durationSec) * time.Second)

	var mu sync.Mutex
	var liveLatencies []int64
	var totalReqs int64
	var errCount int64

	// Stream per-second metrics
	tickerDone := make(chan struct{})
	go func() {
		ticker := time.NewTicker(1 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-tickerDone:
				return
			case <-ctx.Done():
				return
			case t := <-ticker.C:
				elapsed := t.Sub(startTime).Seconds()
				if elapsed > 0 {
					mu.Lock()
					reqs := totalReqs
					errs := errCount
					lats := make([]int64, len(liveLatencies))
					copy(lats, liveLatencies)
					mu.Unlock()

					throughput := float64(reqs) / elapsed
					errRate := 0.0
					if reqs > 0 {
						errRate = float64(errs) / float64(reqs) * 100
					}

					var p50, p95 int64
					if len(lats) > 0 {
						sortInt64(lats)
						n := len(lats)
						p50 = lats[n*50/100]
						p95 = lats[int(float64(n)*0.95)]
					}

					r.publishMetric(runID, projectID, elapsed, reqs, errs, errRate, throughput, p50, p95)
				}
			}
		}
	}()

	for i := 0; i < vus; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for time.Now().Before(deadline) {
				start := time.Now()

				var bodyReader io.Reader
				if bodyStr != "" {
					bodyReader = bytes.NewReader([]byte(bodyStr))
				}

				req, err := http.NewRequestWithContext(ctx, method, targetURL, bodyReader)
				if err != nil {
					mu.Lock()
					totalReqs++
					errCount++
					mu.Unlock()
					resCh <- result{err: err}
					continue
				}

				for k, v := range headersMap {
					req.Header.Set(k, v)
				}

				resp, err := r.httpClient.Do(req)
				latency := time.Since(start).Milliseconds()

				mu.Lock()
				totalReqs++
				if err != nil || (resp != nil && resp.StatusCode >= 400) {
					errCount++
				}
				if err == nil {
					liveLatencies = append(liveLatencies, latency)
				}
				mu.Unlock()

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
		close(tickerDone)
		close(resCh)
	}()

	var latencies []int64
	errors := 0
	total := 0
	for res := range resCh {
		total++
		if res.err != nil || res.status >= 400 {
			errors++
		}
		if res.err == nil {
			latencies = append(latencies, res.latencyMs)
		}
	}

	errRate := 0.0
	if total > 0 {
		errRate = float64(errors) / float64(total) * 100
	}

	if len(latencies) == 0 {
		summary := map[string]interface{}{
			"total_requests":   total,
			"successful":       0,
			"error_count":      errors,
			"error_rate":       100.0,
			"p50_latency_ms":   0,
			"p95_latency_ms":   0,
			"p99_latency_ms":   0,
			"throughput_rps":   float64(total) / float64(durationSec),
			"duration_seconds": durationSec,
			"vus":              vus,
		}
		return summary, fmt.Errorf("all requests failed")
	}

	// Sort for percentiles
	sortInt64(latencies)
	n := len(latencies)
	p50 := latencies[n*50/100]
	p95 := latencies[int(float64(n)*0.95)]
	p99 := latencies[int(float64(n)*0.99)]

	summary := map[string]interface{}{
		"total_requests":   total,
		"successful":       total - errors,
		"error_count":      errors,
		"error_rate":       errRate,
		"p50_latency_ms":   p50,
		"p95_latency_ms":   p95,
		"p99_latency_ms":   p99,
		"throughput_rps":   float64(total) / float64(durationSec),
		"duration_seconds": durationSec,
		"vus":              vus,
	}
	return summary, nil
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

func (r *Runner) publishStatus(runID, status, projectID string) {
	payload := map[string]interface{}{
		"run_id":     runID,
		"project_id": projectID,
		"status":     status,
	}
	data, _ := json.Marshal(payload)
	_ = r.nc.Publish("results.run.status", data)
}

func (r *Runner) publishMetric(runID, projectID string, elapsed float64, totalReqs, errCount int64, errRate, throughput float64, p50, p95 int64) {
	payload := map[string]interface{}{
		"run_id":         runID,
		"project_id":     projectID,
		"status":         "running",
		"elapsed_sec":    elapsed,
		"total_requests": totalReqs,
		"error_count":    errCount,
		"error_rate":     errRate,
		"throughput_rps": throughput,
		"p50_latency_ms": p50,
		"p95_latency_ms": p95,
	}
	data, _ := json.Marshal(payload)
	_ = r.nc.Publish("results.metric", data)
}

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
