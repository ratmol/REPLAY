# replay-dashboard

Vite + React timeline scrubber for replaying recorded agent runs.

Status: routing (runs list / run detail, hand-rolled) and CRT/VHS design
tokens in place. Runs list fetches real data from `GET /runs` and shows
status, duration, cost, and model per run. Run detail renders a hand-built
SVG timeline with a working scrubber: click or drag to seek, arrow keys to
step between events, space or the play button to play back at an adjustable
speed. Clicking an event opens a side panel with its fields, a formatted
JSON payload view, a truncated-payload badge, and a copy button. A cost
panel shows total cost and tokens, a per-step breakdown, and a hand-built
cost-over-time sparkline. The VHS polish pass lands in a later Phase 2 task.
