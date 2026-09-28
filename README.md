# Real-Time Event Dashboard

A responsive single-page app that ingests, filters, and visualizes live user activity logs. The API stores events in PostgreSQL and pushes new rows over WebSocket. The React UI applies event-type, time-range, and payload-search filters to both the activity feed and the analytics charts. If the socket drops, the UI polls every 5 seconds.

## Quick start (one command)

Requires [Docker Desktop](https://docs.docker.com/get-docker/) (or Docker Engine + Compose v2). No `.env` file is required.

```bash
git clone <your-repo-url>
cd taskassignment
docker compose up --build
```

Open **http://localhost:8080**.

That command:

1. Builds the backend and frontend images
2. Starts PostgreSQL and waits until it is healthy
3. Runs the events table migration
4. Serves the UI on port 8080 (nginx proxies `/api`, `/health`, and `/ws` to the API)

Stop with `Ctrl+C`. Tear down with `docker compose down`. Add `-v` to also delete stored events.

### Generate sample traffic

In a second terminal, with the stack still running:

```bash
cd backend
cp .env.example .env
npm ci
API_URL=http://localhost:8080 npm run simulate
```

The simulator posts random `login`, `logout`, `page_view`, `click`, `purchase`, `error`, and `signup` events every 2.5s (under the 30 req/min limit). Stop with `Ctrl+C`. Use `COUNT=20 npm run simulate` for a finite run.

Health check:

```bash
curl http://localhost:8080/health
```

## Architecture

```mermaid
flowchart LR
  Browser -->|"HTTP /api, WS /ws"| Nginx
  Nginx -->|"proxy /api /health /ws"| Api[Express API]
  Api --> RateLimit[Rate limiter]
  RateLimit --> Repo[EventRepository]
  Repo --> Postgres[(PostgreSQL)]
  Api -->|"broadcast event.created"| Ws[WebSocket /ws]
  Ws --> Browser
```

Production (Docker) is a single origin: the browser only talks to nginx on port 8080.

```mermaid
flowchart TB
  subgraph docker [docker compose]
    Frontend[frontend nginx :8080]
    Backend[backend Node :4000]
    Db[db Postgres 16]
  end
  User[Browser] --> Frontend
  Frontend -->|"/api /health /ws"| Backend
  Backend --> Db
```

| Service | Build / image | Role |
| --- | --- | --- |
| `db` | `postgres:16-alpine` | Event store (`events` table + indexes) |
| `backend` | `backend/Dockerfile` | REST + WebSocket API, migrations at boot |
| `frontend` | `frontend/Dockerfile` | Vite production build served by nginx |

### Request flow

1. **Ingest** — `POST /api/events` validates the body (zod), writes through `PostgresEventRepository`, then broadcasts `{ type: "event.created", event }` on `/ws`.
2. **List** — `GET /api/events` applies parameterized filters (`event_type`, `from`/`to`, `q`) with pagination.
3. **Analytics** — `GET /api/events/analytics` returns counts per type and per hour for a time window, optionally restricted to selected types.
4. **UI** — URL query state (`types`, `range`, `q`, `page`) is mapped to those API params. The feed also filters client-side so a previous page of results cannot leak after you change chips or the date range. Live inserts that do not match the current filters are ignored.

### Stack

| Layer | Technology |
| --- | --- |
| API | Node 22, TypeScript, Express 5, zod, `pg`, `ws`, pino, helmet, cors, express-rate-limit |
| UI | React 19, Vite, TypeScript, Tailwind CSS v4, TanStack Query, Recharts |
| Data | PostgreSQL 16 |
| Tests | Vitest, Supertest, Testing Library |
| Run | Docker Compose, multi-stage Dockerfiles, nginx reverse proxy |

## Dashboard

- **Activity feed** — newest-first cards (type badge, user, relative time, expandable payload JSON), pagination, live highlight on matching inserts.
- **Filters** — multi-select event-type chips, payload search (debounced), range presets `1h` / `24h` / `7d` / `All`. State lives in the URL; changing a filter resets to page 1.
- **Analytics** — total, distinct types, top type, bar chart, hourly area chart. The selected range and event types apply here as well. Type chips still list every type in the current time window so you can switch filters.
- **Status pill** — green **Live** when the WebSocket is connected, amber **Polling every 5s** when it is not.
- **Responsive** — one column on mobile; feed + sticky sidebar from the `lg` breakpoint.

## API

Base URL in Docker: `http://localhost:8080`. In local dev: `http://localhost:4000` (or the Vite origin, which proxies `/api` and `/ws`).

Rate limit: **30 requests/minute per IP** on `/api/*`. `/health` is not limited. Duplicate `id` returns 409. JSON bodies larger than 100kb return 413.

### `POST /api/events`

Body:

```json
{
  "id": "e1",
  "user_id": "u1",
  "event_type": "click",
  "payload": { "button": "buy" },
  "timestamp": "2026-09-28T08:00:00Z"
}
```

`event_type` must match `^[a-z0-9._-]+$`. `timestamp` is ISO 8601 with a timezone offset. `payload` is a JSON object.

```bash
curl -X POST http://localhost:8080/api/events \
  -H "Content-Type: application/json" \
  -d "{\"id\":\"e1\",\"user_id\":\"u1\",\"event_type\":\"click\",\"payload\":{\"button\":\"buy\"},\"timestamp\":\"2026-09-28T08:00:00Z\"}"
```

`201` returns the stored event and broadcasts it on `/ws`.

### `GET /api/events`

| Query | Default | Notes |
| --- | --- | --- |
| `page` | 1 | ≥ 1 |
| `limit` | 20 | 1–100 |
| `event_type` | — | Comma list, e.g. `click,login` |
| `from`, `to` | — | ISO date or datetime; `from` ≤ `to` |
| `q` | — | Case-insensitive substring of `payload` |

```bash
curl "http://localhost:8080/api/events?page=1&limit=20&event_type=click&q=buy"
curl "http://localhost:8080/api/events?from=2026-09-27T00:00:00Z&to=2026-09-28T23:59:59Z"
```

Response: `{ "data": [ ... ], "pagination": { "page", "limit", "total", "totalPages" } }`, newest first.

### `GET /api/events/analytics`

| Query | Default | Notes |
| --- | --- | --- |
| `hours` | 24 | 1–720 |
| `event_type` | — | Same comma list as the list endpoint |

```bash
curl "http://localhost:8080/api/events/analytics?hours=24"
curl "http://localhost:8080/api/events/analytics?hours=168&event_type=click"
```

Response: `{ "windowHours", "total", "byType": [{ "event_type", "count" }], "hourly": [{ "hour", "count" }] }`.

### `GET /health`

`200` `{ "status": "ok", "db": "up", "uptime", "timestamp" }` or `503` when the database is down.

### `WS /ws`

Welcome `{ "type": "connected", "timestamp" }`. After each successful POST, `{ "type": "event.created", "event" }`. Heartbeat ping/pong every 30s.

### Errors

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [{ "path": "event_type", "message": "..." }] } }
```

| Code | Status |
| --- | --- |
| `VALIDATION_ERROR` | 400 |
| `INVALID_JSON` | 400 |
| `NOT_FOUND` | 404 |
| `CONFLICT` | 409 |
| `PAYLOAD_TOO_LARGE` | 413 |
| `RATE_LIMITED` | 429 |
| `DATABASE_UNAVAILABLE` | 503 |
| `INTERNAL_ERROR` | 500 |

## Local development (apps on the host)

Needs Node 22+ and a Postgres instance.

```bash
docker run -d --name events-db -p 5432:5432 \
  -e POSTGRES_USER=events \
  -e POSTGRES_PASSWORD=events \
  -e POSTGRES_DB=events \
  postgres:16-alpine
