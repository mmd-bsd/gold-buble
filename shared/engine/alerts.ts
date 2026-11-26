import type { AlertRecord, AlertRuleRecord, MeasurementRecord } from '../types.ts';

export type NewAlert = Omit<AlertRecord, 'id'>;

export interface AlertRuleUpdate {
  id: number;
  lastTriggeredAt: number | null;
  lastState: string | null;
}

export interface AlertEvaluationInput {
  current: MeasurementRecord;
  /** Measurement history sorted ascending by timestamp; may include `current`. */
  history: MeasurementRecord[];
  rules: AlertRuleRecord[];
  now?: number;
}

export interface AlertEvaluationResult {
  alerts: NewAlert[];
  ruleUpdates: AlertRuleUpdate[];
}

const compactNumberFormatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

/** Latin-digit compact amount used inside Persian alert sentences. */
function formatFaNumber(val: number): string {
  return compactNumberFormatter.format(Math.round(val));
}

function isInCooldown(rule: AlertRuleRecord, now: number): boolean {
  if (!rule.lastTriggeredAt) return false;
  const elapsedMs = now - rule.lastTriggeredAt;
  return elapsedMs < rule.cooldownMinutes * 60 * 1000;
}

/**
 * Finds the measurement closest to the start of a rule window, mirroring the
 * old SQL behaviour: latest record at or before the target, otherwise the
 * earliest record after it that predates `current`.
 */
function findWindowAnchor(
  history: MeasurementRecord[],
  targetTimestampMs: number,
  current: MeasurementRecord
): MeasurementRecord | null {
  let latestBefore: MeasurementRecord | null = null;
  let earliestAfter: MeasurementRecord | null = null;

  for (const m of history) {
    if (m.id === current.id) continue;
    if (m.timestamp <= targetTimestampMs) {
      if (
        !latestBefore ||
        m.timestamp > latestBefore.timestamp ||
        (m.timestamp === latestBefore.timestamp && m.id > latestBefore.id)
      ) {
        latestBefore = m;
      }
    } else if (m.id < current.id) {
      if (
        !earliestAfter ||
        m.timestamp < earliestAfter.timestamp ||
        (m.timestamp === earliestAfter.timestamp && m.id < earliestAfter.id)
      ) {
        earliestAfter = m;
      }
    }
  }

  return latestBefore ?? earliestAfter;
}

function findPreviousMeasurement(
  history: MeasurementRecord[],
  current: MeasurementRecord
): MeasurementRecord | null {
  let previous: MeasurementRecord | null = null;
  for (const m of history) {
    if (m.id >= current.id) continue;
    if (
      !previous ||
      m.timestamp > previous.timestamp ||
      (m.timestamp === previous.timestamp && m.id > previous.id)
    ) {
      previous = m;
    }
  }
  return previous;
}

/**
 * Evaluates every enabled volatility rule against a single measurement.
 *
 * Unlike the old DB-backed engine this returns alerts and rule-state changes
 * instead of writing them, so the caller can persist them (browser storage
 * in the website build). Rules whose window anchor is far older than the
 * window itself are skipped, which avoids false alerts when the site was
 * closed for hours or days.
 */
