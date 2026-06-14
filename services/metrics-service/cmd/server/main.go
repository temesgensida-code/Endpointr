// Endpointr Metrics Service
// Consumes results.metric events from NATS and writes them to TimescaleDB.
// Exposes a lightweight HTTP API for dashboard queries until TimescaleDB
// continuous aggregates are plumbed into the Django reports app.
package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"go.uber.org/zap"

	"github.com/endpointr/metrics-service/internal/ingest"
	"github.com/endpointr/metrics-service/internal/api"
)

func main() {
	log, _ := zap.NewProduction()
	defer log.Sync()

	natsURL := env("NATS_URL", "nats://localhost:4222")
	tsdsn := env("TIMESCALE_DSN", "")
	listenAddr := env("METRICS_LISTEN", ":8001")

	log.Info("Metrics service starting",
		zap.String("nats_url", natsURL),
		zap.String("listen", listenAddr),
	)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Start NATS ingest
	ingester, err := ingest.New(natsURL, tsdsn, log)
	if err != nil {
		log.Fatal("Ingest init failed", zap.Error(err))
	}
	go ingester.Run(ctx)

	// Start HTTP API
	handler := api.NewHandler(tsdsn, log)
	srv := &http.Server{Addr: listenAddr, Handler: handler}
	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Error("HTTP server error", zap.Error(err))
		}
	}()

	log.Info("Metrics service ready")

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig

	log.Info("Shutting down...")
	cancel()
	shutCtx, shutCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutCancel()
	srv.Shutdown(shutCtx)
}

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
