/**
 * Stroop task.
 *
 * A color word ("RED", "BLUE", "GREEN", "YELLOW") is rendered in a font
 * color that either matches (congruent) or mismatches (incongruent) the
 * word. The user taps the button for the FONT COLOR, not the word
 * meaning. Incongruent trials are slower and less accurate — the RT /
 * accuracy cost is the "interference" signal.
 *
 * Design:
 *   - 60 scored + 5 warmup (warmup all congruent) = 65 total.
 *   - Scored: 36 congruent / 24 incongruent (60/40 split). More
 *     congruent than incongruent so the prepotent "read the word"
 *     response stays prepotent.
 *   - Stimulus visible until response or 2500 ms max window.
 *   - Jittered 500–900 ms fixation between trials.
 *   - Four response buttons at the bottom of the screen, persistent
 *     throughout the task so the user's fingers don't travel.
 */

import type {
  StroopColor,
  StroopCongruency,
  StroopTrial,
} from "../types";

export const WARMUP_TRIALS = 5;
export const SCORED_CONGRUENT = 36;
export const SCORED_INCONGRUENT = 24;
export const TOTAL_TRIALS = WARMUP_TRIALS + SCORED_CONGRUENT + SCORED_INCONGRUENT;

const RESPONSE_WINDOW_MS = 2500;
const FIXATION_MIN_MS = 500;
const FIXATION_MAX_MS = 900;

const COLORS: StroopColor[] = ["red", "blue", "green", "yellow"];

const COLOR_HEX: Record<StroopColor, string> = {
  red: "#f87171",
  blue: "#60a5fa",
  green: "#34d399",
  yellow: "#fbbf24",
};

interface TrialSpec {
  word: StroopColor;
  inkColor: StroopColor;
  congruency: StroopCongruency;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function buildTrialSpecs(): TrialSpec[] {
  const warmup: TrialSpec[] = Array.from({ length: WARMUP_TRIALS }, () => {
    const c = COLORS[Math.floor(Math.random() * COLORS.length)]!;
    return { word: c, inkColor: c, congruency: "congruent" };
  });

  const congruent: TrialSpec[] = Array.from({ length: SCORED_CONGRUENT }, () => {
    const c = COLORS[Math.floor(Math.random() * COLORS.length)]!;
    return { word: c, inkColor: c, congruency: "congruent" };
  });

  const incongruent: TrialSpec[] = Array.from({ length: SCORED_INCONGRUENT }, () => {
    const word = COLORS[Math.floor(Math.random() * COLORS.length)]!;
    const others = COLORS.filter((c) => c !== word);
    const inkColor = others[Math.floor(Math.random() * others.length)]!;
    return { word, inkColor, congruency: "incongruent" };
  });

  return [...warmup, ...shuffle([...congruent, ...incongruent])];
}

function waitFor(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function onPaintNow(): Promise<number> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame((t) => resolve(t));
    });
  });
}

export interface StroopResult {
  trials: StroopTrial[];
}

export function runStroop(container: HTMLElement): Promise<StroopResult> {
  return new Promise((resolve) => {
    const specs = buildTrialSpecs();
    const trials: StroopTrial[] = [];

    container.innerHTML = `
      <div class="task-root" id="st-root">
        <div class="task-chrome">
          <div class="tl">PROTOCOL: STROOP · SUBJECT ACTIVE</div>
          <div class="tr" id="st-state">STIM: IDLE</div>
          <div class="bl" id="st-iter">ITERATION 00/${String(specs.length).padStart(2, "0")}</div>
          <div class="br"><span class="pip"></span>RUNNING</div>
        </div>
        <div class="stroop-layout">
          <div class="stroop-stim" id="st-stim"></div>
          <div class="stroop-buttons">
            ${COLORS.map(
              (c) => `<button class="stroop-btn" data-color="${c}" style="background:${COLOR_HEX[c]}"></button>`,
            ).join("")}
          </div>
        </div>
      </div>`;

    const root = container.querySelector<HTMLElement>("#st-root")!;
    const stim = container.querySelector<HTMLElement>("#st-stim")!;
    const iterEl = container.querySelector<HTMLElement>("#st-iter")!;
    const stateEl = container.querySelector<HTMLElement>("#st-state")!;

    let acceptingResponse = false;
    let onResponse: ((perf: number, color: StroopColor) => void) | null = null;

    function handle(e: PointerEvent) {
      const target = e.target as HTMLElement;
      const btn = target.closest<HTMLButtonElement>(".stroop-btn");
      if (!btn) return;
      const color = btn.dataset.color as StroopColor | undefined;
      if (!color) return;
      e.preventDefault();
      const now = performance.now();
      if (acceptingResponse && onResponse) onResponse(now, color);
    }
    root.addEventListener("pointerdown", handle, { passive: false });

    function setStim(spec: TrialSpec | null) {
      if (!spec) {
        stim.textContent = "+";
        stim.style.color = "";
        stim.className = "stroop-stim fixation";
        return;
      }
      stim.textContent = spec.word.toUpperCase();
      stim.style.color = COLOR_HEX[spec.inkColor];
      stim.className = "stroop-stim";
    }

    async function runTrial(spec: TrialSpec, index: number): Promise<StroopTrial> {
      setStim(null);
      const fix = FIXATION_MIN_MS + Math.random() * (FIXATION_MAX_MS - FIXATION_MIN_MS);
      await waitFor(fix);
      setStim(spec);
      const stimulusOnsetPerf = await onPaintNow();

      let responsePerf: number | null = null;
      let responseColor: StroopColor | null = null;
      const done = new Promise<void>((resolveResp) => {
        onResponse = (perf: number, color: StroopColor) => {
          if (responsePerf === null) {
            responsePerf = perf;
            responseColor = color;
            resolveResp();
          }
        };
      });
      acceptingResponse = true;
      await Promise.race([done, waitFor(RESPONSE_WINDOW_MS)]);
      acceptingResponse = false;
      onResponse = null;

      const rtMs = responsePerf !== null ? responsePerf - stimulusOnsetPerf : null;
      const correct = responseColor === spec.inkColor;

      setStim(null);
      return {
        index,
        word: spec.word,
        inkColor: spec.inkColor,
        congruency: spec.congruency,
        stimulusOnsetPerf,
        responsePerf,
        responseColor,
        rtMs,
        correct,
      };
    }

    async function loop() {
      for (let i = 0; i < specs.length; i++) {
        iterEl.textContent = `ITERATION ${String(i + 1).padStart(2, "0")}/${String(specs.length).padStart(2, "0")}`;
        stateEl.textContent = `STIM: ${specs[i]!.congruency.toUpperCase()}`;
        const t = await runTrial(specs[i]!, i);
        trials.push(t);
      }
      root.removeEventListener("pointerdown", handle);
      resolve({ trials });
    }

    loop();
  });
}
