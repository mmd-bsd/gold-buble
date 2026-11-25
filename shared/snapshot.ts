import {
  calculateBubble,
  calculateTheoretical18KToman,
  resolveReferencePrice,
} from './engine/calculator.ts';
import type {
  AppSettings,
  CollectorReading,
  DataQuality,
  DigikalaRawData,
  MarketSnapshot,
  MeasurementRecord,
  TgjuRawData,
} from './types.ts';

function computeDataQuality(
  tgju: CollectorReading<TgjuRawData>,
  digikala: CollectorReading<DigikalaRawData>,
  manualOverride: boolean
): DataQuality {
  if (manualOverride) return 'manual';
  if (tgju.status === 'unavailable' && digikala.status === 'unavailable') return 'unavailable';
  if (tgju.status === 'unavailable') return 'unavailable'; // Theoretical requires USD + Ounce from TGJU
  if (tgju.status === 'live' && digikala.status === 'live') return 'live';
  if (tgju.status === 'delayed' || digikala.status === 'delayed') return 'delayed';
  if (tgju.status === 'cached' || digikala.status === 'cached') return 'cached';
  return 'partial';
}

function deltaFrom(
  latest: MeasurementRecord,
  previous: MeasurementRecord | null
): MarketSnapshot['deltaFromPrevious'] {
  return {
    bubbleToman:
      latest.bubbleToman !== null && previous?.bubbleToman !== null && previous?.bubbleToman !== undefined
        ? latest.bubbleToman - previous.bubbleToman
        : null,
    bubblePercent:
      latest.bubblePercent !== null &&
      previous?.bubblePercent !== null &&
      previous?.bubblePercent !== undefined
        ? Number((latest.bubblePercent - previous.bubblePercent).toFixed(4))
        : null,
    referencePriceToman:
      latest.referencePriceToman !== null &&
      previous?.referencePriceToman !== null &&
      previous?.referencePriceToman !== undefined
        ? latest.referencePriceToman - previous.referencePriceToman
        : null,
    theoreticalPriceToman:
      latest.theoreticalPriceToman !== null &&
      previous?.theoreticalPriceToman !== null &&
      previous?.theoreticalPriceToman !== undefined
        ? latest.theoreticalPriceToman - previous.theoreticalPriceToman
        : null,
  };
}

function bubbleStatusOf(
  record: MeasurementRecord,
  nearZeroBandToman: number
): MarketSnapshot['bubbleStatus'] {
  return {
    sign:
      record.bubbleToman === null
        ? null
        : record.bubbleToman > 0
          ? 'positive'
          : record.bubbleToman < 0
            ? 'negative'
            : 'zero',
    isNearZero:
      record.bubbleToman !== null && Math.abs(record.bubbleToman) <= nearZeroBandToman,
  };
}

export interface MarketBuildInput {
  tgju: CollectorReading<TgjuRawData>;
  digikala: CollectorReading<DigikalaRawData>;
  settings: AppSettings;
  previous: MeasurementRecord | null;
  now: number;
}

export interface MarketBuildResult {
  record: MeasurementRecord;
  snapshot: MarketSnapshot;
}

/**
 * Builds a measurement record and snapshot from collector readings. Shared by
 * the website client so all calculations match the original server engine.
 */
