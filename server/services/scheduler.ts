import type {
  CollectorReading,
  DataQuality,
  DigikalaRawData,
  MarketSnapshot,
  MeasurementRecord,
  TgjuRawData,
} from '../../shared/types.ts';
import { collectDigikala } from '../collectors/digikala.ts';
import { collectTgju, fetchTgjuDailyHistory } from '../collectors/tgju.ts';
import type { GoldMonitorDatabase } from '../db.ts';
import {
  calculateBubble,
  calculateTheoretical18KToman,
  resolveReferencePrice,
} from '../engine/calculator.ts';
import { tgjuRialPerGramToToman, usdRialToToman } from '../engine/normalization.ts';
import { evaluateVolatilityRules } from '../engine/volatility.ts';
import type { PushNotificationService } from './push.ts';

export class MarketScheduler {
  private readonly db: GoldMonitorDatabase;
  private readonly pushService: PushNotificationService;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private stopped = false;
  private nextRefreshAt: number | null = null;
  private latestSnapshot: MarketSnapshot | null = null;

  constructor(db: GoldMonitorDatabase, pushService: PushNotificationService) {
    this.db = db;
    this.pushService = pushService;
  }

  async start(): Promise<void> {
    this.stopped = false;
    await this.backfillIfNeeded();
    await this.runCycle();
    this.scheduleNext();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  reschedule(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.stopped) {
      this.scheduleNext();
    }
  }

  private scheduleNext(): void {
    const settings = this.db.getSettings();
    const intervalMs = Math.max(10, settings.refreshIntervalSec) * 1000;
    this.nextRefreshAt = Date.now() + intervalMs;
    this.timer = setTimeout(async () => {
      await this.runCycle();
      if (!this.stopped) {
        this.scheduleNext();
      }
    }, intervalMs);
  }

  private async backfillIfNeeded(): Promise<void> {
    if (this.db.getMeasurementCount() >= 5) {
      return;
    }

    try {
      const [usdHist, goldHist, onsHist] = await Promise.all([
        fetchTgjuDailyHistory('price_dollar_rl', 45),
        fetchTgjuDailyHistory('geram18', 45),
        fetchTgjuDailyHistory('ons', 45),
      ]);

      // Only backfill dates where all three real market inputs exist
      if (usdHist.length === 0 || goldHist.length === 0 || onsHist.length === 0) {
        return;
      }

      const usdMap = new Map(usdHist.map((d) => [d.dateGregorian, d]));
      const onsMap = new Map(onsHist.map((d) => [d.dateGregorian, d]));

      for (const goldDay of goldHist) {
        const usdDay = usdMap.get(goldDay.dateGregorian);
        const onsDay = onsMap.get(goldDay.dateGregorian);
        if (!usdDay || !onsDay) continue;

        const theo = calculateTheoretical18KToman(onsDay.closeValue, usdDay.closeValue);
        const tgjuGoldToman = tgjuRialPerGramToToman(goldDay.closeValue);
        const bubble = calculateBubble(tgjuGoldToman, theo.roundedToman);

        this.db.insertMeasurement({
          timestamp: goldDay.timestampMs,
          usdIrr: usdDay.closeValue,
          usdToman: usdRialToToman(usdDay.closeValue),
          globalOunceUsd: onsDay.closeValue,
          tgjuGold18Toman: tgjuGoldToman,
          digikalaGold18Toman: null,
          referencePriceToman: tgjuGoldToman,
          referenceMode: 'tgju_fallback',
          theoreticalPriceToman: theo.roundedToman,
          bubbleToman: bubble.bubbleToman,
          bubblePercent: bubble.bubblePercent,
          discrepancyToman: null,
          discrepancyExceeded: false,
          dataQuality: 'cached',
          tgjuStatus: 'cached',
          digikalaStatus: 'unavailable',
          tgjuSourceTs: goldDay.dateGregorian,
          digikalaSourceTs: null,
        });
      }
    } catch {
      // Backfill is best-effort; never block live startup
    }
  }

  private computeDataQuality(
    tgju: CollectorReading<TgjuRawData>,
    digikala: CollectorReading<DigikalaRawData>,
    manualOverride: boolean
  ): DataQuality {
    if (manualOverride) return 'manual';
    if (tgju.status === 'unavailable' && digikala.status === 'unavailable') return 'unavailable';
    if (tgju.status === 'unavailable') return 'unavailable'; // Theoretical requires USD + Ounce from TGJU
    if (tgju.status === 'live' && digikala.status === 'live') return 'live';
    if (tgju.status === 'delayed' || digikala.status === 'delayed') return 'delayed';
    if (tgju.status === 'cached' || digikala.status === 'cached') return 'cached';
    return 'partial';
  }

