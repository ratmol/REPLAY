// replay-sdk entry point.
//
// Wires the in-memory buffer up to the collector over the network:
// POST /runs, POST /runs/:id/events (chunked to the collector's 500-event cap),
// flush on interval and on end(), one retry per request then give up silently.
//
// Zero runtime dependencies (invariant 2): the only import from replay-shared
// is `import type`, erased at compile time. Network calls use the global
// `fetch`/`AbortController`/`crypto` - all standard in Node >= 18, no library
// needed.

import type { EventType } from "replay-shared";
import { RingBuffer } from "./ring-buffer.js";
import { truncatePayload } from "./payload.js";
import { chunkArray, patchJsonWithRetry, postJsonWithRetry } from "./transport.js";

export const REPLAY_SDK_VERSION = "0.2.0";

const DEFAULT_MAX_BUFFER_SIZE = 1000;
const DEFAULT_FLUSH_INTERVAL_MS = 2000;
// Mirrors the collector's own cap (collector/src/index.ts MAX_BATCH_SIZE,
// docs/EVENT_SCHEMA.md section 6). Can't import it as a value: the SDK may
// only `import type` from replay-shared, so a shared runtime constant isn't
// an option without adding a real dependency.
const MAX_EVENTS_PER_BATCH = 500;

function normalizePositiveInt(value: number | undefined, fallback: number): number {
  if (typeof value === "number" && Number.isInteger(value) && value >= 1) {
    return value;
  }
  return fallback;
}

export interface ReplayOptions {
  endpoint: string;
  onError?: (error: unknown) => void;
  maxBufferSize?: number;
  flushIntervalMs?: number;
}

export interface StartRunOptions {
  name: string;
  agentName?: string;
  model?: string;
  metadata?: Record<string, unknown>;
}

export interface LogEventOptions {
  type: EventType;
  payload: Record<string, unknown>;
  durationMs?: number;
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
}

export interface EndRunOptions {
  status: "completed" | "failed";
  summary?: unknown;
}

/**
 * The buffered, wire-shaped form of an event. Deliberately not the full
 * `Event` discriminated union from replay-shared: that union ties each
 * `type` literal to a specific payload shape at the type level, which fights
 * a generic `push(type, payload)` builder for no runtime benefit - the
 * collector validates payloads loosely regardless (docs/EVENT_SCHEMA.md
 * principle 4). This shape is exactly what gets JSON.stringify'd and sent.
 */
export interface BufferedEvent {
  seq: number;
  type: EventType;
  timestamp: string;
  durationMs?: number;
  payload: Record<string, unknown>;
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
}

interface RunConfig {
  endpoint: string;
  maxBufferSize: number;
  flushIntervalMs: number;
  onError?: (error: unknown) => void;
}

export class Replay {
  private readonly config: RunConfig;

  constructor(options: ReplayOptions) {
    this.config = {
      // Trailing slash is a common footgun (endpoint "http://host:4747/"
      // would otherwise produce "http://host:4747//runs").
      endpoint: options.endpoint.replace(/\/+$/, ""),
      onError: options.onError,
      // Normalized rather than passed through as-is: a bad config value (0,
      // negative, NaN, a float) must never be able to make startRun() throw
      // into the host - invariant 1 applies to configuration mistakes too,
      // not just runtime failures.
      maxBufferSize: normalizePositiveInt(options.maxBufferSize, DEFAULT_MAX_BUFFER_SIZE),
      flushIntervalMs: normalizePositiveInt(options.flushIntervalMs, DEFAULT_FLUSH_INTERVAL_MS),
    };
  }

  startRun(options: StartRunOptions): Run {
    return new Run(options, this.config);
  }
}

export class Run {
  readonly id: string;

  private readonly config: RunConfig;
  private readonly startOptions: StartRunOptions;
  private readonly startedAt: string;
  private readonly buffer: RingBuffer<BufferedEvent>;
  private readonly flushTimer: NodeJS.Timeout;

