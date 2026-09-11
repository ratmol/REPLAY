// Sample-run seeding for a hosted, read-only instance.
//
// Guarded by the SEED_DEMO env var so a local self-host stays empty - the
// README promises a fresh checkout starts blank, and only the public instance
// sets the flag. Each run is seeded only if its own id is missing, so a host
// with an ephemeral disk (a free tier that wipes storage on restart) rebuilds
// whatever it lost on the next boot, a normal restart that kept its data is a
// no-op, and adding a run here backfills it without wiping the others.
//
// The set is generated rather than hand-written: a realistic demo needs enough
// runs to fill the list, exercise the "show more" cut, and populate all three
// status buckets (running / completed / failed). Payloads are still real event
// shapes (tool names, args, results, errors) so every run is worth inspecting.

import type { CreateRunRequest, Event, PatchRunRequest } from "replay-shared";
import { appendEvents, createRun, getRun, updateRunStatus } from "./store.js";

interface Built {
  run: CreateRunRequest;
  events: Event[];
  end?: PatchRunRequest; // absent for a run still in flight (stays "running")
}

const NOW = Date.now();
const MIN = 60_000;

// Fixed ids (valid uuid shape) so each run keeps the same URL across restarts.
const uuid = (i: number): string => `d3adbeef-0000-4000-8000-${String(i + 1).padStart(12, "0")}`;

const NAMES = [
  "invoice-parser", "weather-lookup", "exchange-rate", "web-scraper", "email-triage",
  "sql-generator", "pdf-summarizer", "code-reviewer", "ticket-router", "data-enricher",
  "sentiment-classifier", "doc-qa", "calendar-scheduler", "translation", "log-analyzer",
  "image-captioner", "product-recommender", "fraud-checker", "resume-screener", "chat-router",
  "api-orchestrator", "changelog-writer", "meeting-notes", "lead-qualifier", "contract-analyzer",
  "price-monitor", "news-digest", "bug-triager", "spec-drafter", "csv-cleaner",
  "address-validator", "tax-estimator", "playlist-curator", "recipe-planner", "seo-auditor",
  "tweet-composer", "form-filler", "receipt-scanner", "survey-analyzer", "onboarding-guide",
];

const MODELS = ["claude-sonnet-4-6", "claude-opus-4-8", "claude-haiku-4-5", "gpt-4o-mini"];
const TOOLS = ["search", "fetch_url", "query_db", "read_file", "call_api", "get_record", "run_query", "lookup"];

type Kind = "simple" | "tool" | "multitool" | "retry" | "failtool" | "failhallu" | "running";

// Hand-placed so the list interleaves statuses (running: 6, failed: 8, rest
// completed: 26) rather than clumping them, which is what makes the status
// filter visibly useful.
const KINDS: Kind[] = [
  "tool", "simple", "running", "retry", "failtool", "multitool", "failhallu", "tool", "simple", "running",
  "retry", "failtool", "tool", "multitool", "simple", "running", "tool", "retry", "simple", "failtool",
  "multitool", "tool", "running", "simple", "failhallu", "retry", "tool", "multitool", "running", "simple",
  "tool", "failtool", "retry", "failhallu", "simple", "running", "multitool", "tool", "failhallu", "simple",
];

function ev(
  seq: number,
  type: Event["type"],
  atMs: number,
  payload: Record<string, unknown>,
  extra: Partial<Event> = {},
): Event {
  return { seq, type, timestamp: new Date(atMs).toISOString(), payload, ...extra };
}

