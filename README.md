# Iranian Gold Bubble Monitor

Persian-language website that compares the domestic 18K gold price with its theoretical value from global gold and USD rates, draws charts, and raises in-page volatility alerts.

It is a **static React app plus one stateless API function**. There is no database and no background process: data refreshes while the page is open, and history/settings/alerts are stored in your browser.

## Local development

```bash
npm install
npm run dev      # http://localhost:3000
npm test
npm run lint
npm run build
```

`npm run dev` serves the SPA through Vite and mounts the same `api/market.ts` handler that Vercel runs.

## Deploy to Vercel (free)

1. Push this repo to GitHub.
2. In Vercel, choose **Add New → Project** and import the repository.
3. Keep the detected **Vite** settings (build `npm run build`, output `dist`). `vercel.json` supplies the rest.
4. Deploy. Vercel gives you `https://<project-name>.vercel.app`.

Optional: in **Project → Settings → Functions**, set the region to **Frankfurt (fra1)** for lower latency to Iran and better odds with the upstream price APIs. Digikala occasionally blocks non-Iranian datacenter IPs; the app automatically falls back to TGJU-only data.

### One-click access

- **Android:** open the URL in Chrome → menu → **Add to Home screen** (or the in-app install button).
- **Desktop:** open the URL in Chrome/Edge → install icon in the address bar → **Install**. This creates a desktop shortcut that opens the site in one click.

### Important limitations

- No alerts while the page is closed (no Web Push, by design).
- History and settings are per browser/device — phone and desktop do not share them.
- Vercel Hobby is for personal, non-commercial use.
- `*.vercel.app` is sometimes filtered inside Iran; a VPN may be needed. Test from your actual network.
- Upstream feeds (TGJU, Digikala) are unofficial and may rate-limit or geo-restrict; failures degrade to cached/single-source data.

## How it works

- `api/market.ts` fetches TGJU and Digikala readings (no computation, no storage).
- The browser computes the theoretical price, reference price and bubble using the shared engine in `shared/`.
- `src/hooks/useMarketData.ts` polls, persists history, and evaluates alert rules locally.
- `shared/backfill.ts` supplies 45 days of daily closes on first load.
