import express from 'express';
import type { AppSettings, ChartRange, PreferredSource } from '../shared/types.ts';
import type { GoldMonitorDatabase } from './db.ts';
import type { PushNotificationService } from './services/push.ts';
import type { MarketScheduler } from './services/scheduler.ts';

const VALID_RANGES = new Set<ChartRange>(['1h', '6h', '12h', '24h', '7d', '30d', 'all']);
const VALID_SOURCES = new Set<PreferredSource>(['auto', 'tgju', 'digikala']);

export function createApiRouter(
  db: GoldMonitorDatabase,
  scheduler: MarketScheduler,
  pushService: PushNotificationService
): express.Router {
  const router = express.Router();
  router.use(express.json({ limit: '64kb' }));

  router.get('/health', (_req, res) => {
    res.json({ ok: true, time: Date.now(), measurements: db.getMeasurementCount() });
  });

  router.get('/market/latest', async (_req, res) => {
    const existing = scheduler.getLatestSnapshot();
    if (existing) {
      res.json(existing);
      return;
    }
    const fresh = await scheduler.runCycle();
    res.json(fresh);
  });

  router.post('/market/refresh', async (_req, res) => {
    const fresh = await scheduler.runCycle();
    res.json(fresh);
  });

  router.post('/market/reference-selection', (req, res) => {
    const body = (req.body ?? {}) as {
      mode?: unknown;
      manualPriceToman?: unknown;
    };

    const mode = body.mode;
    if (mode === 'manual') {
      const price = Number(body.manualPriceToman);
      if (!Number.isFinite(price) || price <= 0 || price > 1_000_000_000) {
        res.status(400).json({ error: 'قیمت دستی واردشده نامعتبر است.' });
        return;
      }
      db.updateSettings({
        manualOverrideEnabled: true,
        manualOverridePriceToman: Math.round(price),
      });
    } else if (typeof mode === 'string' && VALID_SOURCES.has(mode as PreferredSource)) {
      db.updateSettings({
        preferredSource: mode as PreferredSource,
        manualOverrideEnabled: false,
      });
    } else {
      res.status(400).json({ error: 'حالت انتخاب مرجع نامعتبر است.' });
      return;
    }

    const updated = scheduler.recalculateWithCurrentSources();
    res.json({ ok: true, snapshot: updated, settings: db.getSettings() });
  });

  router.get('/history', (req, res) => {
    const rawRange = String(req.query.range || '24h') as ChartRange;
    const range: ChartRange = VALID_RANGES.has(rawRange) ? rawRange : '24h';
    const history = db.getHistory(range);
    res.json({ range, ...history });
  });

  router.get('/alerts', (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    res.json({ alerts: db.getAlerts(limit) });
  });

  router.post('/alerts/:id/ack', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'شناسه هشدار نامعتبر است.' });
      return;
    }
    const ok = db.acknowledgeAlert(id);
    res.json({ ok });
  });

  router.post('/alerts/ack-all', (_req, res) => {
    db.acknowledgeAllAlerts();
    res.json({ ok: true });
  });

  router.get('/rules', (_req, res) => {
    res.json({ rules: db.getRules() });
  });

  router.put('/rules/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'شناسه قانون نامعتبر است.' });
      return;
    }

    const body = (req.body ?? {}) as {
      thresholdValue?: unknown;
      windowMinutes?: unknown;
      cooldownMinutes?: unknown;
      enabled?: unknown;
    };

    const updates: {
      thresholdValue?: number;
      windowMinutes?: number;
      cooldownMinutes?: number;
      enabled?: boolean;
    } = {};

    if (body.thresholdValue !== undefined) {
      const val = Number(body.thresholdValue);
      if (!Number.isFinite(val)) {
        res.status(400).json({ error: 'آستانه عددی نامعتبر است.' });
        return;
      }
      updates.thresholdValue = val;
    }
    if (body.windowMinutes !== undefined) {
      const w = Number(body.windowMinutes);
      if (!Number.isFinite(w) || w < 1 || w > 10080) {
        res.status(400).json({ error: 'بازه زمانی باید بین ۱ تا ۱۰۰۸۰ دقیقه باشد.' });
        return;
      }
      updates.windowMinutes = Math.round(w);
    }
    if (body.cooldownMinutes !== undefined) {
      const c = Number(body.cooldownMinutes);
      if (!Number.isFinite(c) || c < 1 || c > 10080) {
        res.status(400).json({ error: 'زمان انتظار باید بین ۱ تا ۱۰۰۸۰ دقیقه باشد.' });
        return;
      }
      updates.cooldownMinutes = Math.round(c);
    }
    if (body.enabled !== undefined) {
      updates.enabled = Boolean(body.enabled);
    }

    const updated = db.updateRule(id, updates);
    if (!updated) {
      res.status(404).json({ error: 'قانون هشدار یافت نشد.' });
      return;
    }
    res.json({ rule: updated });
  });

  router.get('/settings', (_req, res) => {
    res.json({ settings: db.getSettings() });
  });

  router.put('/settings', (req, res) => {
    const body = (req.body ?? {}) as Partial<AppSettings>;
    const sanitized: Partial<AppSettings> = {};

    if (body.refreshIntervalSec !== undefined) {
      const v = Number(body.refreshIntervalSec);
      if (!Number.isFinite(v) || v < 10 || v > 3600) {
        res.status(400).json({ error: 'بازه بروزرسانی باید بین ۱۰ تا ۳۶۰۰ ثانیه باشد.' });
        return;
      }
      sanitized.refreshIntervalSec = Math.round(v);
    }
    if (body.preferredSource !== undefined) {
      if (!VALID_SOURCES.has(body.preferredSource)) {
        res.status(400).json({ error: 'منبع ترجیحی نامعتبر است.' });
        return;
      }
      sanitized.preferredSource = body.preferredSource;
    }
    if (body.autoAveraging !== undefined) {
      sanitized.autoAveraging = Boolean(body.autoAveraging);
    }
    if (body.discrepancyThresholdToman !== undefined) {
      const v = Number(body.discrepancyThresholdToman);
      if (!Number.isFinite(v) || v < 0 || v > 50_000_000) {
        res.status(400).json({ error: 'آستانه اختلاف منابع نامعتبر است.' });
        return;
      }
      sanitized.discrepancyThresholdToman = Math.round(v);
    }
    if (body.staleThresholdSec !== undefined) {
      const v = Number(body.staleThresholdSec);
      if (!Number.isFinite(v) || v < 30 || v > 86400) {
        res.status(400).json({ error: 'آستانه کهنگی داده نامعتبر است.' });
        return;
      }
      sanitized.staleThresholdSec = Math.round(v);
    }
    if (body.defaultChartRange !== undefined) {
      if (!VALID_RANGES.has(body.defaultChartRange)) {
        res.status(400).json({ error: 'بازه نمودار نامعتبر است.' });
        return;
      }
      sanitized.defaultChartRange = body.defaultChartRange;
    }
    if (body.manualOverrideEnabled !== undefined) {
      sanitized.manualOverrideEnabled = Boolean(body.manualOverrideEnabled);
    }
    if (body.manualOverridePriceToman !== undefined) {
      if (body.manualOverridePriceToman === null) {
        sanitized.manualOverridePriceToman = null;
      } else {
        const v = Number(body.manualOverridePriceToman);
        if (!Number.isFinite(v) || v <= 0 || v > 1_000_000_000) {
          res.status(400).json({ error: 'قیمت دستی نامعتبر است.' });
          return;
        }
        sanitized.manualOverridePriceToman = Math.round(v);
      }
    }
    if (body.notificationsEnabled !== undefined) {
      sanitized.notificationsEnabled = Boolean(body.notificationsEnabled);
    }
    if (body.soundAlertsEnabled !== undefined) {
      sanitized.soundAlertsEnabled = Boolean(body.soundAlertsEnabled);
    }
    if (body.nearZeroBandToman !== undefined) {
      const v = Number(body.nearZeroBandToman);
      if (!Number.isFinite(v) || v < 0 || v > 5_000_000) {
        res.status(400).json({ error: 'محدوده نزدیک به صفر نامعتبر است.' });
        return;
      }
      sanitized.nearZeroBandToman = Math.round(v);
    }

    const updated = db.updateSettings(sanitized);
    if (sanitized.refreshIntervalSec !== undefined) {
      scheduler.reschedule();
    }
    const snapshot = scheduler.recalculateWithCurrentSources();
    res.json({ settings: updated, snapshot });
  });

  router.get('/push/vapid-public-key', (_req, res) => {
    res.json({ publicKey: pushService.getPublicKey() });
  });

  router.post('/push/subscribe', (req, res) => {
    const body = (req.body ?? {}) as {
      endpoint?: unknown;
      keys?: { p256dh?: unknown; auth?: unknown };
    };

    if (
      typeof body.endpoint !== 'string' ||
      !body.endpoint.startsWith('https://') ||
      typeof body.keys?.p256dh !== 'string' ||
      typeof body.keys?.auth !== 'string'
    ) {
      res.status(400).json({ error: 'اطلاعات اشتراک اعلان نامعتبر است.' });
      return;
    }

    db.upsertPushSubscription({
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
    });
    res.json({ ok: true });
  });

  router.post('/push/unsubscribe', (req, res) => {
    const endpoint = (req.body as { endpoint?: unknown })?.endpoint;
    if (typeof endpoint === 'string' && endpoint.length > 0) {
      db.removePushSubscription(endpoint);
    }
    res.json({ ok: true });
  });

  router.post('/push/test', async (_req, res) => {
    const result = await pushService.sendTestNotification();
    res.json(result);
  });

  return router;
}
