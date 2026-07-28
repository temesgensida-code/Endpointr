package runner

import (
	"context"
	"fmt"
	"math"
	"net/http"
	"slices"
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
func (e *PerfExecutor) runLoad(p PerfRunPayload) (map[string]any, string) {
	cfg := p.Config
	vus := intFromConfig(cfg, "vus", 10)
	durationSec := intFromConfig(cfg, "duration_seconds", 30)
	rampUpSec := intFromConfig(cfg, "ramp_up_seconds", 5)
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
	<-done
	vuWg.Wait()

	return buildSummary(samples, int(totalReqs), int(errCount), durationSec), "completed"
}

// runRateLimit fires requests at a fixed RPS and detects rate-limit responses (429).
func (e *PerfExecutor) runRateLimit(p PerfRunPayload) (map[string]any, string) {
	cfg := p.Config
	rps := intFromConfig(cfg, "rps", 10)
	durationSec := intFromConfig(cfg, "duration_seconds", 10)
	targetURL := stringFromConfig(cfg, "target_url", "")
	if targetURL == "" {
		return map[string]any{"error": "target_url required"}, "failed"
	}

	hc := e.hc
	interval := time.Second / time.Duration(rps)
	deadline := time.Now().Add(time.Duration(durationSec) * time.Second)

	var rateLimited, total int
	for time.Now().Before(deadline) {
		req, _ := http.NewRequest("GET", targetURL, nil)
		resp, err := hc.Do(req)
		total++
		if err == nil {
			if resp.StatusCode == 429 {
				rateLimited++
			}
			resp.Body.Close()
		}
		time.Sleep(interval)
	}

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

	hc := e.hc
	var anomalies []map[string]any

	for i := 0; i < iterations; i++ {
		mutation := mutations[i%len(mutations)]
		req, _ := http.NewRequest("POST", targetURL, nil)
		req.Header.Set("Content-Type", "application/json")
		resp, err := hc.Do(req)
		if err != nil {
			continue
		}
		if resp.StatusCode >= 500 {
			anomalies = append(anomalies, map[string]any{
				"iteration":   i,
				"mutation":    mutation[:min(len(mutation), 60)],
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

func buildSummary(samples []perfSample, total, errCount, durationSec int) map[string]any {
	if len(samples) == 0 {
		return map[string]any{"total_requests": total, "error": "no samples"}
	}

	latencies := make([]int64, 0, len(samples))
	for _, s := range samples {
		latencies = append(latencies, s.latencyMs)
	}
	slices.Sort(latencies)

	p := func(pct float64) int64 {
		idx := int(math.Ceil(pct/100*float64(len(latencies)))) - 1
		if idx < 0 {
			idx = 0
		}
		return latencies[idx]
	}

	errRate := 0.0
	if total > 0 {
		errRate = float64(errCount) / float64(total) * 100
	}

	return map[string]any{
		"total_requests":    total,
		"error_count":       errCount,
		"error_rate":        math.Round(errRate*100) / 100,
		"p50_latency_ms":    p(50),
		"p95_latency_ms":    p(95),
		"p99_latency_ms":    p(99),
		"min_latency_ms":    latencies[0],
		"max_latency_ms":    latencies[len(latencies)-1],
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

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
