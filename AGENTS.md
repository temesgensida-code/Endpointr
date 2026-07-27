# AGENTS.md — Endpointr Monorepo

> **Read this file in its entirety before writing any code in this repository.**
> It describes the full architecture, tech stack, data-flow, naming conventions,
> and hard rules that every agent must follow.

---

## 1. Project Overview

**Endpointr** is an API testing & observability platform.  
Users create *Projects*, define *API Collections*, build *Workflows* (React Flow DAGs),
run *Performance tests*, configure *Monitors*, and view live metrics — all from a single SaaS UI.

---

## 2. Repository Layout

```
Endpointr/
├── backend/                  # Django 6 control-plane (Python)
│   ├── backend/              # Django project settings, urls, asgi, wsgi
│   ├── AI_handler/           # Gemini LLM chat + embedding
│   ├── API_request/          # Proxy & saved-request executor
│   ├── Authentication/       # Clerk JWT auth (DRF + decorators)
│   ├── api_collections/      # Collection CRUD
│   ├── audit/                # Immutable audit log (AuditActorMiddleware)
│   ├── contracts/            # Contract / schema management
│   ├── documentation/        # Auto-generated API docs
│   ├── monitoring/           # Uptime monitors + incidents
│   ├── performance/          # PerfTestConfig + PerfTestRun models/views
│   ├── projects/             # Project + ProjectMember + ApiKey models
│   ├── realtime/             # Django Channels WebSocket consumers + NATS bridge
│   ├── reports/              # Reporting app
│   ├── security_tools/       # Security scan tooling
│   ├── users/                # User profile
│   └── workflows/            # Workflow + WorkflowRun models/views
│
├── frontend/                 # React 19 + Vite 8 SPA
│   └── src/
│       ├── components/       # Feature-scoped UI (auth|collections|dashboard|…)
│       ├── hooks/            # Custom React hooks
│       └── services/         # API client helpers
│
├── services/
│   ├── execution-service/    # Go 1.25 — runs workflow & perf tests
│   │   └── internal/
│   │       ├── nats/         # NATS client wrapper
│   │       └── runner/       # Dispatcher + WorkflowExecutor + PerfExecutor
│   └── metrics-service/      # Go 1.25 — ingests NATS metrics → TimescaleDB
│       └── internal/ingest/
│
├── docker-compose.yml        # Full local stack
└── .env.example              # Canonical env-var reference
```

---

## 3. Technology Stack (non-negotiable)

| Layer | Technology | Notes |
|---|---|---|
| Backend framework | **Django 6 + Daphne** | ASGI; served via Daphne, not gunicorn |
| Async / WebSockets | **Django Channels** | InMemory layer (dev), Redis layer (prod) |
| Auth | **Clerk** | JWT validated via JWKS; no Django User rows |
| REST API | **Django REST Framework** | `ClerkJWTAuthentication` is the default |
| Message bus | **NATS 2.10** | JetStream enabled |
| Primary DB | **PostgreSQL 16** (SQLite in dev) | Via `DATABASE_URL` |
| Metrics DB | **TimescaleDB** (pg16) | Via `TIMESCALE_DSN`; only metrics-service writes here |
| Cache / Channels | **Redis 7** | `REDIS_URL` |
| Go services | **Go 1.25** | `nats.go v1.52`, `zap v1.28` |
| Frontend | **React 19 + Vite 8** | JSX; Clerk React SDK; no TypeScript |
| Styling | **Vanilla CSS** (`index.css`) | No Tailwind, no CSS-in-JS |
| AI | **Gemini 2.5 Flash** | `GEMINI_API_KEY`; embeddings via `gemini-embedding-001` |

---

## 4. Data Flow

```
Browser (React)
    ↕ REST  (port 8000)
    ↕ WS    (port 8000, ws://.../ws/...)
Django (Daphne) ──NATS publish──▶ execution-service (Go)
                                        │  results.run.completed / results.run.status
                                        ▼
                               NATS ──▶ realtime/bridge.py ──▶ Redis channel groups
                                                                  ↓
                                                          WebSocket consumers
                                                                  ↓
                                                              Browser
                               NATS ──▶ metrics-service (Go) ──▶ TimescaleDB
```

Key NATS subjects:
| Subject | Publisher | Consumer |
|---|---|---|
| `runs.workflow.requested` | Django `workflows/views.py` | execution-service Dispatcher |
| `runs.perf.requested` | Django `performance/views.py` | execution-service Dispatcher |
| `results.run.completed` | execution-service | realtime bridge + metrics-service |
| `results.run.status` | execution-service | realtime bridge |
| `results.metric` | execution-service | realtime bridge (per-node live) |

---

## 5. Authentication Rules

- **All DRF views** must use `permission_classes = [IsAuthenticated]` (wired to `ClerkJWTAuthentication`).
- `request.user` is a `_ClerkUser` — it has `.clerk_sub` (string) but **no `.pk` / no Django User row**.
- Filter all querysets by `owner_clerk_id=request.user.clerk_sub` or project membership.
- **WebSocket auth**: Clerk token passed as `?token=...` query param; validated in `realtime/consumers.py::_authenticate()`.
- **Dev bypass**: If `CLERK_JWT_ISSUER` is empty and `DEBUG=True`, pass `X-Dev-User-Id` header to authenticate as any user.

---

## 6. Django App Conventions

