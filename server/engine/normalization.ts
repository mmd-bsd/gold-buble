const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
const ARABIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

/**
 * Normalizes Persian/Arabic numerals, strips commas/whitespace, and parses a strict positive finite number.
 * Returns null instead of silently coercing invalid or zero inputs.
 */
export function parsePositiveNumeric(raw: unknown): number | null {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  }
  if (typeof raw !== 'string') {
    return null;
  }

  let normalized = raw.trim();
  for (let i = 0; i < 10; i++) {
    normalized = normalized.replaceAll(PERSIAN_DIGITS[i], String(i));
    normalized = normalized.replaceAll(ARABIC_DIGITS[i], String(i));
  }
  normalized = normalized.replaceAll(',', '').replaceAll('٬', '').replace(/\s+/g, '');
  if (!normalized || !/^-?\d+(\.\d+)?$/.test(normalized)) {
    return null;
  }

  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Parses TGJU timestamps such as "2026-11-25 13:29:41", which are issued in Asia/Tehran (+03:30).
 */
export function parseTgjuTehranTimestamp(ts: unknown): number | null {
  if (typeof ts !== 'string') {
    return null;
  }
  const trimmed = ts.trim();
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)) {
    return null;
  }
  const isoTehran = `${trimmed.replace(' ', 'T')}+03:30`;
  const parsed = Date.parse(isoTehran);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Converts Iranian Rials to Iranian Toman (1 Toman = 10 Rials).
 */
export function rialToToman(rialAmount: number): number {
  return Math.round(rialAmount / 10);
}

/**
 * Normalizes TGJU 18K gold price (IRR per gram) to Toman per gram.
 */
export function tgjuRialPerGramToToman(rialPerGram: number): number {
  return Math.round(rialPerGram / 10);
}

/**
 * Normalizes Digikala Wealth gold18 price (IRR per milligram) to Toman per gram.
 * 1 gram = 1000 mg; 1 Toman = 10 IRR -> IRR/mg * 1000 / 10 = IRR/mg * 100.
 */
export function digikalaRialPerMgToTomanPerGram(rialPerMg: number): number {
  return Math.round(rialPerMg * 100);
}

/**
 * Normalizes USD/IRR rate to USD/Toman.
 */
export function usdRialToToman(usdIrr: number): number {
  return Math.round(usdIrr / 10);
}
