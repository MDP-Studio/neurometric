/**
 * Task registry — runners + per-task metric display specs.
 */

import { computeDigitSpanMetrics } from "../metrics/digitspan";
import { computeGoNogoMetrics } from "../metrics/gonogo";
import { computeNBackMetrics } from "../metrics/nback";
import { computeStroopMetrics } from "../metrics/stroop";
import { runDigitSpan } from "./digitspan";
import { runGoNogo, WARMUP_TRIALS as GONOGO_WARMUP } from "./gonogo";
import { runNBack, WARMUP_TRIALS as NBACK_WARMUP } from "./nback";
import { runStroop, WARMUP_TRIALS as STROOP_WARMUP } from "./stroop";
import type {
  Calibration,
  DeviceTelemetry,
  Session,
  SessionContext,
  SessionFor,
  TaskId,
} from "../types";

export type MetricUnit = "ms" | "fraction" | "number" | "span";

export interface MetricSpec<T extends TaskId = TaskId> {
  key: string;
  label: string;
  unit: MetricUnit;
  betterWhenHigher: boolean | null;
  extract: (session: SessionFor<T>) => number | null;
  format: (v: number | null) => string;
}

const fmtMs = (v: number | null) => (v === null ? "—" : `${v.toFixed(0)} ms`);
const fmtPct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(0)}%`);
const fmtNum2 = (v: number | null) => (v === null ? "—" : v.toFixed(2));
const fmtSpan = (v: number | null) => (v === null ? "—" : v.toFixed(0));

export const METRIC_SPECS: Record<TaskId, MetricSpec[]> = {
  gonogo: [
    {
      key: "dPrime",
      label: "d-prime",
      unit: "number",
      betterWhenHigher: true,
      extract: (s) => (s as SessionFor<"gonogo">).metrics.dPrime,
      format: fmtNum2,
    },
    {
      key: "hitRate",
      label: "Hit rate",
      unit: "fraction",
      betterWhenHigher: true,
      extract: (s) => (s as SessionFor<"gonogo">).metrics.hitRate,
      format: fmtPct,
    },
    {
      key: "falseAlarmRate",
      label: "False alarms",
      unit: "fraction",
      betterWhenHigher: false,
      extract: (s) => (s as SessionFor<"gonogo">).metrics.falseAlarmRate,
      format: fmtPct,
    },
    {
      key: "deviceAdjustedRtMs",
      label: "Device-adjusted RT",
      unit: "ms",
      betterWhenHigher: false,
      extract: (s) => (s as SessionFor<"gonogo">).metrics.deviceAdjustedRtMs,
      format: fmtMs,
    },
  ],
  stroop: [
    {
      key: "interferenceMs",
      label: "Interference (inc − cong)",
      unit: "ms",
      betterWhenHigher: false,
      extract: (s) => (s as SessionFor<"stroop">).metrics.interferenceMs,
      format: fmtMs,
    },
    {
      key: "incongruentAccuracy",
      label: "Incongruent accuracy",
      unit: "fraction",
      betterWhenHigher: true,
      extract: (s) => (s as SessionFor<"stroop">).metrics.incongruentAccuracy,
      format: fmtPct,
    },
    {
      key: "deviceAdjustedCongruentRtMs",
      label: "Device-adjusted RT (cong)",
      unit: "ms",
      betterWhenHigher: false,
      extract: (s) => (s as SessionFor<"stroop">).metrics.deviceAdjustedCongruentRtMs,
      format: fmtMs,
    },
    {
      key: "deviceAdjustedIncongruentRtMs",
      label: "Device-adjusted RT (inc)",
      unit: "ms",
      betterWhenHigher: false,
      extract: (s) => (s as SessionFor<"stroop">).metrics.deviceAdjustedIncongruentRtMs,
      format: fmtMs,
    },
  ],
  digitspan: [
    {
      key: "forwardMaxSpan",
      label: "Forward span",
      unit: "span",
      betterWhenHigher: true,
      extract: (s) => (s as SessionFor<"digitspan">).metrics.forwardMaxSpan,
      format: fmtSpan,
    },
    {
      key: "backwardMaxSpan",
      label: "Backward span",
      unit: "span",
      betterWhenHigher: true,
      extract: (s) => (s as SessionFor<"digitspan">).metrics.backwardMaxSpan,
      format: fmtSpan,
    },
    {
      key: "forwardScore",
      label: "Forward total correct",
      unit: "number",
      betterWhenHigher: true,
      extract: (s) => (s as SessionFor<"digitspan">).metrics.forwardScore,
      format: (v) => (v === null ? "—" : v.toFixed(0)),
    },
    {
      key: "backwardScore",
      label: "Backward total correct",
      unit: "number",
      betterWhenHigher: true,
      extract: (s) => (s as SessionFor<"digitspan">).metrics.backwardScore,
      format: (v) => (v === null ? "—" : v.toFixed(0)),
    },
  ],
  nback: [
    {
      key: "dPrime",
      label: "d-prime",
      unit: "number",
      betterWhenHigher: true,
      extract: (s) => (s as SessionFor<"nback">).metrics.dPrime,
      format: fmtNum2,
    },
    {
      key: "hitRate",
      label: "Hit rate",
      unit: "fraction",
      betterWhenHigher: true,
      extract: (s) => (s as SessionFor<"nback">).metrics.hitRate,
      format: fmtPct,
    },
    {
      key: "falseAlarmRate",
      label: "False alarms",
      unit: "fraction",
      betterWhenHigher: false,
      extract: (s) => (s as SessionFor<"nback">).metrics.falseAlarmRate,
      format: fmtPct,
    },
    {
      key: "medianRtMs",
      label: "Hit RT (median)",
      unit: "ms",
      betterWhenHigher: false,
      extract: (s) => (s as SessionFor<"nback">).metrics.medianRtMs,
      format: fmtMs,
    },
  ],
};

/**
 * Run a task and build a complete Session object (metrics already computed).
 */
export async function runTaskSession(
  task: TaskId,
  container: HTMLElement,
  calibration: Calibration,
  telemetry: DeviceTelemetry,
  context: SessionContext,
  wasAssigned: boolean,
): Promise<Session> {
  const baseFields = {
    id: uuid(),
    timestamp: new Date().toISOString(),
    calibration,
    telemetry,
    context,
    wasAssigned,
    schemaVersion: 2 as const,
  };

  if (task === "gonogo") {
    const { trials } = await runGoNogo(container);
    const metrics = computeGoNogoMetrics(trials, {
      warmupTrials: GONOGO_WARMUP,
      baselineTapMedianMs: calibration.baselineTapMedianMs,
    });
    return { ...baseFields, task: "gonogo", trials, metrics };
  }

  if (task === "stroop") {
    const { trials } = await runStroop(container);
    const metrics = computeStroopMetrics(trials, {
      warmupTrials: STROOP_WARMUP,
      baselineTapMedianMs: calibration.baselineTapMedianMs,
    });
    return { ...baseFields, task: "stroop", trials, metrics };
  }

  if (task === "digitspan") {
    const { trials } = await runDigitSpan(container);
    const metrics = computeDigitSpanMetrics(trials);
    return { ...baseFields, task: "digitspan", trials, metrics };
  }

  if (task === "nback") {
    const { trials } = await runNBack(container);
    const metrics = computeNBackMetrics(trials, { warmupTrials: NBACK_WARMUP });
    return { ...baseFields, task: "nback", trials, metrics };
  }

  throw new Error(`Unknown task: ${task satisfies never}`);
}

function uuid(): string {
  if ("randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
