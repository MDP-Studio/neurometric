# NeuroMetric — Revised Build Plan

The original brief is not viable as written. The audit is substantially correct. This plan proposes a scoped, defensible product.

## Part 1 — Choose a Path

The audit offered three paths. Given a solo/small builder with no seven-figure regulatory budget, Path B (full FDA SaMD) is off the table. Path C (B2B enterprise) is viable but requires sales infrastructure most solo builders don't have. That leaves **Path A**, but with a tighter scientific framing than the audit proposed.

### Recommended: Path A+ — Personal-Baseline Cognitive Self-Tracking

The product measures the user against **their own past self**, not against a population. This one pivot eliminates ~80 % of the regulatory and scientific problems simultaneously, because:

- No percentiles → no "diagnostic threshold" language → no clinical-mimicking values → safely inside 2026 FDA wellness guidance.
- No population comparisons → no false statistical claims → no Lumosity-pattern FTC exposure.
- Within-subject measurement cancels most device-latency bias — if the user always uses the same phone, the constant offset drops out of the delta.
- No "clinical-grade" language → no wellness-exception disqualifier.
- No third-party-task norming problem → NCPT is not needed for anything.

The scientific story becomes honest and novel: *"We can't tell you where you rank — device latency makes that unreliable. We can show you how your own performance trends over time, on the same device, with controls for time of day, sleep, and fatigue."* That is a differentiated, truthful pitch.

### Product Framing — Words That Are Safe vs. Forbidden

**Forbidden (trigger FDA/FTC risk):** clinical, clinical-grade, diagnose, diagnostic, percentile, norm, population, benchmark against others, detect ADHD/dementia/MCI/Alzheimer's, improve your work/school/athletic performance, delay cognitive decline, train your brain to be smarter.

**Safe:** personal baseline, your trend, your consistency, your best/median/worst day, game-based self-tracking, entertainment, curiosity, self-experiment, "how did your sleep / coffee / stress affect today's session."

---

## Part 2 — Scientific Design Constraints

These are the non-negotiables that come out of the verification.

1. **Drop Simple Reaction Time as the headline metric.** It is the task most corrupted by hardware latency. Use it only as a within-user stability check. Replace it as a "hero" metric with tasks where accuracy, throughput, or decision quality matter more than ms-precise RT.
2. **Lean into accuracy-and-throughput tasks.** Stroop interference (accuracy cost of incongruent vs congruent), N-Back d-prime, Go/No-Go commission errors, Posner cueing effects, trail-making completion time (where ±100 ms is negligible against a 30-second task). These are robust to the mobile-timing problem.
3. **Within-subject comparisons only.** Report change vs. the user's own rolling baseline (e.g., last 7 sessions). Never cross-user.
4. **Same-device lock.** Tie the baseline to the specific device. If the user switches phones, flag it and restart baselines. Explain why.
5. **Many trials, report medians.** Per-session trial counts ≥ 50 for RT-style tasks. Report median and interquartile range, not raw RT or means (robust to the latency tail).
6. **Test-retest reliability must be measured and published.** Before any release shipping a new task, run a repeated-measures study (can be N = 30 beta users) and compute the ICC. Don't ship any task with ICC < 0.7. This is the scientific minimum to claim a measurement tracks anything real within a person.
7. **Never have an LLM interpret cognitive scores open-ended.** The LLM layer, if used at all, is limited to rephrasing pre-written, clinician-reviewed templates keyed to discrete bands of the user's own change. No free-form generation about what a score "means." No speculation about clinical conditions.

---

## Part 3 — Technical Architecture (Revised)

### Stack

- **Native mobile, not WebView.** Use SwiftUI on iOS, Jetpack Compose on Android. For high-precision timing rely on platform APIs:
  - iOS: `CADisplayLink` for vsync-locked stimulus timing; `UIResponder` `touchesBegan` timestamps for input; `CACurrentMediaTime` for elapsed time.
  - Android: `Choreographer` for vsync callbacks; `MotionEvent.getEventTime()` for input timestamps (vendor-varying but the best available).
