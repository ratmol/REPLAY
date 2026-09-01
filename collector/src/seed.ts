// Optional sample-run seeding for a hosted, read-only instance.
//
// Guarded by the SEED_DEMO env var so a local self-host stays empty - the
// README promises a fresh checkout starts blank, and only the public instance
// sets the flag. Each sample run is seeded only if its own id is missing, so a
// host with an ephemeral disk (a free tier that wipes storage on restart)
// rebuilds whatever it lost on the next boot, a normal restart that kept its
// data is a no-op, and adding a new sample run here backfills it on the next
// deploy without wiping the others.

import type { CreateRunRequest, Event, PatchRunRequest } from "replay-shared";
import { appendEvents, createRun, getRun, updateRunStatus } from "./store.js";

interface SampleRun {
  run: CreateRunRequest;
  events: Event[];
  end: PatchRunRequest;
}

// Fixed ids so each sample keeps the same URL across restarts (shareable deep
// links stay valid). Valid UUID shape because runs.id is a uuid at the edge.
const BASE = Date.parse("2026-01-15T17:30:00.000Z");
const iso = (offsetMs: number): string => new Date(BASE + offsetMs).toISOString();

// 1. A clean tool-calling loop that completes. llm_call/llm_response sit
//    adjacent (they pair on adjacency); the tool_call/tool_result share a
//    callId (they pair on that), so the timeline draws two spans plus points.
function weatherRun(): SampleRun {
  const at = (ms: number): string => iso(ms);
  return {
    run: {
      id: "d3adbeef-0000-4000-8000-000000000001",
      name: "weather-lookup-agent",
      agentName: "assistant",
      model: "claude-sonnet-4-6",
      startedAt: at(0),
      metadata: { sample: true, task: "Answer a question that needs a tool call" },
    },
    events: [
      { seq: 0, type: "run_start", timestamp: at(0), payload: { agentName: "assistant", model: "claude-sonnet-4-6" } },
      { seq: 1, type: "agent_decision", timestamp: at(140), payload: { decision: "call a tool", reasoning: "The question needs live weather data the model doesn't have." } },
      { seq: 2, type: "llm_call", timestamp: at(180), durationMs: 640, tokensIn: 1240, payload: { model: "claude-sonnet-4-6", messages: [{ role: "user", content: "What's the weather in Toronto right now?" }], tools: ["get_weather"] } },
      { seq: 3, type: "llm_response", timestamp: at(820), tokensOut: 180, costUsd: 0.0043, payload: { finishReason: "tool_calls", toolCalls: [{ toolName: "get_weather", callId: "call_1" }] } },
      { seq: 4, type: "tool_call", timestamp: at(860), payload: { toolName: "get_weather", callId: "call_1", args: { city: "Toronto" } } },
      { seq: 5, type: "tool_result", timestamp: at(1440), durationMs: 560, payload: { toolName: "get_weather", callId: "call_1", ok: true, result: { tempC: 12, condition: "light rain" } } },
      { seq: 6, type: "llm_call", timestamp: at(1500), durationMs: 520, tokensIn: 1510, payload: { model: "claude-sonnet-4-6", messages: [{ role: "tool", content: '{"tempC":12,"condition":"light rain"}' }] } },
      { seq: 7, type: "llm_response", timestamp: at(2020), tokensOut: 96, costUsd: 0.0051, payload: { finishReason: "stop", content: "It's 12 degrees and lightly raining in Toronto right now." } },
      { seq: 8, type: "run_end", timestamp: at(2080), payload: { status: "completed", summary: "Answered with one tool call." } },
    ],
    end: { status: "completed", endedAt: at(2080) },
  };
}

