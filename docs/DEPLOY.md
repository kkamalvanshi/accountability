# Deploying both connectors

Both are Cloudflare Workers. You'll need a (free-tier is fine) Cloudflare account and
`wrangler` installed (`npm install -g wrangler`, or use `npx wrangler`). Do these steps as
yourself — none of this can happen from a Claude session, since it needs your own accounts
and a one-time human OAuth consent.

## 1. WHOOP connector

### 1a. Register a WHOOP developer app

1. Go to the [WHOOP Developer Dashboard](https://developer.whoop.com) and sign in with your
   own WHOOP membership.
2. Create a new app. Note the **Client ID** and **Client Secret** — you'll need both below.
3. Set the app's **redirect URI** to `https://<your-worker-subdomain>.workers.dev/callback`
   (you'll know the exact subdomain after step 1c's first deploy — you can add/edit the
   redirect URI in the WHOOP dashboard after that first deploy, before running OAuth consent).

### 1b. Install dependencies and create the KV namespace

```sh
cd whoop-connector
npm install
wrangler login                      # one-time, opens a browser
wrangler kv namespace create TOKENS
```

Copy the `id` it prints into `wrangler.toml`'s `[[kv_namespaces]]` block, replacing
`REPLACE_WITH_KV_NAMESPACE_ID`.

### 1c. Set secrets and deploy

```sh
wrangler secret put WHOOP_CLIENT_ID
wrangler secret put WHOOP_CLIENT_SECRET
wrangler deploy
```

The deploy output prints your Worker's URL, e.g. `https://whoop-connector.<you>.workers.dev`.

### 1d. Finish the WHOOP redirect URI, then authorize

1. Back in the WHOOP developer dashboard, set the redirect URI to
   `https://whoop-connector.<you>.workers.dev/callback` (exact URL from step 1c).
2. Visit `https://whoop-connector.<you>.workers.dev/authorize` in a browser, log into WHOOP,
   and approve. You should land on a plain "WHOOP connected" page.

### 1e. Add to Claude

Add `https://whoop-connector.<you>.workers.dev/mcp` as a custom connector in Claude's
connector settings. Test with a read-only call to `get_recovery` before wiring it into
anything automated.

## 2. Sleep.me connector

Simpler — no OAuth, just a bearer token you already have.

```sh
cd sleepme-connector
npm install
wrangler kv namespace create CURVE
```

Copy the `id` into `wrangler.toml`'s `[[kv_namespaces]]` block.

```sh
wrangler secret put SLEEPME_API_TOKEN   # paste the token when prompted — never in a file
wrangler deploy
```

Add `https://sleepme-connector.<you>.workers.dev/mcp` as a second custom connector in
Claude. Test with `list_bed_devices` first to confirm the token works and see your
device's real `device_id` and status field names.

## 3. A note on exact field names

Both clients were built directly against real specs (WHOOP's `openapi.json`, Sleep.me's
Postman collection) — not guessed. One gap: the Sleep.me collection shows *requests* only,
not example response bodies for `GET /devices` / `GET /devices/{id}`, so
`sleepme-connector/src/sleepme-client.ts` deliberately returns those responses as-is rather
than reshaping them into an assumed schema. After your first real `list_bed_devices` /
`get_bed_status` call, if you want the response reshaped into cleaner named fields (like the
WHOOP client does), that's a contained change in `sleepme-client.ts` once the real field
names are visible.

## 4. Local testing (optional)

Each package's `.dev.vars.example` lists the variable names `wrangler dev` needs. Copy it to
`.dev.vars` (gitignored) and fill in real values for local-only testing — never commit that
file.

```sh
cp .dev.vars.example .dev.vars   # then edit .dev.vars
npm run typecheck
wrangler dev
```
