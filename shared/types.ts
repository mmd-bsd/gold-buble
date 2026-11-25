export type SourceStatus = 'live' | 'delayed' | 'cached' | 'unavailable';

export type DataQuality = 'live' | 'partial' | 'delayed' | 'stale' | 'cached' | 'unavailable' | 'manual';

export type ReferenceMode =
  | 'averaged'
  | 'tgju'
  | 'digikala'
  | 'tgju_fallback'
  | 'digikala_fallback'
  | 'manual'
  | 'unresolved'
  | 'unavailable';

export type PreferredSource = 'auto' | 'tgju' | 'digikala';

export type ChartRange = '1h' | '6h' | '12h' | '24h' | '7d' | '30d' | 'all';

export type BubbleSign = 'positive' | 'negative' | 'zero';

export type RuleType =
  | 'bubble_abs_change'
  | 'bubble_pct_change'
  | 'rapid_domestic'
  | 'rapid_theoretical'
  | 'rapid_usd'
  | 'rapid_ounce'
  | 'threshold_high'
  | 'threshold_low'
  | 'zero_cross';

export interface CollectorReading<T> {
  source: 'tgju' | 'digikala';
  status: SourceStatus;
  data: T | null;
  fetchedAt: number;
  sourceTimestamp: string | null;
  sourceTimestampMs: number | null;
  ageSeconds: number | null;
  latencyMs: number;
  error: string | null;
}

export interface TgjuRawData {
  usdIrr: number;
  usdToman: number;
  gold18IrrPerGram: number;
  gold18TomanPerGram: number;
  onsUsd: number;
  usdTimestamp: string | null;
  goldTimestamp: string | null;
  onsTimestamp: string | null;
  usdChangePercent: number | null;
  goldChangePercent: number | null;
  onsChangePercent: number | null;
}

export interface DigikalaRawData {
  gold18IrrPerMg: number;
  gold18TomanPerGram: number;
  ttlSeconds: number;
  purity: '18K';
  rawUnit: 'IRR/mg';
}

export interface MeasurementRecord {
  id: number;
  timestamp: number;
  usdIrr: number | null;
  usdToman: number | null;
  globalOunceUsd: number | null;
  tgjuGold18Toman: number | null;
  digikalaGold18Toman: number | null;
  referencePriceToman: number | null;
  referenceMode: ReferenceMode;
  theoreticalPriceToman: number | null;
  bubbleToman: number | null;
  bubblePercent: number | null;
  discrepancyToman: number | null;
  discrepancyExceeded: boolean;
  dataQuality: DataQuality;
  tgjuStatus: SourceStatus;
  digikalaStatus: SourceStatus;
  tgjuSourceTs: string | null;
  digikalaSourceTs: string | null;
}

export interface MarketSnapshot {
  latest: MeasurementRecord | null;
  previous: MeasurementRecord | null;
  deltaFromPrevious: {
    bubbleToman: number | null;
    bubblePercent: number | null;
    referencePriceToman: number | null;
    theoreticalPriceToman: number | null;
  };
  collectors: {
    tgju: CollectorReading<TgjuRawData>;
    digikala: CollectorReading<DigikalaRawData>;
  };
  discrepancy: {
    active: boolean;
    differenceToman: number | null;
    thresholdToman: number;
    requiresSelection: boolean;
    tgjuPriceToman: number | null;
    digikalaPriceToman: number | null;
  };
  bubbleStatus: {
    sign: BubbleSign | null;
    isNearZero: boolean;
  };
  serverTime: number;
  nextRefreshAt: number | null;
}

export interface AlertRuleRecord {
  id: number;
  name: string;
  ruleType: RuleType;
  thresholdValue: number;
  windowMinutes: number;
  cooldownMinutes: number;
  enabled: boolean;
  lastTriggeredAt: number | null;
  lastState: string | null;
}

export interface AlertRecord {
  id: number;
  ruleId: number | null;
  ruleType: RuleType;
  title: string;
  reason: string;
  bubbleToman: number | null;
  bubblePercent: number | null;
  previousValue: number | null;
  changeAmount: number | null;
  referencePriceToman: number | null;
  theoreticalPriceToman: number | null;
  triggeredAt: number;
  acknowledged: boolean;
}

export interface AppSettings {
  refreshIntervalSec: number;
  preferredSource: PreferredSource;
  autoAveraging: boolean;
  discrepancyThresholdToman: number;
  staleThresholdSec: number;
  defaultChartRange: ChartRange;
  manualOverrideEnabled: boolean;
  manualOverridePriceToman: number | null;
  notificationsEnabled: boolean;
  soundAlertsEnabled: boolean;
  nearZeroBandToman: number;
}

export interface HistoryResponse {
  range: ChartRange;
  points: MeasurementRecord[];
  totalCount: number;
}
