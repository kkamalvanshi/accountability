# Standing rules

Durable preferences for this project, kept here because Notion/Calendar (the actual
source-of-truth surfaces described in the blueprint) aren't connected in every session that
touches this repo. If/when Notion or Google Calendar access is set up, these should move
there as the real source of truth — a scheduled daily check-in reads Notion/Calendar, not
this file — but until then, treat this file as authoritative and check it before computing
anything that depends on these values.

## Target wake time: 5:00 AM

As of 2026-08-25, the standing target wake time is **5:00 AM**, every day, until told
otherwise. Use this as `wake_time` in the WHOOP bedtime formula
(`bedtime = wake_time - sleep_need_hours - onset_buffer_minutes`, using
`get_last_sleep`'s `sleep_need_hours` and `onset_buffer_minutes` from the
`whoop-connector` MCP tools) whenever no calendar event or explicit override says
otherwise for a specific night.

`onset_buffer_minutes` is already capped at 60 minutes server-side (falls back to the flat
15-minute default above that) — confirmed necessary live on 2026-08-25, when a rough,
74%-efficiency night produced an uncapped value of ~180 minutes. Use `onset_buffer_minutes`
as-is; `onset_buffer_minutes_uncapped` is there for visibility only, not for the formula.
