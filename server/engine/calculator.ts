import type { BubbleSign, PreferredSource, ReferenceMode } from '../../shared/types.ts';

// 31.1034768 grams per troy ounce = 311034768 / 10_000_000
const TROY_OUNCE_NUM = 311_034_768n;
const TROY_OUNCE_DEN = 10_000_000n;
const DECIMAL_SCALE = 1_000_000n; // 10^6 fixed-point scale for USD ounce

function toScaledBigInt(value: number, scale: bigint): bigint {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid non-negative finite number: ${value}`);
  }
  const fixed = value.toFixed(6);
  const [wholePart, fracPart = ''] = fixed.split('.');
  const paddedFrac = (fracPart + '000000').slice(0, 6);
  return BigInt(wholePart) * scale + BigInt(paddedFrac);
}

/**
 * Calculates theoretical 18-karat gold price per gram in Iranian Toman using exact integer arithmetic:
 *
 * Gold price per gram (18K, Toman) = ((ons_USD * usd_IRR / 31.1034768) * (18 / 24)) / 10
 */
export function calculateTheoretical18KToman(onsUsd: number, usdIrr: number): {
  roundedToman: number;
  exactToman: number;
} {
  if (!Number.isFinite(onsUsd) || onsUsd <= 0) {
    throw new Error('Global gold ounce price must be a positive number');
  }
  if (!Number.isFinite(usdIrr) || usdIrr <= 0) {
    throw new Error('USD/IRR exchange rate must be a positive number');
  }

  const onsScaled = toScaledBigInt(onsUsd, DECIMAL_SCALE);
  const usdScaled = toScaledBigInt(usdIrr, DECIMAL_SCALE);

  // Formula:
  // (onsScaled * usdScaled / SCALE^2) * (TROY_OUNCE_DEN / TROY_OUNCE_NUM) * (18 / 24) / 10
  // Note: 18/24 = 3/4. Multiply by 100 to get 2 decimal places before final rounding.
  const numerator = onsScaled * usdScaled * TROY_OUNCE_DEN * 3n * 100n;
  const denominator = DECIMAL_SCALE * DECIMAL_SCALE * TROY_OUNCE_NUM * 4n * 10n;

  // Half-up division for integer cents of Toman (100ths of Toman)
  const tomanTimes100 = (numerator + denominator / 2n) / denominator;
  const roundedToman = Number((tomanTimes100 + 50n) / 100n);
  const exactToman = Number(tomanTimes100) / 100;

  return { roundedToman, exactToman };
}

export interface ReferenceResolutionInput {
  tgjuToman: number | null;
  digikalaToman: number | null;
  tgjuValid: boolean;
  digikalaValid: boolean;
  autoAveraging: boolean;
  discrepancyThresholdToman: number;
  preferredSource: PreferredSource;
  manualOverrideEnabled: boolean;
  manualOverridePriceToman: number | null;
}

export interface ReferenceResolutionResult {
  referencePriceToman: number | null;
  referenceMode: ReferenceMode;
  discrepancyToman: number | null;
  discrepancyExceeded: boolean;
  requiresUserSelection: boolean;
}

export function resolveReferencePrice(input: ReferenceResolutionInput): ReferenceResolutionResult {
  const {
    tgjuToman,
    digikalaToman,
    tgjuValid,
    digikalaValid,
    autoAveraging,
    discrepancyThresholdToman,
    preferredSource,
    manualOverrideEnabled,
    manualOverridePriceToman,
  } = input;

  const hasBoth = tgjuValid && tgjuToman !== null && digikalaValid && digikalaToman !== null;
  const discrepancyToman = hasBoth ? Math.abs(tgjuToman - digikalaToman) : null;
  const discrepancyExceeded = discrepancyToman !== null && discrepancyToman > discrepancyThresholdToman;

  if (manualOverrideEnabled && manualOverridePriceToman !== null && manualOverridePriceToman > 0) {
    return {
      referencePriceToman: Math.round(manualOverridePriceToman),
      referenceMode: 'manual',
      discrepancyToman,
      discrepancyExceeded,
      requiresUserSelection: false,
    };
  }

  if (hasBoth) {
    if (discrepancyExceeded) {
      if (preferredSource === 'tgju') {
        return {
          referencePriceToman: Math.round(tgjuToman),
          referenceMode: 'tgju',
          discrepancyToman,
          discrepancyExceeded: true,
          requiresUserSelection: false,
        };
      }
      if (preferredSource === 'digikala') {
        return {
          referencePriceToman: Math.round(digikalaToman),
          referenceMode: 'digikala',
          discrepancyToman,
          discrepancyExceeded: true,
          requiresUserSelection: false,
        };
      }
      // Do NOT automatically select or average either price when discrepancy exceeds threshold
      return {
        referencePriceToman: null,
        referenceMode: 'unresolved',
        discrepancyToman,
        discrepancyExceeded: true,
        requiresUserSelection: true,
      };
    }

    // Discrepancy within threshold
    if (preferredSource === 'tgju') {
      return {
        referencePriceToman: Math.round(tgjuToman),
        referenceMode: 'tgju',
        discrepancyToman,
        discrepancyExceeded: false,
        requiresUserSelection: false,
      };
    }
    if (preferredSource === 'digikala') {
      return {
        referencePriceToman: Math.round(digikalaToman),
        referenceMode: 'digikala',
        discrepancyToman,
        discrepancyExceeded: false,
        requiresUserSelection: false,
      };
    }
    if (autoAveraging) {
      return {
        referencePriceToman: Math.round((tgjuToman + digikalaToman) / 2),
        referenceMode: 'averaged',
        discrepancyToman,
        discrepancyExceeded: false,
        requiresUserSelection: false,
      };
    }
    return {
      referencePriceToman: Math.round(tgjuToman),
      referenceMode: 'tgju',
      discrepancyToman,
      discrepancyExceeded: false,
      requiresUserSelection: false,
    };
  }

  if (tgjuValid && tgjuToman !== null) {
    return {
      referencePriceToman: Math.round(tgjuToman),
      referenceMode: 'tgju_fallback',
      discrepancyToman: null,
      discrepancyExceeded: false,
      requiresUserSelection: false,
    };
  }

  if (digikalaValid && digikalaToman !== null) {
    return {
      referencePriceToman: Math.round(digikalaToman),
      referenceMode: 'digikala_fallback',
      discrepancyToman: null,
      discrepancyExceeded: false,
      requiresUserSelection: false,
    };
  }

  return {
    referencePriceToman: null,
    referenceMode: 'unavailable',
    discrepancyToman: null,
    discrepancyExceeded: false,
    requiresUserSelection: false,
  };
}

export interface BubbleCalculationResult {
  bubbleToman: number;
  bubblePercent: number;
  sign: BubbleSign;
  isNearZero: boolean;
}

export function calculateBubble(
  referencePriceToman: number,
  theoreticalPriceToman: number,
  nearZeroBandToman = 25000
): BubbleCalculationResult {
  if (!Number.isFinite(referencePriceToman) || referencePriceToman <= 0) {
    throw new Error('Reference price must be a positive number');
  }
  if (!Number.isFinite(theoreticalPriceToman) || theoreticalPriceToman <= 0) {
    throw new Error('Theoretical price must be a positive number');
  }

  // Use BigInt scaled calculation for exact percentage
  const refBig = BigInt(Math.round(referencePriceToman));
  const theoBig = BigInt(Math.round(theoreticalPriceToman));
  const diffBig = refBig - theoBig;
  const bubbleToman = Number(diffBig);

  // Percentage scaled to 4 decimal places (basis points * 100)
  const pctScaled = (diffBig * 1_000_000n) / theoBig;
  const bubblePercent = Number(pctScaled) / 10_000;

  let sign: BubbleSign = 'zero';
  if (bubbleToman > 0) {
    sign = 'positive';
  } else if (bubbleToman < 0) {
    sign = 'negative';
  }

  const isNearZero = Math.abs(bubbleToman) <= nearZeroBandToman;

  return {
    bubbleToman,
    bubblePercent,
    sign,
    isNearZero,
  };
}
