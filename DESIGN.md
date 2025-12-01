# Wallet Microservice Design

## Goals
- Event-driven, production-grade wallet service with strong consistency on writes and at-least-once event delivery.
- Idempotent APIs that tolerate duplicate client requests and broker redeliveries.
- Background processing with real business logic (analytics/fraud flagging) consuming wallet events.
- Clear audit trail and ability to replay/rebuild read models.

## Architecture Overview
- **API (NestJS)**: Exposes synchronous REST endpoints for deposit, withdraw, transfer, balance, and history. Uses validation, throttling, and Swagger.
- **Database (PostgreSQL via TypeORM)**:
  - `wallets` — current balance (numeric), version, non-negative constraint.
  - `wallet_events` — immutable audit log for every operation (amount, metadata, requestId).
  - `transfers` — tracks multi-step transfers (initiated/debited/credited/failed/compensated) with failureReason.
  - `outbox_messages` — events to be published to RabbitMQ; carries attempts/nextAttemptAt/status.
  - `idempotency_keys` — stores request key, request hash, saved response (for duplicate handling).
  - `consumed_events` — marks processed broker messages for idempotent consumers.
  - `wallet_analytics` — aggregated metrics, flags for review.
- **Message broker (RabbitMQ)**:
  - API writes events to outbox; OutboxPublisher emits to RMQ with retry/backoff.
  - Consumer (worker) listens, performs analytics, uses `consumed_events` for dedupe, nacks without requeue to enable DLQ routing.
- **Cache (Redis)**: Cached balance reads via `RedisCacheService`.
- **Outbox pattern**: Event persistence and publishing decoupled to guarantee at-least-once delivery without dual-write race.

## Write Path (commands)
1. API validates request, enforces idempotency key + payload hash (rejects mismatched reuse).
2. In a DB transaction (pessimistic locks on wallets):
   - Deposit/withdraw update balance (non-negative), auto-create wallet on first use.
   - Transfer:
     - Lock wallets in deterministic order; ensure funds on sender.
     - Record `TransferInitiated` event and transfer row (`initiated`).
     - Debit sender (`FundsWithdrawn`, transfer status `debited`); credit receiver (`FundsDeposited`, status `credited`); emit `TransferCompleted`.
     - On any failure after debit, compensation runs to restore funds and emit `TransferFailed` + `TransferCompensated`.
   - Persist wallet_events and outbox_messages for each event.
3. Commit transaction; return response saved under idempotency key for future duplicates.

## Read Path
- Balance: cached per wallet; falls back to DB if missing.
- History: queries `wallet_events` ordered by newest first with pagination.
- Consistency trade-off: writes are strongly consistent in the DB; cached balances may briefly lag if cache invalidation is delayed (can evict/update cache on writes if needed). Reads favor speed; underlying source of truth remains DB/events.

## Transfer Coordination & Compensation
- States: `initiated` → `debited` → `credited` (success) or `compensated` (on credit failure).
- Compensation trigger: if credit step throws after debit, a compensating transaction adds the amount back to sender, marks transfer `compensated`, and emits failure/compensation events.
- Idempotency: compensation checks existing transfer status; if already compensated, no double-add. Wallet locking prevents race on concurrent operations.

## Duplicate Handling
- Client must supply idempotency key (header/body). Payload hash stored; reuse with different payload is rejected.
- Responses stored with the key; duplicates return the original response, enabling safe retries across API instances.
- Broker consumer dedupes via `consumed_events` to avoid double-side effects on redelivery.

## Background Consumer Logic
- Listens to wallet events; processes `FundsDeposited` / `FundsWithdrawn`.
- Maintains `wallet_analytics` totals, counts, and flags wallets for review on high or rapid withdrawals (heuristic thresholds).
- Idempotent via `consumed_events`; nacks without requeue to allow broker-level DLQ.

## Outbox Publishing & Reliability
- OutboxPublisher polls pending messages, locks rows, increments attempts, publishes to RMQ.
- Exponential backoff; marks `failed` after max attempts. Broker topology should include DLQ for the consumer queue.
- At-least-once delivery; consumers must be idempotent.

## Deployment & Ops
- `docker-compose.yml` runs API, worker (RMQ listener), Postgres, RabbitMQ (with mgmt UI), and Redis. Current DB sync is enabled for bootstrap; migrations recommended for production.
- Health endpoints exist; Swagger is available at `/docs` (basic auth).
- Logging via Nest logger; can be extended with structured logs/metrics.

## Testing Plan
- Unit/integration:
  - Deposit/withdraw/transfer happy paths.
  - Transfer compensation when credit fails.
  - Concurrent withdrawals and bidirectional transfers (ensure no negative balances).
  - Idempotency: repeated requests return stored response; mismatched payload rejected.
  - Outbox publisher emits messages; consumer dedupe and side-effects idempotency.
  - Consumer DLQ behavior (simulate nack).
- E2E: API flows against Postgres/RabbitMQ (test containers or docker-compose), validating consistency and event emission.