// 2. A run that fails on purpose: the tool errors, the agent surfaces a fatal
//    error, and the run ends "failed". This is what makes the status filter and
//    the error styling on the timeline worth having.
function failedRun(): SampleRun {
  const off = 60_000; // a minute after the weather run, so it sorts distinctly
  const at = (ms: number): string => iso(off + ms);
  return {
    run: {
      id: "d3adbeef-0000-4000-8000-000000000002",
      name: "invoice-parser-agent",
      agentName: "assistant",
      model: "claude-sonnet-4-6",
      startedAt: at(0),
      metadata: { sample: true, task: "Parse an invoice PDF that turns out to be unreadable" },
    },
    events: [
      { seq: 0, type: "run_start", timestamp: at(0), payload: { agentName: "assistant", model: "claude-sonnet-4-6" } },
      { seq: 1, type: "llm_call", timestamp: at(160), durationMs: 700, tokensIn: 980, payload: { model: "claude-sonnet-4-6", messages: [{ role: "user", content: "Extract the total from invoice.pdf" }], tools: ["read_pdf"] } },
      { seq: 2, type: "llm_response", timestamp: at(860), tokensOut: 120, costUsd: 0.0038, payload: { finishReason: "tool_calls", toolCalls: [{ toolName: "read_pdf", callId: "call_1" }] } },
      { seq: 3, type: "tool_call", timestamp: at(900), payload: { toolName: "read_pdf", callId: "call_1", args: { path: "invoice.pdf" } } },
      { seq: 4, type: "tool_result", timestamp: at(1520), durationMs: 600, payload: { toolName: "read_pdf", callId: "call_1", ok: false, error: "PdfParseError: no extractable text layer (scanned image)" } },
      { seq: 5, type: "error", timestamp: at(1580), payload: { message: "Tool read_pdf failed and no OCR fallback is configured", fatal: true } },
      { seq: 6, type: "run_end", timestamp: at(1620), payload: { status: "failed", summary: "Could not read a scanned invoice; aborted." } },
    ],
    end: { status: "failed", endedAt: at(1620) },
  };
}

// 3. A run that fails once, retries with a fresh callId, and recovers. The
//    retry event points back at the tool_call it re-attempts (ofSeq), and the
//    second attempt succeeds - the "transient failure survived" story.
function retryRun(): SampleRun {
  const off = 120_000;
  const at = (ms: number): string => iso(off + ms);
  return {
    run: {
      id: "d3adbeef-0000-4000-8000-000000000003",
      name: "exchange-rate-agent",
      agentName: "assistant",
      model: "claude-sonnet-4-6",
      startedAt: at(0),
      metadata: { sample: true, task: "Fetch a rate from an API that rate-limits the first call" },
    },
    events: [
      { seq: 0, type: "run_start", timestamp: at(0), payload: { agentName: "assistant", model: "claude-sonnet-4-6" } },
      { seq: 1, type: "llm_call", timestamp: at(150), durationMs: 610, tokensIn: 1020, payload: { model: "claude-sonnet-4-6", messages: [{ role: "user", content: "What's 100 USD in CAD?" }], tools: ["get_rate"] } },
      { seq: 2, type: "llm_response", timestamp: at(760), tokensOut: 88, costUsd: 0.0036, payload: { finishReason: "tool_calls", toolCalls: [{ toolName: "get_rate", callId: "call_1" }] } },
      { seq: 3, type: "tool_call", timestamp: at(800), payload: { toolName: "get_rate", callId: "call_1", args: { from: "USD", to: "CAD" } } },
      { seq: 4, type: "tool_result", timestamp: at(1180), durationMs: 360, payload: { toolName: "get_rate", callId: "call_1", ok: false, error: "HTTP 429 Too Many Requests" } },
      { seq: 5, type: "retry", timestamp: at(1240), payload: { attempt: 1, ofSeq: 3, reason: "rate limited, backing off 500ms" } },
      { seq: 6, type: "tool_call", timestamp: at(1760), payload: { toolName: "get_rate", callId: "call_2", args: { from: "USD", to: "CAD" } } },
      { seq: 7, type: "tool_result", timestamp: at(2140), durationMs: 340, payload: { toolName: "get_rate", callId: "call_2", ok: true, result: { rate: 1.37 } } },
      { seq: 8, type: "llm_call", timestamp: at(2200), durationMs: 480, tokensIn: 1180, payload: { model: "claude-sonnet-4-6", messages: [{ role: "tool", content: '{"rate":1.37}' }] } },
      { seq: 9, type: "llm_response", timestamp: at(2680), tokensOut: 72, costUsd: 0.0041, payload: { finishReason: "stop", content: "100 USD is about 137 CAD." } },
      { seq: 10, type: "run_end", timestamp: at(2740), payload: { status: "completed", summary: "Recovered from a rate limit on the second attempt." } },
    ],
    end: { status: "completed", endedAt: at(2740) },
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
  for (const sample of [weatherRun(), failedRun(), retryRun()]) {
    try {
      if (getRun(sample.run.id)) {
        continue;
      }
      createRun(sample.run);
      appendEvents(sample.run.id, sample.events);
      updateRunStatus(sample.run.id, sample.end);
      console.log(`seeded sample run ${sample.run.id} (${sample.run.name})`);
    } catch (err) {
      console.error(`sample run seed failed for ${sample.run.name}:`, err);
    }
  }
}
