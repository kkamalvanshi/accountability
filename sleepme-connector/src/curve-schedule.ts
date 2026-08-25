/**
 * Turns the pure curve math in curve.ts into an actual schedule: schedule_temp_curve stores
 * the night's setpoints in KV, and tickCurve (called from the Worker's scheduled() handler
 * every 5 minutes) pushes whichever ones have come due to the device.
 */
import { setDeviceTemp, resolveDeviceId, type SleepMeEnv } from "./sleepme-client";
import { buildCurve, type CurvePoint } from "./curve";

const KEY = "active_curve";

interface StoredCurve {
  device_id: string;
  points: CurvePoint[];
  next_index: number;
}

export async function scheduleCurve(
  env: SleepMeEnv,
  bedtimeIso: string,
  wakeIso: string,
  deviceId?: string
): Promise<{ device_id: string; points: CurvePoint[] }> {
  const resolvedDeviceId = await resolveDeviceId(env, deviceId);
  const points = buildCurve(new Date(bedtimeIso), new Date(wakeIso));
  const stored: StoredCurve = { device_id: resolvedDeviceId, points, next_index: 0 };
  await env.CURVE.put(KEY, JSON.stringify(stored));
  return { device_id: resolvedDeviceId, points };
}

export async function cancelCurve(env: SleepMeEnv): Promise<void> {
  await env.CURVE.delete(KEY);
}

/**
 * Called every 5 minutes from the Worker's scheduled() handler. If several setpoints came
 * due since the last tick (e.g. a missed run), only the latest is actually sent — that's the
 * temperature that should be active right now, not a queue to replay.
 */
export async function tickCurve(env: SleepMeEnv): Promise<void> {
  const raw = await env.CURVE.get(KEY);
  if (!raw) return;
  const stored = JSON.parse(raw) as StoredCurve;
  const now = Date.now();

  let dueIndex = -1;
  for (let i = stored.next_index; i < stored.points.length; i++) {
    if (new Date(stored.points[i].at).getTime() <= now) {
      dueIndex = i;
    } else {
      break;
    }
  }
  if (dueIndex === -1) return;

  const point = stored.points[dueIndex];
  await setDeviceTemp(env, stored.device_id, {
    set_temperature_f: point.temp_f,
    thermal_control_status: "active",
  });

  stored.next_index = dueIndex + 1;
  if (stored.next_index >= stored.points.length) {
    await env.CURVE.delete(KEY); // curve finished — nothing left to push
  } else {
    await env.CURVE.put(KEY, JSON.stringify(stored));
  }
}
