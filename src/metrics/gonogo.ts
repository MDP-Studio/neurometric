import type { GoNogoTrial, GoNogoMetrics } from "../types";
import { dPrimeLogLinear, iqr, median } from "./shared";

export interface GoNogoMetricsOpts {
  warmupTrials: number;
  baselineTapMedianMs: number;
}

export function computeGoNogoMetrics(
  trials: GoNogoTrial[],
  opts: GoNogoMetricsOpts,
): GoNogoMetrics {
  const scored = trials.filter((t) => t.index >= opts.warmupTrials);
  const goTrials = scored.filter((t) => t.kind === "go");
  const nogoTrials = scored.filter((t) => t.kind === "nogo");

  const hits = goTrials.filter((t) => t.outcome === "hit").length;
  const falseAlarms = nogoTrials.filter((t) => t.outcome === "false_alarm").length;

  const hitRate = goTrials.length ? hits / goTrials.length : 0;
  const falseAlarmRate = nogoTrials.length ? falseAlarms / nogoTrials.length : 0;

  const dPrime = dPrimeLogLinear(hits, goTrials.length, falseAlarms, nogoTrials.length);

  const correctRts = goTrials
    .filter((t) => t.outcome === "hit" && t.rtMs !== null)
    .map((t) => t.rtMs as number);

  const medianRtMs = median(correctRts);
  const iqrRtMs = iqr(correctRts);
  const deviceAdjustedRtMs =
    medianRtMs !== null ? Math.max(0, medianRtMs - opts.baselineTapMedianMs) : null;

  return {
    nTrials: scored.length,
    nWarmupDropped: Math.min(opts.warmupTrials, trials.length),
    hitRate,
    falseAlarmRate,
    dPrime,
    medianRtMs,
    iqrRtMs,
    deviceAdjustedRtMs,
  };
}
