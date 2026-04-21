# Methodology — What This Tool Does and Doesn't Measure

This is a personal self-assessment tool. One user, their own device, their own data. No marketing, no claims to anyone else. Everything below is about making the measurement as honest and unbiased as possible *for that user*.

This document is a pre-commitment. Every methodological choice below is locked in before session 1. Changing any of them mid-collection splits the dataset into two incompatible halves, invisibly. Do not change them without starting over.

## What "unbiased" actually means here

Three kinds of bias to defeat:

1. **Measurement bias** — the device, the software, the room lighting, the finger, the moment.
2. **Statistical bias** — short noisy sessions and small samples produce apparent trends that aren't real.
3. **Interpretation bias** — flattery lies, pathology lies, confident narratives on thin data lie.

## How each bias is addressed

### Measurement bias

- **Per-session device calibration.** `requestAnimationFrame` median inter-frame gap gives us the effective refresh rate; a 10-trial "tap the green dot" pretest gives us the user's own same-session baseline tap latency on the same device, posture, hand.
- **Device fingerprint lock, with timing-relevant vs timing-irrelevant split.** Sessions on different devices are not comparable. The fingerprint is recorded per session, but split into two hashes:
  - **`stableHash`** — screen width, screen height, devicePixelRatio, refreshRateHz, hardwareConcurrency, deviceMemory. These are the fields that actually change the RT latency profile of the device. Baseline restarts when this hash changes.
  - **`fullHash`** — everything in `stableHash` plus the full User Agent string. Logged for forensic inspection only (so "which Safari version was this session on" is answerable post-hoc). Changes on every browser/OS minor update. Does **not** trigger a baseline restart. This avoids the silent-data-loss case where iOS 17.5 → 17.6 invalidates six weeks of baseline for a change that has zero effect on timing.
- **Double-rAF stimulus onset.** Stimulus timestamps are captured in the second `requestAnimationFrame` callback after the DOM mutation — the timestamp reflects the painted frame, not the DOM change.
- **`pointerdown` response capture.** Fastest input signal the browser exposes — earlier than `click` (which adds synthetic-click delay on mobile) and than `touchend` (fires on lift-off). Captured with `performance.now()` at dispatch time.
- **Whole-frame stimulus durations.** Sub-frame durations are meaningless on a 60 Hz display.
- **Per-session telemetry snapshot.** Battery level + charging state (when available), `hardwareConcurrency`, `deviceMemory` (Chromium), `navigator.connection` type, `display-mode: standalone`. Plus a deterministic 5-run CPU micro-benchmark (median ms to complete a fixed integer workload). A thermally throttled or low-battery phone shows up as elevated benchmark time.

- **CPU-benchmark exclusion rule (committed).** Once N ≥ 10 sessions have been recorded, each new session's `cpuBenchmarkMs` is compared to the personal median of prior sessions. If the current session's benchmark is **> 1.5 × personal median**, the session is flagged as "device-state compromised" and **excluded from baseline, trend, and context-correlation computations**. It remains visible in the raw-data plot so the exclusion is inspectable. Before N = 10 no exclusion runs (too few reference points).

### Statistical bias

- **Per-task warmup counts, not a global 5.** N-Back uses 10 warmup trials (a 2-back chain is genuinely cognitively different for the first ~8 trials). Go/No-Go and Stroop use 5. Digit Span uses 1 unscored *practice trial* at the start of each block (Forward and Backward separately — different rehearsal strategies), after which each span-counted trial is independent. These are coded constants; changing them invalidates prior data.

