// Package ingest buffers MetricEvents and bulk-inserts them into TimescaleDB using PostgreSQL COPY.
package ingest

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/lib/pq"
	natsgo "github.com/nats-io/nats.go"
	"go.uber.org/zap"
)

const (
	SubjectMetricResults = "results.metric"
	DefaultBatchSize     = 1000
	DefaultFlushPeriod   = 250 * time.Millisecond
)

// MetricEvent represents a single endpoint execution metric.
type MetricEvent struct {
	Time       time.Time `json:"time"`
	ProjectID  string    `json:"project_id"`
	RunID      string    `json:"run_id"`
	Endpoint   string    `json:"endpoint"`
	Method     string    `json:"method"`
	StatusCode int       `json:"status_code"`
	LatencyMs  float64   `json:"latency_ms"`
	Error      bool      `json:"error"`
}

// Ingester handles NATS metric subscription and bulk TimescaleDB COPY insertions.
type Ingester struct {
	nc          *natsgo.Conn
	db          *sql.DB
	log         *zap.Logger
	batchSize   int
	flushPeriod time.Duration
	buf         []MetricEvent
	mu          sync.Mutex
	ch          chan MetricEvent
}

// New initializes the NATS client connection, PostgreSQL pool, and Ingester instance.
func New(natsURL, dsn string, log *zap.Logger) (*Ingester, error) {
	nc, err := natsgo.Connect(natsURL)
	if err != nil {
		return nil, fmt.Errorf("nats connect error: %w", err)
	}

	var db *sql.DB
	if dsn != "" {
		d, err := sql.Open("postgres", dsn)
		if err != nil {
			log.Warn("Failed to open Postgres pool — metrics will be dropped", zap.Error(err))
		} else {
			d.SetMaxOpenConns(10)
			d.SetMaxIdleConns(5)
			if err := d.Ping(); err != nil {
				log.Warn("Postgres ping failed — metrics will be dropped until DB ready", zap.Error(err))
			} else {
				db = d
				// Ensure request_metrics table exists
				createTableSQL := `
				CREATE TABLE IF NOT EXISTS request_metrics (
					time TIMESTAMPTZ NOT NULL,
					project_id TEXT,
					run_id TEXT,
					endpoint TEXT,
					method TEXT,
					status_code INT,
					latency_ms DOUBLE PRECISION,
					error BOOLEAN
				);`
				if _, err := db.Exec(createTableSQL); err != nil {
					log.Warn("Failed to create request_metrics table", zap.Error(err))
				}
				// Try creating TimescaleDB hypertable (ignored if standard Postgres or already hypertable)
				_, _ = db.Exec("SELECT create_hypertable('request_metrics', 'time', if_not_exists => TRUE);")
			}
		}
	} else {
		log.Warn("TIMESCALE_DSN is empty — running ingest in dry-run mode")
	}

	return &Ingester{
		nc:          nc,
		db:          db,
		log:         log,
		batchSize:   DefaultBatchSize,
		flushPeriod: DefaultFlushPeriod,
		buf:         make([]MetricEvent, 0, DefaultBatchSize),
		ch:          make(chan MetricEvent, DefaultBatchSize*4),
	}, nil
}

// Enqueue adds a metric event to the buffer queue.
func (ing *Ingester) Enqueue(m MetricEvent) {
	select {
	case ing.ch <- m:
	default:
		ing.log.Warn("Metrics queue full — dropping event", zap.String("run_id", m.RunID))
	}
}

// Run subscribes to NATS metric subjects and flushes batches on size or timer triggers.
func (ing *Ingester) Run(ctx context.Context) {
	_, err := ing.nc.Subscribe(SubjectMetricResults, func(msg *natsgo.Msg) {
		var event MetricEvent
		if err := json.Unmarshal(msg.Data, &event); err != nil {
			ing.log.Error("Failed to unmarshal metric event JSON", zap.Error(err))
			return
		}
		if event.Time.IsZero() {
			event.Time = time.Now()
		}
		ing.Enqueue(event)
	})

	if err != nil {
		ing.log.Error("Failed to subscribe to NATS metrics topic", zap.Error(err))
		return
	}

	ing.log.Info("Ingester listening on NATS subject", zap.String("subject", SubjectMetricResults))

	ticker := time.NewTicker(ing.flushPeriod)
	defer ticker.Stop()

	for {
		select {
		case m := <-ing.ch:
			ing.mu.Lock()
			ing.buf = append(ing.buf, m)
			full := len(ing.buf) >= ing.batchSize
			ing.mu.Unlock()
			if full {
				ing.flush()
			}
		case <-ticker.C:
			ing.flush()
		case <-ctx.Done():
			ing.flush()
			return
		}
	}
}

// flush executes bulk ingestion into TimescaleDB using PostgreSQL COPY protocol.
func (ing *Ingester) flush() {
	ing.mu.Lock()
	if len(ing.buf) == 0 {
		ing.mu.Unlock()
		return
	}
	batch := ing.buf
	ing.buf = make([]MetricEvent, 0, ing.batchSize)
	ing.mu.Unlock()

	if ing.db == nil {
		ing.log.Debug("Skipping metric flush — no active DB connection", zap.Int("batch_size", len(batch)))
		return
	}

	tx, err := ing.db.Begin()
	if err != nil {
		ing.log.Error("Failed to begin transaction for metrics flush", zap.Error(err))
		return
	}

	// Prepare PostgreSQL COPY statement (10-50x faster than standard INSERT statements)
	stmt, err := tx.Prepare(pq.CopyIn("request_metrics", "time", "project_id", "run_id", "endpoint", "method", "status_code", "latency_ms", "error"))
	if err != nil {
		ing.log.Error("Failed to prepare COPY statement", zap.Error(err))
		_ = tx.Rollback()
		return
	}

	for _, m := range batch {
		t := m.Time
		if t.IsZero() {
			t = time.Now()
		}
		_, err = stmt.Exec(t, m.ProjectID, m.RunID, m.Endpoint, m.Method, m.StatusCode, m.LatencyMs, m.Error)
		if err != nil {
			ing.log.Error("Failed exec on COPY row", zap.Error(err))
			_ = stmt.Close()
			_ = tx.Rollback()
			return
		}
	}

	// Finalize COPY protocol stream
	_, err = stmt.Exec()
	if err != nil {
		ing.log.Error("Failed to flush COPY statement", zap.Error(err))
		_ = stmt.Close()
		_ = tx.Rollback()
		return
	}

	if err := stmt.Close(); err != nil {
		ing.log.Error("Failed to close COPY statement", zap.Error(err))
		_ = tx.Rollback()
		return
	}

	if err := tx.Commit(); err != nil {
		ing.log.Error("Failed to commit COPY transaction", zap.Error(err))
		return
	}

	ing.log.Info("Flushed metric batch via PostgreSQL COPY", zap.Int("count", len(batch)))
}

// Close releases resources.
func (ing *Ingester) Close() {
	if ing.nc != nil {
		ing.nc.Close()
	}
	if ing.db != nil {
		_ = ing.db.Close()
	}
}
