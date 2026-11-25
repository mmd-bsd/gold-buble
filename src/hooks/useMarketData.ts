import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { mergeAndValidateSettings, VALID_SOURCES } from '../../shared/defaults.ts';
import { evaluateVolatilityRules } from '../../shared/engine/alerts.ts';
import { getHistoryResponse, isDuplicateMeasurement, mergeMeasurements } from '../../shared/history.ts';
import { buildMarketSnapshot, buildSnapshotFromStored } from '../../shared/snapshot.ts';
import type {
  AlertRecord,
  AlertRuleRecord,
  AppSettings,
  ChartRange,
  HistoryResponse,
  MarketApiResponse,
  MarketSnapshot,
  MeasurementRecord,
  PreferredSource,
} from '../../shared/types.ts';
import {
  loadAlerts,
  loadBackfill,
  loadLiveMeasurements,
  loadRules,
  loadSettings,
  MAX_ALERTS,
  MAX_LIVE_MEASUREMENTS,
  saveAlerts,
  saveBackfill,
  saveLiveMeasurements,
  saveRules,
  saveSettings,
} from '../lib/localStore';

interface CollectorReadings {
  tgju: MarketApiResponse['tgju'];
  digikala: MarketApiResponse['digikala'];
}

function readErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

function playSubtleAlertTone(): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.14);
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.26);
  } catch {
    // Ignore audio context autoplay restriction
  }
}