- **Digit Span termination rule: WAIS-IV-style "both-trials-fail-at-span."** Each block (Forward / Backward) starts at span 3. Two scored trials run at the current span. If both fail, the block ends; the max span reached is the largest length where at least one of the two trials was correct. Maximum allowed span is 9. This matches the Wechsler Adult Intelligence Scale IV Digit Span Discontinue rule. Variants considered and rejected: *one-error-terminate* (noisier); *full staircase* (longer, better threshold estimate but session duration balloons on good days and introduces fatigue asymmetry across sessions). The WAIS rule is a deliberate accuracy/speed tradeoff; the rule is locked here so session-to-session scoring is comparable.

  **Caveat logged in Phase 3:** session duration under this rule correlates with performance (good-performance sessions run longer). If a systematic fatigue effect appears between Forward and Backward blocks, regress session-duration out before interpreting block differences.
- **Enough trials per session.** Go/No-Go: 60 scored. Stroop: 60 scored. N-Back: 40 scored. Digit Span: variable (adaptive termination).
- **Robust statistics.** Medians + IQR for all RT reporting. Log-linear correction (Macmillan & Creelman 2005) for d'.
- **Rolling baseline, 3-session minimum before any delta.** 7-session rolling window for "is today unusual." Sessions 1–3 per task are explicitly labeled "calibrating" with no delta shown.
- **Drift detection (Phase 3+).** A longer rolling window (30 sessions) runs alongside the short 7-session one. Drift is flagged automatically via **Mann-Kendall non-parametric trend test** (monotonic trend on the 30-session window) at α = 0.05 for each primary metric per task. Mann-Kendall is chosen because it makes no assumption about distribution shape, tolerates outliers, and works on modest sample sizes. When drift is flagged, the home-screen latest-result banner shows a "30-day trend: ↑ / ↓" marker alongside the 7-session delta. If they disagree ("session above short baseline, below long trend") that is itself informative — the short baseline has shifted.
- **Deltas, not absolutes.** Reported as change vs. the user's own rolling baseline. Raw numbers have no honest interpretation without population norms (which we don't have and won't fake).
- **Context tagging and auto-telemetry** captured every session (see Context below).

### Interpretation bias

- **No percentiles.** We don't have a valid reference sample and won't invent one.
- **No gamification or streaks.** Streaks cause test-at-fixed-moments behavior, which correlates sessions with each other (same time of day, same mood), inflates apparent reliability, and ties the measurement schedule to the thing being measured.
- **No free-form LLM narratives** about cognitive scores.
- **Honest expectations per task** (see Expected ICC table below). Stroop interference is expected to be noisy at the individual level no matter how well we measure — that's a property of the task, not a flaw of this tool.
- **Templated narratives are gated on confidence-interval-excludes-zero**, not on correlation magnitude (see Templated Narrative Gating below).

## Task assignment (the single most important rule)

**The app assigns the task. The user does not pick.**

Rule:

1. Pick the task with the oldest last-completed-session timestamp.
2. Ties broken randomly.
3. Tasks never run before sort first (infinitely old).

Rationale: if the user chooses based on mood, every Phase-3 context correlation is contaminated by selection bias. "Caffeine correlates with better Digit Span" might mean "I only do Digit Span on days I already feel alert enough to pick it." Unmeasurable confound, baked into the baseline and unrecoverable in analysis.

**Deferrals are logged, not forbidden.** If the user declines the assigned task, the decline is saved as a `DeferralRecord` with timestamp + telemetry + reason (`dismissed` | `rerolled` | `picked-other`). Selection pressure then becomes *visible* in analysis rather than invisible.

**Manual picks are allowed but flagged.** A manual task-picker screen exists for debugging. Sessions created from it have `wasAssigned = false` and are excluded from baseline, trend, and context-correlation computations. They still appear in the raw-data plot.

## Context capture timing (committed decision)

**Two-part capture, split by contamination risk.**

