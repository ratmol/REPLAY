// replay-sdk entry point.
//
// TODO: implement the Replay class (startRun / logEvent / end).
//
// Design constraints, in priority order:
//   1. Never crash the host agent. Every network call, serialization, and flush
//      is wrapped; failures are swallowed and surfaced through an optional
//      onError callback.
//   2. Zero runtime dependencies. Shared types come in via `import type`, which
//      the compiler erases.
//   3. Three lines to adopt, batched flushes, bounded in-memory buffer.

export const REPLAY_SDK_VERSION = "0.0.1";
