# Audit Verification Verdict

The external audit was checked against primary sources (peer-reviewed journals, FDA guidance, FTC press releases, the NCPT paper itself). Summary: **the audit is substantially correct, and on several points it understates the problem.**

## Claim-by-Claim Results

| # | Audit Claim | Verdict | Notes |
|---|---|---|---|
| 1 | NCPT releases scores+demographics only; jsPsych cannot norm against it | **Confirmed + stronger** | Paper quote is verbatim. Also: Stroop, N-Back, and Simple RT **aren't even in the NCPT battery**. There is literally nothing in NCPT to norm against for the tasks in the original brief. |
| 2 | jsPsych docs warn of 17–33 ms frame uncertainty + 10–40 ms RT lag | Confirmed | Direct quote from jspsych.org/7.3/overview/timing-accuracy |
| 3 | Desktop jsPsych has 25–45 ms lag vs native; 5–10 ms SD jitter | Confirmed | Anwyl-Irvine et al. 2021, Bridges et al. 2020 |
| 4 | Mobile touchscreen adds 50–200 ms; cross-device bias > 1 SD | Confirmed + worse | Germine 2022: Android 1.12 SD slower than Windows, iPhone 0.44 SD slower. Niehorster 2023: 35–140 ms total device latency. "50–200 ms of delay could be greater than the true variation between individuals." |
| 5 | RN WebView can't deliver ms-precise RT on mobile | Confirmed | Even native (CADisplayLink / Choreographer) narrows but does not solve — hardware floor is 35–140 ms. |
| 6 | jsPsych touchscreen extension works for qualitative effects only | Confirmed (usable finding) | Kuroki & Miyawaki 2024: Stroop and psychometric curves *do* replicate on touchscreen. Don't use for ms-precise RT — do use for accuracy/throughput tasks. |
| 7 | FDA General Wellness Guidance (Jan 6, 2026) disqualifies "clinical-grade" and clinical-mimicking values | Confirmed verbatim | "Clinical-grade" is named as a disqualifier in the final guidance. Percentile scoring that mirrors neuropsych reporting likely trips the "diagnostic thresholds" disqualifier. |
| 8 | FTC v. Lumosity 2016: $2M, three claim categories, Jessica Rich quote | Confirmed verbatim | $50 M judgment suspended on $2 M payment. Claim categories match FTC complaint word-for-word. |
| 9 | Akili EndeavorRx is the FDA-cleared precedent for cognitive SaMD | Confirmed + cautionary | De Novo DEN200026, June 2020, prescription-only pediatric ADHD 8–12. **~9 years founded-to-cleared, ~$300 M accumulated deficit, company wound down in 2024.** FDA clearance is not a business model. |
| 10 | FTC Health Breach Notification Rule applies to non-HIPAA health apps | Confirmed + active | GoodRx $1.5 M (Feb 2023), BetterHelp $7.8 M (Mar 2023), Premom (May 2023), Monument (Apr 2024). Updated rule effective July 29, 2024 makes health-app coverage explicit. |
| 11 | HIPAA does not apply to D2C apps | Confirmed | HHS guidance is explicit. |
| 12 | GDPR Art. 9 treats cognitive data as health data | **Partially** — gray area | Clear when marketed for disease detection/monitoring; arguable for pure entertainment. Frame as use-case-dependent, not flat. |
| 13 | COPPA attaches for under-13 + biometric data | Confirmed + strengthened | 2025 final rule (compliance April 22, 2026) explicitly pulls biometric identifiers into "personal information." |
| 14 | CCPA/CPRA deletion rights | Confirmed | Plus new CPPA ADMT regs effective Jan 1, 2026 — relevant if the app algorithmically scores cognition. |
| 15 | BIPA covers behavioral/cognitive signatures | **Overstated** — only item the audit got wrong | No reported BIPA case extends to reaction-time or cognitive-performance data. Statute is limited to retina/iris/fingerprint/voiceprint/hand/face geometry. Recent federal trend tightens, not expands, BIPA scope. |
| 16 | Behavioral signatures can re-identify "anonymized" users | Confirmed | Peer-reviewed keystroke- and mouse-dynamics literature (Monrose & Rubin, Iowa State cognitive-fingerprint study, ACM Computing Surveys 2024). Reaction-time distributions are functionally analogous. Treat as pseudonymous at best. |

## Overall Verdict on the Audit

**Accept the audit.** The three load-bearing findings — (a) NCPT cannot serve as a norm, (b) mobile hardware floor prevents ms-precise RT, (c) "clinical-grade" + percentile marketing violates the 2026 FDA wellness guidance and mirrors the exact pattern FTC prosecuted Lumosity for — are all correct, sourced, and structurally fatal to the original brief.

The audit overstates BIPA exposure. Everything else holds.

## What the Audit Missed (Useful Additions)

1. **Akili is a cautionary precedent, not an aspirational one.** FDA-cleared cognitive SaMD is possible but burned ~$300 M and the company still wound down. "Just go clinical" is not a pivot — it's a different company with different funding.
2. **The jsPsych touchscreen extension actually works** for qualitative effects (Stroop, psychometric curves). This is a usable foundation if the product is scoped around *accuracy and within-user change*, not cross-user RT comparisons.
3. **FTC HBNR enforcement is more active than the audit conveyed.** Four named settlements in 18 months, all for consumer health/wellness apps.
4. **2026 regulatory environment is tightening, not loosening.** FDA's Jan 2026 wellness guidance is the strictest iteration to date, CPPA ADMT rules effective Jan 2026, COPPA amendments effective April 2026. A product designed against the 2022 landscape will be non-compliant by default at launch.
