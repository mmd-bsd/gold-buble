import type { AlertRecord, AlertRuleRecord, MeasurementRecord } from '../../shared/types.ts';
import type { GoldMonitorDatabase } from '../db.ts';

function formatFaNumber(val: number): string {
  return new Intl.NumberFormat('fa-IR').format(Math.round(val));
}

function isInCooldown(rule: AlertRuleRecord, now: number): boolean {
  if (!rule.lastTriggeredAt) return false;
  const elapsedMs = now - rule.lastTriggeredAt;
  return elapsedMs < rule.cooldownMinutes * 60 * 1000;
}

export function evaluateVolatilityRules(
  db: GoldMonitorDatabase,
  current: MeasurementRecord,
  now = Date.now()
): AlertRecord[] {
  // Never fire automated volatility alerts on incomplete or unavailable measurements
  if (current.dataQuality === 'unavailable' || current.referenceMode === 'unresolved') {
    return [];
  }

  const rules = db.getRules();
  const triggeredAlerts: AlertRecord[] = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;

    const windowAnchor = db.getMeasurementClosestTo(
      current.timestamp - rule.windowMinutes * 60 * 1000,
      current.id
    );

    const createAlertPayload = (
      title: string,
      reason: string,
      previousValue: number | null,
      changeAmount: number | null,
      newState: string | null = null
    ): AlertRecord | null => {
      if (isInCooldown(rule, now)) {
        return null;
      }

      const saved = db.insertAlert({
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
      });

      db.updateRuleTriggerState(rule.id, now, newState);
      return saved;
    };

    switch (rule.ruleType) {
      case 'bubble_abs_change': {
        if (
          current.bubbleToman !== null &&
          windowAnchor?.bubbleToman !== null &&
          windowAnchor?.bubbleToman !== undefined
        ) {
          const delta = current.bubbleToman - windowAnchor.bubbleToman;
          if (Math.abs(delta) >= rule.thresholdValue) {
            const direction = delta > 0 ? 'افزایش' : 'کاهش';
            const alert = createAlertPayload(
              `تغییر ${direction}ی حباب طلا`,
              `حباب طلا در ${rule.windowMinutes} دقیقه گذشته به میزان ${formatFaNumber(Math.abs(delta))} تومان ${direction} یافت.`,
              windowAnchor.bubbleToman,
              delta
            );
            if (alert) triggeredAlerts.push(alert);
          }
        }
        break;
      }

      case 'bubble_pct_change': {
        if (
          current.bubblePercent !== null &&
          windowAnchor?.bubblePercent !== null &&
          windowAnchor?.bubblePercent !== undefined
        ) {
          const deltaPct = Number((current.bubblePercent - windowAnchor.bubblePercent).toFixed(2));
          if (Math.abs(deltaPct) >= rule.thresholdValue) {
            const direction = deltaPct > 0 ? 'رشد' : 'افت';
            const alert = createAlertPayload(
              `نوسان درصدی حباب (${Math.abs(deltaPct)}٪)`,
              `درصد حباب طلا طی ${rule.windowMinutes} دقیقه اخیر به میزان ${Math.abs(deltaPct)}٪ ${direction} داشت.`,
              windowAnchor.bubblePercent,
              deltaPct
            );
            if (alert) triggeredAlerts.push(alert);
          }
        }
        break;
      }

      case 'rapid_domestic': {
        if (
          current.referencePriceToman !== null &&
          windowAnchor?.referencePriceToman !== null &&
          windowAnchor?.referencePriceToman !== undefined
        ) {
          const delta = current.referencePriceToman - windowAnchor.referencePriceToman;
          if (Math.abs(delta) >= rule.thresholdValue) {
            const direction = delta > 0 ? 'افزایش ناگهانی' : 'کاهش ناگهانی';
            const alert = createAlertPayload(
              `${direction} قیمت طلای ۱۸ عیار داخلی`,
              `قیمت مرجع داخلی در ${rule.windowMinutes} دقیقه گذشته ${formatFaNumber(Math.abs(delta))} تومان تغییر کرد.`,
              windowAnchor.referencePriceToman,
              delta
            );
            if (alert) triggeredAlerts.push(alert);
          }
        }
        break;
      }

      case 'rapid_theoretical': {
        if (
          current.theoreticalPriceToman !== null &&
          windowAnchor?.theoreticalPriceToman !== null &&
          windowAnchor?.theoreticalPriceToman !== undefined
        ) {
          const delta = current.theoreticalPriceToman - windowAnchor.theoreticalPriceToman;
          if (Math.abs(delta) >= rule.thresholdValue) {
            const direction = delta > 0 ? 'صعود' : 'نزول';
            const alert = createAlertPayload(
              `تغییر سریع ارزش تئوری طلا`,
              `ارزش ذاتی ۱۸ عیار طی ${rule.windowMinutes} دقیقه به اندازه ${formatFaNumber(Math.abs(delta))} تومان ${direction} کرد.`,
              windowAnchor.theoreticalPriceToman,
              delta
            );
            if (alert) triggeredAlerts.push(alert);
          }
        }
        break;
      }

      case 'rapid_usd': {
        if (
          current.usdToman !== null &&
          windowAnchor?.usdToman !== null &&
          windowAnchor?.usdToman !== undefined
        ) {
          const delta = current.usdToman - windowAnchor.usdToman;
          if (Math.abs(delta) >= rule.thresholdValue) {
            const direction = delta > 0 ? 'افزایش' : 'کاهش';
            const alert = createAlertPayload(
              `نوسان سریع نرخ دلار`,
              `نرخ دلار آزاد در ${rule.windowMinutes} دقیقه گذشته ${formatFaNumber(Math.abs(delta))} تومان ${direction} یافت.`,
              windowAnchor.usdToman,
              delta
            );
            if (alert) triggeredAlerts.push(alert);
          }
        }
        break;
      }

      case 'rapid_ounce': {
        if (
          current.globalOunceUsd !== null &&
          windowAnchor?.globalOunceUsd !== null &&
          windowAnchor?.globalOunceUsd !== undefined
        ) {
          const delta = Number((current.globalOunceUsd - windowAnchor.globalOunceUsd).toFixed(2));
          if (Math.abs(delta) >= rule.thresholdValue) {
            const direction = delta > 0 ? 'صعود' : 'ریزش';
            const alert = createAlertPayload(
              `تغییر قابل توجه انس جهانی`,
              `انس جهانی طلا طی ${rule.windowMinutes} دقیقه گذشته ${Math.abs(delta)} دلار ${direction} کرد.`,
              windowAnchor.globalOunceUsd,
              delta
            );
            if (alert) triggeredAlerts.push(alert);
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
            if (alert) triggeredAlerts.push(alert);
          } else if (!breached && rule.lastState === 'above') {
            db.updateRuleTriggerState(rule.id, rule.lastTriggeredAt, 'below');
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
            if (alert) triggeredAlerts.push(alert);
          } else if (!breached && rule.lastState === 'below') {
            db.updateRuleTriggerState(rule.id, rule.lastTriggeredAt, 'above');
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
            const prevAnchor = db.getPreviousMeasurement(current.id);
            const prevVal = prevAnchor?.bubbleToman ?? 0;
            const alert = createAlertPayload(
              'عبور حباب طلا از مرز صفر',
              crossDesc,
              prevVal,
              current.bubbleToman - prevVal,
              currentSign
            );
            if (alert) triggeredAlerts.push(alert);
          } else if (!prevSign) {
            db.updateRuleTriggerState(rule.id, rule.lastTriggeredAt, currentSign);
          } else if (prevSign !== currentSign) {
            db.updateRuleTriggerState(rule.id, rule.lastTriggeredAt, currentSign);
          }
        }
        break;
      }
    }
  }

  return triggeredAlerts;
}
