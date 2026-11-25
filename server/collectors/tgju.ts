import type { CollectorReading, SourceStatus, TgjuRawData } from '../../shared/types.ts';
import {
  parsePositiveNumeric,
  parseTgjuTehranTimestamp,
  tgjuRialPerGramToToman,
  usdRialToToman,
} from '../engine/normalization.ts';

const TGJU_LIVE_URL = 'https://call1.tgju.org/ajax.json';
const TGJU_HISTORY_BASE_URL = 'https://api.tgju.org/v1/market/indicator/summary-table-data';

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  Referer: 'https://www.tgju.org/',
};

interface TgjuSymbolEntry {
  p?: unknown;
  dp?: unknown;
  dt?: unknown;
  ts?: unknown;
}

interface TgjuAjaxPayload {
  current?: {
    price_dollar_rl?: TgjuSymbolEntry;
    geram18?: TgjuSymbolEntry;
    ons?: TgjuSymbolEntry;
  };
}

let lastValidReading: CollectorReading<TgjuRawData> | null = null;

export async function collectTgju(staleThresholdSec: number): Promise<CollectorReading<TgjuRawData>> {
  const startedAt = Date.now();
  try {
    const response = await fetch(TGJU_LIVE_URL, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from TGJU feed`);
    }

    const payload = (await response.json()) as TgjuAjaxPayload;
    const current = payload?.current;
    if (!current) {
      throw new Error('Missing current object in TGJU payload');
    }

    const usdEntry = current.price_dollar_rl;
    const goldEntry = current.geram18;
    const onsEntry = current.ons;

    const usdIrr = parsePositiveNumeric(usdEntry?.p);
    const gold18IrrPerGram = parsePositiveNumeric(goldEntry?.p);
    const onsUsd = parsePositiveNumeric(onsEntry?.p);

    if (usdIrr === null || gold18IrrPerGram === null || onsUsd === null) {
      throw new Error(
        `Invalid numeric values in TGJU payload (usd=${usdEntry?.p}, geram18=${goldEntry?.p}, ons=${onsEntry?.p})`
      );
    }

    const usdTsStr = typeof usdEntry?.ts === 'string' ? usdEntry.ts : null;
    const goldTsStr = typeof goldEntry?.ts === 'string' ? goldEntry.ts : null;
    const onsTsStr = typeof onsEntry?.ts === 'string' ? onsEntry.ts : null;

    const tsCandidates = [
      parseTgjuTehranTimestamp(usdTsStr),
      parseTgjuTehranTimestamp(goldTsStr),
      parseTgjuTehranTimestamp(onsTsStr),
    ].filter((v): v is number => v !== null);

    // Use the oldest critical symbol timestamp for conservative staleness detection
    const oldestSourceMs = tsCandidates.length > 0 ? Math.min(...tsCandidates) : null;
    const newestSourceMs = tsCandidates.length > 0 ? Math.max(...tsCandidates) : null;
    const now = Date.now();
    const ageSeconds = oldestSourceMs !== null ? Math.max(0, Math.floor((now - oldestSourceMs) / 1000)) : null;

    const status: SourceStatus =
      ageSeconds !== null && ageSeconds > staleThresholdSec ? 'delayed' : 'live';

    const data: TgjuRawData = {
      usdIrr,
      usdToman: usdRialToToman(usdIrr),
      gold18IrrPerGram,
      gold18TomanPerGram: tgjuRialPerGramToToman(gold18IrrPerGram),
      onsUsd,
      usdTimestamp: usdTsStr,
      goldTimestamp: goldTsStr,
      onsTimestamp: onsTsStr,
      usdChangePercent: typeof usdEntry?.dp === 'number' ? (usdEntry.dt === 'low' ? -usdEntry.dp : usdEntry.dp) : null,
      goldChangePercent: typeof goldEntry?.dp === 'number' ? (goldEntry.dt === 'low' ? -goldEntry.dp : goldEntry.dp) : null,
      onsChangePercent: typeof onsEntry?.dp === 'number' ? (onsEntry.dt === 'low' ? -onsEntry.dp : onsEntry.dp) : null,
    };

    const reading: CollectorReading<TgjuRawData> = {
      source: 'tgju',
      status,
      data,
      fetchedAt: now,
      sourceTimestamp: goldTsStr ?? usdTsStr,
      sourceTimestampMs: newestSourceMs,
      ageSeconds,
      latencyMs: Date.now() - startedAt,
      error: null,
    };

    lastValidReading = reading;
    return reading;
  } catch (err) {
    const now = Date.now();
    const message = err instanceof Error ? err.message : 'Unknown TGJU error';

    if (lastValidReading && lastValidReading.data) {
      const ageSeconds = Math.max(0, Math.floor((now - lastValidReading.fetchedAt) / 1000));
      return {
        ...lastValidReading,
        status: 'cached',
        ageSeconds,
        latencyMs: Date.now() - startedAt,
        error: `خطا در دریافت زنده (${message})؛ استفاده از آخرین داده معتبر`,
      };
    }

    return {
      source: 'tgju',
      status: 'unavailable',
      data: null,
      fetchedAt: now,
      sourceTimestamp: null,
      sourceTimestampMs: null,
      ageSeconds: null,
      latencyMs: Date.now() - startedAt,
      error: message,
    };
  }
}

export interface TgjuHistoricalDay {
  dateGregorian: string;
  timestampMs: number;
  closeValue: number;
}

export async function fetchTgjuDailyHistory(
  slug: 'price_dollar_rl' | 'geram18' | 'ons',
  days = 45
): Promise<TgjuHistoricalDay[]> {
  try {
    const url = `${TGJU_HISTORY_BASE_URL}/${slug}?length=${Math.min(Math.max(days, 1), 180)}`;
    const response = await fetch(url, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return [];
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return [];
    }

    const payload = (await response.json()) as { data?: unknown[] };
    if (!Array.isArray(payload?.data)) {
      return [];
    }

    const results: TgjuHistoricalDay[] = [];
    for (const row of payload.data) {
      if (!Array.isArray(row) || row.length < 7) continue;
      const closeValue = parsePositiveNumeric(row[3]);
      const gregorian = typeof row[6] === 'string' ? row[6].trim() : '';
      if (closeValue === null || !/^\d{4}\/\d{2}\/\d{2}$/.test(gregorian)) continue;
      const isoDate = `${gregorian.replaceAll('/', '-')}T14:00:00+03:30`;
      const timestampMs = Date.parse(isoDate);
      if (!Number.isFinite(timestampMs)) continue;
      results.push({ dateGregorian: gregorian, timestampMs, closeValue });
    }

    return results.sort((a, b) => a.timestampMs - b.timestampMs);
  } catch {
    return [];
  }
}
