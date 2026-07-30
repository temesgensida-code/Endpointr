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
	"os"
	"os/signal"
	"syscall"
	"time"

	"go.uber.org/zap"

	natsclient "github.com/endpointr/execution-service/internal/nats"
	"github.com/endpointr/execution-service/internal/runner"
)

func main() {
	logger, _ := zap.NewProduction()
	defer logger.Sync()

	natsURL := envOrDefault("NATS_URL", "nats://localhost:4222")
	controlPlaneURL := envOrDefault("CONTROL_PLANE_URL", "http://localhost:8000")
	workerCount := 8

	logger.Info("Connecting to NATS", zap.String("nats_url", natsURL))

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	nc, err := natsclient.Connect(natsURL)
	if err != nil {
		logger.Fatal("NATS connect failed", zap.Error(err))
	}
	defer nc.Close()

	d := runner.NewDispatcher(nc, logger, workerCount, controlPlaneURL)
	if err := d.Start(ctx); err != nil {
		logger.Fatal("Subscription failed", zap.Error(err))
	}

	logger.Info("Execution service ready", zap.Int("workers", workerCount))

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGTERM, syscall.SIGINT)
	<-sigCh
	logger.Info("Shutting down execution service...")
	cancel()
	time.Sleep(500 * time.Millisecond)
}

func envOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
