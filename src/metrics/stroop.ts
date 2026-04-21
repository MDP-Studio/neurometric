import type { StroopTrial, StroopMetrics } from "../types";
import { median } from "./shared";

export interface StroopMetricsOpts {
  warmupTrials: number;
  baselineTapMedianMs: number;
}

export function computeStroopMetrics(
  trials: StroopTrial[],
  opts: StroopMetricsOpts,
): StroopMetrics {
  const scored = trials.filter((t) => t.index >= opts.warmupTrials);
  const congruent = scored.filter((t) => t.congruency === "congruent");
  const incongruent = scored.filter((t) => t.congruency === "incongruent");

  const congruentAccuracy = congruent.length
    ? congruent.filter((t) => t.correct).length / congruent.length
    : 0;
  const incongruentAccuracy = incongruent.length
    ? incongruent.filter((t) => t.correct).length / incongruent.length
    : 0;

  const congRts = congruent
    .filter((t) => t.correct && t.rtMs !== null)
    .map((t) => t.rtMs as number);
  const incRts = incongruent
    .filter((t) => t.correct && t.rtMs !== null)
    .map((t) => t.rtMs as number);

  const congruentMedianRtMs = median(congRts);
  const incongruentMedianRtMs = median(incRts);
  const interferenceMs =
    congruentMedianRtMs !== null && incongruentMedianRtMs !== null
      ? incongruentMedianRtMs - congruentMedianRtMs
      : null;

  const deviceAdjustedCongruentRtMs =
    congruentMedianRtMs !== null
      ? Math.max(0, congruentMedianRtMs - opts.baselineTapMedianMs)
      : null;
  const deviceAdjustedIncongruentRtMs =
    incongruentMedianRtMs !== null
      ? Math.max(0, incongruentMedianRtMs - opts.baselineTapMedianMs)
      : null;

  return {
    nTrials: scored.length,
    nWarmupDropped: Math.min(opts.warmupTrials, trials.length),
    congruentAccuracy,
    incongruentAccuracy,
    congruentMedianRtMs,
    incongruentMedianRtMs,
    interferenceMs,
    deviceAdjustedCongruentRtMs,
    deviceAdjustedIncongruentRtMs,
  };
}
