import type { NBackTrial, NBackMetrics } from "../types";
import { dPrimeLogLinear, iqr, median } from "./shared";

export interface NBackMetricsOpts {
  warmupTrials: number;
}

export function computeNBackMetrics(
  trials: NBackTrial[],
  opts: NBackMetricsOpts,
): NBackMetrics {
  const scored = trials.filter((t) => t.index >= opts.warmupTrials);
  const targets = scored.filter((t) => t.isTarget);
  const nonTargets = scored.filter((t) => !t.isTarget);

  const hits = targets.filter((t) => t.outcome === "hit").length;
  const falseAlarms = nonTargets.filter((t) => t.outcome === "false_alarm").length;

  const hitRate = targets.length ? hits / targets.length : 0;
  const falseAlarmRate = nonTargets.length ? falseAlarms / nonTargets.length : 0;
  const dPrime = dPrimeLogLinear(hits, targets.length, falseAlarms, nonTargets.length);

  const hitRts = targets
    .filter((t) => t.outcome === "hit" && t.rtMs !== null)
    .map((t) => t.rtMs as number);
  const medianRtMs = median(hitRts);
  const iqrRtMs = iqr(hitRts);

  return {
    nTrials: scored.length,
    nWarmupDropped: Math.min(opts.warmupTrials, trials.length),
    hitRate,
    falseAlarmRate,
    dPrime,
    medianRtMs,
    iqrRtMs,
  };
}