// Builds the events for one run of a given shape. `scale` (deterministic per
// run) fans out the token counts and cost so the cost panel and the "costliest"
// sort have a real spread to show.
function shape(
  kind: Kind,
  t0: number,
  model: string,
  scale: number,
  tool: string,
): { events: Event[]; end?: PatchRunRequest } {
  const at = (ms: number): number => t0 + ms;
  const iso = (ms: number): string => new Date(at(ms)).toISOString();
  const tIn = Math.round(1100 * scale);
  const tOut = Math.round(150 * scale);
  const cost = Number((0.006 * scale).toFixed(4));
  const start = ev(0, "run_start", at(0), { agentName: "assistant", model });

  switch (kind) {
    case "simple": {
      const events = [
        start,
        ev(1, "llm_call", at(120), { model, messages: [{ role: "user", content: "Answer from what you already know." }] }, { durationMs: 520, tokensIn: tIn }),
        ev(2, "llm_response", at(660), { finishReason: "stop", content: "Answered directly." }, { tokensOut: tOut, costUsd: cost }),
        ev(3, "run_end", at(720), { status: "completed", summary: "Answered without tools." }),
      ];
      return { events, end: { status: "completed", endedAt: iso(720) } };
    }
    case "tool": {
      const events = [
        start,
        ev(1, "agent_decision", at(120), { decision: "call a tool", reasoning: `Needs data from ${tool}.` }),
        ev(2, "llm_call", at(170), { model, tools: [tool], messages: [{ role: "user", content: "Look this up." }] }, { durationMs: 610, tokensIn: tIn }),
        ev(3, "llm_response", at(820), { finishReason: "tool_calls", toolCalls: [{ toolName: tool, callId: "call_1" }] }, { tokensOut: Math.round(tOut * 0.6), costUsd: Number((cost * 0.6).toFixed(4)) }),
        ev(4, "tool_call", at(860), { toolName: tool, callId: "call_1", args: { q: "input" } }),
        ev(5, "tool_result", at(1420), { toolName: tool, callId: "call_1", ok: true, result: { hit: true } }, { durationMs: 540 }),
        ev(6, "llm_call", at(1470), { model, messages: [{ role: "tool", content: '{"hit":true}' }] }, { durationMs: 480, tokensIn: Math.round(tIn * 1.2) }),
        ev(7, "llm_response", at(1980), { finishReason: "stop", content: "Done." }, { tokensOut: Math.round(tOut * 0.5), costUsd: Number((cost * 0.5).toFixed(4)) }),
        ev(8, "run_end", at(2040), { status: "completed", summary: "One tool call, then answered." }),
      ];
      return { events, end: { status: "completed", endedAt: iso(2040) } };
    }
    case "multitool": {
      const t2 = TOOLS[(TOOLS.indexOf(tool) + 3) % TOOLS.length]!;
      const events = [
        start,
        ev(1, "llm_call", at(150), { model, tools: [tool, t2], messages: [{ role: "user", content: "Multi-step task." }] }, { durationMs: 700, tokensIn: tIn }),
        ev(2, "llm_response", at(900), { finishReason: "tool_calls", toolCalls: [{ toolName: tool, callId: "call_1" }] }, { tokensOut: tOut, costUsd: cost }),
        ev(3, "tool_call", at(950), { toolName: tool, callId: "call_1", args: { q: "step one" } }),
        ev(4, "tool_result", at(1560), { toolName: tool, callId: "call_1", ok: true, result: { rows: 12 } }, { durationMs: 600 }),
        ev(5, "llm_call", at(1620), { model, messages: [{ role: "tool", content: '{"rows":12}' }] }, { durationMs: 640, tokensIn: Math.round(tIn * 1.3) }),
        ev(6, "llm_response", at(2300), { finishReason: "tool_calls", toolCalls: [{ toolName: t2, callId: "call_2" }] }, { tokensOut: tOut, costUsd: cost }),
        ev(7, "tool_call", at(2350), { toolName: t2, callId: "call_2", args: { id: 7 } }),
        ev(8, "tool_result", at(2900), { toolName: t2, callId: "call_2", ok: true, result: { ok: true } }, { durationMs: 520 }),
        ev(9, "llm_call", at(2960), { model, messages: [{ role: "tool", content: '{"ok":true}' }] }, { durationMs: 500, tokensIn: Math.round(tIn * 1.1) }),
        ev(10, "llm_response", at(3480), { finishReason: "stop", content: "Synthesized both results." }, { tokensOut: Math.round(tOut * 0.7), costUsd: Number((cost * 0.7).toFixed(4)) }),
        ev(11, "run_end", at(3540), { status: "completed", summary: "Two tool calls, then synthesized." }),
      ];
      return { events, end: { status: "completed", endedAt: iso(3540) } };
    }
    case "retry": {
      const events = [
        start,
        ev(1, "llm_call", at(150), { model, tools: [tool], messages: [{ role: "user", content: "Fetch a value." }] }, { durationMs: 600, tokensIn: tIn }),
        ev(2, "llm_response", at(760), { finishReason: "tool_calls", toolCalls: [{ toolName: tool, callId: "call_1" }] }, { tokensOut: tOut, costUsd: cost }),
        ev(3, "tool_call", at(800), { toolName: tool, callId: "call_1", args: { q: "x" } }),
        ev(4, "tool_result", at(1180), { toolName: tool, callId: "call_1", ok: false, error: "HTTP 429 Too Many Requests" }, { durationMs: 360 }),
        ev(5, "retry", at(1240), { attempt: 1, ofSeq: 3, reason: "rate limited, backing off 500ms" }),
        ev(6, "tool_call", at(1760), { toolName: tool, callId: "call_2", args: { q: "x" } }),
        ev(7, "tool_result", at(2140), { toolName: tool, callId: "call_2", ok: true, result: { value: 42 } }, { durationMs: 340 }),
        ev(8, "llm_call", at(2200), { model, messages: [{ role: "tool", content: '{"value":42}' }] }, { durationMs: 470, tokensIn: Math.round(tIn * 1.1) }),
        ev(9, "llm_response", at(2680), { finishReason: "stop", content: "Recovered and answered." }, { tokensOut: Math.round(tOut * 0.6), costUsd: Number((cost * 0.6).toFixed(4)) }),
        ev(10, "run_end", at(2740), { status: "completed", summary: "Recovered from a transient failure." }),
      ];
      return { events, end: { status: "completed", endedAt: iso(2740) } };
    }
    case "failtool": {
      const events = [
        start,
        ev(1, "llm_call", at(160), { model, tools: [tool], messages: [{ role: "user", content: "Do the thing." }] }, { durationMs: 700, tokensIn: tIn }),
        ev(2, "llm_response", at(870), { finishReason: "tool_calls", toolCalls: [{ toolName: tool, callId: "call_1" }] }, { tokensOut: tOut, costUsd: cost }),
        ev(3, "tool_call", at(910), { toolName: tool, callId: "call_1", args: { path: "input.dat" } }),
        ev(4, "tool_result", at(1520), { toolName: tool, callId: "call_1", ok: false, error: `${tool} failed: upstream returned 500` }, { durationMs: 600 }),
        ev(5, "error", at(1580), { message: `Tool ${tool} failed and no fallback is configured`, fatal: true }),
        ev(6, "run_end", at(1620), { status: "failed", summary: "Tool errored; aborted." }),
      ];
      return { events, end: { status: "failed", endedAt: iso(1620) } };
    }
    case "failhallu": {
      const events = [
        start,
        ev(1, "llm_call", at(150), { model, tools: [tool], messages: [{ role: "user", content: "Handle the request." }] }, { durationMs: 650, tokensIn: tIn }),
        ev(2, "llm_response", at(800), { finishReason: "tool_calls", toolCalls: [{ toolName: "delete_everything", callId: "call_1" }] }, { tokensOut: tOut, costUsd: cost }),
        ev(3, "error", at(860), { message: "Model called 'delete_everything', which is not in the declared toolset", fatal: false }),
        ev(4, "agent_decision", at(920), { decision: "abort", reasoning: "Refusing to run an undeclared tool." }),
        ev(5, "run_end", at(980), { status: "failed", summary: "Hallucinated a tool outside its toolset; aborted." }),
      ];
      return { events, end: { status: "failed", endedAt: iso(980) } };
    }
    case "running": {
      // No run_end and no status patch, so the row stays "running".
      const events = [
        start,
        ev(1, "agent_decision", at(120), { decision: "call a tool", reasoning: `Needs data from ${tool}.` }),
        ev(2, "llm_call", at(170), { model, tools: [tool], messages: [{ role: "user", content: "In progress." }] }, { durationMs: 620, tokensIn: tIn }),
        ev(3, "llm_response", at(820), { finishReason: "tool_calls", toolCalls: [{ toolName: tool, callId: "call_1" }] }, { tokensOut: tOut, costUsd: cost }),
        ev(4, "tool_call", at(860), { toolName: tool, callId: "call_1", args: { q: "pending" } }),
      ];
      return { events };
    }
  }
}