```

Terminal 1 — API:

```bash
cd backend
cp .env.example .env
npm ci
npm run dev
```

Listens on **http://localhost:4000**. WebSocket: `ws://localhost:4000/ws`.

Terminal 2 — UI:

```bash
cd frontend
npm ci
npm run dev
```

Vite is on **http://localhost:5173** and proxies `/api` and `/ws` to the API.

Optional: `COUNT=10 npm run simulate` from `backend/` (defaults to `http://localhost:4000`).

## Tests

```bash
cd backend && npm test && npm run typecheck
cd frontend && npm test && npm run build
```

Backend coverage includes validation, SQL query building, pagination, config, connection retry, and API integration tests (in-memory repository, no database). `npm run smoke` in `backend/` hits a real Postgres (`npm run smoke -- --memory` uses the in-memory repository).

## Configuration

Docker Compose defaults work with no `.env`. Copy `.env.example` to `.env` only to change them.

| Variable | Default | Where |
| --- | --- | --- |
| `POSTGRES_USER` / `PASSWORD` / `DB` | `events` | Compose |
| `FRONTEND_PORT` | `8080` | Compose (host port) |
| `DATABASE_URL` | `postgres://events:events@localhost:5432/events` | Backend local |
| `PORT` | `4000` | Backend |
| `CORS_ORIGIN` | `*` in Docker, `http://localhost:5173` locally | Backend |
| `RATE_LIMIT_MAX` | `30` | Backend |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Backend |
| `TRUST_PROXY` | `1` in Docker, `0` locally | Backend |
| `VITE_API_URL` / `VITE_WS_URL` | empty (same origin) | Frontend |

## Project layout

```text
├── docker-compose.yml
├── .env.example
├── backend/
│   ├── Dockerfile
│   ├── src/app.ts              # Express factory
│   ├── src/server.ts           # Pool, migrations, HTTP + WebSocket, shutdown
│   ├── src/routes/             # events + health
│   ├── src/repositories/       # Postgres + in-memory
│   ├── src/utils/              # validation, SQL builder, pagination
│   ├── src/realtime/           # WebSocket broadcaster
│   └── scripts/simulate.ts
└── frontend/
    ├── Dockerfile
    ├── nginx.conf              # SPA + /api + /ws proxy
    └── src/
        ├── api/                # typed client
        ├── components/         # feed, filters, analytics, header
        ├── hooks/              # query, stream, URL filters
        └── lib/filters.ts      # URL state ↔ API query
```

## Design notes

- **Repository injection** — handlers depend on `EventRepository`. Tests use the in-memory implementation; production uses PostgreSQL.
- **Realtime with fallback** — inserts broadcast on `/ws`; TanStack Query polls every 5s while disconnected.
- **Filters stay aligned** — the same type list and time window drive list, analytics, and client-side matching.
- **Single origin** — nginx terminates HTTP and upgrades WebSocket, so empty `VITE_*` URLs work in production.
- **Safe SQL** — filters use bound parameters (`IN ($1, $2)`, `timestamp >= $n`, `payload::text ILIKE $n`).
- **Startup migrations** — `CREATE TABLE IF NOT EXISTS` plus indexes, under a Postgres advisory lock, with connect retry/backoff so Compose can start Postgres slowly.
- **Rate limiting** — in-process, per IP. `TRUST_PROXY=1` behind nginx. Several API replicas would need a shared store (for example Redis).

## Trade-offs

In-memory rate limits are not shared across processes. Payload search is `ILIKE`, not full-text search. Schema changes run at boot instead of a dedicated migrator. Analytics `all` uses a 720-hour (30-day) window, which is the API maximum.
