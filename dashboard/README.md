# replay-dashboard

Vite + React timeline scrubber for replaying recorded agent runs.

Status: routing (runs list / run detail, hand-rolled) and CRT/VHS design
tokens in place. Runs list now fetches real data from `GET /runs` and shows
status, duration, cost, and model per run. Run detail is still a
placeholder; timeline, scrubber, and event inspector land in later Phase 2
tasks.
