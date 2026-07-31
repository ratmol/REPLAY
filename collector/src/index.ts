// replay-collector entry point.
//
// TODO: implement the API and storage layer described in docs/EVENT_SCHEMA.md:
//   - POST /runs, POST /runs/:id/events (batch), PATCH /runs/:id, GET reads
//   - Zod validation at the edge, once. Downstream code trusts parsed types.
//   - SQLite via better-sqlite3, plain SQL migrations run at startup, unique
//     index on (run_id, seq) so batch retries are idempotent.

import { Hono } from "hono";
import { serve } from "@hono/node-server";

const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok" }));

const port = Number(process.env.PORT ?? 4747);
serve({ fetch: app.fetch, port });
console.log(`replay-collector listening on :${port}`);
