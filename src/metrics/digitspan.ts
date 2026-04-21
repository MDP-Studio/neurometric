import type { DigitSpanTrial, DigitSpanMetrics } from "../types";

export function computeDigitSpanMetrics(trials: DigitSpanTrial[]): DigitSpanMetrics {
  const forward = trials.filter((t) => t.direction === "forward");
  const backward = trials.filter((t) => t.direction === "backward");

  function maxSpan(ts: DigitSpanTrial[]): number {
    return ts.filter((t) => t.correct).reduce((mx, t) => Math.max(mx, t.span), 0);
  }
  function score(ts: DigitSpanTrial[]): number {
    return ts.filter((t) => t.correct).length;
  }
  function reliability(ts: DigitSpanTrial[]): number {
    if (ts.length === 0) return 0;
    const correct = ts.filter((t) => t.correct).length;
    return correct / ts.length;
  }

  return {
    nTrials: trials.length,
    forwardMaxSpan: maxSpan(forward),
    backwardMaxSpan: maxSpan(backward),
    forwardScore: score(forward),
    backwardScore: score(backward),
    forwardReliability: reliability(forward),
    backwardReliability: reliability(backward),
  };
}
