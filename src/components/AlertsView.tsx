import React, { useState } from 'react';
import { Bell, BellOff, Check, CheckCheck, Send, ShieldAlert } from 'lucide-react';
import type { AlertRecord, AlertRuleRecord } from '../../shared/types.ts';
import {
  formatPercent,
  formatPersianDateTime,
  formatToman,
} from '../utils/formatters';

interface AlertsViewProps {
  alerts: AlertRecord[];
  rules: AlertRuleRecord[];
  pushSupported: boolean;
  pushSubscribed: boolean;
  pushPermission: NotificationPermission;
  onAcknowledgeAlert: (id: number) => Promise<void>;
  onAcknowledgeAll: () => Promise<void>;
  onUpdateRule: (
    id: number,
    updates: Partial<Pick<AlertRuleRecord, 'thresholdValue' | 'windowMinutes' | 'cooldownMinutes' | 'enabled'>>
  ) => Promise<AlertRuleRecord>;
  onSubscribePush: () => Promise<void>;
  onUnsubscribePush: () => Promise<void>;
  onSendTestPush: () => Promise<{ sent: number; failed: number }>;
}

const RULE_UNIT_MAP: Record<AlertRuleRecord['ruleType'], string> = {
  bubble_abs_change: 'تومان',
  bubble_pct_change: 'درصد (٪)',
  rapid_domestic: 'تومان',
  rapid_theoretical: 'تومان',
  rapid_usd: 'تومان',
  rapid_ounce: 'دلار',
  threshold_high: 'تومان',
  threshold_low: 'تومان',
  zero_cross: 'تومان (صفر)',
};

