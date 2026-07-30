package runner

import (
	"bytes"
	"context"
	"encoding/json"
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
	nc              *natsgo.Conn
	log             *zap.Logger
	hc              *http.Client
	controlPlaneURL string
}

func NewPerfExecutor(nc *natsgo.Conn, log *zap.Logger, controlPlaneURL string) *PerfExecutor {
	return &PerfExecutor{
		nc:              nc,
		log:             log,
		controlPlaneURL: controlPlaneURL,
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
	e.patchRunStatus(p.RunID, "running")

	var summary map[string]any
	var status string

	switch p.Type {
	case "load":
		summary, status = e.runLoad(p)
	case "stress":
		summary, status = e.runStress(p)
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
	e.patchPerfRunSummary(p.RunID, status, summary)

	e.log.Info("Perf run complete",
		zap.String("run_id", p.RunID),
		zap.String("type", p.Type),
		zap.String("status", status),
	)
}

func (e *PerfExecutor) patchRunStatus(runID, status string) {
	e.patchJSON(fmt.Sprintf("/perf-runs/%s/", runID), map[string]interface{}{"status": status})
}

func (e *PerfExecutor) patchPerfRunSummary(runID, status string, summary map[string]interface{}) {
	e.patchJSON(fmt.Sprintf("/perf-runs/%s/", runID), map[string]interface{}{
		"status":  status,
		"summary": summary,
	})
}

func (e *PerfExecutor) patchJSON(path string, body map[string]interface{}) {
	data, err := json.Marshal(body)
	if err != nil {
		return
	}
	url := e.controlPlaneURL + "/internal" + path
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

// runLoad executes a load test using configured VUs and duration.
func (e *PerfExecutor) runLoad(p PerfRunPayload) (map[string]any, string) {
	cfg := p.Config
	vus := intFromConfig(cfg, "vus", 10)
	durationSec := intFromConfig(cfg, "duration_seconds", 30)
	rampUpSec := intFromConfig(cfg, "ramp_up_seconds", 5)
	thinkTimeMs := intFromConfig(cfg, "think_time_ms", 0)
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

			if thinkTimeMs > 0 {
				select {
				case <-done:
					return
				case <-time.After(time.Duration(thinkTimeMs) * time.Millisecond):
				}
			}
		}
	}

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

	go e.publishLiveMetrics(ctx, done, p.RunID, p.ProjectID, targetURL, method, &samples, &mu, durationSec)

	<-done
	vuWg.Wait()

	return buildSummary(samples, int(totalReqs), int(errCount), durationSec), "completed"
}

// runStress executes a step-up stress test to find breaking points & SLA violations.
func (e *PerfExecutor) runStress(p PerfRunPayload) (map[string]any, string) {
	cfg := p.Config
	startVUs := intFromConfig(cfg, "start_vus", 5)
	maxVUs := intFromConfig(cfg, "max_vus", intFromConfig(cfg, "vus", 50))
	stepVUs := intFromConfig(cfg, "step_vus", 10)
	stepDurationSec := intFromConfig(cfg, "step_duration_seconds", 5)
	targetURL := stringFromConfig(cfg, "target_url", "")
	method := stringFromConfig(cfg, "method", "GET")
	thinkTimeMs := intFromConfig(cfg, "think_time_ms", 0)

	maxErrorRatePct := floatFromConfig(cfg, "max_error_rate_pct", 5.0)
	maxP95LatencyMs := floatFromConfig(cfg, "max_p95_latency_ms", 2000.0)

	if targetURL == "" {
		return map[string]any{"error": "target_url is required"}, "failed"
	}

	totalSteps := ((maxVUs - startVUs) / stepVUs) + 1
	if totalSteps < 1 {
		totalSteps = 1
	}
	totalDurationSec := totalSteps * stepDurationSec

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(totalDurationSec+10)*time.Second)
	defer cancel()

	var (
		samples   []perfSample
		mu        sync.Mutex
		totalReqs int64
		errCount  int64
		vuWg      sync.WaitGroup
	)

	done := make(chan struct{})
	timer := time.NewTimer(time.Duration(totalDurationSec) * time.Second)
	defer timer.Stop()

	go func() {
		<-timer.C
		close(done)
	}()

	hc := e.hc

	runVUWorker := func() {
		defer vuWg.Done()
		localSamples := make([]perfSample, 0, 500)
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

			if thinkTimeMs > 0 {
				select {
				case <-done:
					return
				case <-time.After(time.Duration(thinkTimeMs) * time.Millisecond):
				}
			}
		}
	}

	var currentVUs int32
	var breakingPointDetected bool
	var breakingVUs int
	var breakingReason string
	var breakingSec int

	// Step load controller
	go func() {
		stepTicker := time.NewTicker(time.Duration(stepDurationSec) * time.Second)
		defer stepTicker.Stop()

		for i := 0; i < startVUs; i++ {
			atomic.AddInt32(&currentVUs, 1)
			vuWg.Add(1)
			go runVUWorker()
		}

		for {
			select {
			case <-done:
				return
			case <-stepTicker.C:
				cur := int(atomic.LoadInt32(&currentVUs))
				if cur < maxVUs {
					toAdd := stepVUs
					if cur+toAdd > maxVUs {
						toAdd = maxVUs - cur
					}
					for i := 0; i < toAdd; i++ {
						atomic.AddInt32(&currentVUs, 1)
						vuWg.Add(1)
						go runVUWorker()
					}
				}
			}
		}
	}()

	// Publish live metrics and monitor breaking point
	go func() {
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
				snap := make([]perfSample, len(samples))
				copy(snap, samples)
				mu.Unlock()

				newCount := len(snap) - lastCount
				lastCount = len(snap)
				if newCount == 0 {
					continue
				}

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

				errRate := float64(errW) / float64(newCount) * 100
				curVUs := int(atomic.LoadInt32(&currentVUs))

				if !breakingPointDetected {
					if errRate >= maxErrorRatePct {
						breakingPointDetected = true
						breakingVUs = curVUs
						breakingReason = fmt.Sprintf("Error rate (%.1f%%) exceeded SLA threshold (%.1f%%)", errRate, maxErrorRatePct)
						breakingSec = second
					} else if p95 >= maxP95LatencyMs {
						breakingPointDetected = true
						breakingVUs = curVUs
						breakingReason = fmt.Sprintf("P95 latency (%.0fms) exceeded SLA threshold (%.0fms)", p95, maxP95LatencyMs)
						breakingSec = second
					}
				}

				_ = natsclient.Publish(e.nc, "results.metric", map[string]any{
					"time":        time.Now(),
					"project_id":  p.ProjectID,
					"run_id":      p.RunID,
					"endpoint":    targetURL,
					"method":      method,
					"status_code": 200,
					"latency_ms":  p95,
					"error":       errRate > 0,
					"rps":         newCount,
					"error_rate":  math.Round(errRate*100) / 100,
					"second":      second,
					"active_vus":  curVUs,
				})
			}
		}
	}()

	<-done
	vuWg.Wait()

	summary := buildSummary(samples, int(totalReqs), int(errCount), totalDurationSec)
	summary["breaking_point"] = map[string]any{
		"detected":       breakingPointDetected,
		"breaking_vus":   breakingVUs,
		"reason":         breakingReason,
		"timestamp_sec":  breakingSec,
		"start_vus":      startVUs,
		"max_vus":        maxVUs,
		"step_vus":       stepVUs,
		"max_error_pct":  maxErrorRatePct,
		"max_latency_ms": maxP95LatencyMs,
	}

	finalStatus := "completed"
	if breakingPointDetected {
		finalStatus = "failed"
	}

	return summary, finalStatus
}

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
				"rps":         newCount,
				"error_rate":  math.Round(errRate*100) / 100,
				"second":      second,
			})
		}
	}
}