  async runCycle(): Promise<MarketSnapshot> {
    if (this.running && this.latestSnapshot) {
      return this.latestSnapshot;
    }

    this.running = true;
    try {
      const settings = this.db.getSettings();
      const [tgju, digikala] = await Promise.all([
        collectTgju(settings.staleThresholdSec),
        collectDigikala(),
      ]);

      const now = Date.now();
      this.db.logCollectorCheck({
        source: 'tgju',
        status: tgju.status,
        latencyMs: tgju.latencyMs,
        sourceTimestamp: tgju.sourceTimestamp,
        errorMessage: tgju.error,
        checkedAt: now,
      });
      this.db.logCollectorCheck({
        source: 'digikala',
        status: digikala.status,
        latencyMs: digikala.latencyMs,
        sourceTimestamp: digikala.sourceTimestamp,
        errorMessage: digikala.error,
        checkedAt: now,
      });

      const snapshot = this.buildAndPersistSnapshot(tgju, digikala, now, true);
      this.latestSnapshot = snapshot;
      return snapshot;
    } finally {
      this.running = false;
    }
  }

  recalculateWithCurrentSources(): MarketSnapshot | null {
    if (!this.latestSnapshot) return null;
    const { tgju, digikala } = this.latestSnapshot.collectors;
    const snapshot = this.buildAndPersistSnapshot(tgju, digikala, Date.now(), false);
    this.latestSnapshot = snapshot;
    return snapshot;
  }

  private buildAndPersistSnapshot(
    tgju: CollectorReading<TgjuRawData>,
    digikala: CollectorReading<DigikalaRawData>,
    now: number,
    evaluateAlerts: boolean
  ): MarketSnapshot {
    const settings = this.db.getSettings();

    const tgjuValid = tgju.data !== null && tgju.status !== 'unavailable';
    const digikalaValid = digikala.data !== null && digikala.status !== 'unavailable';

    const usdIrr = tgju.data?.usdIrr ?? null;
    const usdToman = tgju.data?.usdToman ?? null;
    const globalOunceUsd = tgju.data?.onsUsd ?? null;
    const tgjuGold18Toman = tgju.data?.gold18TomanPerGram ?? null;
    const digikalaGold18Toman = digikala.data?.gold18TomanPerGram ?? null;

    const theoreticalPriceToman =
      tgjuValid && usdIrr !== null && globalOunceUsd !== null
        ? calculateTheoretical18KToman(globalOunceUsd, usdIrr).roundedToman
        : null;

    const refRes = resolveReferencePrice({
      tgjuToman: tgjuGold18Toman,
      digikalaToman: digikalaGold18Toman,
      tgjuValid,
      digikalaValid,
      autoAveraging: settings.autoAveraging,
      discrepancyThresholdToman: settings.discrepancyThresholdToman,
      preferredSource: settings.preferredSource,
      manualOverrideEnabled: settings.manualOverrideEnabled,
      manualOverridePriceToman: settings.manualOverridePriceToman,
    });

    const bubbleRes =
      refRes.referencePriceToman !== null && theoreticalPriceToman !== null
        ? calculateBubble(
            refRes.referencePriceToman,
            theoreticalPriceToman,
            settings.nearZeroBandToman
          )
        : null;

    const dataQuality = this.computeDataQuality(
      tgju,
      digikala,
      refRes.referenceMode === 'manual'
    );

    const recordPayload: Omit<MeasurementRecord, 'id'> = {
      timestamp: now,
      usdIrr,
      usdToman,
      globalOunceUsd,
      tgjuGold18Toman,
      digikalaGold18Toman,
      referencePriceToman: refRes.referencePriceToman,
      referenceMode: refRes.referenceMode,
      theoreticalPriceToman,
      bubbleToman: bubbleRes?.bubbleToman ?? null,
      bubblePercent: bubbleRes?.bubblePercent ?? null,
      discrepancyToman: refRes.discrepancyToman,
      discrepancyExceeded: refRes.discrepancyExceeded,
      dataQuality,
      tgjuStatus: tgju.status,
      digikalaStatus: digikala.status,
      tgjuSourceTs: tgju.sourceTimestamp,
      digikalaSourceTs: digikala.sourceTimestamp,
    };

    const { record: saved } = this.db.insertMeasurement(recordPayload);
    const previous = this.db.getPreviousMeasurement(saved.id);

    if (evaluateAlerts) {
      const alerts = evaluateVolatilityRules(this.db, saved, now);
      if (alerts.length > 0) {
        void this.pushService.sendAlertNotifications(alerts);
      }
    }

    const deltaFromPrevious = {
      bubbleToman:
        saved.bubbleToman !== null && previous?.bubbleToman !== null && previous?.bubbleToman !== undefined
          ? saved.bubbleToman - previous.bubbleToman
          : null,
      bubblePercent:
        saved.bubblePercent !== null &&
        previous?.bubblePercent !== null &&
        previous?.bubblePercent !== undefined
          ? Number((saved.bubblePercent - previous.bubblePercent).toFixed(4))
          : null,
      referencePriceToman:
        saved.referencePriceToman !== null &&
        previous?.referencePriceToman !== null &&
        previous?.referencePriceToman !== undefined
          ? saved.referencePriceToman - previous.referencePriceToman
          : null,
      theoreticalPriceToman:
        saved.theoreticalPriceToman !== null &&
        previous?.theoreticalPriceToman !== null &&
        previous?.theoreticalPriceToman !== undefined
          ? saved.theoreticalPriceToman - previous.theoreticalPriceToman
          : null,
    };

    return {
      latest: saved,
      previous,
      deltaFromPrevious,
      collectors: {
        tgju: {
          ...tgju,
          ageSeconds: tgju.sourceTimestampMs
            ? Math.max(0, Math.floor((now - tgju.sourceTimestampMs) / 1000))
            : tgju.ageSeconds,
        },
        digikala: {
          ...digikala,
          ageSeconds: digikala.sourceTimestampMs
            ? Math.max(0, Math.floor((now - digikala.sourceTimestampMs) / 1000))
            : digikala.ageSeconds,
        },
      },
      discrepancy: {
        active: refRes.discrepancyExceeded,
        differenceToman: refRes.discrepancyToman,
        thresholdToman: settings.discrepancyThresholdToman,
        requiresSelection: refRes.requiresUserSelection,
        tgjuPriceToman: tgjuGold18Toman,
        digikalaPriceToman: digikalaGold18Toman,
      },
      bubbleStatus: {
        sign: bubbleRes?.sign ?? null,
        isNearZero: bubbleRes?.isNearZero ?? false,
      },
      serverTime: now,
      nextRefreshAt: this.nextRefreshAt,
    };
  }

