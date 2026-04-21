# Accounts + Pairing — Setup

The app runs in **local-only** mode without any backend setup (Cognitive Self-Tracking works fully). Multi-mode features (Sampling Tracker, Reflection Library, Joint Notice, Big Five, Mirror) require a Supabase project.

## One-time Supabase setup

1. Create a free Supabase project at <https://app.supabase.com>. Pick a region close to you.
2. In the project dashboard → **Settings → API** you'll find:
   - `Project URL` → this becomes `VITE_SUPABASE_URL`
   - `anon / public` key → this becomes `VITE_SUPABASE_ANON_KEY`
3. In the project dashboard → **SQL Editor**, open a new query, paste the entire contents of [`supabase/migrations/001_init.sql`](../supabase/migrations/001_init.sql), and run. This creates every table, enum, function, trigger, and Row-Level Security policy.
4. Copy `.env.example` → `.env.local` at the project root, fill in the URL and anon key.
5. Restart the dev server (`npm run dev`). The Account screen now shows the sign-in / sign-up flow.

## Verifying RLS works

Before trusting any of this with real data, prove cross-user isolation:

1. Create two test accounts (`alice@test` and `bob@test`).
2. Sign in as alice, create a sample, a reflection, and run a Cognitive session.
3. Sign out. Sign in as bob. Confirm bob sees **zero** rows from alice anywhere.
4. Pair the two accounts (alice generates invite code, bob accepts). Confirm bob still sees **zero** of alice's rows — pairing alone does not share anything. Each share is per-item.
5. Back as alice, explicitly share one sample. Confirm bob now sees that one sample only.
6. Alice revokes the pairing. Confirm bob immediately sees zero of alice's rows, including the previously-shared one.

If any of those steps fails to isolate as described, **do not use with real data**. Re-run the migration.

## Two-user deployment

### Option A — Run the dev server, pair over LAN
You both run the same dev server on the same network. Each of you signs in with your own email. Simplest if you live together; works for a quick trial. Downsides: only works on the LAN, and you both share one `.env.local`.

### Option B — Deploy once, two phones
Deploy the built PWA to any HTTPS host (Cloudflare Pages, Netlify, GitHub Pages). Both of you open the public URL, sign up with separate emails. This is the normal shape.

Build and preview production locally:

```
npm run build
npm run preview
```

Deploy `dist/` to your host. Supabase env vars are baked into the build; anon-key is a public key and is safe to ship (RLS does the work).

## Dev commands

All scripts are cross-platform (Windows PowerShell, cmd, macOS, Linux):

| Script | What it does |
|---|---|
| `npm run dev` | HTTP dev server on `:5173` (default — works with every browser) |
| `npm run dev:https` | HTTPS dev server with self-signed cert — for PWA install testing on phone |
| `npm run build` | Typecheck + production build into `dist/` |
| `npm run preview` | Serve the built `dist/` over HTTP on `:4173` |
| `npm run preview:https` | Same, but HTTPS |
| `npm run typecheck` | Type-check only, no build |

Prefer `npm run dev:https` over raw env-var syntax unless you know the shell quoting for your terminal.

## Mode sharing summary

| Mode | Default | Sharable? | Granularity |
|---|---|---|---|
| Cognitive Self-Tracking | Local-first, synced if authed | **Never** | — |
| Sampling Tracker | Private | Yes | Per sample |
| Reflection Library | Private | Yes | Per entry |
| Big Five results | Private | Yes | Per result |
| Reflecting Mirror | Private | **Never** | — |
| Joint Notice | Paired only | Reciprocal reveal | Round-based |

Cognitive scores and Mirror readings have no share table, no share policy, and no UI path to share. This is a structural firewall, not a UI choice.

## Account-delete mechanics

Clicking "Delete account" in the Account screen:

1. Revokes every pairing the user is part of (symmetric relationships don't orphan).
2. Calls `public.delete_my_account()` which purges every row the user owns across all tables.
3. Signs out locally.

**What it does not do** from the browser: remove the `auth.users` row itself. Supabase's anon client cannot call `auth.admin.deleteUser()`. If you want auth-row removal too, add an Edge Function (template below) and call it from the account-delete flow.

Edge function (`supabase/functions/delete-self/index.ts`, for later):

```ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
Deno.serve(async (req) => {
  const jwt = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!jwt) return new Response("unauthorized", { status: 401 });
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: userResp } = await admin.auth.getUser(jwt);
  if (!userResp.user) return new Response("unauthorized", { status: 401 });
  await admin.auth.admin.deleteUser(userResp.user.id);
  return new Response("ok");
});
```

Deploy with `supabase functions deploy delete-self`. Then in `account.ts#deleteAccount` add a `supabase.functions.invoke("delete-self")` call before `signOut()`.

For a two-user deployment this is optional. All sensitive data is in the public-schema tables and is purged by the existing RPC.

## Privacy notes

- All data at rest in Supabase is encrypted by default.
- All data in transit is HTTPS (Supabase + your deploy host).
- The anon key is public; RLS is the only thing between accounts. Test it (section above).
- The user's password is never stored by your app — Supabase Auth handles it.
- Magic-link sign-in is available as an alternative to passwords. Supabase sends the email; you don't handle it.

## Current state of the codebase

Shipped this pass:

- Schema + RLS for all modes (`supabase/migrations/001_init.sql`).
- Auth: email+password, magic link, sign-out, account delete, export-everything.
- Pairing: invite / accept / revoke, active-partner lookup, symmetric visibility via `is_paired_with()`.
- Cognitive-session sync: local-first authoritative, best-effort cloud mirror on session save. Never called inside a trial loop.
- Home menu lists all five modes with lock states reflecting auth + pairing.
- Account settings UI: identity, pairing (generate / accept / revoke), sync, export, delete.

**Not yet built** (mode skeletons in home menu, data layer ready):

- Sampling Tracker UI (week 2 per the spec — highest-leverage mode).
- Joint Notice UI (week 3).
- Reflection Library + IPIP-NEO-120 (week 4).
- Reflecting Mirror (last, with LLM prompt design).

Everything below the UI layer for those modes is already in the database — the tables, policies, and symmetric-reveal trigger logic (for Joint Notice) are in the migration. Next build pass only has to write the views.