| Item | When | Why |
|---|---|---|
| Hours since waking | Before (pre-task) | Neutral objective fact about the morning; no arousal effect |
| Hours since last meal | Before (pre-task) | Same |
| Hour of day, day of week | Auto, before | Free from environment |
| Battery / hardware / CPU benchmark | Auto, before | Device state at session start |
| Sleep quality (last night) | After (post-task) | Potentially loaded — "I slept badly" could prime poor expectation |
| Caffeine today | After (post-task) | Would be fine either time, kept after for consistency |
| Stress when opening app | After (post-task) | **The one arousal-sensitive item.** Asking "rate your stress" before a timed cognitive task is a documented mild-priming manipulation. Framed retrospectively ("how stressed did you feel when you opened the app?") to reduce post-hoc self-report bias from task performance |

**Why not all-before or all-after.** The reviewer's weak preference was all-before with a 30-second neutral buffer. The split chosen here is stricter: no arousal-sensitive item before the task at all. The 30+ seconds of calibration + instructions between form and first trial remain in place either way.

**Lock-in.** This ordering is now part of the data's identity. If you want to change it later, you cannot merge the old and new sessions — you start a new baseline on each task.

## Data persistence and migration

- **Storage:** IndexedDB, origin-scoped, keyed by `location.origin`. Three object stores: `sessions`, `deferrals`, `meta`.
- **Persistent storage requested at first launch** via `navigator.storage.persist()`. Result is stored in `meta` as `storagePersisted: boolean` and drives the export-reminder cadence. On denial (Safari sometimes denies silently; some Chrome cases require engagement-score), the tool treats data as volatile and nags more frequently.
- **No cloud sync.** Local only.
- **Export format:** JSON, includes `origin` field so future-you can tell which physical URL the export came from.
- **Auto-reminder cadence:**
  - Persistent storage granted: every 5 sessions OR 7 days.
  - Persistent storage denied, non-Safari: every 3 sessions OR 3 days.
  - Persistent storage denied, Safari: every 2 sessions OR 2 days (tightest, because Safari on iOS is the most aggressive evictor of home-screen PWA storage under inactivity).
- **Cross-origin migration is explicitly not supported.** Moving from `http://<ip>:5173` to `https://…` is a hard restart: IndexedDB does not migrate across origins, by design of the web platform. Policy:
  1. Before any origin change, export a full JSON.
  2. After the new origin is up, import is **manual** and is flagged — imported sessions get a `"importedFrom": "<old-origin>"` marker and are treated as a *separate* baseline window from native-origin sessions. No silent merging.
  3. A small storage-migration helper (TODO) will live at `src/storage-import.ts` to read an exported JSON and write each session's imported-origin into the metadata so the data is inspectable but not laundered.

**Deployment implication.** This means choosing your permanent origin *before* session 1 is preferable to accepting data loss later. See [deployment.md](deployment.md).

## N thresholds for inference (raised from earlier plan)

| Analysis | Earlier plan | Committed | Why |
|---|---|---|---|
| ICC per metric per task | N ≥ 15 | **N ≥ 30** | At N = 15 the 95% CI on ICC is roughly ±0.25. Uninformative for flagging metrics. |
| Context correlations (mixed-effects regression) | N ≥ 20 | **N ≥ 50 per task** | Five predictors × small N overfits reliably. Rule-of-thumb 10–20 obs per predictor. |

**Below threshold:** values are shown with a "provisional — confidence interval wide" tag. They're directionally informative only. No templated narratives fire below threshold.

## Device-adjusted RT (renamed from "corrected RT")

The 10-trial baseline-tap pretest captures hardware latency + motor-response latency *under low cognitive load*. We subtract that from task RT to reduce between-session noise from device / posture / hand changes.

**Caveat this does not fix.** Motor-response latency rises slightly under higher cognitive load — attentional resources are partially consumed. The subtraction therefore removes the easy-case floor, not the full task-condition floor. The resulting value understates the "pure cognitive" component by a few ms.

**What it buys you.** Subtracted RT is much less noisy between sessions than raw RT (the device-and-posture constant is the biggest between-session variance source). What it does *not* buy you: a clean "this is your cognition alone" number. The label is `deviceAdjustedRtMs`, not `correctedRtMs`, to be honest about what the correction achieves.

