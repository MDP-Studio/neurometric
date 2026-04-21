# Deployment + Origin Policy

## The origin problem (read this first)

IndexedDB is scoped by origin. If you collect 30 sessions at `http://192.168.1.49:5173` and later deploy to `https://neurometric.example.com`, the second origin has zero data. The browser treats them as completely separate storage buckets. There is no built-in way to migrate.

This means: **choose your permanent origin before session 1, not after session 30.**

## Options

### Option A — Local HTTPS dev server, your LAN only (what's running now)

- **How:** `npm run dev` starts Vite with self-signed HTTPS on every LAN interface. Open the URL it prints on your phone. Accept the certificate warning once.
- **Pros:** free, zero config, data never leaves your house, HTTPS means PWA install works fully (service worker registers, offline caching).
- **Cons:** your phone has to be on the same Wi-Fi. Self-signed cert = scary warning the first time (accept → trusted for that cert's lifetime on that device). IP address may change if your router's DHCP lease rotates — new IP = new origin = new baseline. Book-mark by IP and give your computer a static DHCP reservation if you go this route long-term.
- **Origin:** `https://<your-static-lan-ip>:5173`
- **Recommended:** set a DHCP reservation on your router so the IP never changes.

### Option B — GitHub Pages

- **How:** push the repo to a public GitHub repo, add a GitHub Actions workflow that runs `npm run build` and publishes `dist/` to `gh-pages`. GitHub Pages serves it at `https://<user>.github.io/<repo>/` with free HTTPS.
- **Pros:** free, HTTPS, permanent URL, works from any network.
- **Cons:** **the app code is public** (your data never leaves your device, but anyone can read your source). Also, subpath deployment (`/neurometric/`) requires `base: "/neurometric/"` in `vite.config.ts`.
- **Origin:** `https://<user>.github.io` (origin is host only — the subpath doesn't change the origin, so all data stays together regardless of which repo you deploy to).

### Option C — Cloudflare Pages (private)

- **How:** connect a Cloudflare Pages project to the repo. Use Cloudflare Access to put the whole site behind a login (magic link, Google SSO, etc.). Free tier covers this.
- **Pros:** free, HTTPS, permanent URL, code is private (behind your login), fast CDN.
- **Cons:** one extra service to manage. Cloudflare Access session cookies have their own TTL; re-auth occasionally.
- **Origin:** `https://<project>.pages.dev` (or a custom domain).

### Option D — Netlify with password

- Similar to C. Free tier + password protection on the site.

### Option E — Tailscale-only deploy

- Deploy anywhere, then restrict access to your Tailscale network (e.g., a free Caddy on a $5 VPS with a Tailscale-only listener). Solo nerd mode. Mentioned for completeness.

## Recommendation

For a personal tool: **Option A for the first month, then migrate to B or C once you know you're committed.** Option A costs nothing and gives you full PWA. If you outgrow it (phone roams to other networks, want a permanent home-screen icon that doesn't rely on LAN), migrate with an explicit export → import step (see below).

Commit to the choice. Origin-hopping mid-experiment destroys the baseline.

## Migration protocol (if you must move origins later)

1. **Before** switching: hit "Export JSON" on the home screen. Save the file to cloud storage or equivalent.
2. Deploy to the new origin.
3. Open the new-origin app in your phone's browser. Confirm a fresh state (0 sessions).
4. Use the (future) import button to load the exported JSON. All imported sessions carry an `importedFrom` marker and are treated as a **separate baseline window** from native-origin sessions. No silent merging.
5. From now on, the new origin is the canonical one. The old one is dead. If you re-open the old URL, the app will happily start a new baseline there — don't.

## Running the app

### Dev mode (HTTPS, HMR, what you want during development)

```
npm run dev
```

Vite prints URLs. On this computer: `https://localhost:5173`. On your phone on the same Wi-Fi: one of the `192.168.*` URLs (whichever matches your router's subnet).

First time on your phone: the browser will warn about the self-signed cert. Click through — "advanced" or "show details" → "visit this site anyway." Some browsers remember; some ask each time.

### Production preview (what the installed PWA actually runs)

```
npm run build
npm run preview
```

Serves the optimized build on `https://localhost:4173` (also `host: true`, so LAN too). Service worker caching behaves correctly in this mode (dev mode's HMR can interfere with the SW fetch handler).

### "Add to Home Screen" on iOS

1. Open the HTTPS URL in Safari.
2. Share sheet → Add to Home Screen.
3. Launched from the home-screen icon, the app opens in standalone mode (no Safari chrome, no address bar). This is what the PWA manifest configures.

### "Install app" on Android Chrome

Chrome shows an install prompt when the manifest + HTTPS + service worker all check out. Accept it. Same standalone behavior.

## Cost check (per your "free tier" requirement)

| Option | Monthly cost | Cost driver |
|---|---|---|
| A (local HTTPS dev) | $0 | Free forever |
| B (GitHub Pages) | $0 | Free for public repos |
| C (Cloudflare Pages + Access) | $0 | Free tier is 500 builds/mo, Access up to 50 users |
| D (Netlify + password) | $0 for starter | Pro tier ($19/mo) has better password-protect |
| E (Tailscale + $5 VPS) | $5/mo | VPS |

All options except E are genuinely free for this use case.

## One last honest warning

IndexedDB on iOS Safari is not indestructible. Safari aggressively reclaims storage for sites it considers inactive. If you don't open the app for 7 days, your data **can** be wiped (Storage Access API heuristics). Countermeasures:

- Add the site to your home screen so iOS treats it as "installed" — this changes the eviction policy.
- Export at least once every 5 sessions (the built-in reminder enforces this).
- Don't use Private Browsing for sessions. Ever.

On Android Chrome and desktop browsers the eviction risk is much lower, but "low" is not "zero." The export reminder exists because the platform makes no guarantees.
