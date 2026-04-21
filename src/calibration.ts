/**
 * Device timing calibration.
 *
 * Two measurements per session:
 *
 *  1. frameMs — median inter-frame interval from a requestAnimationFrame loop.
 *     Gives us the effective display refresh rate (16.67 ms on 60 Hz,
 *     8.33 ms on 120 Hz). Used to size stimulus durations to whole frames,
 *     so we never present for less than one vsync.
 *
 *  2. baselineTapMedianMs / baselineTapIqrMs — 10 "tap the green dot as
 *     fast as you can" trials with a randomized 800–1800 ms foreperiod.
 *     This captures the user's own device latency floor on their own
 *     device: touchscreen scan + event queue + render pipeline + finger
 *     travel time.
 *
 * We report *raw* RT and *corrected* RT (raw minus baseline median). The
 * corrected value removes the device-constant component so within-user
 * deltas across sessions reflect cognition, not device noise. We do not
 * compare across users and we do not attempt "absolute" RT.
 */

import type { Calibration, DeviceFingerprint } from "./types";

export async function measureFrameMs(samples = 60): Promise<number> {
  const timestamps: number[] = [];
  await new Promise<void>((resolve) => {
    function tick(t: number) {
      timestamps.push(t);
      if (timestamps.length <= samples) {
        requestAnimationFrame(tick);
      } else {
        resolve();
      }
    }
    requestAnimationFrame(tick);
  });
  const diffs: number[] = [];
  for (let i = 1; i < timestamps.length; i++) {
    diffs.push(timestamps[i]! - timestamps[i - 1]!);
  }
  diffs.sort((a, b) => a - b);
  return diffs[Math.floor(diffs.length / 2)] ?? 16.67;
}

async function cheapHash(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  const bytes = new Uint8Array(buf);
  let hex = "";
  for (let i = 0; i < 8; i++) hex += bytes[i]!.toString(16).padStart(2, "0");
  return hex;
}

interface NavigatorWithCapabilities extends Navigator {
  deviceMemory?: number;
}

export async function getFingerprint(frameMs: number): Promise<DeviceFingerprint> {
  const refreshRateHz = Math.round(1000 / frameMs);
  const nav = navigator as NavigatorWithCapabilities;
  const hardwareConcurrency =
    typeof navigator.hardwareConcurrency === "number"
      ? navigator.hardwareConcurrency
      : null;
  const deviceMemoryGb = typeof nav.deviceMemory === "number" ? nav.deviceMemory : null;

  // Timing-relevant hash: fields that genuinely change the RT latency
  // profile of this device. Baseline locks to this.
  const stableRaw = [
    screen.width,
    screen.height,
    window.devicePixelRatio,
    refreshRateHz,
    hardwareConcurrency ?? "?",
    deviceMemoryGb ?? "?",
  ].join("|");

  // Full hash: for forensics (did the UA change? which browser version?).
  // This changes on every browser/OS minor update and MUST NOT drive a
  // baseline restart.
  const fullRaw = `${stableRaw}||${navigator.userAgent}`;

  return {
    userAgent: navigator.userAgent,
    screenWidth: screen.width,
    screenHeight: screen.height,
    devicePixelRatio: window.devicePixelRatio,
    refreshRateHz,
    hardwareConcurrency,
    deviceMemoryGb,
    stableHash: await cheapHash(stableRaw),
    fullHash: await cheapHash(fullRaw),
  };
}

/**
 * Runs the 10-trial baseline tap pretest.
 * Renders inside the provided container. Resolves with the trial RTs (ms).
 */
export function runBaselineTapPretest(container: HTMLElement): Promise<number[]> {
  return new Promise((resolve) => {
    const N = 10;
    const rts: number[] = [];
    let trialIdx = 0;
    let stimulusOnsetPerf = 0;
    let state: "waiting" | "showing" | "done" = "waiting";
    let timer: number | null = null;

    container.innerHTML = `
      <div class="task-root" id="bt-root">
        <div class="stimulus fixation" id="bt-stim">+</div>
      </div>`;
    const root = container.querySelector<HTMLElement>("#bt-root")!;
    const stim = container.querySelector<HTMLElement>("#bt-stim")!;

    function scheduleNext() {
      if (trialIdx >= N) {
        state = "done";
        resolve(rts);
        return;
      }
      state = "waiting";
      stim.className = "stimulus fixation";
      stim.textContent = "+";
      const foreperiod = 800 + Math.random() * 1000; // 800..1800 ms
      timer = window.setTimeout(() => {
        requestAnimationFrame(() => {
          stim.className = "stimulus go";
          stim.textContent = "TAP";
          // Double rAF so onset is measured after paint.
          requestAnimationFrame((t) => {
            stimulusOnsetPerf = t;
            state = "showing";
          });
        });
      }, foreperiod);
    }

    function onPointer(e: PointerEvent) {
      const now = performance.now();
      if (state === "showing") {
        const rt = now - stimulusOnsetPerf;
        if (rt >= 80 && rt <= 1500) rts.push(rt);
        trialIdx++;
        if (timer) window.clearTimeout(timer);
        scheduleNext();
      } else if (state === "waiting") {
        // Premature — reset this trial without counting.
        if (timer) window.clearTimeout(timer);
        scheduleNext();
      }
      e.preventDefault();
    }

    root.addEventListener("pointerdown", onPointer, { passive: false });
    scheduleNext();
  });
}

export function medianAndIqr(xs: number[]): { median: number; iqr: number } {
  if (xs.length === 0) return { median: 0, iqr: 0 };
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  const q1 = sorted[Math.floor(sorted.length * 0.25)]!;
  const q3 = sorted[Math.floor(sorted.length * 0.75)]!;
  return { median, iqr: q3 - q1 };
}

export async function runCalibration(container: HTMLElement): Promise<Calibration> {
  const frameMs = await measureFrameMs();
  const fingerprint = await getFingerprint(frameMs);
  container.innerHTML = `
    <div class="task-overlay">
      <div class="inner">
        <h2>Baseline tap</h2>
        <p>When you see a green <b>TAP</b> target, tap it as fast as you can.<br/>There will be 10 trials. This measures your device's own latency on your own fingers, so later scores are meaningful.</p>
        <button class="btn" id="bt-start">Start</button>
      </div>
    </div>`;
  await new Promise<void>((resolve) => {
    container.querySelector<HTMLButtonElement>("#bt-start")!.addEventListener(
      "click",
      () => resolve(),
      { once: true }
    );
  });
  const rts = await runBaselineTapPretest(container);
  const { median, iqr } = medianAndIqr(rts);
  return {
    fingerprint,
    frameMs,
    baselineTapMedianMs: median,
    baselineTapIqrMs: iqr,
    measuredAt: new Date().toISOString(),
  };
}
