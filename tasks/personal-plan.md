# Personal-Use Plan (Active Roadmap)

This supersedes [build-plan.md](build-plan.md) for product-framing purposes. That document assumed a public launch with FTC/FDA exposure. For a personal tool there's no marketing and no consumer-protection surface, so all of the "forbidden words" / "wellness guidance" / "compliance" content in the old plan is moot.

**What carries over from the public-product analysis:**

- The scientific rigor constraints (within-subject only, device calibration, robust statistics, ICC tracking, etc.) — these apply even more strongly for personal use, because nobody else is going to catch your own bias.
- The technical architecture (web-first, `performance.now()`, double-rAF stimulus onset, pointer events, IndexedDB local-first) — same rationale.

**What changes in personal-use framing:**

| Public product concern | Personal-use reality |
|---|---|
| FTC "clinical-grade" marketing risk | Not applicable — no marketing |
| FDA General Wellness Guidance | Not applicable — not a device, not distributed |
| GDPR / CCPA / CPRA / COPPA / BIPA | Not applicable — processing your own data on your own device is outside regulatory scope |
| FTC Health Breach Notification Rule | Not applicable — no health record "vendor" |
| App Store review | Not applicable — web app or local native build |
| Retention / engagement / differentiation | Not applicable — you'll use it because you built it |
| Terms of service, privacy policy, consent flow | Optional — keep a simple first-run "what this is / is not" page for your own clarity |

The remaining hard problems are all scientific and engineering:

1. Can you measure it accurately enough on a commodity device?
2. Can you measure it reliably enough that change over time is real signal, not noise?
3. Can you interpret the measurement honestly — including acknowledging what the number *doesn't* mean?

## Phase 1 — Foundation (current)

