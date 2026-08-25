/**
 * Typed wrapper over the Sleep.me developer API, built against the pasted Postman collection
 * for endpoints/auth/PATCH body shape, and against a real GET /devices/{id} response (captured
 * 2026-08-25 from the live "Dock" device) for the response shapes below. GET /devices returns a
 * bare array of {id, name, attachments}; GET/PATCH /devices/{id} returns {about, control, status}
 * — set_temperature_f and thermal_control_status live under `control`, connection state under
 * `status`. All types keep an index signature so any undocumented/future field still passes
 * through untouched rather than getting silently dropped.
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

/** One entry from GET /devices. */
export interface DeviceSummary {
  id: string;
  name?: string;
  attachments?: unknown[];
  [key: string]: unknown;
}

/** The `control` sub-object shape, also used standalone below (PATCH's response). */
export interface DeviceControl {
  brightness_level?: number;
  display_temperature_unit?: "f" | "c";
  set_temperature_c?: number;
  set_temperature_f?: number;
  thermal_control_status?: "active" | "standby";
  time_zone?: string;
  [key: string]: unknown;
}

/** GET /devices/{id} — the device's full current status. */
export interface DeviceStatus {
  about?: {
    firmware_version?: string;
    ip_address?: string;
    lan_address?: string;
    mac_address?: string;
    model?: string;
    serial_number?: string;
    [key: string]: unknown;
  };
  control?: DeviceControl;
  status?: {
    is_connected?: boolean;
    is_water_low?: boolean;
    water_level?: number;
    water_temperature_c?: number;
    water_temperature_f?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export async function listDevices(env: SleepMeEnv): Promise<DeviceSummary[]> {
  const data = await sleepmeFetch<DeviceSummary[] | { devices: DeviceSummary[] }>(
    env,
    "/devices"
  );
  return Array.isArray(data) ? data : data.devices ?? [];
}

export async function getDeviceStatus(env: SleepMeEnv, deviceId: string): Promise<DeviceStatus> {
  return sleepmeFetch<DeviceStatus>(env, `/devices/${encodeURIComponent(deviceId)}`);
}

export interface SetTempInput {
  set_temperature_f: number;
  thermal_control_status?: "active" | "standby";
}

export async function setDeviceTemp(
  env: SleepMeEnv,
  deviceId: string,
  input: SetTempInput
): Promise<DeviceControl> {
  // Confirmed live 2026-08-25: unlike GET (which wraps in {about, control, status}), PATCH
  // returns the `control` fields flattened at the top level — not the full nested shape.
  return sleepmeFetch<DeviceControl>(env, `/devices/${encodeURIComponent(deviceId)}`, {
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