## Expected within-subject ICC, by task (pre-commit)

Published within-subject test-retest ICCs from the cognitive-measurement literature (Hedge, Powell & Sumner 2018 and related):

| Task / metric | Expected ICC | Interpretation |
|---|---|---|
| Simple RT | ~0.7 | Reliable individual-level tracking plausible |
| Go/No-Go d' | 0.55–0.7 | Reliable |
| Digit Span | 0.65–0.8 | Reliable |
| N-Back 2-back d' | 0.5–0.7 | Marginal; high individual variation |
| Stroop interference (inc − cong RT) | **0.3–0.5** | **Unreliable at the individual level.** Difference scores subtract two noisy measurements. Do not expect trustworthy deltas here regardless of session count. |
| Trail Making | ~0.6 | Reliable (when added) |

**Pre-commitment.** Writing this down now stops a future-me from explaining away low Stroop interference reliability as a flaw in the setup rather than as a property of the task.

## Pre-registered hypotheses (replaces Bonferroni gating)

Bonferroni at α = 0.05 / 80 ≈ 0.000625 is the wrong correction for this test structure. The 80 tests (4 tasks × 4 metrics × 5 predictors) are heavily non-independent — metrics within a task share variance, tasks share cognitive substrate, predictors co-vary within-subject (e.g., caffeine ↑ on bad-sleep days). Bonferroni on non-independent tests is drastically over-conservative; real effects you care about would never cross the threshold.

Instead: **five pre-registered hypotheses, each with a specific directional prediction, committed before any data analysis. α = 0.01 each (Bonferroni-corrected for the 5, which is fair because these five were chosen to be non-redundant).** Everything else is exploratory and does not fire a templated narrative regardless of p-value.

### The five pre-registrations

**H1. Sleep quality (last night) → Go/No-Go d'** (positive).
Prediction: nights rated "good" yield higher Go/No-Go d' than nights rated "poor." Prior: robust meta-analytic evidence that sleep deprivation impairs inhibitory control / sustained attention (Lim & Dinges 2010; Pilcher & Huffcutt 1996). Expected effect size: moderate.

**H2. Hours since waking → N-Back d'** (negative at long durations).
Prediction: sessions run ≥ 10 hours after waking show lower N-Back d' than sessions run 2–6 hours after waking. Prior: working memory declines with time-awake, effect accelerating past ~16 hours (Dinges 1997; Van Dongen et al. 2003).

**H3. Caffeine ("some" / "lots") → Go/No-Go device-adjusted RT** (negative — caffeine → faster RT).
Prediction: sessions tagged `caffeine ≠ "none"` show lower device-adjusted median RT than `caffeine = "none"` sessions. Prior: low-to-moderate caffeine reliably reduces simple/choice RT (Smith 2002). Caveat: tolerance develops; effect magnitude may attenuate over months.

**H4. Stress-at-app-open → Stroop interference** (positive — higher stress → more interference).
Prediction: sessions tagged `stress = "high"` show larger interference (incongruent − congruent RT) than `stress = "low"` sessions. Prior: state stress impairs top-down attentional control (Arnsten 2009; Shackman et al. 2011). Caveat: Stroop interference is a difference score with expected ICC 0.3–0.5, so this hypothesis may fail to reach significance even if the effect is real — an **honest-null outcome** is possible here and should not be treated as disconfirmation of the literature.

**H5. Circadian window → Digit Span forward** (afternoon > morning).
Prediction: sessions run 14:00–18:00 show higher forward-span than sessions run 06:00–10:00. Prior: afternoon/evening peak on most working-memory tasks in typical chronotype adults (May 1999; Schmidt et al. 2007).

### Testing rules

