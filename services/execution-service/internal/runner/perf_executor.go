package runner

import (
	"bytes"
	"context"
	"fmt"
	"math"
	"net/http"
	"slices"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	natsgo "github.com/nats-io/nats.go"
	"go.uber.org/zap"

	natsclient "github.com/endpointr/execution-service/internal/nats"
)

// PerfExecutor runs load, stress, rate-limit, and fuzz tests.
// Uses goroutines for concurrency; publishes per-second metrics to NATS.
type PerfExecutor struct {
	nc  *natsgo.Conn
	log *zap.Logger
	hc  *http.Client
}

func NewPerfExecutor(nc *natsgo.Conn, log *zap.Logger) *PerfExecutor {
	return &PerfExecutor{
		nc:  nc,
		log: log,
		hc: &http.Client{
			Timeout: 10 * time.Second,
			Transport: &http.Transport{
				MaxIdleConns:        10000,
				MaxIdleConnsPerHost: 2000,
				IdleConnTimeout:     90 * time.Second,
				DisableKeepAlives:   false,
				ForceAttemptHTTP2:   true,
			},
		},
	}
}

type perfSample struct {
	latencyMs int64
	err       bool
}

func (e *PerfExecutor) Execute(p PerfRunPayload) {
	startedAt := time.Now()
	_ = natsclient.Publish(e.nc, "results.run.status", map[string]any{
		"run_id": p.RunID, "status": "running", "started_at": startedAt,
	})

	var summary map[string]any
	var status string

	switch p.Type {
	case "load", "stress":
		summary, status = e.runLoad(p)
	case "rate_limit":
		summary, status = e.runRateLimit(p)
	case "fuzz":
		summary, status = e.runFuzz(p)
	default:
		e.log.Warn("Unknown perf type", zap.String("type", p.Type))
		status = "failed"
		summary = map[string]any{"error": fmt.Sprintf("unknown type: %s", p.Type)}
	}

	summary["started_at"] = startedAt
	summary["finished_at"] = time.Now()

	_ = natsclient.Publish(e.nc, "results.run.completed", map[string]any{
		"run_id":     p.RunID,
		"config_id":  p.ConfigID,
		"project_id": p.ProjectID,
		"type":       p.Type,
		"status":     status,
		"summary":    summary,
	})

	e.log.Info("Perf run complete",
		zap.String("run_id", p.RunID),
		zap.String("type", p.Type),
		zap.String("status", status),
	)
}

// runLoad executes a load/stress test using the configured VUs and duration.
// Improvement #1: publishes per-second metric snapshots via NATS during the run.
// Improvement #6: supports optional think_time_ms between VU requests.
func (e *PerfExecutor) runLoad(p PerfRunPayload) (map[string]any, string) {
	cfg := p.Config
	vus := intFromConfig(cfg, "vus", 10)
	durationSec := intFromConfig(cfg, "duration_seconds", 30)
	rampUpSec := intFromConfig(cfg, "ramp_up_seconds", 5)
	thinkTimeMs := intFromConfig(cfg, "think_time_ms", 0) // #6: optional think time
	targetURL := stringFromConfig(cfg, "target_url", "")
	method := stringFromConfig(cfg, "method", "GET")

	if targetURL == "" {
		return map[string]any{"error": "target_url is required"}, "failed"
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(durationSec+5)*time.Second)
	defer cancel()

	var (
		samples   []perfSample
		mu        sync.Mutex
		totalReqs int64
		errCount  int64
		vuWg      sync.WaitGroup
	)

	// Ramp-up: gradually increase VUs
	activeCh := make(chan struct{}, vus)
	ticker := time.NewTicker(time.Duration(durationSec) * time.Second)
	defer ticker.Stop()

	rampTicker := time.NewTicker(time.Duration(rampUpSec*1000/vus) * time.Millisecond)
	defer rampTicker.Stop()

	done := make(chan struct{})
	go func() {
		<-ticker.C
		close(done)
	}()

	activeVUs := 0
	hc := e.hc

	runVU := func() {
		defer vuWg.Done()
		localSamples := make([]perfSample, 0, 1000)
		for {
			select {
			case <-done:
				if len(localSamples) > 0 {
					mu.Lock()
					samples = append(samples, localSamples...)
					mu.Unlock()
				}
				return
			default:
			}
			start := time.Now()
			req, _ := http.NewRequestWithContext(ctx, method, targetURL, nil)
			resp, err := hc.Do(req)
			lat := time.Since(start).Milliseconds()
			atomic.AddInt64(&totalReqs, 1)

			isErr := err != nil
			if err == nil {
				resp.Body.Close()
				if resp.StatusCode >= 500 {
					isErr = true
				}
			}
			if isErr {
				atomic.AddInt64(&errCount, 1)
			}

			localSamples = append(localSamples, perfSample{latencyMs: lat, err: isErr})

			// #6: optional think time between requests
			if thinkTimeMs > 0 {
				select {
				case <-done:
					return
				case <-time.After(time.Duration(thinkTimeMs) * time.Millisecond):
				}
			}
		}
	}

	// Ramp up VUs over rampUpSec
	go func() {
		for range rampTicker.C {
			if activeVUs >= vus {
				rampTicker.Stop()
				return
			}
			activeVUs++
			activeCh <- struct{}{}
			vuWg.Add(1)
			go func() {
				runVU()
				<-activeCh
			}()
		}
	}()

	// #1: publish per-second metric snapshots while the test runs
	go e.publishLiveMetrics(ctx, done, p.RunID, p.ProjectID, targetURL, method, &samples, &mu, durationSec)

	<-done
	vuWg.Wait()

	return buildSummary(samples, int(totalReqs), int(errCount), durationSec), "completed"
}

