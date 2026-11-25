import assert from 'node:assert/strict';
import test from 'node:test';
import { GoldMonitorDatabase } from '../server/db.ts';
import {
  calculateBubble,
  calculateTheoretical18KToman,
  resolveReferencePrice,
} from '../server/engine/calculator.ts';
import {
  digikalaRialPerMgToTomanPerGram,
  parsePositiveNumeric,
  parseTgjuTehranTimestamp,
  tgjuRialPerGramToToman,
  usdRialToToman,
} from '../server/engine/normalization.ts';
import { evaluateVolatilityRules } from '../server/engine/volatility.ts';

test('Currency & unit normalization (Rial/Toman, mg/gram, Persian numerals)', () => {
  assert.equal(parsePositiveNumeric('2,876,000'), 2876000);
  assert.equal(parsePositiveNumeric('۲٬۸۷۶٬۰۰۰'), 2876000);
  assert.equal(parsePositiveNumeric('0'), null);
  assert.equal(parsePositiveNumeric('-500'), null);
  assert.equal(parsePositiveNumeric('invalid'), null);

  assert.equal(usdRialToToman(2_876_000), 287_600);
  assert.equal(tgjuRialPerGramToToman(254_506_000), 25_450_600);
  assert.equal(digikalaRialPerMgToTomanPerGram(254_975), 25_497_500);

  const tehranMs = parseTgjuTehranTimestamp('2026-11-25 13:29:41');
  assert.equal(tehranMs, Date.parse('2026-11-25T13:29:41+03:30'));
});

test('Theoretical 18K gold formula matches manual calculation', () => {
  // Manual: ((3525.78 * 2,876,000 / 31.1034768) * (18 / 24)) / 10 = 24,450,988.257 -> 24,450,988
  const result = calculateTheoretical18KToman(3525.78, 2_876_000);
  assert.equal(result.roundedToman, 24_450_988);
  assert.ok(Math.abs(result.exactToman - 24_450_988.26) < 0.01);
});

test('Positive, negative, and zero gold bubble calculations retain exact sign', () => {
  const positive = calculateBubble(25_474_050, 24_451_483);
  assert.equal(positive.bubbleToman, 1_022_567);
  assert.equal(positive.sign, 'positive');
  assert.ok(positive.bubblePercent > 4.18 && positive.bubblePercent < 4.19);

  const negative = calculateBubble(24_000_000, 24_451_483);
  assert.equal(negative.bubbleToman, -451_483);
  assert.equal(negative.sign, 'negative');
  assert.ok(negative.bubblePercent < 0);

  const zero = calculateBubble(24_451_483, 24_451_483);
  assert.equal(zero.bubbleToman, 0);
  assert.equal(zero.bubblePercent, 0);
  assert.equal(zero.sign, 'zero');
  assert.equal(zero.isNearZero, true);
});

test('Source discrepancy rule: <= 100,000 averages, > 100,000 requires selection unless chosen or overridden', () => {
  const withinThreshold = resolveReferencePrice({
    tgjuToman: 25_450_600,
    digikalaToman: 25_550_600, // exact 100,000 boundary
    tgjuValid: true,
    digikalaValid: true,
    autoAveraging: true,
    discrepancyThresholdToman: 100_000,
    preferredSource: 'auto',
    manualOverrideEnabled: false,
    manualOverridePriceToman: null,
  });
  assert.equal(withinThreshold.referenceMode, 'averaged');
  assert.equal(withinThreshold.referencePriceToman, 25_500_600);
  assert.equal(withinThreshold.discrepancyExceeded, false);

  const exceededUnresolved = resolveReferencePrice({
    tgjuToman: 25_450_600,
    digikalaToman: 25_550_601, // 100,001 > 100,000
    tgjuValid: true,
    digikalaValid: true,
    autoAveraging: true,
    discrepancyThresholdToman: 100_000,
    preferredSource: 'auto',
    manualOverrideEnabled: false,
    manualOverridePriceToman: null,
  });
  assert.equal(exceededUnresolved.referenceMode, 'unresolved');
  assert.equal(exceededUnresolved.referencePriceToman, null);
  assert.equal(exceededUnresolved.discrepancyExceeded, true);
  assert.equal(exceededUnresolved.requiresUserSelection, true);

  const exceededSelectedDigikala = resolveReferencePrice({
    tgjuToman: 25_450_600,
    digikalaToman: 25_650_000,
    tgjuValid: true,
    digikalaValid: true,
    autoAveraging: true,
    discrepancyThresholdToman: 100_000,
    preferredSource: 'digikala',
    manualOverrideEnabled: false,
    manualOverridePriceToman: null,
  });
  assert.equal(exceededSelectedDigikala.referenceMode, 'digikala');
  assert.equal(exceededSelectedDigikala.referencePriceToman, 25_650_000);
  assert.equal(exceededSelectedDigikala.discrepancyExceeded, true);

  const manualOverride = resolveReferencePrice({
    tgjuToman: 25_450_600,
    digikalaToman: 25_650_000,
    tgjuValid: true,
    digikalaValid: true,
    autoAveraging: true,
    discrepancyThresholdToman: 100_000,
    preferredSource: 'auto',
    manualOverrideEnabled: true,
    manualOverridePriceToman: 25_500_000,
  });
  assert.equal(manualOverride.referenceMode, 'manual');
  assert.equal(manualOverride.referencePriceToman, 25_500_000);
});