export function buildMarketSnapshot(input: MarketBuildInput): MarketBuildResult {
  const { tgju, digikala, settings, previous, now } = input;

  const tgjuValid = tgju.data !== null && tgju.status !== 'unavailable';
  const digikalaValid = digikala.data !== null && digikala.status !== 'unavailable';

  const usdIrr = tgju.data?.usdIrr ?? null;
  const usdToman = tgju.data?.usdToman ?? null;
  const globalOunceUsd = tgju.data?.onsUsd ?? null;
  const tgjuGold18Toman = tgju.data?.gold18TomanPerGram ?? null;
  const digikalaGold18Toman = digikala.data?.gold18TomanPerGram ?? null;

  const theoreticalPriceToman =
    tgjuValid && usdIrr !== null && globalOunceUsd !== null
      ? calculateTheoretical18KToman(globalOunceUsd, usdIrr).roundedToman
      : null;

  const refRes = resolveReferencePrice({
    tgjuToman: tgjuGold18Toman,
    digikalaToman: digikalaGold18Toman,
    tgjuValid,
    digikalaValid,
    autoAveraging: settings.autoAveraging,
    discrepancyThresholdToman: settings.discrepancyThresholdToman,
    preferredSource: settings.preferredSource,
    manualOverrideEnabled: settings.manualOverrideEnabled,
    manualOverridePriceToman: settings.manualOverridePriceToman,
  });

  const bubbleRes =
    refRes.referencePriceToman !== null && theoreticalPriceToman !== null
      ? calculateBubble(refRes.referencePriceToman, theoreticalPriceToman, settings.nearZeroBandToman)
      : null;

  const dataQuality = computeDataQuality(tgju, digikala, refRes.referenceMode === 'manual');

  const record: MeasurementRecord = {
    id: now,
    timestamp: now,
    usdIrr,
    usdToman,
    globalOunceUsd,
    tgjuGold18Toman,
    digikalaGold18Toman,
    referencePriceToman: refRes.referencePriceToman,
    referenceMode: refRes.referenceMode,
    theoreticalPriceToman,
    bubbleToman: bubbleRes?.bubbleToman ?? null,
    bubblePercent: bubbleRes?.bubblePercent ?? null,
    discrepancyToman: refRes.discrepancyToman,
    discrepancyExceeded: refRes.discrepancyExceeded,
    dataQuality,
    tgjuStatus: tgju.status,
    digikalaStatus: digikala.status,
    tgjuSourceTs: tgju.sourceTimestamp,
    digikalaSourceTs: digikala.sourceTimestamp,
  };

  const snapshot: MarketSnapshot = {
    latest: record,
    previous,
    deltaFromPrevious: deltaFrom(record, previous),
    collectors: {
      tgju: {
        ...tgju,
        ageSeconds: tgju.sourceTimestampMs
          ? Math.max(0, Math.floor((now - tgju.sourceTimestampMs) / 1000))
          : tgju.ageSeconds,
      },
      digikala: {
        ...digikala,
        ageSeconds: digikala.sourceTimestampMs
          ? Math.max(0, Math.floor((now - digikala.sourceTimestampMs) / 1000))
          : digikala.ageSeconds,
      },
    },
    discrepancy: {
      active: refRes.discrepancyExceeded,
      differenceToman: refRes.discrepancyToman,
      thresholdToman: settings.discrepancyThresholdToman,
      requiresSelection: refRes.requiresUserSelection,
      tgjuPriceToman: tgjuGold18Toman,
      digikalaPriceToman: digikalaGold18Toman,
    },
    bubbleStatus: bubbleStatusOf(record, settings.nearZeroBandToman),
    serverTime: now,
    nextRefreshAt: now + Math.max(10, settings.refreshIntervalSec) * 1000,
  };

  return { record, snapshot };
}

/** Snapshot built purely from the last stored measurement (offline / first paint). */
export function buildSnapshotFromStored(
  latest: MeasurementRecord,
  previous: MeasurementRecord | null,
  settings: AppSettings,
  now = Date.now()
): MarketSnapshot {
  const ageSeconds = Math.max(0, Math.floor((now - latest.timestamp) / 1000));

  return {
    latest,
    previous,
    deltaFromPrevious: deltaFrom(latest, previous),
    collectors: {
      tgju: {
        source: 'tgju',
        status: latest.tgjuStatus,
        data: null,
        fetchedAt: latest.timestamp,
        sourceTimestamp: latest.tgjuSourceTs,
        sourceTimestampMs: latest.timestamp,
        ageSeconds,
        latencyMs: 0,
        error: null,
      },
      digikala: {
        source: 'digikala',
        status: latest.digikalaStatus,
        data: null,
        fetchedAt: latest.timestamp,
        sourceTimestamp: latest.digikalaSourceTs,
        sourceTimestampMs: latest.timestamp,
        ageSeconds,
        latencyMs: 0,
        error: null,
      },
    },
    discrepancy: {
      active: latest.discrepancyExceeded,
      differenceToman: latest.discrepancyToman,
      thresholdToman: settings.discrepancyThresholdToman,
      requiresSelection: latest.referenceMode === 'unresolved',
      tgjuPriceToman: latest.tgjuGold18Toman,
      digikalaPriceToman: latest.digikalaGold18Toman,
    },
    bubbleStatus: bubbleStatusOf(latest, settings.nearZeroBandToman),
    serverTime: now,
    nextRefreshAt: now + Math.max(10, settings.refreshIntervalSec) * 1000,
  };
}
