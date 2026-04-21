# NeuroMetric

Personal cognitive self-assessment instrument. Within-subject, on-device, honest.

A multi-mode personal-science suite with a timing-precise cognitive-task battery at its core. Built as a real tool, not a product — no marketing, no percentiles, no "clinical-grade" claims, no pretending mobile hardware can do things it can't.

## What this is

- A PWA that measures inhibitory control, interference control, short-term / working memory, and working-memory updating on your own device, over time, against your own rolling baseline.
- An honest methodology pre-committed in [`tasks/methodology.md`](tasks/methodology.md): task assignment is algorithmic (not user-picked), context capture is split between objective pre-task and arousal-sensitive post-task, device fingerprint is split into timing-relevant vs forensic-only, and there are five pre-registered hypotheses tested at α = 0.01.
- A multi-mode scaffold (Sampling Tracker, Reflection Library, Big Five IPIP-NEO-120, Joint Notice, Reflecting Mirror) behind a Supabase auth layer with Row-Level Security and opt-in-per-item pair sharing. Schema and policies are in [`supabase/migrations/001_init.sql`](supabase/migrations/001_init.sql). UIs for these modes are not implemented yet — the cognitive tracker is fully implemented.

## What this is not

- Not a medical device. Does not diagnose anything.
- Not a benchmark against other people. Does not compute or display percentiles.
- Not a brain-training app. The published evidence for cognitive-training transfer is weak; the app does not claim otherwise.
- Not maintained for external use. Public so it's readable; not a product.

## Running

```
npm install
npm run dev
```

HTTP on `http://localhost:5173`. For PWA install testing on a phone:

```
npm run dev:https
```

See [`tasks/deployment.md`](tasks/deployment.md) for deployment options.

## Stack

- Vite + TypeScript, strict
- IndexedDB local-first for cognitive sessions (authoritative for timing precision)
- Supabase (Postgres + Auth + RLS) for the multi-mode cloud layer; optional
- No analytics SDKs, no cloud LLM calls, no third-party behavioral event streams
- PWA manifest + service worker for home-screen install

## Multi-mode setup (optional)

The Cognitive Self-Tracking mode runs fully local-first without any backend. The other modes require a Supabase project. See [`tasks/accounts-deployment.md`](tasks/accounts-deployment.md) for:

- Creating the Supabase project
- Running `supabase/migrations/001_init.sql`
- Configuring `.env.local` (from `.env.example`)
- Verifying Row-Level Security with two test accounts before real data

## Design system

"The Observational Monolith" — sharp edges, monospace data, lavender primary, amber uncertainty indicator, cool-tone palette on `#131313`. Spec in `stitch_cognitive_baseline_instrument/observatory_precision/DESIGN.md`.

## Methodology

Read [`tasks/methodology.md`](tasks/methodology.md) before running a single session. Every choice is pre-committed; changing any of them mid-collection invalidates the baseline. Highlights:

- Task assignment is algorithmic, not user-picked (selection bias would contaminate correlations).
- Stimulus onset timestamps use double-`requestAnimationFrame` so the value reflects painted frame, not DOM mutation.
- Response capture uses `pointerdown`, not `click`, to avoid the 50–300ms synthetic-click delay on mobile.
- Device-adjusted RT subtracts the session baseline-tap median. Does not claim to remove the full hardware floor.
- ICC checks gated at N ≥ 30 per task. Hypothesis tests gated at N ≥ 50.
- Stop conditions are pre-committed: hard stop at 60 assigned sessions if no plateau; soft stop at 6 months if compliance < 40%.

## Status

Cognitive Self-Tracking mode: implemented (four tasks — Go/No-Go, Stroop, Digit Span, N-Back 2-back).
Sampling Tracker, Reflection Library, Big Five, Joint Notice, Reflecting Mirror: data layer + RLS shipped; UIs to be built.