### Models
- All primary keys are `UUIDField(primary_key=True, default=uuid.uuid4, editable=False)`.
- Owner references are `clerk_user_id` / `owner_clerk_id` CharField(255) — **never a ForeignKey to auth.User**.
- Timestamps: `created_at = auto_now_add`, `updated_at = auto_now`.
- `audit` app must remain **last** in `INSTALLED_APPS` (it listens to signals from all other apps).

### Views / URLs
- Use **DRF ViewSets** or `APIView`; never plain Django views for API endpoints.
- Internal endpoints (called by Go services) live in `internal_views.py` within each app (example: `workflows/internal_views.py`, `performance/internal_views.py`).
- URL prefixes follow the pattern `/api/<app>/` for user-facing endpoints; `/internal/<app>/` for Go-service callbacks.
- Always add new URL includes to `backend/urls.py`.

### NATS Publishing (Django → Go)
```python
# Use the nats_client.py pattern in each app:
from workflows.nats_client import publish_workflow_run
```
- Publish JSON with snake_case keys.
- Include `run_id`, `project_id`, and the relevant payload.

---

## 7. Go Service Conventions

### Module names
- execution-service: `github.com/endpointr/execution-service`
- metrics-service: `github.com/endpointr/metrics-service`

### Logging
- **Always use `go.uber.org/zap`** (`zap.Logger`), never `fmt.Println` or `log.Printf` in production paths.
- Pass logger by pointer; create with `zap.NewProduction()` in `cmd/main.go`.

### NATS client
- Use `internal/nats/client.go` wrapper (`natsclient.Publish(nc, subject, payload)`) for publishing.
- Dispatcher subscribes in `internal/runner/dispatcher.go`; do not add new subscriptions outside this file.

### Executor pattern
- `WorkflowExecutor` → handles `runs.workflow.requested`.
- `PerfExecutor` → handles `runs.perf.requested` (load | stress | rate_limit | fuzz).
- Add new run types by adding a new `Executor` struct and registering it in `dispatcher.go::handle()`.

### HTTP client
- Always use `http.NewRequestWithContext(ctx, ...)` — never `http.NewRequest` without context.
- Set reasonable timeouts; default is 30s for workflow nodes, 10s for perf VUs.

---

## 8. Frontend Conventions

### State & Auth
- Use `useAuth()` and `useUser()` from `@clerk/react` — never store tokens in localStorage manually.
- API calls must attach the Clerk session token: `const { getToken } = useAuth(); const token = await getToken();`
- Pass as `Authorization: Bearer <token>` header.

### Component structure
```
src/components/<feature>/
    <Feature>Page.jsx       # page-level component (route target)
    <Widget>.jsx            # sub-components
```

### Styling
- All global tokens and utilities are in `src/index.css`.
- **No inline styles** for anything beyond single-use positioning.
- **No Tailwind**.

### API service layer
- HTTP helpers live in `src/services/` — do not scatter `fetch()` calls across components.

### WebSocket (real-time)
- Connect to `ws://localhost:8000/ws/runs/<run_id>/live/?token=<clerk_token>`
- Use custom hooks in `src/hooks/` (e.g. `useRunLive`, `useMonitorLive`).

---

## 9. Run / Dev Commands

```bash
# Backend only (SQLite + InMemory channels — no Go services needed)
cd backend
python manage.py migrate
daphne -b 0.0.0.0 -p 8000 backend.asgi:application

# Frontend
cd frontend
npm run dev          # Vite dev server on :5173

# Full stack (Docker)
docker compose up

# NATS bridge (separate process when not in Docker)
cd backend
python manage.py run_bridge

# Go execution-service
cd services/execution-service
go run ./cmd/...

# Go metrics-service
cd services/metrics-service
go run ./cmd/...
```

---

## 10. Environment Variables (from `.env.example`)

| Variable | Used by | Purpose |
|---|---|---|
| `SECRET_KEY` | Django | Django secret |
| `DEBUG` | Django | `true` enables dev-bypass auth |
| `DATABASE_URL` | Django | Postgres DSN (blank = SQLite) |
| `TIMESCALE_DSN` | metrics-service | TimescaleDB connection |
| `REDIS_URL` | Django Channels | Redis channel layer |
| `NATS_URL` | Django + Go services | NATS broker |
| `CLERK_JWT_ISSUER` | Django | Clerk tenant URL |
| `CLERK_JWKS_URL` | Django | JWKS endpoint for JWT validation |
| `CLERK_JWT_AUDIENCE` | Django | Expected `aud` claim |
| `VITE_CLERK_PUBLISHABLE_KEY` | React | Clerk frontend key |
| `GEMINI_API_KEY` | Django AI_handler | LLM API key |
| `GEMINI_MODEL` | Django | Default: `gemini-2.5-flash` |
| `CONTROL_PLANE_URL` | execution-service | Django base URL for PATCH callbacks |

---

## 11. Hard Rules (never violate)

1. **Never use Django's built-in `auth.User` as FK target** — Clerk is the identity source.
2. **Never run migrations inside Go services** — only Django owns the primary DB.
3. **Never bypass `ClerkJWTAuthentication`** in production views.
4. **Never write to TimescaleDB from Django** — only the metrics-service does so.
5. **Never add new NATS subscriptions outside `dispatcher.go`** in execution-service.
6. **Never use `log.Printf` in Go production paths** — use `zap.Logger`.
7. **Always run `python manage.py migrate`** before testing Django after model changes.
8. **The `audit` app must stay last in `INSTALLED_APPS`** — it depends on signals from all others.
9. **Frontend has no TypeScript** — keep all files `.jsx` / `.js`.
10. **WebSocket auth uses `?token=` query param**, not Authorization header (WebSocket limitation).