function build(i: number): Built {
  const kind = KINDS[i]!;
  const name = `${NAMES[i]!}-agent`;
  const model = MODELS[i % MODELS.length]!;
  const tool = TOOLS[i % TOOLS.length]!;
  // Deterministic 0.6..1.5 spread so tokens/cost vary run to run.
  const scale = 0.6 + ((i * 7) % 10) / 10;
  // Staggered back from now (run 0 most recent), with a little jitter, so the
  // "newest" sort has a realistic ~1.5 day spread to order.
  const t0 = NOW - i * 43 * MIN - (i % 5) * 7 * MIN;
  const { events, end } = shape(kind, t0, model, scale, tool);
  return {
    run: {
      id: uuid(i),
      name,
      agentName: "assistant",
      model,
      startedAt: new Date(t0).toISOString(),
      metadata: { sample: true },
    },
    events,
    end,
  };
}

// Two extra runs that exercise documented features the generated set above
// doesn't reach, with their own stable ids (distinct "feedface" prefix) so they
// stay deep-linkable across restarts:
//   1. a run carrying a truncated payload, so the dashboard's truncation badge
//      (isTruncatedPayload / the _truncated marker) has something to render;
//   2. a ~300-event run, so the timeline's many-nodes path is exercisable.
const TRUNCATED_RUN_ID = "feedface-0000-4000-8000-000000000001";
const LARGE_RUN_ID = "feedface-0000-4000-8000-000000000002";

