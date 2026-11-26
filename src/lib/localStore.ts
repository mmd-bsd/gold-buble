import { DEFAULT_SETTINGS, mergeAndValidateSettings, seedRules } from '../../shared/defaults.ts';
import type { AlertRecord, AlertRuleRecord, AppSettings, MeasurementRecord } from '../../shared/types.ts';

const KEY_SETTINGS = 'goldbubble:settings:v1';
const KEY_RULES = 'goldbubble:rules:v1';
const KEY_ALERTS = 'goldbubble:alerts:v1';
const KEY_LIVE = 'goldbubble:measurements:v1';
const KEY_BACKFILL = 'goldbubble:backfill:v1';

export const MAX_LIVE_MEASUREMENTS = 5000;
export const MAX_BACKFILL_MEASUREMENTS = 800;
export const MAX_ALERTS = 200;

function readJson(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage may be full or disabled (private mode); the app keeps working in memory.
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isMeasurement(value: unknown): value is MeasurementRecord {
  return (
    isObject(value) &&
    typeof value.timestamp === 'number' &&
    Number.isFinite(value.timestamp) &&
    typeof value.id === 'number' &&
    typeof value.referenceMode === 'string' &&
    typeof value.dataQuality === 'string'
  );
}

function isAlert(value: unknown): value is AlertRecord {
  return (
    isObject(value) &&
    typeof value.id === 'number' &&
    typeof value.ruleType === 'string' &&
    typeof value.title === 'string' &&
    typeof value.triggeredAt === 'number'
  );
}

export function loadSettings(): AppSettings {
  const parsed = readJson(KEY_SETTINGS);
  if (!isObject(parsed)) return { ...DEFAULT_SETTINGS };
  const result = mergeAndValidateSettings(DEFAULT_SETTINGS, parsed as Partial<AppSettings>);
  return result.ok ? result.value : { ...DEFAULT_SETTINGS };
}

export function saveSettings(settings: AppSettings): void {
  writeJson(KEY_SETTINGS, settings);
}

export function loadRules(): AlertRuleRecord[] {
  const seeds = seedRules();
  const parsed = readJson(KEY_RULES);
  if (!Array.isArray(parsed)) return seeds;

  const byType = new Map<string, Record<string, unknown>>();
  for (const raw of parsed) {
    if (isObject(raw) && typeof raw.ruleType === 'string') {
      byType.set(raw.ruleType, raw);
    }
  }

  return seeds.map((seed) => {
    const stored = byType.get(seed.ruleType);
    if (!stored) return seed;
    return {
      ...seed,
      thresholdValue:
        typeof stored.thresholdValue === 'number' && Number.isFinite(stored.thresholdValue)
          ? stored.thresholdValue
          : seed.thresholdValue,
      windowMinutes:
        typeof stored.windowMinutes === 'number' && Number.isFinite(stored.windowMinutes)
          ? stored.windowMinutes
          : seed.windowMinutes,
      cooldownMinutes:
        typeof stored.cooldownMinutes === 'number' && Number.isFinite(stored.cooldownMinutes)
          ? stored.cooldownMinutes
          : seed.cooldownMinutes,
      enabled: typeof stored.enabled === 'boolean' ? stored.enabled : seed.enabled,
      lastTriggeredAt:
        typeof stored.lastTriggeredAt === 'number' && Number.isFinite(stored.lastTriggeredAt)
          ? stored.lastTriggeredAt
          : null,
      lastState: typeof stored.lastState === 'string' ? stored.lastState : null,
    };
  });
}

export function saveRules(rules: AlertRuleRecord[]): void {
  writeJson(KEY_RULES, rules);
}

export function loadAlerts(): AlertRecord[] {
  const parsed = readJson(KEY_ALERTS);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isAlert).slice(0, MAX_ALERTS);
}

export function saveAlerts(alerts: AlertRecord[]): void {
  writeJson(KEY_ALERTS, alerts.slice(0, MAX_ALERTS));
}

export function loadLiveMeasurements(): MeasurementRecord[] {
  const parsed = readJson(KEY_LIVE);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter(isMeasurement)
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-MAX_LIVE_MEASUREMENTS);
}

export function saveLiveMeasurements(points: MeasurementRecord[]): void {
  writeJson(KEY_LIVE, points.slice(-MAX_LIVE_MEASUREMENTS));
}

export function loadBackfill(): MeasurementRecord[] {
  const parsed = readJson(KEY_BACKFILL);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter(isMeasurement)
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-MAX_BACKFILL_MEASUREMENTS);
}

export function saveBackfill(points: MeasurementRecord[]): void {
  writeJson(KEY_BACKFILL, points.slice(-MAX_BACKFILL_MEASUREMENTS));
}