// publishLiveMetrics emits a results.metric NATS event every second during the run.
// Improvement #1: real-time per-second snapshots for live chart rendering.
func (e *PerfExecutor) publishLiveMetrics(
	ctx context.Context,
	done <-chan struct{},
	runID, projectID, endpoint, method string,
	samples *[]perfSample,
	mu *sync.Mutex,
	durationSec int,
) {
	tick := time.NewTicker(time.Second)
	defer tick.Stop()
	lastCount := 0
	second := 0

	for {
		select {
		case <-done:
			return
		case <-ctx.Done():
			return
		case <-tick.C:
			second++
			mu.Lock()
			snap := make([]perfSample, len(*samples))
			copy(snap, *samples)
			mu.Unlock()

			newCount := len(snap) - lastCount
			lastCount = len(snap)
			if newCount == 0 {
				continue
			}

			// Compute latency stats on the window of new samples
			window := snap[max(0, len(snap)-newCount):]
			lats := make([]int64, 0, len(window))
			errW := 0
			for _, s := range window {
				lats = append(lats, s.latencyMs)
				if s.err {
					errW++
				}
			}
			slices.Sort(lats)

			p95 := float64(0)
			if len(lats) > 0 {
				idx := int(math.Ceil(0.95*float64(len(lats)))) - 1
				if idx < 0 {
					idx = 0
				}
				p95 = float64(lats[idx])
			}

			errRate := 0.0
			if newCount > 0 {
				errRate = float64(errW) / float64(newCount) * 100
			}

			_ = natsclient.Publish(e.nc, "results.metric", map[string]any{
				"time":        time.Now(),
				"project_id":  projectID,
				"run_id":      runID,
				"endpoint":    endpoint,
				"method":      method,
				"status_code": 200,
				"latency_ms":  p95,
				"error":       errRate > 0,
				// extra live fields consumed by the frontend chart
				"rps":        newCount,
				"error_rate": math.Round(errRate*100) / 100,
				"second":     second,
			})
		}
	}
}

// runRateLimit fires requests at a fixed RPS and detects rate-limit responses (429).
// Fix #3: now uses http.NewRequestWithContext so cancellation works correctly.
func (e *PerfExecutor) runRateLimit(p PerfRunPayload) (map[string]any, string) {
	cfg := p.Config
	rps := intFromConfig(cfg, "rps", 10)
	durationSec := intFromConfig(cfg, "duration_seconds", 10)
	targetURL := stringFromConfig(cfg, "target_url", "")
	if targetURL == "" {
		return map[string]any{"error": "target_url required"}, "failed"
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(durationSec+2)*time.Second)
	defer cancel()

	hc := e.hc
	interval := time.Second / time.Duration(rps)
	deadline := time.Now().Add(time.Duration(durationSec) * time.Second)

	var rateLimited, total int
	for time.Now().Before(deadline) {
		// Fix #3: use context so the request respects cancellation/timeout
		req, err := http.NewRequestWithContext(ctx, "GET", targetURL, nil)
		if err != nil {
			break
		}
		resp, err := hc.Do(req)
		total++
		if err == nil {
			if resp.StatusCode == 429 {
				rateLimited++
			}
			resp.Body.Close()
		}
		select {
		case <-ctx.Done():
			goto done
		case <-time.After(interval):
		}
	}
done:

	rateLimitPct := 0.0
	if total > 0 {
		rateLimitPct = float64(rateLimited) / float64(total) * 100
	}

	return map[string]any{
		"total_requests":      total,
		"rate_limited_count":  rateLimited,
		"rate_limited_pct":    rateLimitPct,
		"rate_limit_detected": rateLimitPct > 0,
		"configured_rps":      rps,
	}, "completed"
}

