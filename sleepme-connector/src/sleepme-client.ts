/**
 * Typed wrapper over the Sleep.me developer API, built directly against the pasted Postman
 * collection (endpoints, auth, and the PATCH body shape are taken verbatim from it).
 *
 * One honest gap: the collection shows *requests* only, not example response bodies for
 * GET /devices or GET /devices/{id} — so this deliberately does NOT reshape those responses
 * into a guessed schema. get_bed_status/list_bed_devices return the device JSON exactly as
 * Sleep.me sends it. Once a real call has run once (after the token/device are live), if the
 * field names for current/target temp turn out to differ from what's assumed in curve.ts's
 * caller, the fix is contained to this file.
 */

export interface SleepMeEnv {
  SLEEPME_API_TOKEN: string;
  CURVE: KVNamespace;
  // Durable Object binding McpAgent.serve() uses by default — see wrangler.toml.
  MCP_OBJECT: DurableObjectNamespace;
}

const BASE = "https://api.developer.sleep.me/v1";

async function sleepmeFetch<T>(
  env: SleepMeEnv,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const resp = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.SLEEPME_API_TOKEN}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  if (!resp.ok) {
    throw new Error(
      `Sleep.me ${init.method ?? "GET"} ${path} failed (${resp.status}): ${await resp.text()}`
    );
  }
  if (resp.status === 204) return undefined as unknown as T;
  return (await resp.json()) as T;
}

/** Passed through verbatim — see the file-level note on why this isn't reshaped. */
export type SleepMeDevice = Record<string, unknown> & { id: string };

export async function listDevices(env: SleepMeEnv): Promise<SleepMeDevice[]> {
  const data = await sleepmeFetch<SleepMeDevice[] | { devices: SleepMeDevice[] }>(
    env,
    "/devices"
  );
  return Array.isArray(data) ? data : data.devices ?? [];
}

export async function getDeviceStatus(env: SleepMeEnv, deviceId: string): Promise<SleepMeDevice> {
  return sleepmeFetch<SleepMeDevice>(env, `/devices/${encodeURIComponent(deviceId)}`);
}

export interface SetTempInput {
  set_temperature_f: number;
  thermal_control_status?: "active" | "standby";
}

export async function setDeviceTemp(
  env: SleepMeEnv,
  deviceId: string,
  input: SetTempInput
): Promise<SleepMeDevice> {
  return sleepmeFetch<SleepMeDevice>(env, `/devices/${encodeURIComponent(deviceId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export interface SleepReportsQuery {
  start_date: string; // YYYY-MM-DD
  days_back?: number;
  time_zone?: string; // IANA tz, e.g. America/Los_Angeles
}

/** Not wired to an MCP tool yet (not asked for) — exposed since the collection includes it
 * and it's a trivial addition later (habit-tracker cross-checks, sleep-report history, etc). */
export async function listSleepReports(
  env: SleepMeEnv,
  query: SleepReportsQuery
): Promise<unknown> {
  const params = new URLSearchParams({ start_date: query.start_date });
  if (query.days_back !== undefined) params.set("days_back", String(query.days_back));
  if (query.time_zone) params.set("time_zone", query.time_zone);
  return sleepmeFetch(env, `/sleep-reports?${params.toString()}`);
}

/** Resolve which device to act on: an explicit id always wins; otherwise auto-pick only if
 * there's exactly one device on the account. */
export async function resolveDeviceId(env: SleepMeEnv, requested?: string): Promise<string> {
  if (requested) return requested;
  const devices = await listDevices(env);
  if (devices.length === 1) return devices[0].id;
  if (devices.length === 0) throw new Error("No Sleep.me devices found on this account.");
  throw new Error(
    `Multiple Sleep.me devices found (${devices
      .map((d) => d.id)
      .join(", ")}) — pass device_id explicitly.`
  );
}
