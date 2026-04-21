/**
 * N-Back task (2-back).
 *
 * A stream of letters is shown. Tap MATCH when the current letter is
 * the same as the one shown two letters earlier.
 *
 * Design:
 *   - Letters drawn from a set of 8 (B F K H M Q R X) to avoid
 *     similar-looking/sounding letters.
 *   - 40 scored trials + 5 warmup = 45 total. Warmup trials never
 *     target (you can't target until 3rd trial anyway).
 *   - 30% target rate on the scored portion (12 targets / 40).
 *   - Stimulus 500 ms on, ISI 2500 ms = 3 s per trial = ~2.25 minutes.
 *   - Response captured on pointerdown on the "MATCH" button, anywhere
 *     in the 3-second trial window.
 */

import type { NBackTrial, NBackOutcome } from "../types";

/**
 * N-Back warmup is 10 trials, not 5, because the 2-back chain has to be
 * built from scratch each session. Trials 1–2 literally have no "2 back"
 * to compare to, and strategy stabilizes around trials 8–10 even after
 * many prior sessions. Standard cognitive-training protocols discard 10+
 * warmup trials from N-back scoring. Don't lower this.
 */
export const WARMUP_TRIALS = 10;
export const SCORED_TRIALS = 40;
const TOTAL_TRIALS = WARMUP_TRIALS + SCORED_TRIALS;
const N = 2;
const TARGET_RATE = 0.3;

const STIMULUS_MS = 500;
const TRIAL_MS = 3000;

const LETTERS = ["B", "F", "K", "H", "M", "Q", "R", "X"];

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

/**
 * Builds a letter sequence with the desired target rate. A "target" is
 * when the letter at position i matches the letter at position i - N.
 */
function buildSequence(total: number, warmup: number): { seq: string[]; targets: boolean[] } {
  const seq: string[] = [];
  const targets: boolean[] = [];
  for (let i = 0; i < total; i++) {
    if (i < N) {
      seq.push(LETTERS[Math.floor(Math.random() * LETTERS.length)]!);
      targets.push(false);
      continue;
    }
    const scored = i >= warmup;
    const forceTarget = scored && Math.random() < TARGET_RATE;
    if (forceTarget) {
      seq.push(seq[i - N]!);
      targets.push(true);
    } else {
      let pick: string;
      do {
        pick = LETTERS[Math.floor(Math.random() * LETTERS.length)]!;
      } while (pick === seq[i - N]);
      seq.push(pick);
      targets.push(false);
    }
  }
  return { seq, targets };
}

export interface NBackResult {
  trials: NBackTrial[];
}

export function runNBack(container: HTMLElement): Promise<NBackResult> {
  return new Promise((resolve) => {
    const { seq, targets } = buildSequence(TOTAL_TRIALS, WARMUP_TRIALS);
    const trials: NBackTrial[] = [];

    container.innerHTML = `
      <div class="task-root" id="nb-root">
        <div class="task-chrome">
          <div class="tl">PROTOCOL: N-BACK · SUBJECT ACTIVE</div>
          <div class="tr" id="nb-state">STIM: IDLE</div>
          <div class="bl" id="nb-iter">ITERATION 00/${String(seq.length).padStart(2, "0")}</div>
          <div class="br"><span class="pip"></span>RUNNING</div>
        </div>
        <div class="nback-layout">
          <div class="nback-stim" id="nb-stim">+</div>
          <button class="btn nback-match" id="nb-match">MATCH</button>
          <div class="nback-hint">TAP MATCH IF CURRENT LETTER = LETTER 2 BACK</div>
        </div>
      </div>`;

    const stim = container.querySelector<HTMLElement>("#nb-stim")!;
    const matchBtn = container.querySelector<HTMLButtonElement>("#nb-match")!;
    const iterEl = container.querySelector<HTMLElement>("#nb-iter")!;
    const stateEl = container.querySelector<HTMLElement>("#nb-state")!;

    let currentTrialResponsePerf: number | null = null;
    let currentStimulusOnsetPerf = 0;

    matchBtn.addEventListener(
      "pointerdown",
      (e) => {
        e.preventDefault();
        if (currentTrialResponsePerf === null) {
          currentTrialResponsePerf = performance.now();
        }
      },
      { passive: false },
    );

    (async function run() {
      await waitFor(500);
      for (let i = 0; i < seq.length; i++) {
        currentTrialResponsePerf = null;
        iterEl.textContent = `ITERATION ${String(i + 1).padStart(2, "0")}/${String(seq.length).padStart(2, "0")}`;
        stateEl.textContent = `STIM: ${targets[i] ? "TARGET" : "LURE"}`;

        stim.textContent = seq[i]!;
        stim.className = "nback-stim on";
        currentStimulusOnsetPerf = await onPaintNow();

        await waitFor(STIMULUS_MS);
        stim.textContent = "+";
        stim.className = "nback-stim off";
        await waitFor(TRIAL_MS - STIMULUS_MS);

        const isTarget = targets[i]!;
        const responded = currentTrialResponsePerf !== null;
        let outcome: NBackOutcome;
        if (isTarget && responded) outcome = "hit";
        else if (isTarget && !responded) outcome = "miss";
        else if (!isTarget && responded) outcome = "false_alarm";
        else outcome = "correct_rejection";

        trials.push({
          index: i,
          letter: seq[i]!,
          isTarget,
          stimulusOnsetPerf: currentStimulusOnsetPerf,
          responsePerf: currentTrialResponsePerf,
          rtMs:
            currentTrialResponsePerf !== null
              ? currentTrialResponsePerf - currentStimulusOnsetPerf
              : null,
          outcome,
        });
      }
      resolve({ trials });
    })();
  });
}
