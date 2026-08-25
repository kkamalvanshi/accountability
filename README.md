# accountability

Two small remote MCP connectors, each a standalone Cloudflare Worker, that give Claude
direct read/write access to a WHOOP account and a Sleep.me (Chilipad/Ooler) bed. Built for
the "personal operating system" setup described in the Aug 2026 blueprint — neither vendor
ships a ready-made Claude connector, so these are hand-built against their real APIs.

Nothing here runs on a laptop. Both are cloud Workers Claude talks to over HTTPS.

## Packages

- **[`whoop-connector/`](whoop-connector)** — OAuth2 against the WHOOP API (v2). Tools:
  `get_last_sleep`, `get_recovery`, `get_strain`.
- **[`sleepme-connector/`](sleepme-connector)** — bearer-token REST against the Sleep.me
  developer API. Tools: `list_bed_devices`, `get_bed_status`, `set_bed_temp`, plus
  `schedule_temp_curve` / `cancel_temp_curve` to run the full night's bedtime-to-wake
  temperature curve on a 5-minute cron, not just a single setpoint.

Each package is independently deployable — see [`docs/DEPLOY.md`](docs/DEPLOY.md) for the
full step-by-step (WHOOP app registration, `wrangler` secrets, KV namespace creation, adding
both URLs as custom connectors in Claude).

Standing preferences that feed the bedtime formula (currently just target wake time) live in
[`CLAUDE.md`](CLAUDE.md) — check there before computing a bedtime from `get_last_sleep`.

## Security notes

- No vendor credentials are committed anywhere in this repo. `.dev.vars.example` in each
  package lists the required variable *names* only; real values go in a local, gitignored
  `.dev.vars` for `wrangler dev`, and in the deployed Worker's secrets
  (`wrangler secret put <NAME>`) for production.
- The WHOOP connector's OAuth tokens live in a Cloudflare KV namespace, never in Notion, a
  Calendar event, or this repo.
- The Sleep.me connector's `SLEEPME_API_TOKEN` is a static bearer token — treat it like a
  password; rotate it from the Sleep.me developer portal if it's ever exposed.
