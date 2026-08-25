/**
 * Typed wrappers over the three WHOOP v2 endpoints this connector exposes, built directly
 * against the pasted openapi.json (not guessed). Each function does the minimum cleanup the
 * doc asks for — e.g. summing `sleep_needed`'s four ms fields into hours — and otherwise
 * passes WHOOP's own fields through untouched, so nothing is silently reinterpreted.
 */
import { getValidAccessToken, type WhoopEnv } from "./oauth";

const BASE = "https://api.prod.whoop.com/developer";
const MILLI_PER_HOUR = 3_600_000;
const DEFAULT_ONSET_BUFFER_MINUTES = 15;

async function whoopGet<T>(env: WhoopEnv, path: string): Promise<T> {
  const token = await getValidAccessToken(env);
  const resp = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) {
    throw new Error(`WHOOP GET ${path} failed (${resp.status}): ${await resp.text()}`);
  }
  return (await resp.json()) as T;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// --- Raw WHOOP response shapes (subset of openapi.json actually used here) ---

interface SleepNeeded {
  baseline_milli: number;
  need_from_sleep_debt_milli: number;
  need_from_recent_strain_milli: number;
  need_from_recent_nap_milli: number;
}

interface SleepStageSummary {
  total_in_bed_time_milli: number;
  total_awake_time_milli: number;
  total_light_sleep_time_milli: number;
  total_slow_wave_sleep_time_milli: number;
  total_rem_sleep_time_milli: number;
  sleep_cycle_count: number;
  disturbance_count: number;
}

interface SleepScore {
  stage_summary: SleepStageSummary;
  sleep_needed: SleepNeeded;
  respiratory_rate?: number;
  sleep_performance_percentage?: number;
  sleep_consistency_percentage?: number;
  sleep_efficiency_percentage?: number;
}

interface SleepRecord {
  id: string;
  start: string;
  end: string;
  nap: boolean;
  score_state: "SCORED" | "PENDING_SCORE" | "UNSCORABLE";
  score?: SleepScore;
}

interface PaginatedSleepResponse {
  records: SleepRecord[];
}

interface RecoveryScore {
  user_calibrating: boolean;
  recovery_score: number;
  resting_heart_rate: number;
  hrv_rmssd_milli: number;
  spo2_percentage?: number;
  skin_temp_celsius?: number;
}

interface RecoveryRecord {
  cycle_id: number;
  sleep_id: string;
  score_state: "SCORED" | "PENDING_SCORE" | "UNSCORABLE";
  score?: RecoveryScore;
}

interface RecoveryCollection {
  records: RecoveryRecord[];
}

interface CycleScore {
  strain: number;
  kilojoule: number;
  average_heart_rate: number;
  max_heart_rate: number;
}

interface CycleRecord {
  id: number;
  start: string;
  end?: string;
  score_state: "SCORED" | "PENDING_SCORE" | "UNSCORABLE";
  score?: CycleScore;
}

interface PaginatedCycleResponse {
  records: CycleRecord[];
}

// --- Cleaned tool outputs ---

export interface LastSleepResult {
  found: boolean;
  start?: string;
  end?: string;
  nap?: boolean;
  score_state?: string;
  /** Sum of the four sleep_needed ms fields, in hours — WHOOP's own number, not reimplemented. */
  sleep_need_hours?: number;
  sleep_need_breakdown_ms?: SleepNeeded;
  /** Default 15 min; refined to need_hrs * (1/efficiency - 1) * 60 once efficiency is known. */
  onset_buffer_minutes?: number;
  sleep_efficiency_percentage?: number;
  sleep_performance_percentage?: number;
  sleep_consistency_percentage?: number;
  respiratory_rate?: number;
  stage_summary_hours?: {
    in_bed: number;
    awake: number;
    light: number;
    slow_wave: number;
    rem: number;
  };
  sleep_cycle_count?: number;
  disturbance_count?: number;
}

