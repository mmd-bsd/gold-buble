import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AlertRecord,
  AlertRuleRecord,
  AppSettings,
  ChartRange,
  HistoryResponse,
  MarketSnapshot,
  PreferredSource,
} from '../../shared/types.ts';

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function playSubtleAlertTone(): void {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null);
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [chartRange, setChartRange] = useState<ChartRange>('24h');
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [rules, setRules] = useState<AlertRuleRecord[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission>('default');
  const latestAlertIdRef = useRef<number | null>(null);
  const initialRangeLoadedRef = useRef(false);

  const fetchHistory = useCallback(async (range: ChartRange) => {
    try {
      const res = await fetch(`/api/history?range=${encodeURIComponent(range)}`);
      if (!res.ok) return;
      const data = (await res.json()) as HistoryResponse;
      setHistory(data);
    } catch {
      // Preserve last loaded history
    }
  }, []);

  const fetchAll = useCallback(async (activeRange: ChartRange) => {
    try {
      const [latestRes, alertsRes, rulesRes, settingsRes] = await Promise.all([
        fetch('/api/market/latest'),
        fetch('/api/alerts?limit=80'),
        fetch('/api/rules'),
        fetch('/api/settings'),
      ]);

      if (!latestRes.ok) {
        throw new Error('خطا در دریافت داده‌های بازار');
      }

      const latestData = (await latestRes.json()) as MarketSnapshot;
      setSnapshot(latestData);

      let loadedSettings: AppSettings | null = null;
      if (settingsRes.ok) {
        const sJson = (await settingsRes.json()) as { settings: AppSettings };
        loadedSettings = sJson.settings;
        setSettings(sJson.settings);
        if (!initialRangeLoadedRef.current && sJson.settings.defaultChartRange) {
          initialRangeLoadedRef.current = true;
          setChartRange(sJson.settings.defaultChartRange);
          void fetchHistory(sJson.settings.defaultChartRange);
        } else {
          void fetchHistory(activeRange);
        }
      } else {
        void fetchHistory(activeRange);
      }

      if (alertsRes.ok) {
        const aJson = (await alertsRes.json()) as { alerts: AlertRecord[] };
        setAlerts(aJson.alerts);
        const newestId = aJson.alerts[0]?.id ?? null;
        if (
          latestAlertIdRef.current !== null &&
          newestId !== null &&
          newestId > latestAlertIdRef.current &&
          loadedSettings?.soundAlertsEnabled
        ) {
          playSubtleAlertTone();
        }
        latestAlertIdRef.current = newestId;
      }

      if (rulesRes.ok) {
        const rJson = (await rulesRes.json()) as { rules: AlertRuleRecord[] };
        setRules(rJson.rules);
      }

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطای ارتباط با سرور');
    } finally {
      setLoading(false);
    }
  }, [fetchHistory]);

  useEffect(() => {
    void fetchAll(chartRange);
  }, []);

  useEffect(() => {
    void fetchHistory(chartRange);
  }, [chartRange, fetchHistory]);

  useEffect(() => {
    const intervalSec = Math.max(10, settings?.refreshIntervalSec ?? 30);
    const id = window.setInterval(() => {
      void fetchAll(chartRange);
    }, intervalSec * 1000);
    return () => window.clearInterval(id);
  }, [chartRange, fetchAll, settings?.refreshIntervalSec]);

  useEffect(() => {
    const supported =
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window;
    setPushSupported(supported);
    if (supported) {
      setPushPermission(Notification.permission);
      navigator.serviceWorker.ready
        .then((reg) => reg.pushManager.getSubscription())
        .then((sub) => setPushSubscribed(!!sub))
        .catch(() => {});
    }
  }, []);

  const refreshNow = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch('/api/market/refresh', { method: 'POST' });
      if (!res.ok) throw new Error('بروزرسانی با خطا مواجه شد');
      const data = (await res.json()) as MarketSnapshot;
      setSnapshot(data);
      await Promise.all([fetchHistory(chartRange), fetchAll(chartRange)]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در بروزرسانی');
    } finally {
      setRefreshing(false);
    }
  }, [chartRange, fetchAll, fetchHistory]);

  const selectReferenceSource = useCallback(
    async (mode: PreferredSource | 'manual', manualPriceToman?: number) => {
      const res = await fetch('/api/market/reference-selection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, manualPriceToman }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || 'خطا در ذخیره انتخاب مرجع');
      }
      const data = (await res.json()) as { snapshot: MarketSnapshot | null; settings: AppSettings };
      if (data.snapshot) setSnapshot(data.snapshot);
      if (data.settings) setSettings(data.settings);
      await fetchHistory(chartRange);
    },
    [chartRange, fetchHistory]
  );

  const updateSettings = useCallback(
    async (partial: Partial<AppSettings>) => {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(partial),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || 'خطا در ذخیره تنظیمات');
      }
      const data = (await res.json()) as { settings: AppSettings; snapshot: MarketSnapshot | null };
      setSettings(data.settings);
      if (data.snapshot) setSnapshot(data.snapshot);
      return data.settings;
    },
    []
  );

  const updateRule = useCallback(
    async (
      id: number,
      updates: Partial<Pick<AlertRuleRecord, 'thresholdValue' | 'windowMinutes' | 'cooldownMinutes' | 'enabled'>>
    ) => {
      const res = await fetch(`/api/rules/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || 'خطا در بروزرسانی قانون');
      }
      const data = (await res.json()) as { rule: AlertRuleRecord };
      setRules((prev) => prev.map((r) => (r.id === id ? data.rule : r)));
      return data.rule;
    },
    []
  );

  const acknowledgeAlert = useCallback(async (id: number) => {
    await fetch(`/api/alerts/${id}/ack`, { method: 'POST' });
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, acknowledged: true } : a)));
  }, []);

  const acknowledgeAllAlerts = useCallback(async () => {
    await fetch('/api/alerts/ack-all', { method: 'POST' });
    setAlerts((prev) => prev.map((a) => ({ ...a, acknowledged: true })));
  }, []);

  const subscribePush = useCallback(async () => {
    if (!pushSupported) {
      throw new Error('مرورگر شما از Web Push پشتیبانی نمی‌کند');
    }
    const permission = await Notification.requestPermission();
    setPushPermission(permission);
    if (permission !== 'granted') {
      throw new Error('دسترسی ارسال اعلان توسط مرورگر تایید نشد');
    }
    const keyRes = await fetch('/api/push/vapid-public-key');
    const { publicKey } = (await keyRes.json()) as { publicKey: string };
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
    const jsonSub = sub.toJSON();
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(jsonSub),
    });
    setPushSubscribed(true);
  }, [pushSupported]);

  const unsubscribePush = useCallback(async () => {
    if (!pushSupported) return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await fetch('/api/push/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });
      await sub.unsubscribe();
    }
    setPushSubscribed(false);
  }, [pushSupported]);

  const sendTestPush = useCallback(async () => {
    const res = await fetch('/api/push/test', { method: 'POST' });
    return (await res.json()) as { sent: number; failed: number };
  }, []);

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
    pushSupported,
    pushSubscribed,
    pushPermission,
    refreshNow,
    selectReferenceSource,
    updateSettings,
    updateRule,
    acknowledgeAlert,
    acknowledgeAllAlerts,
    subscribePush,
    unsubscribePush,
    sendTestPush,
  };
}