- Each hypothesis is tested only once analysis thresholds are met (ICC ≥ 0.5 on the relevant metric, N ≥ 50 for the task).
- α = 0.01 per hypothesis (Bonferroni for 5, which is defensible for a small pre-registered set).
- Test only the directional prediction (one-sided). Reversed or absent effects are reported but do not "confirm" anything.
- A templated narrative fires only when the 95% CI for the effect excludes zero in the predicted direction at α = 0.01, AND the measured ICC is ≥ 0.5.
- **Adding new hypotheses after data collection starts is not allowed.** If a new hypothesis comes up later, it goes in the exploratory log, never in the templated narrative layer.

### Exploratory analyses (everything else)

All other context × metric relationships are exploratory. They can be inspected in the raw-data view and in the correlation matrix (Phase 3+). They never trigger templated narratives. They never get a confidence-interval-based "this is real" label. This is not because they're less interesting — it's because uncontrolled-comparison inference on small single-subject data is how you fool yourself.

## Intervention evidence table (updated with calibration)

| Intervention | Evidence for cognition | Magnitude | Caveat |
|---|---|---|---|
| Adequate sleep (7–9 h, consistent schedule) | Strong | Large on working memory, attention, processing speed | Applies to adults across ages |
| Aerobic exercise (150+ min/week moderate) | Moderate (was "strong") | **Moderate in older / clinical populations; small and inconsistent in healthy adults under 50** | Effect size depends on baseline; don't overestimate if you're young and already active |
| Stress / anxiety management | Strong for removing impairment | Clears a ceiling; not a booster | Won't make "sharp" sharper |
| Mediterranean / anti-inflammatory diet | Moderate | Small-to-moderate, long-term | Years, not weeks |
| Caffeine (acute, low-to-moderate) | Moderate | Small acute boost; tolerance develops | Self-confounds with sleep |
| Meditation (MBSR-style, 8+ weeks) | Moderate | Small-to-moderate on sustained attention | Dose-dependent, compliance matters |
| Social engagement | Moderate (long-term) | Protective against decline | Not detectable in weeks |
| Complex cognitive engagement (real life, not apps) | Moderate (long-term) | Cognitive reserve | Years, not sessions |
| Commercial brain-training apps (including this one) | **Weak / null for transfer** | Improves only the trained task | You will get better at this app's Go/No-Go. That is not "your attention improving" in general. |
| Most nootropic supplements | Weak to null, or understudied | N/A | Don't rely on these |

## Practice effects and the plateau requirement

- Practice effects on cognitive tasks don't plateau at a uniform session count. N-Back in particular shows documented **"second-wind" plateaus** — improvement, then stability, then another improvement when a new strategy is discovered. Estimates: 10 sessions for Go/No-Go and Stroop; 15–30+ for N-Back and Digit Span (higher variance).
- **Before starting any self-experiment / intervention**, look at the raw-data plot (home → "Raw data plot"). Only start counting intervention effects once you've seen a visually obvious plateau spanning **7+ sessions** on that specific task.
- The raw-data view is the first analytic view built, before any delta computation, precisely so the eyeball-first step is enforced.

## What the tool does not do

- Diagnose anything.
- Screen, detect, or rule out conditions.
- Claim generalizable cognitive improvement from playing these tasks.
- Compare you to other people.
- Prescribe interventions.
- Replace a clinician if you have genuine concerns about cognitive change.

## What the tool does do

Over weeks of sessions, the tool builds:

- A stable, low-bias, within-device personal baseline per task.
- A delta chart: today's session vs. that rolling baseline.
- A context database (objective + subjective, split by contamination risk) that will eventually power correlation analysis (Phase 3, N ≥ 50 per task).
- A raw-data plot for eyeball inspection before any delta is trusted.
- Exportable JSON of everything.

## Session protocol — anchor habit

"I will do a session every day" is a wish. "I will do a session *while _____*" is a protocol. Implementation-intention research is one of the cleaner replications in the behavior-change literature — anchoring a new behavior to an existing unconscious one outperforms willpower by a large margin, and pins it to a consistent time of day, which has the additional benefit of controlling one of the context variables without manual effort.

