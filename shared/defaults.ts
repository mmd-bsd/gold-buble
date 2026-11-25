import type { AlertRuleRecord, AppSettings, ChartRange, PreferredSource } from './types.ts';

export const DEFAULT_SETTINGS: AppSettings = {
  refreshIntervalSec: 30,
  preferredSource: 'auto',
  autoAveraging: true,
  discrepancyThresholdToman: 100_000,
  staleThresholdSec: 300,
  defaultChartRange: '24h',
  manualOverrideEnabled: false,
  manualOverridePriceToman: null,
  notificationsEnabled: true,
  soundAlertsEnabled: true,
  nearZeroBandToman: 25_000,
};

export const DEFAULT_RULES: ReadonlyArray<
  Omit<AlertRuleRecord, 'id' | 'lastTriggeredAt' | 'lastState'>
> = [
  {
    name: 'تغییر مطلق حباب در بازه زمانی',
    ruleType: 'bubble_abs_change',
    thresholdValue: 150_000,
    windowMinutes: 30,
    cooldownMinutes: 30,
    enabled: true,
  },
  {
    name: 'تغییر درصدی حباب',
    ruleType: 'bubble_pct_change',
    thresholdValue: 1.0,
    windowMinutes: 30,
    cooldownMinutes: 30,
    enabled: true,
  },
  {
    name: 'جهش سریع طلای ۱۸ عیار داخلی',
    ruleType: 'rapid_domestic',
    thresholdValue: 300_000,
    windowMinutes: 15,
    cooldownMinutes: 20,
    enabled: true,
  },
  {
    name: 'تغییر سریع ارزش تئوری طلا',
    ruleType: 'rapid_theoretical',
    thresholdValue: 300_000,
    windowMinutes: 15,
    cooldownMinutes: 20,
    enabled: true,
  },
  {
    name: 'نوسان شدید نرخ دلار',
    ruleType: 'rapid_usd',
    thresholdValue: 3_000,
    windowMinutes: 15,
    cooldownMinutes: 20,
    enabled: true,
  },
  {
    name: 'نوسان انس جهانی طلا',
    ruleType: 'rapid_ounce',
    thresholdValue: 25,
    windowMinutes: 30,
    cooldownMinutes: 30,
    enabled: true,
  },
  {
    name: 'سقف حباب مثبت (آستانه بالا)',
    ruleType: 'threshold_high',
    thresholdValue: 1_500_000,
    windowMinutes: 1,
    cooldownMinutes: 60,
    enabled: true,
  },
  {
    name: 'کف حباب منفی (آستانه پایین)',
    ruleType: 'threshold_low',
    thresholdValue: -300_000,
    windowMinutes: 1,
    cooldownMinutes: 60,
    enabled: true,
  },
  {
    name: 'عبور حباب از خط صفر',
    ruleType: 'zero_cross',
    thresholdValue: 0,
    windowMinutes: 15,
    cooldownMinutes: 30,
    enabled: true,
  },
];

export function seedRules(): AlertRuleRecord[] {
  return DEFAULT_RULES.map((rule, index) => ({
    ...rule,
    id: index + 1,
    lastTriggeredAt: null,
    lastState: null,
  }));
}

export const VALID_RANGES: ReadonlySet<ChartRange> = new Set<ChartRange>([
  '1h',
  '6h',
  '12h',
  '24h',
  '7d',
  '30d',
  'all',
]);

export const VALID_SOURCES: ReadonlySet<PreferredSource> = new Set<PreferredSource>([
  'auto',
  'tgju',
  'digikala',
]);

export interface SettingsValidation {
  ok: boolean;
  error?: string;
  value: AppSettings;
}

/**
 * Merges and validates a partial settings update, mirroring the old server-side
 * validation so the UI shows the same Persian messages.
 */
export function mergeAndValidateSettings(
  current: AppSettings,
  partial: Partial<AppSettings>
): SettingsValidation {
  const next: AppSettings = { ...current };

  if (partial.refreshIntervalSec !== undefined) {
    const v = Number(partial.refreshIntervalSec);
    if (!Number.isFinite(v) || v < 10 || v > 3600) {
      return { ok: false, error: 'بازه بروزرسانی باید بین ۱۰ تا ۳۶۰۰ ثانیه باشد.', value: current };
    }
    next.refreshIntervalSec = Math.round(v);
  }
  if (partial.preferredSource !== undefined) {
    if (!VALID_SOURCES.has(partial.preferredSource)) {
      return { ok: false, error: 'منبع ترجیحی نامعتبر است.', value: current };
    }
    next.preferredSource = partial.preferredSource;
  }
  if (partial.autoAveraging !== undefined) {
    next.autoAveraging = Boolean(partial.autoAveraging);
  }
  if (partial.discrepancyThresholdToman !== undefined) {
    const v = Number(partial.discrepancyThresholdToman);
    if (!Number.isFinite(v) || v < 0 || v > 50_000_000) {
      return { ok: false, error: 'آستانه اختلاف منابع نامعتبر است.', value: current };
    }
    next.discrepancyThresholdToman = Math.round(v);
  }
  if (partial.staleThresholdSec !== undefined) {
    const v = Number(partial.staleThresholdSec);
    if (!Number.isFinite(v) || v < 30 || v > 86400) {
      return { ok: false, error: 'آستانه کهنگی داده نامعتبر است.', value: current };
    }
    next.staleThresholdSec = Math.round(v);
  }
  if (partial.defaultChartRange !== undefined) {
    if (!VALID_RANGES.has(partial.defaultChartRange)) {
      return { ok: false, error: 'بازه نمودار نامعتبر است.', value: current };
    }
    next.defaultChartRange = partial.defaultChartRange;
  }
  if (partial.manualOverrideEnabled !== undefined) {
    next.manualOverrideEnabled = Boolean(partial.manualOverrideEnabled);
  }
  if (partial.manualOverridePriceToman !== undefined) {
    if (partial.manualOverridePriceToman === null) {
      next.manualOverridePriceToman = null;
    } else {
      const v = Number(partial.manualOverridePriceToman);
      if (!Number.isFinite(v) || v <= 0 || v > 1_000_000_000) {
        return { ok: false, error: 'قیمت دستی نامعتبر است.', value: current };
      }
      next.manualOverridePriceToman = Math.round(v);
    }
  }
  if (partial.notificationsEnabled !== undefined) {
    next.notificationsEnabled = Boolean(partial.notificationsEnabled);
  }
  if (partial.soundAlertsEnabled !== undefined) {
    next.soundAlertsEnabled = Boolean(partial.soundAlertsEnabled);
  }
  if (partial.nearZeroBandToman !== undefined) {
    const v = Number(partial.nearZeroBandToman);
    if (!Number.isFinite(v) || v < 0 || v > 5_000_000) {
      return { ok: false, error: 'محدوده نزدیک به صفر نامعتبر است.', value: current };
    }
    next.nearZeroBandToman = Math.round(v);
  }

  return { ok: true, value: next };
}