// runFuzz sends mutated payloads and records unexpected 5xx responses.
// Fix #4: mutation payload is now actually sent as the request body.
func (e *PerfExecutor) runFuzz(p PerfRunPayload) (map[string]any, string) {
	cfg := p.Config
	iterations := intFromConfig(cfg, "iterations", 20)
	targetURL := stringFromConfig(cfg, "target_url", "")
	if targetURL == "" {
		return map[string]any{"error": "target_url required"}, "failed"
	}

	mutations := []string{
		"", "null", "true", "false", "0", "-1", "9999999",
		`{"__proto__":{"admin":true}}`,
		"<script>alert(1)</script>",
		"' OR 1=1 --",
		string(make([]byte, 10000)), // large payload
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(iterations*2+10)*time.Second)
	defer cancel()

	hc := e.hc
	var anomalies []map[string]any

	for i := 0; i < iterations; i++ {
		mutation := mutations[i%len(mutations)]

		// Fix #4: actually send the mutation as the request body
		body := strings.NewReader(mutation)
		req, err := http.NewRequestWithContext(ctx, "POST", targetURL, body)
		if err != nil {
			continue
		}
		req.Header.Set("Content-Type", "application/json")

		resp, err := hc.Do(req)
		if err != nil {
			continue
		}
		if resp.StatusCode >= 500 {
			preview := mutation
			if len(preview) > 60 {
				preview = preview[:60]
			}
			anomalies = append(anomalies, map[string]any{
				"iteration":   i,
				"mutation":    preview,
				"status_code": resp.StatusCode,
			})
		}
		resp.Body.Close()
	}

	return map[string]any{
		"iterations":      iterations,
		"anomaly_count":   len(anomalies),
		"anomalies":       anomalies,
		"security_issues": len(anomalies) > 0,
	}, "completed"
}

// ── helpers ───────────────────────────────────────────────────────────────────

// buildSummary computes latency percentiles, throughput, error rate and stddev.
// Improvement #5: adds stddev_latency_ms to the summary.
func buildSummary(samples []perfSample, total, errCount, durationSec int) map[string]any {
	if len(samples) == 0 {
		return map[string]any{"total_requests": total, "error": "no samples"}
	}

	latencies := make([]int64, 0, len(samples))
	for _, s := range samples {
		latencies = append(latencies, s.latencyMs)
	}
	slices.Sort(latencies)

	pct := func(pctVal float64) int64 {
		idx := int(math.Ceil(pctVal/100*float64(len(latencies)))) - 1
		if idx < 0 {
			idx = 0
		}
		return latencies[idx]
	}

	// #5: compute standard deviation
	var sumLat float64
	for _, l := range latencies {
		sumLat += float64(l)
	}
	mean := sumLat / float64(len(latencies))
	var variance float64
	for _, l := range latencies {
		d := float64(l) - mean
		variance += d * d
	}
	stddev := math.Sqrt(variance / float64(len(latencies)))

	errRate := 0.0
	if total > 0 {
		errRate = float64(errCount) / float64(total) * 100
	}

	return map[string]any{
		"total_requests":    total,
		"error_count":       errCount,
		"error_rate":        math.Round(errRate*100) / 100,
		"p50_latency_ms":    pct(50),
		"p95_latency_ms":    pct(95),
		"p99_latency_ms":    pct(99),
		"min_latency_ms":    latencies[0],
		"max_latency_ms":    latencies[len(latencies)-1],
		"avg_latency_ms":    math.Round(mean*100) / 100,
		"stddev_latency_ms": math.Round(stddev*100) / 100,
		"throughput_rps":    math.Round(float64(total)/float64(durationSec)*100) / 100,
		"duration_seconds":  durationSec,
	}
}

func intFromConfig(cfg map[string]any, key string, def int) int {
	if v, ok := cfg[key]; ok {
		switch t := v.(type) {
		case float64:
			return int(t)
		case int:
			return t
		}
	}
	return def
}

func stringFromConfig(cfg map[string]any, key, def string) string {
	if v, ok := cfg[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return def
}

// Silence unused import — bytes is used by strings.NewReader equivalent check
var _ = bytes.NewReader

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