  getLatestSnapshot(): MarketSnapshot | null {
    if (this.latestSnapshot) {
      const now = Date.now();
      return {
        ...this.latestSnapshot,
        serverTime: now,
        collectors: {
          tgju: {
            ...this.latestSnapshot.collectors.tgju,
            ageSeconds: this.latestSnapshot.collectors.tgju.sourceTimestampMs
              ? Math.max(0, Math.floor((now - this.latestSnapshot.collectors.tgju.sourceTimestampMs) / 1000))
              : this.latestSnapshot.collectors.tgju.ageSeconds,
          },
          digikala: {
            ...this.latestSnapshot.collectors.digikala,
            ageSeconds: this.latestSnapshot.collectors.digikala.sourceTimestampMs
              ? Math.max(0, Math.floor((now - this.latestSnapshot.collectors.digikala.sourceTimestampMs) / 1000))
              : this.latestSnapshot.collectors.digikala.ageSeconds,
          },
        },
      };
    }

    const latest = this.db.getLatestMeasurement();
    if (!latest) return null;
    const previous = this.db.getPreviousMeasurement(latest.id);
    const settings = this.db.getSettings();
    return {
      latest,
      previous,
      deltaFromPrevious: {
        bubbleToman:
          latest.bubbleToman !== null && previous?.bubbleToman != null
            ? latest.bubbleToman - previous.bubbleToman
            : null,
        bubblePercent:
          latest.bubblePercent !== null && previous?.bubblePercent != null
            ? Number((latest.bubblePercent - previous.bubblePercent).toFixed(4))
            : null,
        referencePriceToman:
          latest.referencePriceToman !== null && previous?.referencePriceToman != null
            ? latest.referencePriceToman - previous.referencePriceToman
            : null,
        theoreticalPriceToman:
          latest.theoreticalPriceToman !== null && previous?.theoreticalPriceToman != null
            ? latest.theoreticalPriceToman - previous.theoreticalPriceToman
            : null,
      },
      collectors: {
        tgju: {
          source: 'tgju',
          status: latest.tgjuStatus,
          data: null,
          fetchedAt: latest.timestamp,
          sourceTimestamp: latest.tgjuSourceTs,
          sourceTimestampMs: latest.timestamp,
          ageSeconds: Math.max(0, Math.floor((Date.now() - latest.timestamp) / 1000)),
          latencyMs: 0,
          error: null,
        },
        digikala: {
          source: 'digikala',
          status: latest.digikalaStatus,
          data: null,
          fetchedAt: latest.timestamp,
          sourceTimestamp: latest.digikalaSourceTs,
          sourceTimestampMs: latest.timestamp,
          ageSeconds: Math.max(0, Math.floor((Date.now() - latest.timestamp) / 1000)),
          latencyMs: 0,
          error: null,
        },
      },
      discrepancy: {
        active: latest.discrepancyExceeded,
        differenceToman: latest.discrepancyToman,
        thresholdToman: settings.discrepancyThresholdToman,
        requiresSelection: latest.referenceMode === 'unresolved',
        tgjuPriceToman: latest.tgjuGold18Toman,
        digikalaPriceToman: latest.digikalaGold18Toman,
      },
      bubbleStatus: {
        sign:
          latest.bubbleToman === null
            ? null
            : latest.bubbleToman > 0
              ? 'positive'
              : latest.bubbleToman < 0
                ? 'negative'
                : 'zero',
        isNearZero:
          latest.bubbleToman !== null && Math.abs(latest.bubbleToman) <= settings.nearZeroBandToman,
      },
      serverTime: Date.now(),
      nextRefreshAt: this.nextRefreshAt,
    };
  }
}