- **Shared test engine as a plain C or Rust core**, wrapped per platform. This is the only viable way to keep the task definitions portable without introducing the WebView timing tax. Keep the core deterministic and unit-testable.
- **jsPsych is NOT used at runtime.** It is useful as a *reference implementation and design guide* for task logic — the behavioral-science community has already figured out the trial structures. Port the semantics, not the code.
- **Backend: Supabase or Firebase.** Firestore / Postgres is fine. Keep it minimal.
- **Data model: local-first.** Every session is written to an on-device SQLite store first. Only derived, de-identified aggregates sync to the cloud (per-task daily medians, not trial-level data). Gives the user deletion by wiping the app, satisfies GDPR data-minimization, reduces breach surface.
- **No third-party analytics SDKs that receive behavioral event streams.** FTC's HBNR enforcement pattern is SDK/pixel leakage to ad networks — do not ship a product with Meta Pixel, TikTok SDK, Amplitude, Mixpanel, or similar sending raw session data off-device. Use self-hosted, event-minimized analytics (PostHog self-hosted, or native Apple/Google aggregated metrics only).

### What About Cross-Platform Shortcuts?

- **React Native + WebView:** rejected. This is exactly the configuration the audit identified as broken for timing.
- **Flutter:** better than RN for consistent cross-platform rendering, but Flutter still doesn't give you vsync-locked input timestamps on Android as cleanly as native. Usable if the product is scoped to accuracy-only tasks.
- **Capacitor / Cordova / Expo WebView:** no, same timing problem as RN WebView.

Recommendation: native-native is worth the extra engineering for a measurement product specifically. If the scope shrinks to pure accuracy/throughput tasks (no RT at all), Flutter becomes acceptable.

### LLM Layer

- Cut the open-ended interpretation feature entirely.
- If a "coach" feature ships, it is limited to rephrasing a curated set of ~100 human-written messages keyed to discrete deltas in the user's own trend. Human review of every template.
- No API calls that send the user's cognitive data to an external LLM provider. Privacy exposure + FTC HBNR risk + inference cost all favor shipping the templates on-device.

---

## Part 4 — MVP Scope

### Included

- 3 tasks, chosen for robustness on mobile:
  1. **Go/No-Go** (commission errors + hit rate) — proxy for impulse control
  2. **Stroop** (accuracy cost of incongruent trials, with RT as secondary via within-subject delta) — proxy for interference control
  3. **N-Back (2-back)** (d-prime) — proxy for working memory
