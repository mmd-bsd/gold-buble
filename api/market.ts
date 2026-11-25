import type { IncomingMessage, ServerResponse } from 'node:http';
import { collectDigikala } from '../server/collectors/digikala.ts';
import { collectTgju, fetchTgjuDailyHistory } from '../server/collectors/tgju.ts';
import { buildBackfillMeasurements } from '../shared/backfill.ts';
import type {
  CollectorReading,
  DigikalaRawData,
  MeasurementRecord,
  TgjuRawData,
} from '../shared/types.ts';

interface MarketApiResponse {
  tgju: CollectorReading<TgjuRawData>;
  digikala: CollectorReading<DigikalaRawData>;
  history?: MeasurementRecord[];
  serverTime: number;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(payload);
}

/**
 * Stateless market endpoint: fetches the two upstream sources, normalizes
 * them, and returns raw collector readings. All pricing math, persistence
 * and alerting happen in the browser.
 */
export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'فقط درخواست GET پشتیبانی می‌شود.' });
    return;
  }

  try {
    const url = new URL(req.url ?? '/api/market', 'http://localhost');
    const staleParam = Number(url.searchParams.get('stale'));
    const staleThresholdSec =
      Number.isFinite(staleParam) && staleParam >= 30 && staleParam <= 86400
        ? Math.round(staleParam)
        : 300;
    const includeHistory = url.searchParams.get('history') === '1';

    const [tgju, digikala] = await Promise.all([
      collectTgju(staleThresholdSec),
      collectDigikala(),
    ]);

    let history: MeasurementRecord[] | undefined;
    if (includeHistory) {
      try {
        const [usdHist, goldHist, onsHist] = await Promise.all([
          fetchTgjuDailyHistory('price_dollar_rl', 45),
          fetchTgjuDailyHistory('geram18', 45),
          fetchTgjuDailyHistory('ons', 45),
        ]);
        history = buildBackfillMeasurements(usdHist, goldHist, onsHist);
      } catch {
        // Backfill is best-effort; live data is still returned.
        history = [];
      }
    }

    const body: MarketApiResponse = {
      tgju,
      digikala,
      history,
      serverTime: Date.now(),
    };
    sendJson(res, 200, body);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'خطای ناشناخته';
    sendJson(res, 500, { error: `خطا در دریافت داده بازار: ${message}` });
  }
}
