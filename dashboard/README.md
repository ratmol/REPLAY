# replay-dashboard

Vite + React timeline scrubber for replaying recorded agent runs.

Status: routing (runs list / run detail, hand-rolled) and CRT/VHS design
tokens in place. Runs list fetches real data from `GET /runs` and shows
status, duration, cost, and model per run. Run detail renders a hand-built
SVG timeline with a working scrubber: click or drag to seek, arrow keys to
step between events, space or the play button to play back at an adjustable
speed. Event inspector and cost panel land in later Phase 2 tasks.