- Session length: 4–6 minutes total, once daily.
- Onboarding: 7-day calibration period where scores are not yet shown, just a progress bar. Explain the baseline concept honestly.
- Results: daily trend chart (user's own scores over time), rolling 7-day median, flag on "above / at / below your baseline" only — no numeric percentile, no population comparison.
- Simple journaling tag per session: sleep, caffeine, stress (low/med/high). Makes the longitudinal data actually useful.
- Local-first storage, export-your-data button, delete-all button.

### Explicitly Not Included in MVP

- Population percentiles of any kind
- Any "compared to your age group" framing
- LLM-generated narratives
- Cross-device sync (introduce only after per-device baselines are stable)
- Any feature targeting minors — age-gate to 18+ at onboarding to remove COPPA entirely from scope
- Any disease / condition language anywhere in UI, copy, marketing, or App Store listing

---

## Part 5 — Realistic Timeline

The 6-week figure in the original brief is wrong. Honest phasing for a solo builder with competent native-mobile skills:

- **Weeks 1–3 — Task engine on one platform.** Pick iOS first (timing APIs are cleaner). Implement Go/No-Go with `CADisplayLink`-timed stimuli, measure timing against an external photodiode or at minimum a second phone's camera at 240 fps to characterize actual onset latency. Build the trial-logging data model.
- **Weeks 4–6 — Port to Android + run internal calibration.** Validate that your N=2 devices give stable within-session medians. Add Stroop.
- **Weeks 7–10 — Closed beta (N ≈ 20–30).** Two daily sessions each over two weeks. Compute test-retest ICC per task. If any task ICC < 0.7, iterate — do not ship it.
- **Weeks 11–14 — Add N-Back, polish UX, consent + privacy flows, build onboarding.** Ship App Store / Play Store TestFlight / internal test.
- **Weeks 15–20 — Public soft launch.** Single task category, narrow audience (pick one: musicians, tech workers, poker players, endurance athletes — someone with an intuitive reason to care about consistency). Focus on retention data, not acquisition.
- **Months 6–12 — Expand task library, add journaling correlations, decide whether to build a reference sample for eventual norming (a 12+ month data-collection effort) or stay strictly within-user.**

Honest headline: **five months to a defensible public MVP, twelve months to a product that could credibly start collecting its own reference sample if you want to pursue soft norming later.** Half that if there are two engineers.

---

## Part 6 — Legal / Compliance Surface

Work you must do *before* public launch, not after:

- **Consult an FDA regulatory attorney** (not general counsel) for a 2–3 hour marketing-copy review. Cost: ~$1.5–3 K. Purpose: confirm the marketing copy does not trigger the 2026 wellness-guidance disqualifiers. Cheaper than an FTC letter.
- **Privacy policy and ToS** tailored to: GDPR, CCPA/CPRA, CPPA ADMT (Jan 2026), COPPA (declare 18+ only to exit scope), FTC HBNR. Purchase a template from a privacy-specialist firm; $500–1500.
- **App Store listing copy** pre-reviewed against the forbidden-words list in Part 1 before submission. App Stores apply their own "medical claim" filters that are stricter than FDA in practice.
- **Data Processing Agreement** with Supabase/Firebase; document the data flow.
- **In-app consent** at first launch: explicit, granular, timestamped. Store consent in the database. Make withdrawal one tap.
- **Breach-response playbook** (for FTC HBNR 60-day notice requirements). One page is enough for MVP; expand later.

---

## Part 7 — What Success Looks Like at 6 Months

- 500–2000 active users in a narrow niche.
- Per-task test-retest ICC > 0.7 documented.
- Retention > 20 % at day 30 (this is the *real* hard problem — see Lumosity, Peak, Elevate, all of whom solved the science to some degree and still struggle with retention).
- Zero FTC inquiries, zero FDA untitled letters.
- One blog post on your measurement methodology, written honestly, that serves as scientific legitimacy marketing instead of hand-waved "clinical-grade" copy.

If retention is good, the path forward is either (a) collect a reference sample over months 6–18 and eventually add cautious age-band comparisons (with published methodology), (b) stay pure personal-baseline and compete on UX / content / insight quality, or (c) pivot to B2B (sports teams, cognitive-adjacent communities, clinician-referred self-tracking) where the data becomes valuable to a second party.

---

## Part 8 — Hard Nos

Things not to do regardless of how tempting:

- Do not ship population percentiles without collecting your own normed sample.
- Do not use the word "clinical" in any surface.
- Do not let an LLM free-form interpret a user's cognitive scores.
- Do not ship third-party analytics SDKs that receive trial-level behavioral data.
- Do not claim the product improves memory, focus, attention, productivity, or work/school/sports performance.
- Do not target or knowingly allow under-18 users in MVP.
- Do not ship a WebView-based test runner.
- Do not copy task stimuli from Lumosity, CogniFit, Cambridge Brain Sciences, or any commercial product. Implement from the behavioral-science literature.

---

## Review / Next Step

Before coding: user decides whether to commit to Path A+ as scoped above, or to pivot (Path C enterprise, or full-stop). If Path A+ is accepted, the first concrete engineering task is a one-week spike building a single-task Go/No-Go implementation on iOS with `CADisplayLink`-timed stimuli and a timing-characterization script.