export async function getLastSleep(env: WhoopEnv): Promise<LastSleepResult> {
  const data = await whoopGet<PaginatedSleepResponse>(env, "/v2/activity/sleep?limit=1");
  const record = data.records[0];
  if (!record) return { found: false };

  const result: LastSleepResult = {
    found: true,
    start: record.start,
    end: record.end,
    nap: record.nap,
    score_state: record.score_state,
  };

  const score = record.score;
  if (score) {
    const need = score.sleep_needed;
    const needHours =
      (need.baseline_milli +
        need.need_from_sleep_debt_milli +
        need.need_from_recent_strain_milli +
        need.need_from_recent_nap_milli) /
      MILLI_PER_HOUR;

    result.sleep_need_hours = round2(needHours);
    result.sleep_need_breakdown_ms = need;
    result.sleep_efficiency_percentage = score.sleep_efficiency_percentage;
    result.sleep_performance_percentage = score.sleep_performance_percentage;
    result.sleep_consistency_percentage = score.sleep_consistency_percentage;
    result.respiratory_rate = score.respiratory_rate;

    result.onset_buffer_minutes =
      score.sleep_efficiency_percentage && score.sleep_efficiency_percentage > 0
        ? round2(needHours * (100 / score.sleep_efficiency_percentage - 1) * 60)
        : DEFAULT_ONSET_BUFFER_MINUTES;

    const stages = score.stage_summary;
    if (stages) {
      result.stage_summary_hours = {
        in_bed: round2(stages.total_in_bed_time_milli / MILLI_PER_HOUR),
        awake: round2(stages.total_awake_time_milli / MILLI_PER_HOUR),
        light: round2(stages.total_light_sleep_time_milli / MILLI_PER_HOUR),
        slow_wave: round2(stages.total_slow_wave_sleep_time_milli / MILLI_PER_HOUR),
        rem: round2(stages.total_rem_sleep_time_milli / MILLI_PER_HOUR),
      };
      result.sleep_cycle_count = stages.sleep_cycle_count;
      result.disturbance_count = stages.disturbance_count;
    }
  }

  return result;
}

export interface RecoveryResult {
  found: boolean;
  cycle_id?: number;
  sleep_id?: string;
  score_state?: string;
  recovery_score?: number;
  resting_heart_rate?: number;
  hrv_rmssd_milli?: number;
  spo2_percentage?: number;
  skin_temp_celsius?: number;
  user_calibrating?: boolean;
}

export async function getRecovery(env: WhoopEnv): Promise<RecoveryResult> {
  const data = await whoopGet<RecoveryCollection>(env, "/v2/recovery?limit=1");
  const record = data.records[0];
  if (!record) return { found: false };
  return {
    found: true,
    cycle_id: record.cycle_id,
    sleep_id: record.sleep_id,
    score_state: record.score_state,
    ...(record.score
      ? {
          recovery_score: record.score.recovery_score,
          resting_heart_rate: record.score.resting_heart_rate,
          hrv_rmssd_milli: record.score.hrv_rmssd_milli,
          spo2_percentage: record.score.spo2_percentage,
          skin_temp_celsius: record.score.skin_temp_celsius,
          user_calibrating: record.score.user_calibrating,
        }
      : {}),
  };
}

export interface StrainResult {
  found: boolean;
  cycle_id?: number;
  start?: string;
  /** Absent means the cycle is still open — this is today's strain-so-far. */
  end?: string;
  score_state?: string;
  strain?: number;
  kilojoule?: number;
  average_heart_rate?: number;
  max_heart_rate?: number;
}

export async function getStrain(env: WhoopEnv): Promise<StrainResult> {
  const data = await whoopGet<PaginatedCycleResponse>(env, "/v2/cycle?limit=1");
  const record = data.records[0];
  if (!record) return { found: false };
  return {
    found: true,
    cycle_id: record.id,
    start: record.start,
    end: record.end,
    score_state: record.score_state,
    ...(record.score
      ? {
          strain: record.score.strain,
          kilojoule: record.score.kilojoule,
          average_heart_rate: record.score.average_heart_rate,
          max_heart_rate: record.score.max_heart_rate,
        }
      : {}),
  };
}