**Commitment, to be filled in before session 1:**

- **My anchor habit:** _______________________________________
  *(candidates: while the kettle boils for morning coffee; right after brushing teeth at night; on the train between two specific stops; first thing after sitting at my desk but before email — pick one that already happens without thought)*
- **Expected time of day:** _______ (the more consistent, the better the chronotype variable is controlled for free)
- **Backup protocol if the primary anchor is missed:** _______________________________________ *(e.g., "end of the next lunch," not "sometime later today")*
- **What I will NOT do:** run a session impulsively at odd times because "I feel sharp and want to see a good number" (this is the selection-bias failure mode in a different disguise).

Once filled in, the anchor becomes part of the methodology. Don't change it without restarting the timing-context baseline.

## Stop conditions

Most personal-science projects don't die from quitting too early. They die from refusing to quit when the signal isn't there. Pre-commit the falsification rules now:

- **Hard stop at 60 assigned-sessions total across the battery** (roughly 15 per task, month 5 at perfect cadence / month 7–8 realistic). **If at that point the raw-data plot shows no visually obvious plateau spanning 7+ sessions on at least two of the four tasks, this project ends.** Output: write up what was learned about *the measurement* — device-class latency, compliance reality, what context variables turned out to matter, what the tool itself was good and bad at — not about cognition.
- **Soft stop at 6 months calendar-time.** If compliance is < 40 % and not trending up, reduce to a 2-task rotation on every-other-day cadence OR stop outright. Do not grind on with grit — compliance below 40 % produces a dataset that's both small *and* selection-biased by which sessions you completed, which is the worst of both worlds.
- **Catastrophic-loss stop.** If the dataset is destroyed unrecoverably by any of the known failure modes (storage eviction, origin migration without export, device fingerprint invalidation, IndexedDB corruption), the project ends with a writeup — it does not restart. A restart is a fresh project that has to re-earn every threshold.
- **Tool-instability stop.** If the CPU-benchmark column shows > 20 % of sessions flagged as compromised for 60+ days, commodity mobile web is not a reliable measurement substrate for this user on this device. That is a real finding. Write it up. Stop.

These are **not** failure conditions in the colloquial sense. They are the pre-commitment that makes the project itself falsifiable, not just the hypotheses inside it. An outcome where the stop rule fires is an outcome where the project worked.

## Regardless of cognitive outcome — the meta-finding commitment

The methodology itself is a durable artifact independent of what the cognitive numbers do. A rigorously documented, pre-committed, transparent personal-science project on commodity mobile hardware is scarce. If the cognitive signal is lost in device noise — a genuinely plausible outcome that this document already flags — the meta-finding ("here, in detail, documented during collection not after, is what does and does not work for within-subject cognitive RT tracking on a consumer phone") is itself worth publishing.

**Pre-committed budget:** a writeup is produced at any project endpoint (stop-rule firing, completion of all pre-registered hypothesis tests, or 12-month mark — whichever comes first), regardless of whether the primary hypotheses hit. This commitment exists to prevent the "disappointing result = don't bother writing it up" failure that wastes the most effort in the personal-science genre.

## Analysis timeline — realistic expectations

This is the section that matters most for whether the project survives to Phase 3. Set the expectation now, in writing, so session-count despair at month 2 doesn't derail it.

### Arithmetic on the committed thresholds

With 4 tasks rotating under the scheduler, each task gets run roughly every 4 days. Committed thresholds:

| Milestone | Sessions per task | Days (100% compliance) | Days (realistic 60–70% compliance) |
|---|---|---|---|
| First delta shown on home screen | 3 | 12 | 17–20 |
| Full rolling baseline | 7 | 28 | 40–47 |
| Go/No-Go + Stroop practice plateau (eyeball) | 10–15 | 40–60 | 57–100 |
| N-Back practice plateau (eyeball) | 20–30 | 80–120 | 115–200 |
| First trustworthy ICC | 30 | 120 | 170–200 |
| Mann-Kendall drift detection has 30 points | 30 | 120 | 170–200 |
| CPU-benchmark exclusion rule active | 10 total sessions (any task) | ~10 days | ~15 days |
| First pre-registered hypothesis test | 50 per task for the task involved | 200 | 285–330 |

