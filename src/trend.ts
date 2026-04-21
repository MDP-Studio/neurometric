/**
 * Within-subject trend computation.
 *
 * Generic over metric value — callers pass in extracted numbers. The
 * trend module doesn't know about task-specific metric shapes; each
 * caller (see src/tasks/registry.ts) owns extraction + display config.
 *
 * Baseline = median of the last N (default 7) prior-session values.
 * Minimum 3 baseline sessions before a delta is reported; until then
 * the trend is "pending" and UI shows "calibrating".
 */

import { median } from "./metrics/shared";

export const BASELINE_WINDOW = 7;
export const MIN_BASELINE_SESSIONS = 3;

/** A change below this fraction of the baseline is "flat", not up/down. */
const FLAT_THRESHOLD = 0.03;

export type Direction = "up" | "down" | "flat" | "pending";

export interface TrendPoint {
  value: number | null;
  baseline: number | null;
  delta: number | null;
  direction: Direction;
  nBaselineSessions: number;
}

/**
 * @param priorValues values from prior sessions in chronological order
 * @param currentValue the current session's metric value
 * @param betterWhenHigher true = higher is better; false = lower is better;
 *        null = neither direction colored (e.g. a capacity metric)
 */
export function computeTrendPoint(
  priorValues: Array<number | null>,
  currentValue: number | null,
  betterWhenHigher: boolean | null,
): TrendPoint {
  const window = priorValues.slice(-BASELINE_WINDOW);
  const valid = window.filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v),
  );
  const baseline = median(valid);

  if (
    baseline === null ||
    currentValue === null ||
    valid.length < MIN_BASELINE_SESSIONS
  ) {
    return {
      value: currentValue,
      baseline,
      delta: null,
      direction: "pending",
      nBaselineSessions: valid.length,
    };
  }

  const delta = currentValue - baseline;
  const relChange = baseline !== 0 ? Math.abs(delta) / Math.abs(baseline) : 0;

  let direction: Direction;
  if (relChange < FLAT_THRESHOLD || betterWhenHigher === null) {
    direction = "flat";
  } else {
    const higher = delta > 0;
    direction = higher === betterWhenHigher ? "up" : "down";
  }

  return {
    value: currentValue,
    baseline,
    delta,
    direction,
    nBaselineSessions: valid.length,
  };
}

export function formatDelta(
  point: TrendPoint,
  unit: "ms" | "fraction" | "number" | "span",
): string {
  if (point.direction === "pending") {
    const needed = MIN_BASELINE_SESSIONS - point.nBaselineSessions;
    return `${needed} more session${needed === 1 ? "" : "s"} to baseline`;
  }
  if (point.delta === null) return "";
  const sign = point.delta > 0 ? "+" : point.delta < 0 ? "" : "±";
  if (unit === "ms") return `${sign}${point.delta.toFixed(0)} ms vs baseline`;
  if (unit === "fraction")
    return `${sign}${(point.delta * 100).toFixed(1)} pp vs baseline`;
  if (unit === "span") return `${sign}${point.delta.toFixed(1)} vs baseline`;
  return `${sign}${point.delta.toFixed(2)} vs baseline`;
}
