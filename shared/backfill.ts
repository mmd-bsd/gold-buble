import { calculateBubble, calculateTheoretical18KToman } from './engine/calculator.ts';
import { tgjuRialPerGramToToman, usdRialToToman } from './engine/normalization.ts';
import type { MeasurementRecord } from './types.ts';

export interface DailySeriesPoint {
  dateGregorian: string;
  timestampMs: number;
  closeValue: number;
}

/**
 * Joins TGJU daily USD, gold18 and global ounce series into backfill
 * measurements. Only dates where all three inputs exist are used.
 */
export function buildBackfillMeasurements(
  usdHist: DailySeriesPoint[],
  goldHist: DailySeriesPoint[],
  onsHist: DailySeriesPoint[]
): MeasurementRecord[] {
  if (usdHist.length === 0 || goldHist.length === 0 || onsHist.length === 0) {
    return [];
  }

  const usdMap = new Map(usdHist.map((d) => [d.dateGregorian, d]));
  const onsMap = new Map(onsHist.map((d) => [d.dateGregorian, d]));
  const records: MeasurementRecord[] = [];

  for (const goldDay of goldHist) {
    const usdDay = usdMap.get(goldDay.dateGregorian);
    const onsDay = onsMap.get(goldDay.dateGregorian);
    if (!usdDay || !onsDay) continue;

    const theo = calculateTheoretical18KToman(onsDay.closeValue, usdDay.closeValue);
    const tgjuGoldToman = tgjuRialPerGramToToman(goldDay.closeValue);
    const bubble = calculateBubble(tgjuGoldToman, theo.roundedToman);

    records.push({
      id: goldDay.timestampMs,
      timestamp: goldDay.timestampMs,
      usdIrr: usdDay.closeValue,
      usdToman: usdRialToToman(usdDay.closeValue),
      globalOunceUsd: onsDay.closeValue,
      tgjuGold18Toman: tgjuGoldToman,
      digikalaGold18Toman: null,
      referencePriceToman: tgjuGoldToman,
      referenceMode: 'tgju_fallback',
      theoreticalPriceToman: theo.roundedToman,
      bubbleToman: bubble.bubbleToman,
      bubblePercent: bubble.bubblePercent,
      discrepancyToman: null,
      discrepancyExceeded: false,
      dataQuality: 'cached',
      tgjuStatus: 'cached',
      digikalaStatus: 'unavailable',
      tgjuSourceTs: goldDay.dateGregorian,
      digikalaSourceTs: null,
    });
  }

  return records.sort((a, b) => a.timestamp - b.timestamp);
}