function buildTruncatedRun(): Built {
  const t0 = NOW - 90 * MIN;
  const at = (ms: number): number => t0 + ms;
  const iso = (ms: number): string => new Date(at(ms)).toISOString();
  const model = MODELS[1]!;
  const events: Event[] = [
    ev(0, "run_start", at(0), { agentName: "assistant", model }),
    ev(1, "llm_call", at(120), { model, messages: [{ role: "user", content: "Fetch the full report." }] }, { durationMs: 540, tokensIn: 900 }),
    ev(2, "tool_call", at(700), { toolName: "fetch_report", callId: "call_1", args: { id: "q3" } }),
    // The marker shape the SDK writes when a payload exceeds 50KB
    // (docs/EVENT_SCHEMA.md section 4): _truncated + _originalBytes + _preview.
    // isTruncatedPayload keys off _truncated === true; the badge reads it back
    // from here.
    ev(3, "tool_result", at(1300), {
      toolName: "fetch_report",
      callId: "call_1",
      ok: true,
      _truncated: true,
      _originalBytes: 83421,
      _preview: '{"rows":[{"id":1,"name":"Acme","total":9910.55},{"id":2,',
    }, { durationMs: 600 }),
    ev(4, "llm_response", at(1900), { finishReason: "stop", content: "Summarized the report." }, { tokensOut: 140, costUsd: 0.0071 }),
    ev(5, "run_end", at(1960), { status: "completed", summary: "Handled an oversized tool result." }),
  ];
  return {
    run: {
      id: TRUNCATED_RUN_ID,
      name: "report-fetcher-agent",
      agentName: "assistant",
      model,
      startedAt: new Date(t0).toISOString(),
      metadata: { sample: true, demonstrates: "truncated-payload" },
    },
    events,
    end: { status: "completed", endedAt: iso(1960) },
  };
}

function buildLargeRun(): Built {
  const t0 = NOW - 200 * MIN;
  const model = MODELS[0]!;
  const tool = TOOLS[0]!;
  const events: Event[] = [ev(0, "run_start", t0, { agentName: "assistant", model })];
  // ~300 events: repeated tool loops (llm_call -> llm_response -> tool_call ->
  // tool_result), then a run_end, each 40ms apart so the timeline spreads them.
  let seq = 1;
  const stepMs = 40;
  const loops = 74; // 1 + 74*4 + 1 = 298 events
  for (let i = 0; i < loops; i += 1) {
    const base = seq * stepMs;
    events.push(ev(seq++, "llm_call", t0 + base, { model, messages: [{ role: "user", content: `Step ${i}` }] }, { durationMs: 30, tokensIn: 60 }));
    events.push(ev(seq++, "llm_response", t0 + seq * stepMs, { finishReason: "tool_calls", toolCalls: [{ toolName: tool, callId: `call_${i}` }] }, { tokensOut: 20, costUsd: 0.0002 }));
    events.push(ev(seq++, "tool_call", t0 + seq * stepMs, { toolName: tool, callId: `call_${i}`, args: { n: i } }));
    events.push(ev(seq++, "tool_result", t0 + seq * stepMs, { toolName: tool, callId: `call_${i}`, ok: true, result: { n: i } }, { durationMs: 20 }));
  }
  const endMs = t0 + (seq + 1) * stepMs;
  events.push(ev(seq, "run_end", endMs, { status: "completed", summary: `Long run with ${seq + 1} events.` }));
  return {
    run: {
      id: LARGE_RUN_ID,
      name: "batch-processor-agent",
      agentName: "assistant",
      model,
      startedAt: new Date(t0).toISOString(),
      metadata: { sample: true, demonstrates: "large-event-count" },
    },
    events,
    end: { status: "completed", endedAt: new Date(endMs).toISOString() },
  };
}

// Seeds any sample run whose id is not already present, when SEED_DEMO is set.
// Never throws: a blank dashboard is a far better failure than a boot crash, so
// a seeding problem is logged and swallowed rather than allowed to take the
// collector down. Each run is independent, so one bad sample can't block the
// rest.
export function seedSampleRunsIfMissing(): void {
  if (!process.env.SEED_DEMO) {
    return;
  }
  let seeded = 0;
  const built: Built[] = [
    ...Array.from({ length: KINDS.length }, (_unused, i) => build(i)),
    buildTruncatedRun(),
    buildLargeRun(),
  ];
  for (const { run, events, end } of built) {
    try {
      if (getRun(run.id)) {
        continue;
      }
      createRun(run);
      appendEvents(run.id, events);
      if (end) {
        updateRunStatus(run.id, end);
      }
      seeded += 1;
    } catch (err) {
      console.error(`sample run seed failed for ${run.name}:`, err);
    }
  }
  if (seeded > 0) {
    console.log(`seeded ${seeded} sample runs`);
  }
}
