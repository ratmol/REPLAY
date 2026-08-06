# replay-sdk

Flight recorder SDK for AI agent runs. Wrap an agent in ~3 lines, get every
tool call, retry, and cost recorded.

Zero runtime dependencies. Never throws into the host agent: if the collector is
unreachable, your agent runs exactly as it would without this library.

Status: implemented and wired to the collector - `startRun`, `logEvent`,
`end`, the bounded in-memory buffer, payload truncation, batched sends with
one retry, flush on an interval and on `end()`. `end()` also PATCHes the
run's status so it doesn't stay stuck at "running".
