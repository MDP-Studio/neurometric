/**
 * Go/No-Go task.
 *
 * Design:
 *   - 65 trials total (5 warmup dropped + 60 scored).
 *   - Scored split: 40 Go ("TAP"), 20 No-Go ("STOP") — 2:1 ratio so the
 *     prepotent response to go builds real inhibitory load.
 *   - Warmup trials are all Go so the user isn't cold-started into a
 *     confusing mix.
 *   - Stimulus on for ~500 ms (rounded to whole frames). Total response
 *     window is 1000 ms from onset.
 *   - Fixation + ISI jittered 700–1100 ms.
 *
 * Timing:
 *   - Stimulus onset is captured in a double-rAF callback so the
 *     timestamp reflects the painted frame, not the DOM mutation.
 *   - Responses are captured from `pointerdown` (fires on touchstart on
 *     mobile, on mousedown on desktop — earliest input signal).
 *   - RT = response_perf - stimulus_onset_perf, both from performance.now().
 */

import type { GoNogoTrial, GoNogoStimulusType, GoNogoOutcome } from "../types";

export const WARMUP_TRIALS = 5;
export const SCORED_GO = 40;
export const SCORED_NOGO = 20;
export const TOTAL_TRIALS = WARMUP_TRIALS + SCORED_GO + SCORED_NOGO;

export const STIMULUS_MS = 500;
export const RESPONSE_WINDOW_MS = 1000;
export const FEEDBACK_MS = 250;
const ISI_MIN_MS = 700;
const ISI_MAX_MS = 1100;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Builds the trial order: warmup (all Go), then shuffled Go/No-Go mix. */
export function buildTrialOrder(): GoNogoStimulusType[] {
  const warmup: GoNogoStimulusType[] = Array(WARMUP_TRIALS).fill("go");
  const scored: GoNogoStimulusType[] = [
    ...Array(SCORED_GO).fill("go"),
    ...Array(SCORED_NOGO).fill("nogo"),
  ];
  return [...warmup, ...shuffle(scored)];
}

function waitFor(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/** Resolves with the perf timestamp at which a freshly-mutated DOM was painted. */
function onPaintNow(): Promise<number> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame((t) => resolve(t));
    });
  });
}

export interface GoNogoResult {
  trials: GoNogoTrial[];
}

export function runGoNogo(container: HTMLElement): Promise<GoNogoResult> {
  return new Promise((resolve) => {
    const order = buildTrialOrder();
    const trials: GoNogoTrial[] = [];
    let idx = 0;

    container.innerHTML = `
      <div class="task-root" id="gng-root">
        <div class="task-chrome">
          <div class="tl">PROTOCOL: GONOGO · SUBJECT ACTIVE</div>
          <div class="tr" id="gng-state">STIM: IDLE</div>
          <div class="bl" id="gng-iter">ITERATION 00/${String(order.length).padStart(2, "0")}</div>
          <div class="br"><span class="pip"></span>RUNNING</div>
        </div>
        <div class="stimulus fixation" id="gng-stim">+</div>
      </div>`;
    const root = container.querySelector<HTMLElement>("#gng-root")!;
    const stim = container.querySelector<HTMLElement>("#gng-stim")!;
    const iterEl = container.querySelector<HTMLElement>("#gng-iter")!;
    const stateEl = container.querySelector<HTMLElement>("#gng-state")!;

    let acceptingResponse = false;
    let onResponse: ((perf: number) => void) | null = null;

    function handlePointer(e: PointerEvent) {
      const now = performance.now();
      e.preventDefault();
      if (acceptingResponse && onResponse) onResponse(now);
    }
    root.addEventListener("pointerdown", handlePointer, { passive: false });

    function setFixation() {
      stim.className = "stimulus fixation";
      stim.textContent = "+";
    }
    function setBlank() {
      stim.className = "stimulus blank";
      stim.textContent = "";
    }
    function setGo() {
      stim.className = "stimulus go";
      stim.textContent = "TAP";
    }
    function setNoGo() {
      stim.className = "stimulus nogo";
      stim.textContent = "STOP";
    }

    async function runTrial(kind: GoNogoStimulusType, index: number): Promise<GoNogoTrial> {
      setFixation();
      const isi = ISI_MIN_MS + Math.random() * (ISI_MAX_MS - ISI_MIN_MS);
      await waitFor(isi);

      if (kind === "go") setGo();
      else setNoGo();

      const stimulusOnsetPerf = await onPaintNow();

      let responsePerf: number | null = null;
      const responded = new Promise<void>((resolveResp) => {
        onResponse = (perf: number) => {
          if (responsePerf === null) {
            responsePerf = perf;
            resolveResp();
          }
        };
      });
      acceptingResponse = true;

      const windowElapsed = waitFor(RESPONSE_WINDOW_MS);
      await Promise.race([responded, windowElapsed]);

      // If stimulus is still on, clear it at its natural duration.
      const elapsedSinceOnset = performance.now() - stimulusOnsetPerf;
      if (elapsedSinceOnset < STIMULUS_MS) {
        await waitFor(STIMULUS_MS - elapsedSinceOnset);
      }
      setBlank();

      // Wait out the rest of the response window, if any.
      const stillWaiting = RESPONSE_WINDOW_MS - (performance.now() - stimulusOnsetPerf);
      if (stillWaiting > 0 && responsePerf === null) {
        await Promise.race([responded, waitFor(stillWaiting)]);
      }

      acceptingResponse = false;
      onResponse = null;

      const rtMs = responsePerf !== null ? responsePerf - stimulusOnsetPerf : null;
      const outcome = classify(kind, rtMs);

      return {
        index,
        kind,
        stimulusOnsetPerf,
        responsePerf,
        rtMs,
        outcome,
      };
    }

    async function loop() {
      while (idx < order.length) {
        const kind = order[idx]!;
        iterEl.textContent = `ITERATION ${String(idx + 1).padStart(2, "0")}/${String(order.length).padStart(2, "0")}`;
        stateEl.textContent = `STIM: ${kind.toUpperCase()}`;
        const t = await runTrial(kind, idx);
        trials.push(t);
        idx++;
      }
      root.removeEventListener("pointerdown", handlePointer);
      resolve({ trials });
    }

    loop();
  });
}

function classify(kind: GoNogoStimulusType, rtMs: number | null): GoNogoOutcome {
  if (kind === "go") {
    if (rtMs !== null) return "hit";
    return "miss";
  } else {
    if (rtMs !== null) return "false_alarm";
    return "correct_rejection";
  }
}
