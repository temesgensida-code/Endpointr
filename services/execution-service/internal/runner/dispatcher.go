// Package runner dispatches run jobs received from NATS to worker goroutines.
package runner

import (
	"context"
	"encoding/json"

	natsgo "github.com/nats-io/nats.go"
	"go.uber.org/zap"

)

// NATS subjects the dispatcher subscribes to.
const (
	SubjectWorkflowRun = "runs.workflow.requested"
	SubjectPerfRun     = "runs.perf.requested"
)

// WorkflowRunPayload is the JSON envelope published by Django.
type WorkflowRunPayload struct {
	RunID      string         `json:"run_id"`
	WorkflowID string         `json:"workflow_id"`
	ProjectID  string         `json:"project_id"`
	Definition map[string]any `json:"definition"` // React Flow DAG
}

// PerfRunPayload is published by Django performance.views.
type PerfRunPayload struct {
	RunID    string         `json:"run_id"`
	ConfigID string         `json:"config_id"`
	Type     string         `json:"type"` // load | stress | rate_limit | fuzz
	Config   map[string]any `json:"config"`
	ProjectID string        `json:"project_id"`
}

// Dispatcher manages subscriptions and a worker pool.
type Dispatcher struct {
	nc          *natsgo.Conn
	log         *zap.Logger
	workerCount int
	jobCh       chan job
}

type job struct {
	subject string
	data    []byte
}

// NewDispatcher creates a Dispatcher with workerCount goroutines.
func NewDispatcher(nc *natsgo.Conn, log *zap.Logger, workerCount int) *Dispatcher {
	return &Dispatcher{
		nc:          nc,
		log:         log,
		workerCount: workerCount,
		jobCh:       make(chan job, workerCount*4),
	}
}

// Start subscribes to NATS and launches worker goroutines.
func (d *Dispatcher) Start(ctx context.Context) error {
	// Launch workers
	for i := 0; i < d.workerCount; i++ {
		go d.worker(ctx)
	}

	handler := func(msg *natsgo.Msg) {
		select {
		case d.jobCh <- job{subject: msg.Subject, data: msg.Data}:
		default:
			d.log.Warn("Job queue full — dropping message", zap.String("subject", msg.Subject))
		}
	}

	if _, err := d.nc.Subscribe(SubjectWorkflowRun, handler); err != nil {
		return err
	}
	if _, err := d.nc.Subscribe(SubjectPerfRun, handler); err != nil {
		return err
	}
	return nil
}

func (d *Dispatcher) worker(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case j := <-d.jobCh:
			d.handle(j)
		}
	}
}

func (d *Dispatcher) handle(j job) {
	switch j.subject {
	case SubjectWorkflowRun:
		var p WorkflowRunPayload
		if err := json.Unmarshal(j.data, &p); err != nil {
			d.log.Error("Failed to unmarshal workflow payload", zap.Error(err))
			return
		}
		d.log.Info("Executing workflow run", zap.String("run_id", p.RunID))
		executor := NewWorkflowExecutor(d.nc, d.log)
		executor.Execute(p)

	case SubjectPerfRun:
		var p PerfRunPayload
		if err := json.Unmarshal(j.data, &p); err != nil {
			d.log.Error("Failed to unmarshal perf payload", zap.Error(err))
			return
		}
		d.log.Info("Executing perf run", zap.String("run_id", p.RunID), zap.String("type", p.Type))
		executor := NewPerfExecutor(d.nc, d.log)
		executor.Execute(p)
	}
}
