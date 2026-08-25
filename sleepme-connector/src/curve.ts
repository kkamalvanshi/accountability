/**
 * Builds one night's bed-temperature curve from the exact reference anchors: settle & cool
 * anchored to bedtime, a proportional core-warm climb through the middle of the night, and a
 * wake-time heat ramp anchored to wake time. A night computed at a different length than the
 * 9:30pm-6:30am reference gets the same-shaped curve, just resampled to fit.
 */

export interface CurvePoint {
  at: string; // ISO 8601
  temp_f: number;
}

const MINUTE_MS = 60_000;

export function buildCurve(bedtime: Date, wake: Date): CurvePoint[] {
  const points: CurvePoint[] = [];
  const add = (at: Date, temp_f: number) => points.push({ at: at.toISOString(), temp_f });

  // Settle & cool — anchored to bedtime: hold 75°F for 15 min, then cool to a 70°F trough
  // by 90 minutes in. This is about sleep onset, so it always runs from lights-out.
  add(bedtime, 75);
  add(new Date(bedtime.getTime() + 15 * MINUTE_MS), 75);
  add(new Date(bedtime.getTime() + 45 * MINUTE_MS), 72);
  const trough = new Date(bedtime.getTime() + 90 * MINUTE_MS);
  add(trough, 70);

  // Core warm — proportional: 70°F -> 73°F -> 75°F -> 77°F in three even steps, spanning
  // from the trough to wake-0:45. Resampled to that night's actual span, not fixed clock
  // offsets, so a short or long night still gets the same-shaped climb.
  const coreEnd = new Date(wake.getTime() - 45 * MINUTE_MS);
  const coreSpanMs = coreEnd.getTime() - trough.getTime();
  if (coreSpanMs > 0) {
    add(new Date(trough.getTime() + coreSpanMs * 0.33), 73);
    add(new Date(trough.getTime() + coreSpanMs * 0.67), 75);
    add(coreEnd, 77);
  } else {
    // Night too short for the full proportional climb (e.g. a nap-length window) — skip
    // straight to the wake-boost anchor at 77°F rather than emitting an inverted schedule.
    add(coreEnd, 77);
  }

  // Wake boost — anchored to wake time: hold 77°F until wake-0:15, then ramp to a 115°F
  // peak over a fixed 20 minutes, landing the peak right around the actual wake moment.
  const rampStart = new Date(wake.getTime() - 15 * MINUTE_MS);
  add(rampStart, 77);
  add(new Date(rampStart.getTime() + 20 * MINUTE_MS), 115);

  return points.sort((a, b) => a.at.localeCompare(b.at));
}
