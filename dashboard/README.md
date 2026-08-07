# replay-dashboard

Vite + React timeline scrubber for replaying recorded agent runs.

Status: routing (runs list / run detail, hand-rolled) and CRT/VHS design
tokens in place. Runs list fetches real data from `GET /runs` and shows
status, duration, cost, and model per run. Run detail now renders a
hand-built SVG timeline (v1: static positioning, tool_call/tool_result and
llm_call/llm_response render as spans per the documented pairing rule,
everything else as points; zoom in/out only, no scrubber interaction yet -
that's roadmap 2.4). Event inspector and cost panel land in later Phase 2
tasks.
