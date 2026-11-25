import type { CollectorReading, DigikalaRawData, SourceStatus } from '../../shared/types.ts';
import { digikalaRialPerMgToTomanPerGram, parsePositiveNumeric } from '../engine/normalization.ts';

const DIGIKALA_PRICES_URL = 'https://api.digikala.com/wealth/v1/prices/';

const BASE_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  Origin: 'https://www.digikala.com',
  Referer: 'https://www.digikala.com/wealth/landing/',
};

interface DigikalaPriceResponse {
  gold18?: {
    price?: unknown;
    ttl?: unknown;
  };
}

let cachedCdnCookie: string | null = null;
let lastValidReading: CollectorReading<DigikalaRawData> | null = null;

async function fetchWithCdnCookie(): Promise<Response> {
  if (cachedCdnCookie) {
    const res = await fetch(DIGIKALA_PRICES_URL, {
      headers: { ...BASE_HEADERS, Cookie: cachedCdnCookie },
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 200) {
      return res;
    }
    // Cookie expired or rotated; clear and perform fresh handshake
    cachedCdnCookie = null;
  }

  const handshake = await fetch(DIGIKALA_PRICES_URL, {
    headers: BASE_HEADERS,
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
  });

  if (handshake.status === 200) {
    return handshake;
  }

  if (handshake.status === 307 || handshake.status === 302) {
    const setCookie = handshake.headers.get('set-cookie');
    const cookiePair = setCookie ? setCookie.split(';')[0]?.trim() : '';
    if (!cookiePair) {
      throw new Error('Digikala CDN redirect did not provide digicdn_cookie');
    }
    cachedCdnCookie = cookiePair;

    return fetch(DIGIKALA_PRICES_URL, {
      headers: { ...BASE_HEADERS, Cookie: cachedCdnCookie },
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    });
  }

  throw new Error(`Unexpected status ${handshake.status} during Digikala handshake`);
}

export async function collectDigikala(): Promise<CollectorReading<DigikalaRawData>> {
  const startedAt = Date.now();
  try {
    const response = await fetchWithCdnCookie();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from Digikala Wealth API`);
    }

    const payload = (await response.json()) as DigikalaPriceResponse;
    const gold18 = payload?.gold18;
    const irrPerMg = parsePositiveNumeric(gold18?.price);
    if (irrPerMg === null) {
      throw new Error(`Invalid gold18.price value from Digikala: ${String(gold18?.price)}`);
    }

    const ttlSeconds =
      typeof gold18?.ttl === 'number' && Number.isFinite(gold18.ttl) && gold18.ttl > 0
        ? gold18.ttl
        : 60;

    const now = Date.now();
    const data: DigikalaRawData = {
      gold18IrrPerMg: irrPerMg,
      gold18TomanPerGram: digikalaRialPerMgToTomanPerGram(irrPerMg),
      ttlSeconds,
      purity: '18K',
      rawUnit: 'IRR/mg',
    };

    const status: SourceStatus = 'live';
    const reading: CollectorReading<DigikalaRawData> = {
      source: 'digikala',
      status,
      data,
      fetchedAt: now,
      sourceTimestamp: new Date(now).toISOString(),
      sourceTimestampMs: now,
      ageSeconds: 0,
      latencyMs: Date.now() - startedAt,
      error: null,
    };

    lastValidReading = reading;
    return reading;
  } catch (err) {
    const now = Date.now();
    const message = err instanceof Error ? err.message : 'Unknown Digikala error';

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
      source: 'digikala',
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