**Net:** the first time a pre-registered hypothesis can be tested under the committed rules is roughly **seven months of daily sessions at perfect compliance, or ten to twelve months at realistic personal-tracking compliance.**

This is not a flaw in the tool. It is a property of honest single-subject experimental science. Apps that promise insights in two weeks either have no measurement rigor, or have none of the above thresholds, or are lying.

### Intermediate milestones (things to do that aren't analytical)

To keep the project psychologically sustainable between now and the first hypothesis test:

- **Session 10 overall** — CPU-benchmark exclusion rule activates. Check the telemetry column in the export; see which session(s) your phone was hot on.
- **Session 20 per task** — open the raw-data plot. Look at the curve with your eyes. Has it plateaued? If visibly still improving, you're in practice-effects territory and deltas aren't meaningful yet.
- **Session 30 per task** — first ICC check. Compute the split-half ICC on the 30 sessions for that task's primary metric. If ICC ≥ 0.5 on the metric, you can start paying attention to its rolling delta. If ICC < 0.5, that metric is too noisy *for you on this device* no matter what you do — note it and move on.
- **Session 50 per task** — first pre-registered hypothesis test for any hypothesis whose task and metric have hit the N and ICC thresholds.
- **Every 3 months regardless** — manual review. Re-read this methodology doc. Has anything changed about your life (new phone? new wake/sleep schedule? moved apartments?) that should be noted in the session metadata? If yes, make a note in the export and decide whether the baseline should restart.

### What you will learn in the first 3 months (spoiler: mostly about the measurement itself)

The overwhelmingly most common failure mode for personal-tracking projects is:
> "I ran this for six weeks, I didn't see anything interesting, I stopped."

What you will actually learn in months 1–3:

- Whether your device's timing is stable enough day-to-day for any of this to work at all. (Look at the CPU-benchmark column in your export. If it's consistently within 20% of its own median, you're fine. If it's swinging 2–3× and you can see thermal events, note the times.)
- Whether you can comfortably complete a 3-minute session daily. (If not, this project is already over — consider a 2-task rotation instead of 4, or every-other-day cadence.)
- Which context variables you wish you'd logged but didn't. (Keep a separate note file for these. Do not add them to the schema mid-experiment — they become a new schema version and restart the baseline. Add them in a batch every 3 months if they accumulate.)
- How accurate your post-task "cast back 3 minutes" stress rating actually is. (Check consistency across sessions run close in time.)

None of this is "insight about your cognition." All of it is calibration. Budget for it. Do not treat it as failure.

### When to tighten the cadence or stop

- If you miss > 2 weeks in a row, don't try to "catch up" — just resume. Compliance is binary; pretending isn't.
- If after 3 months compliance is below ~40%, consider reducing to 2 tasks + every-other-day. Still science, still honest, less grinding.
- If after 6 months your CPU-benchmark column shows chronic instability, the data is probably un-interpretable and the conclusion is "commodity mobile web can't do this reliably for me." That's a real finding and it ends the project honestly.

## Planned expansion (task battery)

1. Go / No-Go ✅
2. Stroop ✅
3. Digit Span ✅
4. N-Back 2-back ✅
5. Visual Search (processing speed / attention allocation) — TODO
6. Trail Making A / B (executive / set-switching) — TODO
7. Simple / Choice RT (processing speed) — deferred unless we add hardware-calibration accessories

Adding a task = adding a new baseline that has to re-accrue the 3 / 30 / 50 N thresholds independently. Don't add them impulsively.
