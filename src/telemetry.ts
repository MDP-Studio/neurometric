/**
 * Device telemetry captured per session.
 *
 * Everything here is "free" — no user input, just interrogating the
 * browser + a short CPU micro-benchmark to detect thermal throttling.
 *
 * Critical item: phones throttle CPU when hot or low-battery, and that
 * widens the timing-floor on WebView RT. By logging battery + a fixed
 * CPU benchmark per session, we can detect and (later) exclude sessions
 * run on a compromised device state.
 */

import type { DeviceTelemetry } from "./types";

interface BatteryManager {
  level: number;
  charging: boolean;
}
interface NavigatorWithBattery extends Navigator {
  getBattery?: () => Promise<BatteryManager>;
}
interface NavigatorConnection {
  effectiveType?: string;
  type?: string;
}
interface NavigatorWithConnection extends Navigator {
  connection?: NavigatorConnection;
  mozConnection?: NavigatorConnection;
  webkitConnection?: NavigatorConnection;
  deviceMemory?: number;
}

async function readBattery(): Promise<{ level: number | null; charging: boolean | null }> {
  const nav = navigator as NavigatorWithBattery;
  if (typeof nav.getBattery !== "function") {
    return { level: null, charging: null };
  }
  try {
    const bat = await nav.getBattery();
    return { level: bat.level, charging: bat.charging };
  } catch {
    return { level: null, charging: null };
  }
}

function readConnection(): string | null {
  const nav = navigator as NavigatorWithConnection;
  const c = nav.connection ?? nav.mozConnection ?? nav.webkitConnection;
  return c?.effectiveType ?? c?.type ?? null;
}

function readDeviceMemory(): number | null {
  const nav = navigator as NavigatorWithConnection;
  return typeof nav.deviceMemory === "number" ? nav.deviceMemory : null;
}

function readHardwareConcurrency(): number | null {
  return typeof navigator.hardwareConcurrency === "number"
    ? navigator.hardwareConcurrency
    : null;
}

function isStandalonePwa(): boolean {
  // iOS non-standard:
  const iosStandalone =
    typeof navigator !== "undefined" &&
    (navigator as { standalone?: boolean }).standalone === true;
  // Chromium-style:
  const displayStandalone =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches;
  return iosStandalone || displayStandalone;
}

/**
 * Tight-loop CPU benchmark. Runs a deterministic workload several times
 * and returns the median wall-clock ms. A healthy mobile CPU runs this
 * in single-digit ms; a thermally throttled phone takes 3–10× longer.
 * Not an RT measurement — just a thermal / throttling proxy.
 */
function runCpuBenchmark(): number {
  function workload(): number {
    let x = 0;
    // ~300K integer ops. Small enough to not impact battery.
    for (let i = 0; i < 300_000; i++) {
      x = (x + i * 1.000001) % 9973;
    }
    return x;
  }
  const runs: number[] = [];
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now();
    workload();
    runs.push(performance.now() - t0);
  }
  runs.sort((a, b) => a - b);
  return runs[Math.floor(runs.length / 2)] ?? 0;
}

export async function captureTelemetry(): Promise<DeviceTelemetry> {
  const battery = await readBattery();
  return {
    batteryLevel: battery.level,
    batteryCharging: battery.charging,
    hardwareConcurrency: readHardwareConcurrency(),
    deviceMemoryGb: readDeviceMemory(),
    cpuBenchmarkMs: runCpuBenchmark(),
    isStandalone: isStandalonePwa(),
    networkType: readConnection(),
    measuredAt: new Date().toISOString(),
  };
}
