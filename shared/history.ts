import type { ChartRange, HistoryResponse, MeasurementRecord } from './types.ts';

const RANGE_MS: Record<ChartRange, number | null> = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  all: null,
};

/** Merges measurement lists, deduplicating by timestamp (later lists win) and sorting ascending. */
export function mergeMeasurements(...lists: MeasurementRecord[][]): MeasurementRecord[] {
  const byTimestamp = new Map<number, MeasurementRecord>();
  for (const list of lists) {
    for (const point of list) {
      if (!Number.isFinite(point.timestamp)) continue;
      byTimestamp.set(point.timestamp, point);
    }
  }
  return [...byTimestamp.values()].sort((a, b) => a.timestamp - b.timestamp);
}

function downsample(points: MeasurementRecord[], maxPoints: number): MeasurementRecord[] {
  if (points.length <= maxPoints) return points;
  // Even-stride downsampling preserving first and last point
  const step = (points.length - 1) / (maxPoints - 1);
  const sampled: MeasurementRecord[] = [];
  for (let i = 0; i < maxPoints; i++) {
    sampled.push(points[Math.round(i * step)]);
  }
  return sampled;
}

export function getHistoryResponse(
  allPoints: MeasurementRecord[],
  range: ChartRange,
  now = Date.now(),
  maxPoints = 600
): HistoryResponse {
  const windowMs = RANGE_MS[range];
  const cutoff = windowMs !== null ? now - windowMs : 0;

  const points = allPoints
    .filter((p) => p.timestamp >= cutoff && p.timestamp <= now + 60_000)
    .sort((a, b) => a.timestamp - b.timestamp);

  return {
    range,
    points: downsample(points, maxPoints),
    totalCount: points.length,
  };
}

/**
 * Mirrors the old server-side dedupe: identical snapshots within 5 minutes are
 * not stored again.
 */
export function isDuplicateMeasurement(
  latest: MeasurementRecord | null,
  next: MeasurementRecord
): boolean {
  if (!latest) return false;
  const fiveMinMs = 5 * 60 * 1000;
  return (
    Math.abs(next.timestamp - latest.timestamp) < fiveMinMs &&
    latest.usdIrr === next.usdIrr &&
    latest.globalOunceUsd === next.globalOunceUsd &&
    latest.tgjuGold18Toman === next.tgjuGold18Toman &&
    latest.digikalaGold18Toman === next.digikalaGold18Toman &&
    latest.referencePriceToman === next.referencePriceToman &&
    latest.referenceMode === next.referenceMode &&
    latest.dataQuality === next.dataQuality
  );
}