  private seq = 0;
  private ended = false;
  private runCreated = false;
  // Set as soon as an attempt is made, success or failure - same "one try
  // (with its own internal retry), then give up silently" policy as event
  // batches. Without this, the constructor's own initial flush can still be
  // in-flight when end() runs and reach this check after `ended` is already
  // true, racing the queued follow-up round (see flush()'s comment) into
  // attempting the PATCH twice whenever it's failing.
  private statusPatchAttempted = false;
  private endResult: EndRunOptions | undefined;
  private endedAt: string | undefined;

  // Single-flight flush with a "run again after this one" flag, rather than
  // a plain boolean guard: end() must be able to trust that its own final
  // flush() call actually sends the run_end event it just pushed, even if an
  // interval-triggered flush was already mid-flight (and had already drained
  // the buffer *before* run_end existed). A boolean guard that just no-ops
  // when busy would silently lose that last event.
  private flushPromise: Promise<void> | null = null;
  private flushQueued = false;

  constructor(options: StartRunOptions, config: RunConfig) {
    this.id = crypto.randomUUID();
    this.config = config;
    this.startOptions = options;
    this.startedAt = new Date().toISOString();
    this.buffer = new RingBuffer(config.maxBufferSize);

    // POST /runs creates the row; the SDK also emits run_start at seq 0 so
    // the event log alone is a complete record (docs/EVENT_SCHEMA.md
    // section 7).
    this.push("run_start", {
      agentName: options.agentName,
      model: options.model,
      metadata: options.metadata,
    });

    // Unref'd: a Run nobody ever calls end() on must not be the reason a
    // short-lived script can't exit. Individual in-flight fetches are not
    // unref'd, so a flush already underway still gets to finish naturally.
    this.flushTimer = setInterval(() => {
      // Fire-and-forget: nothing awaits an interval flush, so a rejection here
      // would be an unhandledRejection. flush() is built not to reject, but the
      // .catch makes that guarantee local and independent of that assumption.
      this.flush().catch(() => {});
    }, config.flushIntervalMs);
    this.flushTimer.unref();

    this.flush().catch(() => {});
  }

  logEvent(options: LogEventOptions): void {
    if (this.ended) {
      return;
    }
    try {
      this.push(options.type, options.payload, {
        durationMs: options.durationMs,
        tokensIn: options.tokensIn,
        tokensOut: options.tokensOut,
        costUsd: options.costUsd,
      });
    } catch (error) {
      this.safeOnError(error);
    }
  }

  async end(options: EndRunOptions): Promise<void> {
    if (this.ended) {
      return;
    }
    this.ended = true;
    this.endResult = options;
    this.endedAt = new Date().toISOString();
    clearInterval(this.flushTimer);
    try {
      this.push("run_end", { status: options.status, summary: options.summary });
    } catch (error) {
      this.safeOnError(error);
    }
    await this.flush();
  }

  /** Snapshot of everything currently buffered (not yet sent), in seq order. */
  getBufferedEvents(): BufferedEvent[] {
    return this.buffer.toArray();
  }

  get droppedEventCount(): number {
    return this.buffer.droppedCount;
  }

  // The host's onError is arbitrary user code and may itself throw. If that
  // throw escaped, it would defeat the whole point of the callback and crash
  // the host (invariant 1) - the worst case being an interval- or
  // constructor-triggered flush, where the rejection has no awaiter and Node
  // turns it into a process-killing unhandledRejection. There is nowhere safe
  // to report a broken error reporter, so the secondary throw is swallowed.
  private safeOnError(error: unknown): void {
    try {
      this.config.onError?.(error);
    } catch {
      // Intentionally empty: see above.
    }
  }

