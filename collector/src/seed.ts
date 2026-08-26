// Optional sample-run seeding for a hosted, read-only instance.
//
// Guarded by the SEED_DEMO env var so a local self-host stays empty - the
// README promises a fresh checkout starts blank, and only the public instance
// sets the flag. It also only seeds when no runs exist yet, so on a host with
// an ephemeral disk (a free tier that wipes storage on restart) a restart
// rebuilds the sample run instead of leaving the dashboard blank, while a
// normal restart that kept its data doesn't duplicate it.

import type { CreateRunRequest, Event, PatchRunRequest } from "replay-shared";
import { appendEvents, createRun, listRuns, updateRunStatus } from "./store.js";

// Fixed so the sample run keeps the same URL across restarts (shareable deep
// links stay valid). Valid UUID shape because runs.id is a uuid at the edge.
const SAMPLE_RUN_ID = "d3adbeef-0000-4000-8000-000000000001";

function buildSampleRun(): {
  run: CreateRunRequest;
  events: Event[];
  end: PatchRunRequest;
} {
  const base = Date.parse("2026-01-15T17:30:00.000Z");
  const at = (offsetMs: number): string => new Date(base + offsetMs).toISOString();

  const run: CreateRunRequest = {
    id: SAMPLE_RUN_ID,
    name: "weather-lookup-agent",
    agentName: "assistant",
    model: "claude-sonnet-4-6",
    startedAt: at(0),
    metadata: { sample: true, task: "Answer a question that needs a tool call" },
  };

  // A small tool-calling loop: decide, ask the model, call a tool, ask again,
  // finish. llm_call/llm_response sit adjacent (they pair on adjacency) and the
  // tool_call/tool_result share a callId (they pair on that), so the timeline
  // draws two spans plus points - enough to exercise every panel.
  const events: Event[] = [
    {
      seq: 0,
      type: "run_start",
      timestamp: at(0),
      payload: { agentName: "assistant", model: "claude-sonnet-4-6" },
    },
    {
      seq: 1,
      type: "agent_decision",
      timestamp: at(140),
      payload: {
        decision: "call a tool",
        reasoning: "The question needs live weather data the model doesn't have.",
      },
    },
    {
      seq: 2,
      type: "llm_call",
      timestamp: at(180),
      durationMs: 640,
      tokensIn: 1240,
      payload: {
        model: "claude-sonnet-4-6",
        messages: [{ role: "user", content: "What's the weather in Toronto right now?" }],
        tools: ["get_weather"],
      },
    },
    {
      seq: 3,
      type: "llm_response",
      timestamp: at(820),
      tokensOut: 180,
      costUsd: 0.0043,
      payload: {
        finishReason: "tool_calls",
        toolCalls: [{ toolName: "get_weather", callId: "call_1" }],
      },
    },
    {
      seq: 4,
      type: "tool_call",
      timestamp: at(860),
      payload: { toolName: "get_weather", callId: "call_1", args: { city: "Toronto" } },
    },
    {
      seq: 5,
      type: "tool_result",
      timestamp: at(1440),
      durationMs: 560,
      payload: {
        toolName: "get_weather",
        callId: "call_1",
        ok: true,
        result: { tempC: 12, condition: "light rain" },
      },
    },
    {
      seq: 6,
      type: "llm_call",
      timestamp: at(1500),
      durationMs: 520,
      tokensIn: 1510,
      payload: {
        model: "claude-sonnet-4-6",
        messages: [{ role: "tool", content: '{"tempC":12,"condition":"light rain"}' }],
      },
    },
    {
      seq: 7,
      type: "llm_response",
      timestamp: at(2020),
      tokensOut: 96,
      costUsd: 0.0051,
      payload: {
        finishReason: "stop",
        content: "It's 12 degrees and lightly raining in Toronto right now.",
      },
    },
    {
      seq: 8,
      type: "run_end",
      timestamp: at(2080),
      payload: { status: "completed", summary: "Answered with one tool call." },
    },
  ];

  const end: PatchRunRequest = { status: "completed", endedAt: at(2080) };

  return { run, events, end };
}

// Seeds the sample run when SEED_DEMO is set and the store is empty. Never
// throws: a blank dashboard is a far better failure than a boot crash, so a
// seeding problem is logged and swallowed rather than allowed to take the
// collector down.
export function seedSampleRunIfEmpty(): void {
  if (!process.env.SEED_DEMO) {
    return;
  }
  try {
    if (listRuns(1, 0).length > 0) {
      return;
    }
    const { run, events, end } = buildSampleRun();
    createRun(run);
    appendEvents(run.id, events);
    updateRunStatus(run.id, end);
    console.log(`seeded sample run ${run.id}`);
  } catch (err) {
    console.error("sample run seed failed:", err);
  }
}
