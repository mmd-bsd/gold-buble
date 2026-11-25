import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type {
  AlertRecord,
  AlertRuleRecord,
  AppSettings,
  ChartRange,
  DataQuality,
  MeasurementRecord,
  ReferenceMode,
  RuleType,
  SourceStatus,
} from '../shared/types.ts';

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

const DEFAULT_RULES: Array<Omit<AlertRuleRecord, 'id' | 'lastTriggeredAt' | 'lastState'>> = [
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

export interface PushSubscriptionRecord {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  createdAt: number;
}

export class GoldMonitorDatabase {
  private readonly db: DatabaseSync;

  constructor(dbPath = path.resolve(process.cwd(), 'data', 'gold_monitor.db')) {
    if (dbPath !== ':memory:') {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    }
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
    this.initSchema();
    this.seedDefaults();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS measurements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        usd_irr REAL,
        usd_toman REAL,
        global_ounce_usd REAL,
        tgju_gold18_toman REAL,
        digikala_gold18_toman REAL,
        reference_price_toman REAL,
        reference_mode TEXT NOT NULL,
        theoretical_price_toman REAL,
        bubble_toman REAL,
        bubble_percent REAL,
        discrepancy_toman REAL,
        discrepancy_exceeded INTEGER NOT NULL DEFAULT 0,
        data_quality TEXT NOT NULL,
        tgju_status TEXT NOT NULL,
        digikala_status TEXT NOT NULL,
        tgju_source_ts TEXT,
        digikala_source_ts TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_measurements_ts ON measurements(timestamp);

      CREATE TABLE IF NOT EXISTS collector_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT NOT NULL,
        status TEXT NOT NULL,
        latency_ms INTEGER NOT NULL,
        source_timestamp TEXT,
        error_message TEXT,
        checked_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_collector_logs_ts ON collector_logs(checked_at);

      CREATE TABLE IF NOT EXISTS alert_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        rule_type TEXT NOT NULL UNIQUE,
        threshold_value REAL NOT NULL,
        window_minutes INTEGER NOT NULL,
        cooldown_minutes INTEGER NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        last_triggered_at INTEGER,
        last_state TEXT
      );

      CREATE TABLE IF NOT EXISTS alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rule_id INTEGER,
        rule_type TEXT NOT NULL,
        title TEXT NOT NULL,
        reason TEXT NOT NULL,
        bubble_toman REAL,
        bubble_percent REAL,
        previous_value REAL,
        change_amount REAL,
        reference_price_toman REAL,
        theoretical_price_toman REAL,
        triggered_at INTEGER NOT NULL,
        acknowledged INTEGER NOT NULL DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_alerts_ts ON alerts(triggered_at DESC);

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        endpoint TEXT NOT NULL UNIQUE,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);
  }

  private seedDefaults(): void {
    const insertSetting = this.db.prepare(
      'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
    );
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      insertSetting.run(key, JSON.stringify(value));
    }

    const insertRule = this.db.prepare(
      `INSERT OR IGNORE INTO alert_rules (name, rule_type, threshold_value, window_minutes, cooldown_minutes, enabled)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    for (const rule of DEFAULT_RULES) {
      insertRule.run(
        rule.name,
        rule.ruleType,
        rule.thresholdValue,
        rule.windowMinutes,
        rule.cooldownMinutes,
        rule.enabled ? 1 : 0
      );
    }
  }

  getSettings(): AppSettings {
    const rows = this.db.prepare('SELECT key, value FROM settings').all() as Array<{
      key: string;
      value: string;
    }>;
    const merged: Record<string, unknown> = { ...DEFAULT_SETTINGS };
    for (const row of rows) {
      if (row.key in DEFAULT_SETTINGS) {
        try {
          merged[row.key] = JSON.parse(row.value);
        } catch {
          // Keep default on malformed JSON
        }
      }
    }
    return merged as unknown as AppSettings;
  }

  updateSettings(partial: Partial<AppSettings>): AppSettings {
    const current = this.getSettings();
    const next: AppSettings = { ...current, ...partial };
    const upsert = this.db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    );
    for (const key of Object.keys(DEFAULT_SETTINGS) as Array<keyof AppSettings>) {
      upsert.run(key, JSON.stringify(next[key]));
    }
    return next;
  }

  getInternalSecret(key: string): string | null {
    const row = this.db
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  setInternalSecret(key: string, value: string): void {
    this.db
      .prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
      )
      .run(key, value);
  }

  private mapMeasurement(row: Record<string, unknown>): MeasurementRecord {
    return {
      id: Number(row.id),
      timestamp: Number(row.timestamp),
      usdIrr: row.usd_irr === null ? null : Number(row.usd_irr),
      usdToman: row.usd_toman === null ? null : Number(row.usd_toman),
      globalOunceUsd: row.global_ounce_usd === null ? null : Number(row.global_ounce_usd),
      tgjuGold18Toman: row.tgju_gold18_toman === null ? null : Number(row.tgju_gold18_toman),
      digikalaGold18Toman: row.digikala_gold18_toman === null ? null : Number(row.digikala_gold18_toman),
      referencePriceToman: row.reference_price_toman === null ? null : Number(row.reference_price_toman),
      referenceMode: row.reference_mode as ReferenceMode,
      theoreticalPriceToman: row.theoretical_price_toman === null ? null : Number(row.theoretical_price_toman),
      bubbleToman: row.bubble_toman === null ? null : Number(row.bubble_toman),
      bubblePercent: row.bubble_percent === null ? null : Number(row.bubble_percent),
      discrepancyToman: row.discrepancy_toman === null ? null : Number(row.discrepancy_toman),
      discrepancyExceeded: Boolean(row.discrepancy_exceeded),
      dataQuality: row.data_quality as DataQuality,
      tgjuStatus: row.tgju_status as SourceStatus,
      digikalaStatus: row.digikala_status as SourceStatus,
      tgjuSourceTs: row.tgju_source_ts === null ? null : String(row.tgju_source_ts),
      digikalaSourceTs: row.digikala_source_ts === null ? null : String(row.digikala_source_ts),
    };
  }

  getLatestMeasurement(): MeasurementRecord | null {
    const row = this.db
      .prepare('SELECT * FROM measurements ORDER BY timestamp DESC, id DESC LIMIT 1')
      .get() as Record<string, unknown> | undefined;
    return row ? this.mapMeasurement(row) : null;
  }

  getPreviousMeasurement(beforeId?: number): MeasurementRecord | null {
    const row = (
      beforeId !== undefined
        ? this.db
            .prepare('SELECT * FROM measurements WHERE id < ? ORDER BY timestamp DESC, id DESC LIMIT 1')
            .get(beforeId)
        : this.db
            .prepare('SELECT * FROM measurements ORDER BY timestamp DESC, id DESC LIMIT 1 OFFSET 1')
            .get()
    ) as Record<string, unknown> | undefined;
    return row ? this.mapMeasurement(row) : null;
  }

  /**
   * Inserts a measurement while avoiding redundant identical snapshots within 5 minutes.
   */
  insertMeasurement(record: Omit<MeasurementRecord, 'id'>): {
    record: MeasurementRecord;
    inserted: boolean;
  } {
    const latest = this.getLatestMeasurement();
    const fiveMinMs = 5 * 60 * 1000;

    if (
      latest &&
      Math.abs(record.timestamp - latest.timestamp) < fiveMinMs &&
      latest.usdIrr === record.usdIrr &&
      latest.globalOunceUsd === record.globalOunceUsd &&
      latest.tgjuGold18Toman === record.tgjuGold18Toman &&
      latest.digikalaGold18Toman === record.digikalaGold18Toman &&
      latest.referencePriceToman === record.referencePriceToman &&
      latest.referenceMode === record.referenceMode &&
      latest.dataQuality === record.dataQuality
    ) {
      return { record: latest, inserted: false };
    }

    const result = this.db
      .prepare(
        `INSERT INTO measurements (
          timestamp, usd_irr, usd_toman, global_ounce_usd,
          tgju_gold18_toman, digikala_gold18_toman, reference_price_toman,
          reference_mode, theoretical_price_toman, bubble_toman, bubble_percent,
          discrepancy_toman, discrepancy_exceeded, data_quality,
          tgju_status, digikala_status, tgju_source_ts, digikala_source_ts
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.timestamp,
        record.usdIrr,
        record.usdToman,
        record.globalOunceUsd,
        record.tgjuGold18Toman,
        record.digikalaGold18Toman,
        record.referencePriceToman,
        record.referenceMode,
        record.theoreticalPriceToman,
        record.bubbleToman,
        record.bubblePercent,
        record.discrepancyToman,
        record.discrepancyExceeded ? 1 : 0,
        record.dataQuality,
        record.tgjuStatus,
        record.digikalaStatus,
        record.tgjuSourceTs,
        record.digikalaSourceTs
      );

    return {
      record: { ...record, id: Number(result.lastInsertRowid) },
      inserted: true,
    };
  }

  getHistory(range: ChartRange, maxPoints = 600): { points: MeasurementRecord[]; totalCount: number } {
    const now = Date.now();
    const rangeMsMap: Record<ChartRange, number | null> = {
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '12h': 12 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
      all: null,
    };

    const windowMs = rangeMsMap[range];
    const cutoff = windowMs !== null ? now - windowMs : 0;

    const countRow = this.db
      .prepare('SELECT COUNT(*) as cnt FROM measurements WHERE timestamp >= ?')
      .get(cutoff) as { cnt: number };
    const totalCount = Number(countRow.cnt);

    const rows = this.db
      .prepare('SELECT * FROM measurements WHERE timestamp >= ? ORDER BY timestamp ASC')
      .all(cutoff) as Array<Record<string, unknown>>;

    const mapped = rows.map((r) => this.mapMeasurement(r));
    if (mapped.length <= maxPoints) {
      return { points: mapped, totalCount };
    }

    // Even-stride downsampling preserving first and last point
    const step = (mapped.length - 1) / (maxPoints - 1);
    const sampled: MeasurementRecord[] = [];
    for (let i = 0; i < maxPoints; i++) {
      sampled.push(mapped[Math.round(i * step)]);
    }
    return { points: sampled, totalCount };
  }

  getMeasurementClosestTo(
    targetTimestampMs: number,
    beforeId?: number
  ): MeasurementRecord | null {
    const preWindow = this.db
      .prepare(
        'SELECT * FROM measurements WHERE timestamp <= ? ORDER BY timestamp DESC, id DESC LIMIT 1'
      )
      .get(targetTimestampMs) as Record<string, unknown> | undefined;
    if (preWindow) {
      return this.mapMeasurement(preWindow);
    }

    const earliestInWindow = (
      beforeId !== undefined
        ? this.db
            .prepare(
              'SELECT * FROM measurements WHERE timestamp > ? AND id < ? ORDER BY timestamp ASC, id ASC LIMIT 1'
            )
            .get(targetTimestampMs, beforeId)
        : this.db
            .prepare(
              'SELECT * FROM measurements WHERE timestamp > ? ORDER BY timestamp ASC, id ASC LIMIT 1'
            )
            .get(targetTimestampMs)
    ) as Record<string, unknown> | undefined;

    return earliestInWindow ? this.mapMeasurement(earliestInWindow) : null;
  }

  logCollectorCheck(entry: {
    source: 'tgju' | 'digikala';
    status: SourceStatus;
    latencyMs: number;
    sourceTimestamp: string | null;
    errorMessage: string | null;
    checkedAt: number;
  }): void {
    this.db
      .prepare(
        `INSERT INTO collector_logs (source, status, latency_ms, source_timestamp, error_message, checked_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        entry.source,
        entry.status,
        entry.latencyMs,
        entry.sourceTimestamp,
        entry.errorMessage,
        entry.checkedAt
      );

    // Keep collector logs bounded (latest 500 entries)
    this.db
      .prepare(
        'DELETE FROM collector_logs WHERE id NOT IN (SELECT id FROM collector_logs ORDER BY id DESC LIMIT 500)'
      )
      .run();
  }

  getRules(): AlertRuleRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM alert_rules ORDER BY id ASC')
      .all() as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      id: Number(r.id),
      name: String(r.name),
      ruleType: r.rule_type as RuleType,
      thresholdValue: Number(r.threshold_value),
      windowMinutes: Number(r.window_minutes),
      cooldownMinutes: Number(r.cooldown_minutes),
      enabled: Boolean(r.enabled),
      lastTriggeredAt: r.last_triggered_at === null ? null : Number(r.last_triggered_at),
      lastState: r.last_state === null ? null : String(r.last_state),
    }));
  }

  updateRule(
    id: number,
    updates: Partial<Pick<AlertRuleRecord, 'thresholdValue' | 'windowMinutes' | 'cooldownMinutes' | 'enabled'>>
  ): AlertRuleRecord | null {
    const existing = this.getRules().find((r) => r.id === id);
    if (!existing) return null;

    const nextThreshold = updates.thresholdValue ?? existing.thresholdValue;
    const nextWindow = updates.windowMinutes ?? existing.windowMinutes;
    const nextCooldown = updates.cooldownMinutes ?? existing.cooldownMinutes;
    const nextEnabled = updates.enabled ?? existing.enabled;

    this.db
      .prepare(
        `UPDATE alert_rules
         SET threshold_value = ?, window_minutes = ?, cooldown_minutes = ?, enabled = ?
         WHERE id = ?`
      )
      .run(nextThreshold, nextWindow, nextCooldown, nextEnabled ? 1 : 0, id);

    return this.getRules().find((r) => r.id === id) ?? null;
  }

  updateRuleTriggerState(id: number, lastTriggeredAt: number | null, lastState: string | null): void {
    this.db
      .prepare('UPDATE alert_rules SET last_triggered_at = ?, last_state = ? WHERE id = ?')
      .run(lastTriggeredAt, lastState, id);
  }

  insertAlert(alert: Omit<AlertRecord, 'id'>): AlertRecord {
    const result = this.db
      .prepare(
        `INSERT INTO alerts (
          rule_id, rule_type, title, reason, bubble_toman, bubble_percent,
          previous_value, change_amount, reference_price_toman, theoretical_price_toman,
          triggered_at, acknowledged
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        alert.ruleId,
        alert.ruleType,
        alert.title,
        alert.reason,
        alert.bubbleToman,
        alert.bubblePercent,
        alert.previousValue,
        alert.changeAmount,
        alert.referencePriceToman,
        alert.theoreticalPriceToman,
        alert.triggeredAt,
        alert.acknowledged ? 1 : 0
      );

    return { ...alert, id: Number(result.lastInsertRowid) };
  }

  getAlerts(limit = 50): AlertRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM alerts ORDER BY triggered_at DESC, id DESC LIMIT ?')
      .all(limit) as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      id: Number(r.id),
      ruleId: r.rule_id === null ? null : Number(r.rule_id),
      ruleType: r.rule_type as RuleType,
      title: String(r.title),
      reason: String(r.reason),
      bubbleToman: r.bubble_toman === null ? null : Number(r.bubble_toman),
      bubblePercent: r.bubble_percent === null ? null : Number(r.bubble_percent),
      previousValue: r.previous_value === null ? null : Number(r.previous_value),
      changeAmount: r.change_amount === null ? null : Number(r.change_amount),
      referencePriceToman: r.reference_price_toman === null ? null : Number(r.reference_price_toman),
      theoreticalPriceToman: r.theoretical_price_toman === null ? null : Number(r.theoretical_price_toman),
      triggeredAt: Number(r.triggered_at),
      acknowledged: Boolean(r.acknowledged),
    }));
  }

  acknowledgeAlert(id: number): boolean {
    const res = this.db.prepare('UPDATE alerts SET acknowledged = 1 WHERE id = ?').run(id);
    return Number(res.changes) > 0;
  }

  acknowledgeAllAlerts(): void {
    this.db.prepare('UPDATE alerts SET acknowledged = 1 WHERE acknowledged = 0').run();
  }

  upsertPushSubscription(sub: { endpoint: string; p256dh: string; auth: string }): void {
    this.db
      .prepare(
        `INSERT INTO push_subscriptions (endpoint, p256dh, auth, created_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth`
      )
      .run(sub.endpoint, sub.p256dh, sub.auth, Date.now());
  }

  removePushSubscription(endpoint: string): void {
    this.db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint);
  }

  getPushSubscriptions(): PushSubscriptionRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM push_subscriptions ORDER BY id ASC')
      .all() as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: Number(r.id),
      endpoint: String(r.endpoint),
      p256dh: String(r.p256dh),
      auth: String(r.auth),
      createdAt: Number(r.created_at),
    }));
  }

  getMeasurementCount(): number {
    const row = this.db.prepare('SELECT COUNT(*) as cnt FROM measurements').get() as { cnt: number };
    return Number(row.cnt);
  }

  close(): void {
    this.db.close();
  }
}