export const AlertsView: React.FC<AlertsViewProps> = ({
  alerts,
  rules,
  pushSupported,
  pushSubscribed,
  pushPermission,
  onAcknowledgeAlert,
  onAcknowledgeAll,
  onUpdateRule,
  onSubscribePush,
  onUnsubscribePush,
  onSendTestPush,
}) => {
  const [pushMessage, setPushMessage] = useState<string | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [ruleDrafts, setRuleDrafts] = useState<
    Record<number, { thresholdValue: string; windowMinutes: string; cooldownMinutes: string }>
  >({});
  const [savingRuleId, setSavingRuleId] = useState<number | null>(null);

  const unreadCount = alerts.filter((a) => !a.acknowledged).length;

  const handleTogglePush = async () => {
    setPushBusy(true);
    setPushMessage(null);
    try {
      if (pushSubscribed) {
        await onUnsubscribePush();
        setPushMessage('اشتراک اعلان‌های پس‌زمینه غیرفعال شد.');
      } else {
        await onSubscribePush();
        setPushMessage('اعلان‌های پس‌زمینه (Web Push) با موفقیت فعال شد.');
      }
    } catch (err) {
      setPushMessage(err instanceof Error ? err.message : 'خطا در تنظیم اعلان');
    } finally {
      setPushBusy(false);
    }
  };

  const handleTestPush = async () => {
    setPushBusy(true);
    setPushMessage(null);
    try {
      const res = await onSendTestPush();
      setPushMessage(
        res.sent > 0
          ? `اعلان آزمایشی به ${res.sent} دستگاه ارسال شد.`
          : 'هیچ دستگاه فعالی برای دریافت Web Push ثبت نشده است.'
      );
    } catch {
      setPushMessage('خطا در ارسال اعلان آزمایشی.');
    } finally {
      setPushBusy(false);
    }
  };

  const getDraft = (rule: AlertRuleRecord) => {
    return (
      ruleDrafts[rule.id] ?? {
        thresholdValue: String(rule.thresholdValue),
        windowMinutes: String(rule.windowMinutes),
        cooldownMinutes: String(rule.cooldownMinutes),
      }
    );
  };

  const setDraftField = (
    rule: AlertRuleRecord,
    field: 'thresholdValue' | 'windowMinutes' | 'cooldownMinutes',
    value: string
  ) => {
    const current = getDraft(rule);
    setRuleDrafts((prev) => ({
      ...prev,
      [rule.id]: { ...current, [field]: value },
    }));
  };

  const handleSaveRule = async (rule: AlertRuleRecord) => {
    const draft = getDraft(rule);
    setSavingRuleId(rule.id);
    try {
      await onUpdateRule(rule.id, {
        thresholdValue: Number(draft.thresholdValue),
        windowMinutes: Number(draft.windowMinutes),
        cooldownMinutes: Number(draft.cooldownMinutes),
      });
    } finally {
      setSavingRuleId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Web Push Subscription Banner */}
      <section className="rounded-xl border border-slate-800 bg-[#111827] p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            {pushSubscribed ? (
              <Bell className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            ) : (
              <BellOff className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
            )}
            <div>
              <h1 className="text-base font-bold text-slate-100">
                سیستم پایش نوسانات و اعلان‌های پس‌زمینه (Web Push)
              </h1>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                سرور به صورت مستقل در پس‌زمینه قیمت‌ها را بررسی می‌کند و حتی در زمان بسته بودن مرورگر، هشدارهای نوسان را به گوشی اندروید یا دسکتاپ ارسال می‌کند.
              </p>
              <p className="text-xs text-slate-500 mt-1.5">
                وضعیت مرورگر: {pushSupported ? (pushSubscribed ? 'فعال و متصل' : `غیرفعال (${pushPermission})`) : 'پشتیبانی نمی‌شود'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {pushSupported && (
              <button
                type="button"
                disabled={pushBusy}
                onClick={handleTogglePush}
                className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors min-h-[40px] whitespace-nowrap ${
                  pushSubscribed
                    ? 'border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800'
                    : 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                }`}
              >
                {pushSubscribed ? 'لغو اعلان پس‌زمینه' : 'فعال‌سازی اعلان پوش'}
              </button>
            )}
            {pushSubscribed && (
              <button
                type="button"
                disabled={pushBusy}
                onClick={handleTestPush}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-700 bg-slate-900 text-xs text-slate-200 hover:border-amber-500/40 min-h-[40px] whitespace-nowrap"
              >
                <Send className="w-3.5 h-3.5" />
                <span>تست اعلان</span>
              </button>
            )}
          </div>
        </div>
        {pushMessage && <p className="mt-3 text-xs text-amber-300">{pushMessage}</p>}
      </section>

      {/* Triggered Alerts History */}
      <section className="rounded-xl border border-slate-800 bg-[#111827] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-semibold text-slate-100">تاریخچه هشدارهای ثبت‌شده</h2>
            <span className="text-xs text-slate-400 font-mono-tabular">
              ({new Intl.NumberFormat('fa-IR').format(unreadCount)} خوانده‌نشده)
            </span>
          </div>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={onAcknowledgeAll}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-400 hover:text-amber-300 min-h-[36px]"
            >
              <CheckCheck className="w-4 h-4" />
              <span>تایید همه هشدارها</span>
            </button>
          )}
        </div>

        {alerts.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-500">
            هنوز هیچ هشداری ثبت نشده است. با عبور نوسانات بازار از آستانه‌های زیر، هشدارها اینجا نمایش داده می‌شوند.
          </div>
        ) : (
          <div className="divide-y divide-slate-800/80">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className={`py-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between ${
                  alert.acknowledged ? 'opacity-65' : ''
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-slate-100">{alert.title}</span>
                    <span aria-hidden="true" className="text-slate-600">·</span>
                    <span className="text-xs text-slate-400 font-mono-tabular">
                      {formatPersianDateTime(alert.triggeredAt)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">{alert.reason}</p>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 font-mono-tabular pt-1">
                    <span>
                      حباب فعلی: <strong className="text-slate-200">{formatToman(alert.bubbleToman, true)} ت</strong> ({formatPercent(alert.bubblePercent, true)})
                    </span>
                    {alert.previousValue !== null && (
                      <span>مقدار قبلی: {formatToman(alert.previousValue, true)}</span>
                    )}
                    {alert.changeAmount !== null && (
                      <span>تغییر: {formatToman(alert.changeAmount, true)}</span>
                    )}
                    <span>مرجع: {formatToman(alert.referencePriceToman)} ت</span>
                    <span>تئوری: {formatToman(alert.theoreticalPriceToman)} ت</span>
                  </div>
                </div>

                {!alert.acknowledged && (
                  <button
                    type="button"
                    onClick={() => onAcknowledgeAlert(alert.id)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-200 hover:border-amber-500/50 shrink-0 min-h-[40px]"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>تایید</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Configurable Rules Table */}
      <section className="rounded-xl border border-slate-800 bg-[#111827] p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">تنظیم قوانین و آستانه‌های هشدار</h2>
          <p className="text-xs text-slate-400 mt-1">
            تمام آستانه‌ها، پنجره‌های زمانی و مدت انتظار جلوگیری از تکرار (Cooldown) به صورت زنده قابل تغییر هستند.
          </p>
        </div>

        <div className="divide-y divide-slate-800/80">
          {rules.map((rule) => {
            const draft = getDraft(rule);
            return (
              <div
                key={rule.id}
                className="py-4 grid grid-cols-1 lg:grid-cols-12 gap-3 items-center"
              >
                <div className="lg:col-span-4 flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={rule.enabled}
                    onChange={(e) => onUpdateRule(rule.id, { enabled: e.target.checked })}
                    className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                    aria-label={`فعال‌سازی ${rule.name}`}
                  />
                  <div>
                    <p className="text-sm font-medium text-slate-200">{rule.name}</p>
                    <p className="text-xs text-slate-500">واحد: {RULE_UNIT_MAP[rule.ruleType]}</p>
                  </div>
                </div>

                <div className="lg:col-span-2">
                  <label className="block text-[11px] text-slate-400 mb-1">آستانه</label>
                  <input
                    type="number"
                    step={rule.ruleType === 'bubble_pct_change' ? '0.1' : '1'}
                    value={draft.thresholdValue}
                    disabled={rule.ruleType === 'zero_cross'}
                    onChange={(e) => setDraftField(rule, 'thresholdValue', e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-2.5 py-2 text-xs text-slate-100 font-mono-tabular disabled:opacity-50"
                  />
                </div>

                <div className="lg:col-span-2">
                  <label className="block text-[11px] text-slate-400 mb-1">بازه بررسی (دقیقه)</label>
                  <input
                    type="number"
                    min={1}
                    value={draft.windowMinutes}
                    onChange={(e) => setDraftField(rule, 'windowMinutes', e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-2.5 py-2 text-xs text-slate-100 font-mono-tabular"
                  />
                </div>

                <div className="lg:col-span-2">
                  <label className="block text-[11px] text-slate-400 mb-1">تکرار مجدد (دقیقه)</label>
                  <input
                    type="number"
                    min={1}
                    value={draft.cooldownMinutes}
                    onChange={(e) => setDraftField(rule, 'cooldownMinutes', e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-2.5 py-2 text-xs text-slate-100 font-mono-tabular"
                  />
                </div>

                <div className="lg:col-span-2 flex justify-end">
                  <button
                    type="button"
                    disabled={savingRuleId === rule.id}
                    onClick={() => handleSaveRule(rule)}
                    className="w-full lg:w-auto px-4 py-2 rounded-lg border border-amber-500/40 bg-amber-500/15 text-xs font-medium text-amber-300 hover:bg-amber-500/25 transition-colors min-h-[38px]"
                  >
                    {savingRuleId === rule.id ? 'در حال ذخیره...' : 'ذخیره قانون'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
