# replay-collector

Hono + Zod API. Validates events at the edge, writes to SQLite.

API and storage contract: [`../docs/EVENT_SCHEMA.md`](../docs/EVENT_SCHEMA.md).

Status: `POST /runs`, `POST /runs/:id/events`, `GET /runs`, `GET /runs/:id`,
and `GET /runs/:id/events` implemented with Zod validation, the documented
error contract, and SQLite persistence (plain-SQL migrations run at startup,
unique index on `(run_id, seq)` for idempotent batch retries).
`PATCH /runs/:id` is not yet implemented.