test('Unavailable source handling falls back cleanly or stays null without silent zeros', () => {
  const singleSourceFallback = resolveReferencePrice({
    tgjuToman: 25_450_600,
    digikalaToman: null,
    tgjuValid: true,
    digikalaValid: false,
    autoAveraging: true,
    discrepancyThresholdToman: 100_000,
    preferredSource: 'auto',
    manualOverrideEnabled: false,
    manualOverridePriceToman: null,
  });
  assert.equal(singleSourceFallback.referenceMode, 'tgju_fallback');
  assert.equal(singleSourceFallback.referencePriceToman, 25_450_600);

  const bothDown = resolveReferencePrice({
    tgjuToman: null,
    digikalaToman: null,
    tgjuValid: false,
    digikalaValid: false,
    autoAveraging: true,
    discrepancyThresholdToman: 100_000,
    preferredSource: 'auto',
    manualOverrideEnabled: false,
    manualOverridePriceToman: null,
  });
  assert.equal(bothDown.referenceMode, 'unavailable');
  assert.equal(bothDown.referencePriceToman, null);
});

test('Volatility engine triggers alerts on threshold/zero-cross and prevents duplicate spam via cooldown', () => {
  const db = new GoldMonitorDatabase(':memory:');
  const baseTime = 1_764_000_000_000;

  // Seed initial positive measurement
  const first = db.insertMeasurement({
    timestamp: baseTime,
    usdIrr: 2_800_000,
    usdToman: 280_000,
    globalOunceUsd: 3500,
    tgjuGold18Toman: 24_000_000,
    digikalaGold18Toman: 24_000_000,
    referencePriceToman: 24_000_000,
    referenceMode: 'averaged',
    theoreticalPriceToman: 23_800_000,
    bubbleToman: 200_000,
    bubblePercent: 0.84,
    discrepancyToman: 0,
    discrepancyExceeded: false,
    dataQuality: 'live',
    tgjuStatus: 'live',
    digikalaStatus: 'live',
    tgjuSourceTs: null,
    digikalaSourceTs: null,
  }).record;

  evaluateVolatilityRules(db, first, baseTime);

  // Drop bubble sharply to negative (-400,000 Toman) 5 minutes later -> triggers bubble_abs_change, threshold_low, zero_cross, etc.
  const second = db.insertMeasurement({
    timestamp: baseTime + 5 * 60 * 1000,
    usdIrr: 2_800_000,
    usdToman: 280_000,
    globalOunceUsd: 3500,
    tgjuGold18Toman: 23_400_000,
    digikalaGold18Toman: 23_400_000,
    referencePriceToman: 23_400_000,
    referenceMode: 'averaged',
    theoreticalPriceToman: 23_800_000,
    bubbleToman: -400_000,
    bubblePercent: -1.68,
    discrepancyToman: 0,
    discrepancyExceeded: false,
    dataQuality: 'live',
    tgjuStatus: 'live',
    digikalaStatus: 'live',
    tgjuSourceTs: null,
    digikalaSourceTs: null,
  }).record;

  const triggered = evaluateVolatilityRules(db, second, baseTime + 5 * 60 * 1000);
  const triggeredTypes = new Set(triggered.map((a) => a.ruleType));
  assert.ok(triggeredTypes.has('bubble_abs_change'));
  assert.ok(triggeredTypes.has('threshold_low'));
  assert.ok(triggeredTypes.has('zero_cross'));

  // 1 minute later, same negative regime -> cooldown must block duplicates
  const third = db.insertMeasurement({
    timestamp: baseTime + 6 * 60 * 1000,
    usdIrr: 2_800_000,
    usdToman: 280_000,
    globalOunceUsd: 3500,
    tgjuGold18Toman: 23_350_000,
    digikalaGold18Toman: 23_350_000,
    referencePriceToman: 23_350_000,
    referenceMode: 'averaged',
    theoreticalPriceToman: 23_800_000,
    bubbleToman: -450_000,
    bubblePercent: -1.89,
    discrepancyToman: 0,
    discrepancyExceeded: false,
    dataQuality: 'live',
    tgjuStatus: 'live',
    digikalaStatus: 'live',
    tgjuSourceTs: null,
    digikalaSourceTs: null,
  }).record;

  const duplicateCheck = evaluateVolatilityRules(db, third, baseTime + 6 * 60 * 1000);
  assert.equal(duplicateCheck.length, 0);

  db.close();
});
