package api

import (
	"database/sql"
	"net/http"

	_ "github.com/lib/pq"
	"go.uber.org/zap"
)

// Handler serves metrics API endpoints.
type Handler struct {
	db  *sql.DB
	log *zap.Logger
}

// NewHandler initializes HTTP routing for metrics service.
func NewHandler(dsn string, log *zap.Logger) http.Handler {
	mux := http.NewServeMux()
	h := &Handler{log: log}
	if dsn != "" {
		if db, err := sql.Open("postgres", dsn); err == nil {
			h.db = db
		}
	}

	mux.HandleFunc("/health", h.handleHealth)
	mux.HandleFunc("/api/metrics/ping", h.handleHealth)
	return mux
}

func (h *Handler) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{"status":"ok"}`))
}
