// execution-service — Endpointr Go execution plane
//
// Subscribes to NATS run-request subjects and executes:
//   - Workflow / collection runs      (runs.workflow.requested)
//   - Load / stress / fuzz perf runs  (runs.perf.requested)
//
// After each run it publishes results back on:
//   - results.run.completed
//   - results.metric          (sampled per VU tick)
//
// Results are also PATCH'd back to the Django control-plane REST API
// so WorkflowRun / PerfTestRun rows are updated in Postgres.
package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	natsclient "github.com/endpointr/execution-service/internal/nats"
	"github.com/endpointr/execution-service/internal/runner"
)

func main() {
	natsURL := envOrDefault("NATS_URL", "nats://localhost:4222")
	controlPlaneURL := envOrDefault("CONTROL_PLANE_URL", "http://localhost:8000")
	workerCount := 8

	log.Printf("[execution-service] connecting to NATS at %s", natsURL)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	nc, err := natsclient.Connect(natsURL)
	if err != nil {
		log.Fatalf("[execution-service] NATS connect failed: %v", err)
	}
	defer nc.Close()

	r := runner.New(nc, controlPlaneURL, workerCount)
	if err := r.SubscribeAll(ctx); err != nil {
		log.Fatalf("[execution-service] subscription failed: %v", err)
	}

	log.Printf("[execution-service] ready — %d workers", workerCount)

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGTERM, syscall.SIGINT)
	<-sigCh
	log.Println("[execution-service] shutting down…")
	cancel()
	time.Sleep(500 * time.Millisecond)
}

func envOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
