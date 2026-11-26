import type { DataQuality, ReferenceMode, SourceStatus } from '../../shared/types.ts';

// Latin digits everywhere: Persian labels, English numerals.
const intFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
});

const decimalFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const compactFormatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

const latinDateTimeFormatter = new Intl.DateTimeFormat('fa-IR-u-ca-persian-nu-latn', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

const latinShortTimeFormatter = new Intl.DateTimeFormat('fa-IR-u-ca-persian-nu-latn', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

/**
 * Short human-readable amount: 980 -> "980", 36_100 -> "36.1K",
 * 258_197_000 -> "258.2M". Keeps big Toman figures tiny on screen.
 */
export function formatCompactNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  return compactFormatter.format(Math.round(value));
}

export function formatToman(value: number | null | undefined, showSign = false): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  const rounded = Math.round(value);
  const formatted = compactFormatter.format(Math.abs(rounded));
  if (rounded < 0) {
    return `−${formatted}`;
  }
  if (showSign && rounded > 0) {
    return `+${formatted}`;
  }
  return formatted;
}

export function formatIrr(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 'ناموجود';
  }
  return intFormatter.format(Math.round(value));
}

export function formatUsd(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 'ناموجود';
  }
  return `${intFormatter.format(Math.round(value))} دلار`;
}

export function formatUsdNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 'ناموجود';
  }
  return intFormatter.format(Math.round(value));
}

export function formatPercent(value: number | null | undefined, showSign = true): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  const absFormatted = decimalFormatter.format(Math.abs(value));
  if (value < 0) {
    return `−${absFormatted}%`;
  }
  if (showSign && value > 0) {
    return `+${absFormatted}%`;
  }
  return `${absFormatted}%`;
}

export function formatPersianDateTime(tsMs: number | null | undefined): string {
  if (!tsMs || !Number.isFinite(tsMs)) {
    return 'نامشخص';
  }
  return latinDateTimeFormatter.format(new Date(tsMs));
}

export function formatShortTime(tsMs: number | null | undefined): string {
  if (!tsMs || !Number.isFinite(tsMs)) {
    return '—';
  }
  return latinShortTimeFormatter.format(new Date(tsMs));
}

export function formatAgeSeconds(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) {
    return 'نامشخص';
  }
  if (seconds < 5) return 'هم‌اکنون';
  if (seconds < 60) return `${intFormatter.format(seconds)} ثانیه پیش`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${intFormatter.format(mins)} دقیقه پیش`;
  const hours = Math.floor(mins / 60);
  return `${intFormatter.format(hours)} ساعت پیش`;
}

export function getSourceStatusLabel(status: SourceStatus): string {
  switch (status) {
    case 'live':
      return 'زنده';
    case 'delayed':
      return 'با تاخیر';
    case 'cached':
      return 'کش‌شده';
    case 'unavailable':
      return 'در دسترس نیست';
  }
}

export function getDataQualityLabel(quality: DataQuality): string {
  switch (quality) {
    case 'live':
      return 'داده زنده و معتبر';
    case 'partial':
      return 'داده جزئی (تک‌منبع)';
    case 'delayed':
      return 'دارای تاخیر زمانی';
    case 'stale':
      return 'داده قدیمی';
    case 'cached':
      return 'داده کش‌شده';
    case 'manual':
      return 'قیمت دستی کاربر';
    case 'unavailable':
      return 'عدم دسترسی به داده معتبر';
  }
}

export function getReferenceModeLabel(mode: ReferenceMode): string {
  switch (mode) {
    case 'averaged':
      return 'میانگین TGJU و دیجی‌کالا';
    case 'tgju':
      return 'انتخاب کاربر: TGJU';
    case 'digikala':
      return 'انتخاب کاربر: دیجی‌کالا ولث';
    case 'tgju_fallback':
      return 'تک‌منبع جایگزین: TGJU';
    case 'digikala_fallback':
      return 'تک‌منبع جایگزین: دیجی‌کالا ولث';
    case 'manual':
      return 'تنظیم دستی قیمت مرجع';
    case 'unresolved':
      return 'نیازمند انتخاب کاربر (اختلاف بالا)';
    case 'unavailable':
      return 'ناموجود';
  }
}
