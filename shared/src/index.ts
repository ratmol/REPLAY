// replay-shared - the wire contract between the SDK, collector, and dashboard.
//
// Implementation of docs/EVENT_SCHEMA.md. That document is authoritative: if
// the design here disagrees with it, the doc is right and this file is a bug.
//
// Import rules, which are load-bearing:
//   - collector and dashboard may import values (runtime Zod parsing).
//   - the SDK may only use `import type { ... } from "replay-shared"`. Type-only
//     imports are erased at compile time, which is how the SDK keeps zero
//     runtime dependencies while still sharing one source of truth for shapes.

import { z } from "zod";

export const REPLAY_SCHEMA_VERSION = "0.1.0";

/** Closed set of v1 event types. See docs/EVENT_SCHEMA.md section 3. */
export const EVENT_TYPES = [
  "run_start",
  "llm_call",
  "llm_response",
  "tool_call",
  "tool_result",
  "retry",
  "error",
  "agent_decision",
  "run_end",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

// Fields shared by every event (docs/EVENT_SCHEMA.md section 2). `type` and
// `payload` are declared per-variant below because their shapes differ; every
// other envelope field is identical across all nine event types.
const envelopeShape = {
  seq: z.number().int().nonnegative(),
  timestamp: z.string().datetime(),
  durationMs: z.number().int().nonnegative().optional(),
  tokensIn: z.number().int().nonnegative().optional(),
  tokensOut: z.number().int().nonnegative().optional(),
  costUsd: z.number().nonnegative().optional(),
};

// The marker the SDK substitutes for a payload whose serialized JSON exceeds
// 50KB (docs/EVENT_SCHEMA.md section 4). Every payload schema below is loose
// enough to accept this shape too - since every documented payload field is
// optional and unknown keys pass through, a truncated payload validates
// against any event type's schema without a separate union.
export const TruncatedPayloadSchema = z
  .object({
    _truncated: z.literal(true),
    _originalBytes: z.number().int().nonnegative(),
    _preview: z.string(),
  })
  .passthrough();

export type TruncatedPayload = z.infer<typeof TruncatedPayloadSchema>;

export function isTruncatedPayload(
  payload: Record<string, unknown>,
): payload is TruncatedPayload {
  return payload["_truncated"] === true;
}

// Payload schemas keep every documented key optional and pass unknown keys
// through untouched: the collector validates the envelope strictly and the
// payload loosely (principle 4 in the doc), because agent payload shapes vary
// wildly across frameworks and a strict payload schema would make the SDK
// brittle at exactly the moment someone is trying to debug something weird.
// Fields whose shape is genuinely framework-specific (messages, args, result,
// options, tools, content, toolCalls, summary) are typed `unknown` rather than
// guessed at.

const runStartPayloadSchema = z
  .object({
    agentName: z.string().optional(),
    model: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

const llmCallPayloadSchema = z
  .object({
    model: z.string().optional(),
    messages: z.unknown().optional(),
    temperature: z.number().optional(),
    tools: z.unknown().optional(),
  })
  .passthrough();

const llmResponsePayloadSchema = z
  .object({
    content: z.unknown().optional(),
    finishReason: z.string().optional(),
    toolCalls: z.unknown().optional(),
  })
  .passthrough();

const toolCallPayloadSchema = z
  .object({
    toolName: z.string().optional(),
    args: z.unknown().optional(),
    callId: z.string().optional(),
  })
  .passthrough();

const toolResultPayloadSchema = z
  .object({
    toolName: z.string().optional(),
    callId: z.string().optional(),
    result: z.unknown().optional(),
    ok: z.boolean().optional(),
  })
  .passthrough();

const retryPayloadSchema = z
  .object({
    attempt: z.number().int().nonnegative().optional(),
    reason: z.string().optional(),
    ofSeq: z.number().int().nonnegative().optional(),
  })
  .passthrough();

const errorPayloadSchema = z
  .object({
    message: z.string().optional(),
    stack: z.string().optional(),
    fatal: z.boolean().optional(),
  })
  .passthrough();

const agentDecisionPayloadSchema = z
  .object({
    decision: z.string().optional(),
    reasoning: z.string().optional(),
    options: z.unknown().optional(),
  })
  .passthrough();

const runEndPayloadSchema = z
  .object({
    status: z.enum(["completed", "failed"]).optional(),
    summary: z.unknown().optional(),
  })
  .passthrough();

export const RunStartEventSchema = z
  .object({ ...envelopeShape, type: z.literal("run_start"), payload: runStartPayloadSchema })
  .strict();

export const LlmCallEventSchema = z
  .object({ ...envelopeShape, type: z.literal("llm_call"), payload: llmCallPayloadSchema })
  .strict();

export const LlmResponseEventSchema = z
  .object({ ...envelopeShape, type: z.literal("llm_response"), payload: llmResponsePayloadSchema })
  .strict();

export const ToolCallEventSchema = z
  .object({ ...envelopeShape, type: z.literal("tool_call"), payload: toolCallPayloadSchema })
  .strict();

export const ToolResultEventSchema = z
  .object({ ...envelopeShape, type: z.literal("tool_result"), payload: toolResultPayloadSchema })
  .strict();

export const RetryEventSchema = z
  .object({ ...envelopeShape, type: z.literal("retry"), payload: retryPayloadSchema })
  .strict();

export const ErrorEventSchema = z
  .object({ ...envelopeShape, type: z.literal("error"), payload: errorPayloadSchema })
  .strict();

export const AgentDecisionEventSchema = z
  .object({ ...envelopeShape, type: z.literal("agent_decision"), payload: agentDecisionPayloadSchema })
  .strict();

export const RunEndEventSchema = z
  .object({ ...envelopeShape, type: z.literal("run_end"), payload: runEndPayloadSchema })
  .strict();

/** Discriminated union of all nine event types - the wire format for one event. */
export const EventSchema = z.discriminatedUnion("type", [
  RunStartEventSchema,
  LlmCallEventSchema,
  LlmResponseEventSchema,
  ToolCallEventSchema,
  ToolResultEventSchema,
  RetryEventSchema,
  ErrorEventSchema,
  AgentDecisionEventSchema,
  RunEndEventSchema,
]);

export type Event = z.infer<typeof EventSchema>;
export type RunStartEvent = z.infer<typeof RunStartEventSchema>;
export type LlmCallEvent = z.infer<typeof LlmCallEventSchema>;
export type LlmResponseEvent = z.infer<typeof LlmResponseEventSchema>;
export type ToolCallEvent = z.infer<typeof ToolCallEventSchema>;
export type ToolResultEvent = z.infer<typeof ToolResultEventSchema>;
export type RetryEvent = z.infer<typeof RetryEventSchema>;
export type ErrorEvent = z.infer<typeof ErrorEventSchema>;
export type AgentDecisionEvent = z.infer<typeof AgentDecisionEventSchema>;
export type RunEndEvent = z.infer<typeof RunEndEventSchema>;

/**
 * Body for `POST /runs` (docs/EVENT_SCHEMA.md section 6). `id` is required
 * rather than server-generated: the `runs` table documents `id` as "uuid v4,
 * generated by SDK" (section 5), matching how the SDK - not the collector -
 * already owns `seq` assignment. `status`/derived totals are not client input;
 * the collector sets those on creation.
 */
export const CreateRunRequestSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1),
    agentName: z.string().optional(),
    model: z.string().optional(),
    startedAt: z.string().datetime(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type CreateRunRequest = z.infer<typeof CreateRunRequestSchema>;

/**
 * Body for `POST /runs/:id/events`. The documented 500-event cap (section 6)
 * is deliberately NOT enforced here with `.max(500)`: the API contract wants
 * an over-cap batch to fail with 413, distinct from a 400 Zod validation
 * failure, so the collector checks the length itself before parsing.
 */
export const EventBatchSchema = z
  .object({
    events: z.array(EventSchema),
  })
  .strict();

export type EventBatch = z.infer<typeof EventBatchSchema>;

/**
 * Body for `PATCH /runs/:id` (docs/EVENT_SCHEMA.md section 6). The SDK sends
 * this from `end()` alongside the `run_end` event: the event log is the
 * authoritative record of how a run finished, but `runs.status` is a
 * denormalized convenience column so the dashboard's runs list doesn't have
 * to scan events to know if a run is done.
 */
export const PatchRunRequestSchema = z
  .object({
    status: z.enum(["completed", "failed"]),
    endedAt: z.string().datetime(),
  })
  .strict();

export type PatchRunRequest = z.infer<typeof PatchRunRequestSchema>;

/**
 * Shape of one run in `GET /runs` and `GET /runs/:id` (docs/EVENT_SCHEMA.md
 * section 6). A plain interface, not a Zod schema: this is a response the
 * collector constructs itself from typed SQLite rows, always correct by
 * construction, not untrusted input that needs edge validation (invariant 4
 * is about incoming data). Its only job is keeping the collector's response
 * shape and the dashboard's expectation of it from silently drifting apart -
 * annotate the collector's serializer with this type too.
 */
export interface RunSummary {
  id: string;
  name: string;
  agentName?: string;
  model?: string;
  startedAt: string;
  endedAt?: string;
  status: "running" | "completed" | "failed";
  totalTokensIn: number;
  totalTokensOut: number;
  totalCostUsd: number;
  metadata?: Record<string, unknown>;
}

/**
 * Shape of one event in `GET /runs/:id/events` - same reasoning as
 * RunSummary (plain interface, collector-constructed response, nothing to
 * validate at this edge). Deliberately not the `Event` discriminated union:
 * that ties `type` to a specific payload shape at the type level, which
 * fights a generic deserialized-from-JSON consumer for no benefit here
 * either - same call the SDK made for `BufferedEvent`.
 */
export interface EventRecord {
  seq: number;
  type: EventType;
  timestamp: string;
  durationMs?: number;
  payload: Record<string, unknown>;
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
}