export function useMarketData() {
  const [settings, setSettingsState] = useState<AppSettings>(() => loadSettings());
  const [rules, setRulesState] = useState<AlertRuleRecord[]>(() => loadRules());
  const [alerts, setAlertsState] = useState<AlertRecord[]>(() => loadAlerts());
  const [live, setLiveState] = useState<MeasurementRecord[]>(() => loadLiveMeasurements());
  const [backfill, setBackfillState] = useState<MeasurementRecord[]>(() => loadBackfill());
  const [chartRange, setChartRange] = useState<ChartRange>(() => loadSettings().defaultChartRange);

  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(() => {
    const storedSettings = loadSettings();
    const merged = mergeMeasurements(loadBackfill(), loadLiveMeasurements());
    if (merged.length === 0) return null;
    const latest = merged[merged.length - 1];
    const previous = merged.length > 1 ? merged[merged.length - 2] : null;
    return buildSnapshotFromStored(latest, previous, storedSettings);
  });

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const settingsRef = useRef(settings);
  const rulesRef = useRef(rules);
  const alertsRef = useRef(alerts);
  const liveRef = useRef(live);
  const backfillRef = useRef(backfill);
  const readingsRef = useRef<CollectorReadings | null>(null);

  const persistSettings = useCallback((next: AppSettings) => {
    settingsRef.current = next;
    setSettingsState(next);
    saveSettings(next);
  }, []);

  const persistRules = useCallback((next: AlertRuleRecord[]) => {
    rulesRef.current = next;
    setRulesState(next);
    saveRules(next);
  }, []);

  const persistAlerts = useCallback((next: AlertRecord[]) => {
    const capped = next.slice(0, MAX_ALERTS);
    alertsRef.current = capped;
    setAlertsState(capped);
    saveAlerts(capped);
  }, []);

  const persistLive = useCallback((next: MeasurementRecord[]) => {
    const capped = next.slice(-MAX_LIVE_MEASUREMENTS);
    liveRef.current = capped;
    setLiveState(capped);
    saveLiveMeasurements(capped);
  }, []);

  const persistBackfill = useCallback((next: MeasurementRecord[]) => {
    backfillRef.current = next;
    setBackfillState(next);
    saveBackfill(next);
  }, []);

  const applyMarketData = useCallback(
    (data: MarketApiResponse) => {
      const settingsNow = settingsRef.current;

      if (data.history && data.history.length > 0) {
        persistBackfill(mergeMeasurements(data.history));
      }

      readingsRef.current = { tgju: data.tgju, digikala: data.digikala };

      const mergedBefore = mergeMeasurements(backfillRef.current, liveRef.current);
      const previous = mergedBefore.length > 0 ? mergedBefore[mergedBefore.length - 1] : null;
      const now = data.serverTime || Date.now();

      const { record, snapshot: nextSnapshot } = buildMarketSnapshot({
        tgju: data.tgju,
        digikala: data.digikala,
        settings: settingsNow,
        previous,
        now,
      });
      setSnapshot(nextSnapshot);

      const latestStored = mergedBefore.length > 0 ? mergedBefore[mergedBefore.length - 1] : null;
      const duplicate = isDuplicateMeasurement(latestStored, record);

      let liveNext = liveRef.current;
      if (!duplicate) {
        liveNext = mergeMeasurements(liveNext, [record]).slice(-MAX_LIVE_MEASUREMENTS);
        persistLive(liveNext);

        const evaluation = evaluateVolatilityRules({
          current: record,
          history: mergeMeasurements(backfillRef.current, liveNext),
          rules: rulesRef.current,
          now,
        });

        if (evaluation.ruleUpdates.length > 0) {
          const updates = new Map(evaluation.ruleUpdates.map((u) => [u.id, u]));
          persistRules(
            rulesRef.current.map((rule) => {
              const update = updates.get(rule.id);
              return update
                ? { ...rule, lastTriggeredAt: update.lastTriggeredAt, lastState: update.lastState }
                : rule;
            })
          );
        }

        if (evaluation.alerts.length > 0) {
          let nextId = alertsRef.current.reduce((max, alert) => Math.max(max, alert.id), 0) + 1;
          const newAlerts = evaluation.alerts.map((alert) => ({ ...alert, id: nextId++ }));
          persistAlerts([...newAlerts, ...alertsRef.current]);
          if (settingsNow.soundAlertsEnabled) {
            playSubtleAlertTone();
          }
        }
      }

      setError(null);
    },
    [persistAlerts, persistBackfill, persistLive, persistRules]
  );

  const fetchMarket = useCallback(
    async (includeHistory: boolean) => {
      const params = new URLSearchParams({
        stale: String(settingsRef.current.staleThresholdSec),
      });
      if (includeHistory) params.set('history', '1');

      const res = await fetch(`/api/market?${params.toString()}`);
      if (!res.ok) {
        throw new Error('خطا در دریافت داده‌های بازار');
      }
      const data = (await res.json()) as MarketApiResponse;
      applyMarketData(data);
    },
    [applyMarketData]
  );

  const recomputeSnapshot = useCallback((nextSettings: AppSettings) => {
    const readings = readingsRef.current;
    if (!readings) return;
    const merged = mergeMeasurements(backfillRef.current, liveRef.current);
    const previous = merged.length > 0 ? merged[merged.length - 1] : null;
    const { snapshot: nextSnapshot } = buildMarketSnapshot({
      tgju: readings.tgju,
      digikala: readings.digikala,
      settings: nextSettings,
      previous,
      now: Date.now(),
    });
    setSnapshot(nextSnapshot);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await fetchMarket(backfillRef.current.length === 0);
      } catch (err) {
        if (!cancelled) setError(readErrorMessage(err, 'خطای ارتباط با سرور'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchMarket]);

  useEffect(() => {
    const intervalSec = Math.max(10, settings.refreshIntervalSec);
    const id = window.setInterval(() => {
      void fetchMarket(false).catch((err) => {
        setError(readErrorMessage(err, 'خطای ارتباط با سرور'));
      });
    }, intervalSec * 1000);
    return () => window.clearInterval(id);
  }, [fetchMarket, settings.refreshIntervalSec]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void fetchMarket(false).catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [fetchMarket]);

  const history = useMemo<HistoryResponse | null>(() => {
    if (live.length === 0 && backfill.length === 0) return null;
    return getHistoryResponse(mergeMeasurements(backfill, live), chartRange, Date.now());
  }, [backfill, chartRange, live]);

  const refreshNow = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchMarket(backfillRef.current.length === 0);
      setError(null);
    } catch (err) {
      setError(readErrorMessage(err, 'خطا در بروزرسانی'));
    } finally {
      setRefreshing(false);
    }
  }, [fetchMarket]);

  const selectReferenceSource = useCallback(
    async (mode: PreferredSource | 'manual', manualPriceToman?: number) => {
      const current = settingsRef.current;
      let partial: Partial<AppSettings>;

      if (mode === 'manual') {
        if (
          manualPriceToman === undefined ||
          !Number.isFinite(manualPriceToman) ||
          manualPriceToman <= 0 ||
          manualPriceToman > 1_000_000_000
        ) {
          throw new Error('قیمت دستی واردشده نامعتبر است.');
        }
        partial = {
          manualOverrideEnabled: true,
          manualOverridePriceToman: Math.round(manualPriceToman),
        };
      } else {
        if (!VALID_SOURCES.has(mode)) {
          throw new Error('حالت انتخاب مرجع نامعتبر است.');
        }
        partial = { preferredSource: mode, manualOverrideEnabled: false };
      }

      const result = mergeAndValidateSettings(current, partial);
      if (!result.ok) {
        throw new Error(result.error ?? 'خطا در ذخیره انتخاب مرجع');
      }
      persistSettings(result.value);
      recomputeSnapshot(result.value);
    },
    [persistSettings, recomputeSnapshot]
  );

  const updateSettings = useCallback(
    async (partial: Partial<AppSettings>) => {
      const result = mergeAndValidateSettings(settingsRef.current, partial);
      if (!result.ok) {
        throw new Error(result.error ?? 'خطا در ذخیره تنظیمات');
      }
      persistSettings(result.value);
      recomputeSnapshot(result.value);
      return result.value;
    },
    [persistSettings, recomputeSnapshot]
  );

  const updateRule = useCallback(
    async (
      id: number,
      updates: Partial<Pick<AlertRuleRecord, 'thresholdValue' | 'windowMinutes' | 'cooldownMinutes' | 'enabled'>>
    ) => {
      const existing = rulesRef.current.find((rule) => rule.id === id);
      if (!existing) {
        throw new Error('قانون هشدار یافت نشد.');
      }

      const nextThreshold =
        updates.thresholdValue !== undefined ? Number(updates.thresholdValue) : existing.thresholdValue;
      if (!Number.isFinite(nextThreshold)) {
        throw new Error('آستانه عددی نامعتبر است.');
      }

      const nextWindow =
        updates.windowMinutes !== undefined ? Number(updates.windowMinutes) : existing.windowMinutes;
      if (!Number.isFinite(nextWindow) || nextWindow < 1 || nextWindow > 10080) {
        throw new Error('بازه زمانی باید بین ۱ تا ۱۰۰۸۰ دقیقه باشد.');
      }

      const nextCooldown =
        updates.cooldownMinutes !== undefined
          ? Number(updates.cooldownMinutes)
          : existing.cooldownMinutes;
      if (!Number.isFinite(nextCooldown) || nextCooldown < 1 || nextCooldown > 10080) {
        throw new Error('زمان انتظار باید بین ۱ تا ۱۰۰۸۰ دقیقه باشد.');
      }

      const updated: AlertRuleRecord = {
        ...existing,
        thresholdValue: nextThreshold,
        windowMinutes: Math.round(nextWindow),
        cooldownMinutes: Math.round(nextCooldown),
        enabled: updates.enabled ?? existing.enabled,
      };

      persistRules(rulesRef.current.map((rule) => (rule.id === id ? updated : rule)));
      return updated;
    },
    [persistRules]
  );

  const acknowledgeAlert = useCallback(
    async (id: number) => {
      persistAlerts(
        alertsRef.current.map((alert) =>
          alert.id === id ? { ...alert, acknowledged: true } : alert
        )
      );
    },
    [persistAlerts]
  );

  const acknowledgeAllAlerts = useCallback(async () => {
    persistAlerts(alertsRef.current.map((alert) => ({ ...alert, acknowledged: true })));
  }, [persistAlerts]);

  return {
    snapshot,
    history,
    chartRange,
    setChartRange,
    alerts,
    rules,
    settings,
    loading,
    refreshing,
    error,
    refreshNow,
    selectReferenceSource,
    updateSettings,
    updateRule,
    acknowledgeAlert,
    acknowledgeAllAlerts,
  };
}