  private push(
    type: EventType,
    payload: Record<string, unknown>,
    extra?: { durationMs?: number; tokensIn?: number; tokensOut?: number; costUsd?: number },
  ): void {
    const event: BufferedEvent = {
      seq: this.seq,
      type,
      timestamp: new Date().toISOString(),
      payload: truncatePayload(payload),
      ...(extra?.durationMs !== undefined ? { durationMs: extra.durationMs } : {}),
      ...(extra?.tokensIn !== undefined ? { tokensIn: extra.tokensIn } : {}),
      ...(extra?.tokensOut !== undefined ? { tokensOut: extra.tokensOut } : {}),
      ...(extra?.costUsd !== undefined ? { costUsd: extra.costUsd } : {}),
    };
    this.seq += 1;
    this.buffer.push(event);
  }

  /** Single-flight coordinator: see the flushPromise/flushQueued comment above. */
  private flush(): Promise<void> {
    if (this.flushPromise) {
      this.flushQueued = true;
      return this.flushPromise;
    }
    // The settle handler must run on BOTH outcomes. flushOnce is built not to
    // reject, but if it ever did (a bug slipping an unguarded throw past the
    // onError guards), resetting flushPromise only in the success branch would
    // leave it pinned to a rejected promise forever - every later flush() would
    // hand back that same rejected promise and no event would ever be sent
    // again. Running it as both handlers of .then keeps one failed flush from
    // wedging the run permanently.
    const settle = (): void | Promise<void> => {
      this.flushPromise = null;
      if (this.flushQueued) {
        this.flushQueued = false;
        return this.flush();
      }
      return undefined;
    };
    this.flushPromise = this.flushOnce().then(settle, settle);
    return this.flushPromise;
  }

  private async flushOnce(): Promise<void> {
    if (!this.runCreated) {
      const created = await postJsonWithRetry(`${this.config.endpoint}/runs`, {
        id: this.id,
        name: this.startOptions.name,
        agentName: this.startOptions.agentName,
        model: this.startOptions.model,
        startedAt: this.startedAt,
        metadata: this.startOptions.metadata,
      });
      if (!created) {
        this.safeOnError(
          new Error(
            `replay-sdk: could not reach the collector to create run "${this.id}" at ` +
              `${this.config.endpoint}/runs after 1 retry. Events are buffering locally ` +
              `(capacity ${this.config.maxBufferSize}) and will be sent once it's reachable.`,
          ),
        );
        return;
      }
      this.runCreated = true;
    }

    // No early return on an empty buffer: the PATCH below must still run even
    // on a round with nothing new to send (e.g. a follow-up round after the
    // one that already sent run_end - see the flush() comment for when that
    // happens).
    const events = this.buffer.drain();
    for (const batch of chunkArray(events, MAX_EVENTS_PER_BATCH)) {
      const sent = await postJsonWithRetry(`${this.config.endpoint}/runs/${this.id}/events`, {
        events: batch,
      });
      if (!sent) {
        this.safeOnError(
          new Error(
            `replay-sdk: failed to send ${batch.length} event(s) for run "${this.id}" to ` +
              `${this.config.endpoint} after 1 retry. These events were dropped, not requeued - ` +
              `check that the collector is running and reachable.`,
          ),
        );
      }
    }

    // The run_end event above is the authoritative record of how the run
    // finished; this PATCH just keeps runs.status in sync so the dashboard's
    // runs list doesn't need to scan events to know a run is done.
    if (this.ended && !this.statusPatchAttempted && this.endResult && this.endedAt) {
      this.statusPatchAttempted = true;
      const patched = await patchJsonWithRetry(`${this.config.endpoint}/runs/${this.id}`, {
        status: this.endResult.status,
        endedAt: this.endedAt,
      });
      if (!patched) {
        this.safeOnError(
          new Error(
            `replay-sdk: failed to update run "${this.id}" status to "${this.endResult.status}" ` +
              `after 1 retry. The run_end event was recorded, but runs.status may still show "running".`,
          ),
        );
      }
    }
  }
}
