// Package ingest buffers MetricEvents and bulk-inserts them into TimescaleDB.
package ingest

import (
	"context"
	"database/sql"
	"log"
	"sync"
	"time"

	_ "github.com/lib/pq"
)

// MetricEvent is the JSON payload published on results.metric.
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

// Ingester buffers events and flushes on size or time threshold.
type Ingester struct {
	db          *sql.DB
	batchSize   int
	flushPeriod time.Duration
	buf         []MetricEvent
	mu          sync.Mutex
	ch          chan MetricEvent
}

func New(dsn string, batchSize int, flushPeriod time.Duration) (*Ingester, error) {
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(5)
	if err := db.Ping(); err != nil {
		return nil, err
	}
	return &Ingester{db: db, batchSize: batchSize, flushPeriod: flushPeriod, ch: make(chan MetricEvent, batchSize*4)}, nil
}

func (ing *Ingester) Enqueue(m MetricEvent) {
	select {
	case ing.ch <- m:
	default:
		log.Println("[ingest] buffer full — dropping event")
	}
}

func (ing *Ingester) Start(ctx context.Context) {
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

func (ing *Ingester) flush() {
	ing.mu.Lock()
	if len(ing.buf) == 0 {
		ing.mu.Unlock()
		return
	}
	batch := ing.buf
	ing.buf = nil
	ing.mu.Unlock()

	tx, err := ing.db.Begin()
	if err != nil {
		log.Printf("[ingest] tx: %v", err)
		return
	}
	stmt, err := tx.Prepare(`INSERT INTO request_metrics (time,project_id,run_id,endpoint,method,status_code,latency_ms,error) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`)
	if err != nil {
		tx.Rollback()
		return
	}
	defer stmt.Close()
	for _, m := range batch {
		stmt.Exec(m.Time, m.ProjectID, m.RunID, m.Endpoint, m.Method, m.StatusCode, m.LatencyMs, m.Error)
	}
	tx.Commit()
	log.Printf("[ingest] flushed %d rows", len(batch))
}

func (ing *Ingester) Close() { ing.db.Close() }
