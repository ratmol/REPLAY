# Replay

Flight recorder for AI agents. Record every tool call, retry, and cost, then
replay the run on a timeline like game footage.

Debugging an agent today means reading console logs and guessing why it looped,
burned three dollars in tokens, or silently failed a tool call. Replay records
the run as an append-only event log and gives you a scrubber to step through it.

**Status: early scaffold. Not usable yet.** The event schema is specified, the
implementation is not written.

## Layout

Monorepo, pnpm workspaces.

| Package | What it is |
|---|---|
| `shared/` | `replay-shared` - Zod event schemas, the wire contract. Not published |
| `sdk/` | `replay-sdk` - drop-in instrumentation, zero runtime dependencies |
| `collector/` | `replay-collector` - Hono + Zod API over SQLite |
| `dashboard/` | `replay-dashboard` - Vite + React timeline scrubber |

## Design notes

- **Append-only event log.** Events are facts. Run-level totals are derived by
  summing events, never mutated independently.
- **`(run_id, seq)` orders events, not timestamps.** Clocks are unreliable and
  batches can arrive out of order after a retry. A unique index on that pair
  makes re-sending a batch idempotent, which is what lets the SDK retry without
  any coordination.
- **The SDK never crashes the host agent.** Your agent runs identically whether
  the collector is up, down, or returning garbage.
- **The SDK has zero runtime dependencies.** It shares schema types with the rest
  of the repo through type-only imports, which the compiler erases.
- **The timeline is hand-built.** No charting library.

Full data contract: [`docs/EVENT_SCHEMA.md`](docs/EVENT_SCHEMA.md).

## Setup

Node >= 20, pnpm.

```
pnpm install
pnpm typecheck        # all workspaces
pnpm dev:collector    # collector on :4747
pnpm dev:dashboard    # dashboard on :5173
```

`better-sqlite3` is a native module. It normally installs a prebuilt binary; if
none matches your platform it compiles with node-gyp, which on Windows needs
Visual Studio Build Tools.

## Limitations

- SQLite only, local-first. No hosted or multi-user mode.
- No auth. Run the collector on localhost.
- Payloads over 50KB are truncated by the SDK before they are sent.
- TypeScript only.
