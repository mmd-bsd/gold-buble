# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install
npm run dev          # tsx dev-server.ts: Vite middleware + /api/market on http://localhost:3000 (PORT)
npm run build        # vite build -> dist/ (no type-checking)
npm run lint         # tsc --noEmit
npm test             # tsx --test tests/*.test.ts
npm run preview      # serve the built SPA (no API)
```

Single test: `npx tsx --test --test-name-pattern="bubble" tests/engine.test.ts`

The app is a static SPA plus one stateless serverless function. There is no database, no background timer, and no Web Push. Runtime requirements: Node >= 20 for local dev (uses global `fetch`); Node >= 22 for Vercel's function runtime.

## Architecture

Two deployable pieces, no persistent server:

- `npm run build` produces the React PWA in `dist/` (`vite.config.ts`).
- `api/market.ts` is the only backend: a stateless Node handler that fetches TGJU + Digikala and returns raw collector readings. Vercel runs it as `/api/market`; `dev-server.ts` mounts the same handler for local development.

All pricing math, history, settings, alert rules and alerts live in the browser. Nothing is stored server-side, so phone and desktop have independent data and there is no monitoring while the page is closed — this is intentional.

### Request / data flow

`src/hooks/useMarketData.ts` is the single data layer:

1. `GET /api/market?stale=<sec>[&history=1]` -> `MarketApiResponse` (`shared/types.ts`).
2. `shared/snapshot.ts` turns the two collector readings plus local settings into a `MeasurementRecord` and `MarketSnapshot`.
3. New measurements are appended to local storage (deduped within 5 minutes, capped at 5,000 live points).
4. `shared/engine/alerts.ts` evaluates enabled rules against that history; resulting alerts and rule cooldowns are persisted locally.
5. `shared/history.ts` filters/downsamples local points for the chart range (max 600 points).
6. The hook polls every `refreshIntervalSec` (default 30 s) while the page is open and refetches when the tab becomes visible.

`history=1` additionally fetches 45 days of TGJU daily closes (`shared/backfill.ts`) and stores them as daily backfill points, so long-range charts work on first load. Intraday history only accumulates while the page is open.

### Money and unit rules

- Everything is stored and compared in **Toman per gram** (and USD/Toman). TGJU serves IRR (rial) per gram plus USD/IRR; Digikala serves IRR per milligram.
- All conversions go through `shared/engine/normalization.ts` (÷10 rial→toman, ×100 IRR/mg→Toman/g).
- Theoretical 18K price = `((ounceUSD × USD/IRR) / 31.1034768) × (18/24) / 10`, computed with BigInt fixed-point math. Do not replace it with floating point; tests assert exact rounded values.
- Bubble = reference price − theoretical price (positive = bubble, negative = discount). Percent is fixed-point too.
- Upstream numbers may contain Persian/Arabic digits and separators; parse them with `parsePositiveNumeric` and never coerce invalid values to 0/null silently.

### Reference price policy

`resolveReferencePrice` deliberately has policy baked in and is covered by tests:
- When both sources are valid and their difference exceeds `discrepancyThresholdToman` (default 100,000), the result is `unresolved` with a null price and `requiresUserSelection: true` unless the user picked a source. It is **never** averaged across the threshold.
- A manual override always wins (`referenceMode: 'manual'`).
- If TGJU is unavailable, the theoretical price is impossible (it needs USD + ounce), so data quality becomes `unavailable`; Digikala alone can only supply a fallback reference.
- `dataQuality` is derived in `shared/snapshot.ts`, not stored upstream.

### Alerts

- `shared/engine/alerts.ts` is pure: it returns `{ alerts, ruleUpdates }` instead of writing anywhere. Defaults live in `shared/defaults.ts` (9 seeded rules, stable ids 1–9).
- Per-rule cooldowns use `lastTriggeredAt`; edge-triggered rules (`threshold_high`, `threshold_low`, `zero_cross`) also use `lastState` so they fire on transitions.
- Window-based rules skip an anchor that is more than 2× the rule window old, preventing false "30-minute" alerts when the site was closed for days.
- Alerts are suppressed when data quality is `unavailable` or the reference is `unresolved`.

### Local persistence (`src/lib/localStore.ts`)

- `goldbubble:settings:v1` — `AppSettings` merged over `DEFAULT_SETTINGS`.
- `goldbubble:rules:v1` — alert-rule overrides merged over seeded defaults.
- `goldbubble:alerts:v1` — newest 200 alerts and acknowledgement flags.
- `goldbubble:measurements:v1` — live points, newest 5,000.
- `goldbubble:backfill:v1` — daily TGJU points, newest 60.
- All reads/writes are guarded; private mode or a full quota degrades to in-memory state. Clearing site data deletes history and settings.

### Upstream collectors

`server/collectors/tgju.ts` and `server/collectors/digikala.ts` are server-only (imported only by `api/market.ts`). They send browser-like headers, use 10 s timeouts, and keep a module-level last-valid reading for per-instance fallback. Digikala requires a cookie handshake (`redirect: 'manual'` + `Set-Cookie`). From non-Iranian datacenters Digikala may 403/time out; the app then falls back to TGJU-only (`tgju_fallback`), so do not make Digikala a hard dependency. TGJU timestamps are Asia/Tehran (+03:30).

### Frontend

- No router: `src/App.tsx` owns the active tab (dashboard/charts/alerts/settings).
- UI is Persian/RTL and dark-only (`#0B0F17`). Format all numbers/dates with `src/utils/formatters.ts` (`fa-IR`, Persian calendar); negative currency uses U+2212 `−`. New UI copy should be Persian.
- Charts use `lightweight-charts` in `BubbleChartPanel`; it receives already-downsampled `MeasurementRecord[]`.
- Tailwind v4 through `@tailwindcss/vite` — no `tailwind.config`; theme tokens live in `src/index.css`. Typography is Estedad for Persian/numerals with IBM Plex Mono for Latin-only technical strings, loaded from Google Fonts in `index.html`.
- PWA: `vite-plugin-pwa` generates the manifest/service worker for installability only. There is no push service worker; keep `navigateFallbackDenylist` for `/api/`.
- `vite.config.ts` has a build-only plugin copying `src/assets` into `dist/src/assets` for root-relative image URLs. `DISABLE_HMR=true` intentionally disables HMR/file watching; treat it as expected.

### Deployment

- `vercel.json`: Vite build, `api/market.ts` function (60 s max), SPA rewrite excluding `/api`.
- The function region matters for upstream access. Frankfurt (`fra1`) is a reasonable choice for Iran-adjacent traffic; change the function region in the Vercel project settings if Digikala/TGJU behave differently.
- Vercel Hobby is personal/non-commercial only. `*.vercel.app` reachability from Iran is unstable (sometimes whitelisted, sometimes 403s from NAT IPs); a VPN may be required.
- No environment variables are required. VAPID/Gemini settings are gone.

### Tests

`tests/engine.test.ts` covers normalization, the theoretical formula, bubble math, reference resolution, alert cooldowns/transitions, and the anchor-staleness guard. Tests are pure and use no database.
