Wallet Service

## Quick start (Docker)
Prereqs: Docker + Docker Compose.
```
docker compose up --build
```
Services:
- API on http://localhost:3000 (Swagger at /docs, basic auth from .env: `SWAGGER_USER`/`SWAGGER_PASSWORD`)
- Worker (RabbitMQ consumer) runs `main-listener`
- Postgres on localhost:5432 (`DATABASE_*` in .env)
- RabbitMQ on localhost:5672, management UI at http://localhost:15672 (guest/guest)
- Redis on localhost:6379
- Optional k6 load test service (profile `loadtest`): `docker compose --profile loadtest up k6`

## Local development (without Docker)
1) Install deps: `npm install`
2) Run Postgres, RabbitMQ, Redis locally (adjust `.env` hosts/ports).
3) Start API: `npm run start:dev`
4) Start worker: `npm run build && node dist/main-listener.js` (or `ts-node src/main-listener.ts`)

## Environment
Set via `.env`:
- DB: `DATABASE_HOST/PORT/USER/PASSWORD/NAME`, `DATABASE_SYNC` (true for dev), `DATABASE_LOGGING`
- Redis: `REDIS_HOST/PORT/DB`, `CACHE_PREFIX`, `REDIS_TTL`
- RabbitMQ: `RABBITMQ_URL`, `RABBITMQ_QUEUE`, `RABBITMQ_PREFETCH`, `RABBITMQ_DLX`, `RABBITMQ_DLQ`
- Idempotency TTL: `IDEMPOTENCY_TTL_HOURS`

## API endpoints
- POST `/wallet/:id/deposit` { amount, idempotencyKey, metadata? }
- POST `/wallet/:id/withdraw` { amount, idempotencyKey, metadata? }
- POST `/wallet/:id/transfer` { amount, toWalletId, idempotencyKey, metadata? }
- GET `/wallet/:id` → { walletId, balance }
- GET `/wallet/:id/history?offset=&limit=` → events (newest first)

Notes:
- `Idempotency-Key` required (header/body). Same key + payload returns stored response; different payload rejected.
- Amounts support 4 decimals; wallets auto-create on first use.

## Architecture (short)
- NestJS + TypeORM (Postgres), RabbitMQ, Redis cache, Decimal.js for money math.
- Outbox pattern: `outbox_messages` persisted with state changes, publisher emits to RMQ with retry/backoff; DLQ configured.
- Consumer: analytics/fraud flags; idempotent via `consumed_events`; `nack` to DLQ on failure.
- Transfers: compensation reverses debit on credit failure; states tracked.
- Idempotency keys persist responses; duplicate-safe across instances.

## Running tests
- `npm test -- --runInBand` (uses Postgres from `.env`, drops schema — point to a test DB/port).

## Design
- `DESIGN.md`: decisions, trade-offs, flows.
