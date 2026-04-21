/**
 * Digit Span task.
 *
 * Classic capacity test. Digits are presented one at a time (800 ms on
 * / 400 ms off). The user then types them back.
 *
 * Two blocks per session:
 *   1. Forward — recall in presented order.
 *   2. Backward — recall in reverse order.
 *
 * Each block starts at span 3. Two trials per span. If both fail at a
 * span, that block ends. Max span reached = the last span where at
 * least one trial was correct.
 *
 * This is a capacity task; we do not record RT.
 */

import type { DigitSpanDirection, DigitSpanTrial } from "../types";

const START_SPAN = 3;
const MAX_SPAN = 9;
const TRIALS_PER_SPAN = 2;
const STIMULUS_ON_MS = 800;
const STIMULUS_OFF_MS = 400;

function randomDigits(n: number): number[] {
  const out: number[] = [];
  let last = -1;
  while (out.length < n) {
    const d = Math.floor(Math.random() * 10);
    if (d === last) continue;
    out.push(d);
    last = d;
  }
  return out;
}

function waitFor(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export interface DigitSpanResult {
  trials: DigitSpanTrial[];
}

export function runDigitSpan(container: HTMLElement): Promise<DigitSpanResult> {
  return new Promise((resolve) => {
    const trials: DigitSpanTrial[] = [];
    let trialIndex = 0;

    (async function runAll() {
      // One unscored practice trial per block. This lets the user settle
      // on a rehearsal strategy (verbal loop / chunking / visualization)
      // for each direction before the scored trials begin. Practice
      // trials are run but NOT saved into trials[] and not scored.
      await runPractice("forward");
      await runBlock("forward");
      await showBlockIntro("Now: same idea, but enter the digits in <b>reverse</b> order.");
      await runPractice("backward");
      await runBlock("backward");
      resolve({ trials });
    })();

    async function runPractice(direction: DigitSpanDirection): Promise<void> {
      container.innerHTML = `
        <div class="task-overlay">
          <div class="inner">
            <h2>Practice trial</h2>
            <p>One untimed practice at span 3 so you can settle on a strategy. This one does not count.</p>
            <button class="btn" id="ds-practice-go">Start practice</button>
          </div>
        </div>`;
      await new Promise<void>((done) => {
        container
          .querySelector<HTMLButtonElement>("#ds-practice-go")!
          .addEventListener("click", () => done(), { once: true });
      });
      const digits = randomDigits(START_SPAN);
      await presentDigits(digits);
      await collectRecall(START_SPAN);
      // Ignore the result. Direction is logged but the data is discarded.
      void direction;
    }

    function showBlockIntro(htmlMessage: string): Promise<void> {
      return new Promise<void>((done) => {
        container.innerHTML = `
          <div class="task-overlay">
            <div class="inner">
              <h2>Switch blocks</h2>
              <p>${htmlMessage}</p>
              <button class="btn" id="ds-next">Start</button>
            </div>
          </div>`;
        container
          .querySelector<HTMLButtonElement>("#ds-next")!
          .addEventListener("click", () => done(), { once: true });
      });
    }

    async function runBlock(direction: DigitSpanDirection) {
      let currentSpan = START_SPAN;
      let consecutiveFails = 0;
      while (currentSpan <= MAX_SPAN) {
        let spanCorrect = 0;
        for (let t = 0; t < TRIALS_PER_SPAN; t++) {
          const digits = randomDigits(currentSpan);
          await presentDigits(digits);
          const recalled = await collectRecall(currentSpan);
          const expected = direction === "forward" ? digits : [...digits].reverse();
          const correct =
            recalled.length === expected.length &&
            recalled.every((d, i) => d === expected[i]);
          trials.push({
            index: trialIndex++,
            direction,
            span: currentSpan,
            presented: digits,
            recalled,
            correct,
          });
          if (correct) spanCorrect++;
        }
        if (spanCorrect === 0) {
          consecutiveFails++;
          if (consecutiveFails >= 1) break;
        } else {
          consecutiveFails = 0;
        }
        currentSpan++;
      }
    }

    async function presentDigits(digits: number[]): Promise<void> {
      container.innerHTML = `
        <div class="task-root">
          <div class="task-chrome">
            <div class="tl">PROTOCOL: DIGIT_SPAN · PRESENTING</div>
            <div class="tr">SPAN ${digits.length}</div>
            <div class="bl">N_DIGITS ${digits.length}</div>
            <div class="br"><span class="pip"></span>ENCODING</div>
          </div>
          <div class="stimulus fixation" id="ds-digit">+</div>
        </div>`;
      const el = container.querySelector<HTMLElement>("#ds-digit")!;
      await waitFor(700);
      for (const d of digits) {
        el.className = "stimulus";
        el.style.background = "var(--surface-container-highest)";
        el.style.color = "var(--primary)";
        el.textContent = String(d);
        await waitFor(STIMULUS_ON_MS);
        el.textContent = "";
        el.style.background = "transparent";
        await waitFor(STIMULUS_OFF_MS);
      }
    }

    function collectRecall(span: number): Promise<number[]> {
      return new Promise((done) => {
        container.innerHTML = `
          <div class="task-root">
            <div class="task-chrome">
              <div class="tl">PROTOCOL: DIGIT_SPAN · RECALL</div>
              <div class="tr">SPAN ${span}</div>
              <div class="bl">ENTER ${span} DIGITS</div>
              <div class="br"><span class="pip"></span>AWAITING INPUT</div>
            </div>
            <div style="width: 100%; max-width: 380px; padding: 60px 20px 24px;">
              <div class="ds-display mono" id="ds-buf"></div>
              <div class="ds-keypad">
                ${[1,2,3,4,5,6,7,8,9].map((d) => `<button class="ds-key" data-d="${d}">${d}</button>`).join("")}
                <button class="ds-key" id="ds-back">⌫</button>
                <button class="ds-key" data-d="0">0</button>
                <button class="ds-key ds-submit" id="ds-submit">COMMIT</button>
              </div>
            </div>
          </div>`;
        const buf: number[] = [];
        const display = container.querySelector<HTMLElement>("#ds-buf")!;
        function render() {
          display.textContent = buf.length ? buf.join(" ") : "—";
        }
        render();
        container.querySelectorAll<HTMLButtonElement>(".ds-key[data-d]").forEach((btn) => {
          btn.addEventListener("click", () => {
            if (buf.length >= span) return;
            buf.push(Number(btn.dataset.d));
            render();
          });
        });
        container.querySelector<HTMLButtonElement>("#ds-back")!.addEventListener("click", () => {
          buf.pop();
          render();
        });
        container.querySelector<HTMLButtonElement>("#ds-submit")!.addEventListener("click", () => {
          done([...buf]);
        });
      });
    }
  });
}