export function evaluateVolatilityRules(input: AlertEvaluationInput): AlertEvaluationResult {
  const { current, history, rules } = input;
  const now = input.now ?? Date.now();

  // Never fire automated volatility alerts on incomplete or unavailable measurements
  if (current.dataQuality === 'unavailable' || current.referenceMode === 'unresolved') {
    return { alerts: [], ruleUpdates: [] };
  }

  const workingRules = rules.map((rule) => ({ ...rule }));
  const alerts: NewAlert[] = [];
  const ruleUpdates: AlertRuleUpdate[] = [];

  const recordState = (rule: AlertRuleRecord): void => {
    ruleUpdates.push({
      id: rule.id,
      lastTriggeredAt: rule.lastTriggeredAt,
      lastState: rule.lastState,
    });
  };

  for (const rule of workingRules) {
    if (!rule.enabled) continue;

    const windowStart = current.timestamp - rule.windowMinutes * 60 * 1000;
    const anchor = findWindowAnchor(history, windowStart, current);
    const anchorIsFresh =
      anchor !== null &&
      Math.abs(current.timestamp - anchor.timestamp) <= rule.windowMinutes * 2 * 60 * 1000;

    const createAlertPayload = (
      title: string,
      reason: string,
      previousValue: number | null,
      changeAmount: number | null,
      newState: string | null = null
    ): NewAlert | null => {
      if (isInCooldown(rule, now)) {
        return null;
      }

      const alert: NewAlert = {
        ruleId: rule.id,
        ruleType: rule.ruleType,
        title,
        reason,
        bubbleToman: current.bubbleToman,
        bubblePercent: current.bubblePercent,
        previousValue,
        changeAmount,
        referencePriceToman: current.referencePriceToman,
        theoreticalPriceToman: current.theoreticalPriceToman,
        triggeredAt: now,
        acknowledged: false,
      };

      rule.lastTriggeredAt = now;
      rule.lastState = newState;
      recordState(rule);
      return alert;
    };

    switch (rule.ruleType) {
      case 'bubble_abs_change': {
        if (
          anchorIsFresh &&
          anchor &&
          current.bubbleToman !== null &&
          anchor.bubbleToman !== null
        ) {
          const delta = current.bubbleToman - anchor.bubbleToman;
          if (Math.abs(delta) >= rule.thresholdValue) {
            const direction = delta > 0 ? 'افزایش' : 'کاهش';
            const alert = createAlertPayload(
              `تغییر ${direction}ی حباب طلا`,
              `حباب طلا در ${rule.windowMinutes} دقیقه گذشته به میزان ${formatFaNumber(Math.abs(delta))} تومان ${direction} یافت.`,
              anchor.bubbleToman,
              delta
            );
            if (alert) alerts.push(alert);
          }
        }
        break;
      }

      case 'bubble_pct_change': {
        if (
          anchorIsFresh &&
          anchor &&
          current.bubblePercent !== null &&
          anchor.bubblePercent !== null &&
          anchor.bubblePercent !== undefined
        ) {
          const deltaPct = Number((current.bubblePercent - anchor.bubblePercent).toFixed(2));
          if (Math.abs(deltaPct) >= rule.thresholdValue) {
            const direction = deltaPct > 0 ? 'رشد' : 'افت';
            const alert = createAlertPayload(
              `نوسان درصدی حباب (${Math.abs(deltaPct)}%)`,
              `درصد حباب طلا طی ${rule.windowMinutes} دقیقه اخیر به میزان ${Math.abs(deltaPct)}% ${direction} داشت.`,
              anchor.bubblePercent,
              deltaPct
            );
            if (alert) alerts.push(alert);
          }
        }
        break;
      }

      case 'rapid_domestic': {
        if (
          anchorIsFresh &&
          anchor &&
          current.referencePriceToman !== null &&
          anchor.referencePriceToman !== null
        ) {
          const delta = current.referencePriceToman - anchor.referencePriceToman;
          if (Math.abs(delta) >= rule.thresholdValue) {
            const direction = delta > 0 ? 'افزایش ناگهانی' : 'کاهش ناگهانی';
            const alert = createAlertPayload(
              `${direction} قیمت طلای 18 عیار داخلی`,
              `قیمت مرجع داخلی در ${rule.windowMinutes} دقیقه گذشته ${formatFaNumber(Math.abs(delta))} تومان تغییر کرد.`,
              anchor.referencePriceToman,
              delta
            );
            if (alert) alerts.push(alert);
          }
        }
        break;
      }

      case 'rapid_theoretical': {
        if (
          anchorIsFresh &&
          anchor &&
          current.theoreticalPriceToman !== null &&
          anchor.theoreticalPriceToman !== null
        ) {
          const delta = current.theoreticalPriceToman - anchor.theoreticalPriceToman;
          if (Math.abs(delta) >= rule.thresholdValue) {
            const direction = delta > 0 ? 'صعود' : 'نزول';
            const alert = createAlertPayload(
              `تغییر سریع ارزش تئوری طلا`,
              `ارزش ذاتی 18 عیار طی ${rule.windowMinutes} دقیقه به اندازه ${formatFaNumber(Math.abs(delta))} تومان ${direction} کرد.`,
              anchor.theoreticalPriceToman,
              delta
            );
            if (alert) alerts.push(alert);
          }
        }
        break;
      }

      case 'rapid_usd': {
        if (
          anchorIsFresh &&
          anchor &&
          current.usdToman !== null &&
          anchor.usdToman !== null
        ) {
          const delta = current.usdToman - anchor.usdToman;
          if (Math.abs(delta) >= rule.thresholdValue) {
            const direction = delta > 0 ? 'افزایش' : 'کاهش';
            const alert = createAlertPayload(
              `نوسان سریع نرخ دلار`,
              `نرخ دلار آزاد در ${rule.windowMinutes} دقیقه گذشته ${formatFaNumber(Math.abs(delta))} تومان ${direction} یافت.`,
              anchor.usdToman,
              delta
            );
            if (alert) alerts.push(alert);
          }
        }
        break;
      }

      case 'rapid_ounce': {
        if (
          anchorIsFresh &&
          anchor &&
          current.globalOunceUsd !== null &&
          anchor.globalOunceUsd !== null
        ) {
          const delta = Number((current.globalOunceUsd - anchor.globalOunceUsd).toFixed(2));
          if (Math.abs(delta) >= rule.thresholdValue) {
            const direction = delta > 0 ? 'صعود' : 'ریزش';
            const alert = createAlertPayload(
              `تغییر قابل توجه انس جهانی`,
              `انس جهانی طلا طی ${rule.windowMinutes} دقیقه گذشته ${Math.abs(delta)} دلار ${direction} کرد.`,
              anchor.globalOunceUsd,
              delta
            );
            if (alert) alerts.push(alert);
          }
        }
        break;
      }

      case 'threshold_high': {
        if (current.bubbleToman !== null) {
          const breached = current.bubbleToman >= rule.thresholdValue;
          if (breached && rule.lastState !== 'above') {
            const alert = createAlertPayload(
              `عبور حباب از سقف ${formatFaNumber(rule.thresholdValue)} تومان`,
              `حباب طلا به ${formatFaNumber(current.bubbleToman)} تومان رسید و از آستانه مثبت تعریف‌شده عبور کرد.`,
              rule.thresholdValue,
              current.bubbleToman - rule.thresholdValue,
              'above'
            );
            if (alert) alerts.push(alert);
          } else if (!breached && rule.lastState === 'above') {
            rule.lastState = 'below';
            recordState(rule);
          }
        }
        break;
      }

      case 'threshold_low': {
        if (current.bubbleToman !== null) {
          const breached = current.bubbleToman <= rule.thresholdValue;
          if (breached && rule.lastState !== 'below') {
            const alert = createAlertPayload(
              `افت حباب به زیر ${formatFaNumber(rule.thresholdValue)} تومان`,
              `حباب طلا به ${formatFaNumber(current.bubbleToman)} تومان رسید و وارد محدوده منفی هدف شد.`,
              rule.thresholdValue,
              current.bubbleToman - rule.thresholdValue,
              'below'
            );
            if (alert) alerts.push(alert);
          } else if (!breached && rule.lastState === 'below') {
            rule.lastState = 'above';
            recordState(rule);
          }
        }
        break;
      }

      case 'zero_cross': {
        if (current.bubbleToman !== null) {
          const currentSign =
            current.bubbleToman > 0 ? 'positive' : current.bubbleToman < 0 ? 'negative' : 'zero';
          const prevSign = rule.lastState;
          if (
            prevSign &&
            prevSign !== currentSign &&
            ((prevSign === 'positive' && currentSign === 'negative') ||
              (prevSign === 'negative' && currentSign === 'positive') ||
              currentSign === 'zero')
          ) {
            const crossDesc =
              currentSign === 'positive'
                ? 'حباب از محدوده منفی به محدوده مثبت وارد شد.'
                : currentSign === 'negative'
                  ? 'حباب از محدوده مثبت به محدوده منفی سقوط کرد.'
                  : 'حباب دقیقاً به نقطه تعادل صفر رسید.';
            const prevAnchor = findPreviousMeasurement(history, current);
            const prevVal = prevAnchor?.bubbleToman ?? 0;
            const alert = createAlertPayload(
              'عبور حباب طلا از مرز صفر',
              crossDesc,
              prevVal,
              current.bubbleToman - prevVal,
              currentSign
            );
            if (alert) alerts.push(alert);
          } else if (prevSign !== currentSign) {
            rule.lastState = currentSign;
            recordState(rule);
          }
        }
        break;
      }
    }
  }

  return { alerts, ruleUpdates };
}
