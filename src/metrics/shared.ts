/** Robust-statistics helpers shared across task-specific metric computers. */

const SQRT2 = Math.sqrt(2);

/** Inverse error function, Winitzki rational approximation. */
function erfInv(x: number): number {
  const a = 0.147;
  const ln = Math.log(1 - x * x);
  const term1 = 2 / (Math.PI * a) + ln / 2;
  const term2 = ln / a;
  const sign = x < 0 ? -1 : 1;
  return sign * Math.sqrt(Math.sqrt(term1 * term1 - term2) - term1);
}

export function zInv(p: number): number {
  const clamped = Math.max(1e-6, Math.min(1 - 1e-6, p));
  return SQRT2 * erfInv(2 * clamped - 1);
}

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function iqr(xs: number[]): number | null {
  if (xs.length < 4) return null;
  const s = [...xs].sort((a, b) => a - b);
  const q1 = s[Math.floor(s.length * 0.25)]!;
  const q3 = s[Math.floor(s.length * 0.75)]!;
  return q3 - q1;
}

/** Macmillan & Creelman (2005) log-linear correction for signal detection. */
export function dPrimeLogLinear(hits: number, nGo: number, fa: number, nNogo: number): number {
  const hitRateAdj = (hits + 0.5) / (nGo + 1);
  const faRateAdj = (fa + 0.5) / (nNogo + 1);
  return zInv(hitRateAdj) - zInv(faRateAdj);
}