func (e *PerfExecutor) runRateLimit(p PerfRunPayload) (map[string]any, string) {
	cfg := p.Config
	startRPS := intFromConfig(cfg, "start_rps", 5)
	maxRPS := intFromConfig(cfg, "max_rps", 100)
	rpsStep := intFromConfig(cfg, "rps_step", 5)
	stepDurationSec := intFromConfig(cfg, "step_duration_seconds", 3)

	targetURL := stringFromConfig(cfg, "target_url", "")
	method := stringFromConfig(cfg, "method", "GET")
	if method == "" {
		method = "GET"
	}
	if targetURL == "" {
		return map[string]any{"error": "target_url required"}, "failed"
	}

	headersMap := make(map[string]string)
	if hRaw, ok := cfg["headers"].(map[string]any); ok {
		for k, v := range hRaw {
			if strVal, ok := v.(string); ok {
				headersMap[k] = strVal
			}
		}
	}
	bodyStr := stringFromConfig(cfg, "body", "")

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	hc := e.hc

	var breakingPointDetected bool
	var breakingRPS int

	currentRPS := int32(startRPS)

	done := make(chan struct{})
	var wg sync.WaitGroup

	totalSteps := ((maxRPS - startRPS) / rpsStep) + 1
	if totalSteps <= 0 {
		totalSteps = 1
	}
	totalDurationSec := totalSteps * stepDurationSec

	timer := time.NewTimer(time.Duration(totalDurationSec) * time.Second)
	defer timer.Stop()

	go func() {
		<-timer.C
		close(done)
	}()

	// Step-up ticker
	go func() {
		stepTicker := time.NewTicker(time.Duration(stepDurationSec) * time.Second)
		defer stepTicker.Stop()
		for {
			select {
			case <-done:
				return
			case <-ctx.Done():
				return
			case <-stepTicker.C:
				next := atomic.LoadInt32(&currentRPS) + int32(rpsStep)
				if next > int32(maxRPS) {
					next = int32(maxRPS)
				}
				atomic.StoreInt32(&currentRPS, next)
			}
		}
	}()

	var totalRequests int64
	var rateLimitedCount int64
	var errorCount int64

	// Asynchronous dispatcher
	wg.Add(1)
	go func() {
		defer wg.Done()
		var lastRPS int32
		var ticker *time.Ticker

		for {
			cur := atomic.LoadInt32(&currentRPS)
			if ticker == nil || cur != lastRPS {
				if ticker != nil {
					ticker.Stop()
				}
				if cur > 0 {
					ticker = time.NewTicker(time.Duration(time.Second.Nanoseconds() / int64(cur)))
				}
				lastRPS = cur
			}

			select {
			case <-done:
				if ticker != nil {
					ticker.Stop()
				}
				return
			case <-ctx.Done():
				if ticker != nil {
					ticker.Stop()
				}
				return
			case <-ticker.C:
				atomic.AddInt64(&totalRequests, 1)
				wg.Add(1)
				go func() {
					defer wg.Done()
					var bodyReader *bytes.Reader
					if bodyStr != "" {
						bodyReader = bytes.NewReader([]byte(bodyStr))
					}
					var req *http.Request
					var err error
					if bodyReader != nil {
						req, err = http.NewRequestWithContext(ctx, method, targetURL, bodyReader)
					} else {
						req, err = http.NewRequestWithContext(ctx, method, targetURL, nil)
					}
					if err == nil {
						for k, v := range headersMap {
							req.Header.Set(k, v)
						}
						resp, err := hc.Do(req)

						if err != nil {
							atomic.AddInt64(&errorCount, 1)
						} else {
							if resp.StatusCode == 429 {
								atomic.AddInt64(&rateLimitedCount, 1)
							} else if resp.StatusCode >= 400 {
								atomic.AddInt64(&errorCount, 1)
							}
							resp.Body.Close()
						}
					} else {
						atomic.AddInt64(&errorCount, 1)
					}
				}()
			}
		}
	}()

	// Live metrics publisher & breaking point detector
	wg.Add(1)
	go func() {
		defer wg.Done()
		tick := time.NewTicker(time.Second)
		defer tick.Stop()
		second := 0
		var lastRL int64
		var lastTotal int64

		for {
			select {
			case <-done:
				return
			case <-ctx.Done():
				return
			case <-tick.C:
				second++

				rlCount := atomic.LoadInt64(&rateLimitedCount)
				totCount := atomic.LoadInt64(&totalRequests)

				recentRL := rlCount - lastRL
				recentTotal := totCount - lastTotal

				lastRL = rlCount
				lastTotal = totCount

				if recentTotal == 0 {
					continue
				}

				curRPS := int(atomic.LoadInt32(&currentRPS))

				if !breakingPointDetected && recentRL > 0 {
					breakingPointDetected = true
					breakingRPS = curRPS
					
					// Halt early if limit found
					go func() {
						defer func(){ recover() }()
						close(done)
					}()
				}

				_ = natsclient.Publish(e.nc, "results.metric", map[string]any{
					"time":           time.Now(),
					"project_id":     p.ProjectID,
					"run_id":         p.RunID,
					"endpoint":       targetURL,
					"method":         method,
					"status_code":    200,
					"latency_ms":     0,
					"error":          recentRL > 0,
					"rps":            recentTotal,
					"active_rps":     curRPS,
					"rate_limited":   recentRL,
					"second":         second,
					"breaking_point": breakingPointDetected,
				})
			}
		}
	}()

	<-done
	cancel() // Ensure we don't leak anything
	wg.Wait()

	total := atomic.LoadInt64(&totalRequests)
	rateLimited := atomic.LoadInt64(&rateLimitedCount)

	rateLimitPct := 0.0
	if total > 0 {
		rateLimitPct = float64(rateLimited) / float64(total) * 100
	}

	summary := map[string]any{
		"total_requests":      total,
		"rate_limited_count":  rateLimited,
		"rate_limited_pct":    rateLimitPct,
		"rate_limit_detected": breakingPointDetected,
	}

	if breakingPointDetected {
		summary["breaking_rps"] = breakingRPS
	}

	return summary, "completed"
}

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
		string(make([]byte, 10000)),
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(iterations*2+10)*time.Second)
	defer cancel()

	hc := e.hc
	var anomalies []map[string]any

	for i := 0; i < iterations; i++ {
		mutation := mutations[i%len(mutations)]

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

func floatFromConfig(cfg map[string]any, key string, def float64) float64 {
	if v, ok := cfg[key]; ok {
		switch t := v.(type) {
		case float64:
			return t
		case int:
			return float64(t)
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

var _ = bytes.NewReader

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