Built and running at [http://localhost:5173](http://localhost:5173):

- Vite + TypeScript web app, strict typing.
- Per-session device calibration: frame-rate measurement + 10-trial baseline-tap pretest.
- Go / No-Go task: 60 scored trials (40 Go / 20 No-Go) + 5 warmup dropped. Double-rAF stimulus onset, pointer-event response capture, 500 ms stimulus with 1000 ms response window, jittered 700–1100 ms ISI.
- Metrics: hit rate, false alarm rate, d-prime (with Macmillan-Creelman correction), median RT with IQR, corrected RT (raw − baseline tap).
- Within-subject trend: 7-session rolling median baseline, 3-session minimum before deltas are shown.
- IndexedDB local-first storage, JSON export, wipe-all.
- Context tagging per session (sleep, caffeine, stress, hour, day of week).
- Methodology documented in [methodology.md](methodology.md).

## Phase 2 — Task battery expansion (next)

To build a cognitive profile across domains, we need 5–6 tasks, each measuring something distinct. Rough priority order:

| # | Task | Primary construct | Hardware sensitivity | Build complexity |
|---|---|---|---|---|
| 1 | Go / No-Go | Inhibitory control | Low (accuracy-dominant) | ✅ done |
| 2 | Stroop | Interference control / selective attention | Low–med | Small |
| 3 | Digit Span forward + backward | Short-term & working memory | Very low (untimed) | Small |
| 4 | N-Back (2-back) | Working memory updating | Low–med (accuracy) | Medium |
| 5 | Visual Search | Attention allocation / processing speed | Medium | Medium |
| 6 | Trail Making A / B | Executive function / set-switching | Low (total-time metric) | Medium |
| (deferred) | Simple / Choice RT as primary metric | Processing speed | High — hardware floor dominates | Deferred unless we add photodiode calibration |

I recommend adding **Stroop** and **Digit Span** next. Together with Go/No-Go they cover three distinct cognitive domains. Each task gets its own module under `src/tasks/` and plugs into the same session/metrics/trend pipeline.

## Phase 3 — Context-correlation analysis

Once you have ≥ 20 sessions across multiple tasks, the single most valuable analysis is:

> "Which of my context variables actually predict my performance on which tasks?"

Plan:

- Mixed-effects regression per (task × metric): outcome = metric, predictors = sleep, caffeine, stress, hour of day, day of week. Random effect = session.
- Show effect sizes and bootstrapped confidence intervals — not p-values (single-subject data is not well suited to null-hypothesis testing).
- Surface the top three context variables that actually move each metric for *you*, with honest "no detectable effect" when there isn't one.
- Bayesian option: treat the baseline-tap distribution as a prior, update per-session; useful if we want probability-of-improvement statements instead of point estimates.

This is the part that turns the tool from "score chart" into "personal cognitive-science lab."

## Phase 4 — Personal reliability + cognitive profile

After ≥ 15 sessions per task:

- Compute **intraclass correlation (ICC)** per metric per task for *you* — your own test-retest reliability. If ICC < 0.6 on a given metric on your device, display a warning that the metric is too noisy to trust week-to-week.
- **Normalize your own scores** within-subject: z-score each metric against your own session-level distribution. Now tasks are on the same scale.
- **Radar chart** of within-subject strengths: which cognitive domains are the highest and most stable for you, relative to your own average. This is your honest "cognitive profile" — a map of your brain as measured on this device under your normal conditions.
- Flag domains with high variance as "possibly fatigue-sensitive" or "possibly device-limited" based on the context-correlation results from Phase 3.

## Phase 5 — Intervention tracking

The real question you asked: *"what could help me improve what my brain is best at."* Honest answer from the evidence base: commercial "brain training" does not transfer beyond the trained task; but sleep, exercise, stress, and diet do reliably affect cognition.

The tool's Phase-5 role is not to prescribe — it is to *verify*. You pick an intervention (e.g., "I'll aim for 8 hours of sleep consistently for 4 weeks"). You tag it in the app's context capture. At the end of the trial, the app shows whether *your own scores actually shifted* on the metrics the literature predicts that intervention should move.

Interventions worth running A/B-style against yourself:

- **Sleep duration / consistency.** Expected effect: large on working memory and attention. Observable in ~2 weeks.
- **Morning vs. evening testing.** Expected effect: individually variable chronotype effect. Observable in ~10 sessions.
- **Caffeine on vs. off.** Expected effect: small acute boost with tolerance. Observable in ~1 week.
- **Aerobic exercise (e.g., 30 min / day, 5×/week).** Expected effect: moderate on processing speed, executive function. Observable in ~6–8 weeks.
- **Meditation (MBSR-style, 10–20 min/day).** Expected effect: small–moderate on sustained attention. Observable in ~8 weeks.

Each becomes a self-experiment: pre-intervention baseline window, intervention window, post-intervention window. The tool reports effect sizes and whether change exceeds your own measurement noise.

Interventions that are not worth spending time on (evidence is weak or null):

- Most nootropic supplements (except caffeine, and L-theanine with caffeine).
- Commercial brain-training apps as a generalized cognitive improver.
- "Brain games" as a dementia preventive (cognitive reserve comes from genuinely hard intellectual engagement in life, not from apps).
- Listening to "binaural beats" or similar.

## Phase 6 — Data ownership and portability

Already built (JSON export). Additional nice-to-haves when you reach that phase:

- CSV export for spreadsheet analysis.
- Optional encrypted sync to your own storage (iCloud Drive / Google Drive / local file) — no cloud service dependency.
- R / Python analysis notebook template in the repo for deeper stats on the exported JSON.

## Honest limitations that won't go away

1. **Mobile hardware latency floor (~35–140 ms).** Corrected RT mostly removes this, but tasks where 10–20 ms differences matter (e.g., distinguishing subtle processing-speed deficits) cannot be measured reliably without external hardware (photodiode, button box). This is a ceiling on what the tool can ever measure, regardless of effort.
2. **Single-subject statistics are inherently less powerful.** You can detect large effects reliably, moderate effects with effort, small effects not at all. Most within-person cognitive effects of lifestyle changes are in the small-to-moderate range. This means some real interventions will not show up clearly even when they're helping.
3. **Practice effects confound early sessions.** The first 10–15 sessions on any task will show improvement just from learning the task. The tool's baseline-window approach partially handles this by using rolling medians, but for the first month of any new task, "getting better" and "practicing more" are indistinguishable.
4. **No external validation.** You cannot confirm whether your "d-prime = 2.4" means anything in the real world — there is no blood test for cognitive performance. The tool measures what it measures. Whether that translates to "your brain in real life" is unverifiable from inside the tool.

These are not failures of engineering — they are the honest ceiling on what a commodity-device self-assessment can deliver.

## Decision points for the next session

When you come back to this, you'll need to choose:

1. **Add Stroop next, or Digit Span next?** I'd recommend Stroop — closer in architecture to Go/No-Go so code reuses cleanly, and interference control is a distinct, well-validated domain.
2. **Start running sessions now** with just Go/No-Go to build your baseline, or **wait until the battery is larger**? Running now gives you a two-week head start on the baseline-window math; waiting means all tasks have aligned session counts. I'd recommend running now — baseline data is the bottleneck resource.
3. **PWA / home-screen install?** Trivially easy to add; makes the app launch-able like a native app from your phone's home screen. Useful if you want daily use.
4. **Device pinning?** Right now you can use the tool on any device and it detects the switch. You may want to lock to one device for maximum reliability.
