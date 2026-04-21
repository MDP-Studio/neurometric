# NeuroMetric — Audit Verification + Build Plan

## Phase 0: Verify the External Audit (Fact-Checking)

The user received a detailed third-party audit challenging the original brief. Before trusting or discarding it, verify its load-bearing claims against primary sources.

- [ ] **Claim 1 — NCPT norming impossible.** Verify that the NCPT dataset (Scientific Data / Kaggle) releases scores + demographics only, NOT the task stimuli/timing/trial-counts. If confirmed: the "norming engine" in the original brief is invalid.
- [ ] **Claim 2 — WebView / RN latency.** Verify peer-reviewed measurements of jsPsych timing accuracy on mobile WebView. Target: is the 100–200ms stacked latency + jitter claim real?
- [ ] **Claim 3 — jsPsych timing caveat.** Verify the quoted jsPsych docs acknowledge 17–33ms frame timing uncertainty.
- [ ] **Claim 4 — FDA General Wellness Guidance (Jan 2026).** Verify the specific exclusion criteria around "mimicking clinical values" and "clinical-grade" marketing language.
- [ ] **Claim 5 — FTC Lumosity precedent.** Verify the $2M settlement, the three prosecuted claim categories, and the enforcement pattern.
- [ ] **Claim 6 — Akili / EndeavorRx FDA clearance.** Verify this is indeed the only FDA-cleared cognitive product and the SaMD path requires years of work.
- [ ] **Claim 7 — BIPA / GDPR biometric classification.** Verify cognitive/behavioral performance data is treated as biometric/health data under current law.
- [ ] **Claim 8 — FTC Health Breach Notification Rule.** Verify this applies to non-HIPAA consumer health apps.

## Phase 1: Synthesis — Which Audit Claims Hold Up?

- [ ] Rate each audit claim: confirmed / partially-confirmed / overstated / false
- [ ] Flag any technical mitigations the audit missed
- [ ] Determine which of the audit's three paths (A: consumer engagement, B: full SaMD, C: B2B enterprise) is most viable given user's constraints

## Phase 2: Decide on a Scoped Product Definition

- [ ] Pick a path (A / B / C / hybrid)
- [ ] Define what IS measured vs. what's NOT claimed
- [ ] Lock positioning language that survives FDA wellness guidance + FTC scrutiny
- [ ] Define the MVP feature set in terms of what's scientifically defensible

## Phase 3: Technical Architecture (re-planned)

- [ ] Decide: native-only vs WebView vs hybrid (driven by latency budget)
- [ ] Decide: Firebase vs self-hosted vs something else
- [ ] Decide: LLM narrative layer — keep, constrain, or cut
- [ ] Data model for local-first + anonymized sync
- [ ] Auth, payments, consent flow scope
- [ ] Privacy compliance surface (GDPR, CCPA/CPRA, COPPA, BIPA, FTC HBNR)

## Phase 4: Honest Roadmap

- [ ] Kill the 6-week MVP claim; replace with realistic phasing
- [ ] Define Phase 1 (local prototype with self-only tracking), Phase 2 (auth + cloud), Phase 3 (norming from own data — NOT NCPT)
- [ ] Budget for test-retest reliability validation and device-class calibration
- [ ] Resource plan (solo vs team, outside reviewers needed)

## Review

### Audit Verification — Outcome

The external audit was substantively correct. Verified against primary sources:

- **NCPT norming is impossible** — confirmed, and the audit actually understated it. Stroop / N-Back / Simple RT aren't even in NCPT's battery. See [audit-verdict.md](audit-verdict.md).
- **Mobile RT latency is fatal for the "millisecond precision" claim** — confirmed by Germine 2022, Niehorster 2023, Anwyl-Irvine 2021, Bridges 2020, and the jsPsych official docs. Even native mobile hits a 35–140 ms hardware floor.
- **FDA General Wellness Guidance (Jan 6, 2026)** — confirmed verbatim. "Clinical-grade" is named as a disqualifier. Percentile scoring that mirrors neuropsych reporting trips "diagnostic thresholds" and "values that mimic those used clinically."
- **FTC v. Lumosity 2016** — confirmed down to the wording. $2 M paid on a $50 M suspended judgment.
- **Akili EndeavorRx** — confirmed. But the audit missed that Akili **wound down in 2024 after ~$300 M accumulated deficit**. FDA clearance did not produce a viable business. That is a stronger cautionary precedent than the audit gave it.
- **FTC HBNR** — confirmed, with four active enforcement actions since 2023 (GoodRx, BetterHelp, Premom, Monument). Rule was updated July 2024 to make health-app coverage explicit.
- **BIPA exposure** — the one claim the audit overstated. No BIPA case law extends to cognitive/behavioral data.
- **GDPR health-data framing** — partially correct. Gray area for pure entertainment; clearly health data when marketed for disease detection.

### Decision Required From User

Pick a path before any code is written:

- **Path A+ (recommended)** — Personal-baseline cognitive self-tracking. No population comparisons. Native mobile. Accuracy-based tasks. 5-month MVP timeline. See [build-plan.md](build-plan.md) for full design.
- **Path C** — B2B / enterprise. Same technical constraints, different go-to-market. Requires sales infrastructure.
- **Full stop** — if neither Path A+ nor Path C is appealing given the constraints. The original brief is not a viable product; there is no shame in walking away.

### Key Refactors vs Original Brief

| Original brief said | Reality check says | Revised plan uses |
|---|---|---|
| React Native + WebView | Hardware + JS-thread latency kills ms-precise RT | Native iOS + Android, shared C/Rust task core |
| jsPsych at runtime | Same latency problem in a WebView | jsPsych as reference only; port semantics, not code |
| NCPT-based percentiles | Stimuli proprietary; tasks not in NCPT at all | No percentiles in MVP; within-user baselines |
| Simple RT as hero metric | Most latency-corrupted task possible | Demoted to stability check; hero = accuracy/throughput tasks |
| "Clinical-grade" positioning | Explicit 2026 FDA wellness disqualifier | Personal self-tracking language, enumerated forbidden-words list |
| GPT-4o open-ended interpretation | Lumosity-pattern FTC risk + LLM hallucination liability | Cut; replace with curated clinician-reviewed templates keyed to own-baseline deltas |
| 6-week MVP | Off by ~5× for a solo builder | 5 months to defensible public MVP |
| Firebase + analytics SDKs | FTC HBNR enforcement targets SDK leakage | Local-first storage; no 3P behavioral analytics |

No code written yet. Awaiting user decision on path.
