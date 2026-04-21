/**
 * Raw-data plot view — Monolith aesthetic.
 *
 * One chart per task × primary-metric. Every assigned session as a
 * square. Thin dashed line connecting sequential points. No smoothing.
 * Grid background, monospace axis labels.
 */

import type { Session, TaskId } from "../types";
import { TASK_DEFINITIONS } from "../types";
import { METRIC_SPECS } from "../tasks/registry";
import { shellHtml } from "./views";

export function renderRawPlot(
  container: HTMLElement,
  sessions: Session[],
  onBack: () => void,
): void {
  const taskIds: TaskId[] = ["gonogo", "stroop", "digitspan", "nback"];

  const legend = `
    <div class="plot-legend">
      <span><span class="swatch datapoint"></span>SESSION DATA POINT</span>
      <span><span class="swatch baseline"></span>SEQUENTIAL TREND</span>
      <span><span class="swatch anomaly"></span>PROVISIONAL / FLAGGED</span>
    </div>`;

  const blocks = taskIds
    .map((task) => {
      const forTask = sessions
        .filter((s): s is Extract<Session, { task: typeof task }> =>
          s.task === task && s.wasAssigned,
        )
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      const def = TASK_DEFINITIONS[task];
      if (forTask.length === 0) {
        return `<section class="module">
          <div class="head">
            <div class="label">${def.name.toUpperCase()} · RAW</div>
            <div class="label">N=00</div>
          </div>
          <p class="label" style="color: var(--on-surface-variant);">NO ASSIGNED SESSIONS RECORDED.</p>
        </section>`;
      }
      const specs = METRIC_SPECS[task];
      const charts = specs
        .map((spec) => {
          const values = forTask.map((s) => ({
            x: new Date(s.timestamp).getTime(),
            y: spec.extract(s as never),
          }));
          return plotSvg(spec.label, values);
        })
        .join("");
      return `<section class="module">
        <div class="head">
          <div class="label">${def.name.toUpperCase()} · RAW</div>
          <div class="label">N=${String(forTask.length).padStart(2, "0")}</div>
        </div>
        ${charts}
      </section>`;
    })
    .join("");

  const body = `
    <section class="module">
      <div class="head">
        <div class="label">LEGEND</div>
        <div class="label">ASSIGNED ONLY · UNSMOOTHED</div>
      </div>
      ${legend}
      <p class="label" style="color: var(--on-surface-variant); letter-spacing: 0.1em;">
        Every assigned session rendered as-measured. Manually-picked sessions excluded. Examine visually for plateau before trusting rolling deltas.
      </p>
    </section>
    ${blocks}
    <div class="actions" style="margin-top: 8px;">
      <button class="btn ghost" id="raw-back">‹ RETURN</button>
    </div>
  `;

  container.innerHTML = shellHtml({
    active: "exploration",
    title: "RAW_DATA_PLOT",
    seqId: "RAW",
    statusLabel: "READ-ONLY EXPLORATION",
    body,
  });
  container
    .querySelector<HTMLButtonElement>("#raw-back")!
    .addEventListener("click", onBack, { once: true });
}

function plotSvg(
  label: string,
  points: Array<{ x: number; y: number | null }>,
): string {
  const valid = points.filter((p): p is { x: number; y: number } => p.y !== null);
  if (valid.length === 0) {
    return `<div class="cell" style="background: var(--surface); padding: 14px; margin-top: 8px;">
      <span class="k">${label.toUpperCase()}</span>
      <span class="delta">NO DATA</span>
    </div>`;
  }
  const width = 680;
  const height = 200;
  const pad = { l: 48, r: 10, t: 18, b: 26 };
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;

  const xs = valid.map((p) => p.x);
  const ys = valid.map((p) => p.y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  let yMin = Math.min(...ys);
  let yMax = Math.max(...ys);
  if (yMin === yMax) {
    yMin = yMin - 1;
    yMax = yMax + 1;
  }
  const yRange = yMax - yMin;
  // Pad y a little for visual breathing room
  yMin -= yRange * 0.08;
  yMax += yRange * 0.08;

  const xRange = xMax - xMin || 1;
  const yRange2 = yMax - yMin;

  const X = (v: number) => pad.l + ((v - xMin) / xRange) * w;
  const Y = (v: number) => pad.t + h - ((v - yMin) / yRange2) * h;

  // Grid — horizontal (y) + vertical (x) ghost grid
  const yTicks = 4;
  const hGrid = Array.from({ length: yTicks + 1 }, (_, i) => {
    const frac = i / yTicks;
    const yv = yMin + frac * yRange2;
    const yy = Y(yv);
    const precision = yRange2 < 3 ? 2 : yRange2 < 30 ? 1 : 0;
    return `
      <line x1="${pad.l}" x2="${width - pad.r}" y1="${yy.toFixed(1)}" y2="${yy.toFixed(1)}" stroke="#2a2a2a" stroke-width="1"/>
      <text x="${pad.l - 8}" y="${(yy + 3).toFixed(1)}" fill="#8f909d" font-family="JetBrains Mono" font-size="9" letter-spacing="1" text-anchor="end">${yv.toFixed(precision)}</text>`;
  }).join("");

  const xTicks = Math.min(valid.length, 4);
  const vGrid = Array.from({ length: xTicks + 1 }, (_, i) => {
    const frac = i / xTicks;
    const xv = xMin + frac * xRange;
    const xx = X(xv);
    return `<line x1="${xx.toFixed(1)}" x2="${xx.toFixed(1)}" y1="${pad.t}" y2="${height - pad.b}" stroke="#201f1f" stroke-width="1"/>`;
  }).join("");

  // Dashed connecting line
  const linePath =
    valid.length >= 2
      ? `<polyline fill="none" stroke="#454651" stroke-width="1" stroke-dasharray="3 3" points="${valid
          .map((p) => `${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`)
          .join(" ")}" />`
      : "";

  // Square markers
  const dots = valid
    .map((p) => {
      const cx = X(p.x);
      const cy = Y(p.y);
      return `<rect x="${(cx - 4).toFixed(1)}" y="${(cy - 4).toFixed(1)}" width="8" height="8" fill="#bac3ff"/>`;
    })
    .join("");

  const xFirst = new Date(xMin).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const xLast = new Date(xMax).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return `<div style="margin: 14px 0 0;">
    <div class="label" style="margin-bottom: 6px;">${label.toUpperCase()}</div>
    <div style="background: var(--surface); padding: 10px;">
      <svg viewBox="0 0 ${width} ${height}" width="100%" style="display: block;">
        <rect x="${pad.l}" y="${pad.t}" width="${w}" height="${h}" fill="#131313"/>
        ${vGrid}
        ${hGrid}
        ${linePath}
        ${dots}
        <text x="${pad.l}" y="${height - 6}" fill="#8f909d" font-family="JetBrains Mono" font-size="9" letter-spacing="1">${xFirst}</text>
        <text x="${width - pad.r}" y="${height - 6}" fill="#8f909d" font-family="JetBrains Mono" font-size="9" letter-spacing="1" text-anchor="end">${xLast}</text>
      </svg>
    </div>
  </div>`;
}
