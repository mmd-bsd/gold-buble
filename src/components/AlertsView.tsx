import React, { useState } from 'react';
import { Check, CheckCheck, Info, ShieldAlert } from 'lucide-react';
import type { AlertRecord, AlertRuleRecord } from '../../shared/types.ts';
import {
  formatPercent,
  formatPersianDateTime,
  formatToman,
} from '../utils/formatters';

interface AlertsViewProps {
  alerts: AlertRecord[];
  rules: AlertRuleRecord[];
  onAcknowledgeAlert: (id: number) => Promise<void>;
  onAcknowledgeAll: () => Promise<void>;
  onUpdateRule: (
    id: number,
    updates: Partial<Pick<AlertRuleRecord, 'thresholdValue' | 'windowMinutes' | 'cooldownMinutes' | 'enabled'>>
  ) => Promise<AlertRuleRecord>;
}

const RULE_UNIT_MAP: Record<AlertRuleRecord['ruleType'], string> = {
  bubble_abs_change: 'تومان',
  bubble_pct_change: 'درصد (%)',
  rapid_domestic: 'تومان',
  rapid_theoretical: 'تومان',
  rapid_usd: 'تومان',
  rapid_ounce: 'دلار',
  threshold_high: 'تومان',
  threshold_low: 'تومان',
  zero_cross: 'تومان (صفر)',
};

const inputCls =
  'min-h-[42px] w-full rounded-xl border border-white/10 bg-canvas px-2.5 py-2 text-[12px] text-slate-100 tabular-nums placeholder:text-slate-500 focus:border-amber-400/50 disabled:opacity-50';

export const AlertsView: React.FC<AlertsViewProps> = ({
  alerts,
  rules,
  onAcknowledgeAlert,
  onAcknowledgeAll,
  onUpdateRule,
}) => {
  const [ruleDrafts, setRuleDrafts] = useState<
    Record<number, { thresholdValue: string; windowMinutes: string; cooldownMinutes: string }>
  >({});
  const [savingRuleId, setSavingRuleId] = useState<number | null>(null);
  const [ruleError, setRuleError] = useState<string | null>(null);

  const unreadCount = alerts.filter((a) => !a.acknowledged).length;

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
    setRuleError(null);
    try {
      await onUpdateRule(rule.id, {
        thresholdValue: Number(draft.thresholdValue),
        windowMinutes: Number(draft.windowMinutes),
        cooldownMinutes: Number(draft.cooldownMinutes),
      });
    } catch (err) {
      setRuleError(err instanceof Error ? err.message : 'خطا در ذخیره قانون');
    } finally {
      setSavingRuleId(null);
    }
  };

  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-[22px] font-extrabold tracking-tight text-slate-50">هشدارها و قوانین</h1>
        <p className="mt-1.5 text-[12.5px] leading-6 text-slate-400">
          تاریخچه هشدارها، پایش درون‌صفحه‌ای و تنظیم آستانه‌های نوسان
        </p>
      </div>

      {/* In-page monitoring notice */}
      <section className="rounded-2xl border border-amber-400/15 bg-amber-400/[0.05] p-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-amber-400/20 bg-amber-400/10 text-amber-300">
            <Info className="h-[18px] w-[18px]" />
          </span>
          <div>
            <h2 className="text-[14px] font-bold text-slate-50">پایش نوسانات و هشدارهای درون‌صفحه‌ای</h2>
            <p className="mt-1.5 text-[12.5px] leading-6 text-slate-300">
              هنگام باز بودن صفحه، داده‌ها هر چند ثانیه بروزرسانی و قوانین هشدار بررسی می‌شوند. هشدارها، قوانین و تنظیمات در همین مرورگر ذخیره می‌شوند و پس از بستن صفحه اعلان پس‌زمینه ارسال نمی‌شود.
            </p>
          </div>
        </div>
      </section>

      {/* Triggered Alerts History */}
      <section className="space-y-4 rounded-2xl border border-white/[0.07] bg-panel p-5 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] pb-3.5">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg border border-amber-400/15 bg-amber-400/10 text-amber-300">
              <ShieldAlert className="h-4 w-4" />
            </span>
            <h2 className="text-[14px] font-bold text-slate-50">تاریخچه هشدارهای ثبت‌شده</h2>
            <span className="text-[11.5px] tabular-nums text-slate-500">
              {new Intl.NumberFormat('en-US').format(unreadCount)} خوانده‌نشده
            </span>
          </div>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => void onAcknowledgeAll()}
              className="inline-flex min-h-[36px] items-center gap-1.5 text-[12px] font-semibold text-amber-300 transition-colors hover:text-amber-200"
            >
              <CheckCheck className="h-4 w-4" />
              <span>تایید همه هشدارها</span>
            </button>
          )}
        </div>

        {alerts.length === 0 ? (
          <div className="py-12 text-center text-[12.5px] text-slate-500">
            هنوز هیچ هشداری ثبت نشده است. با عبور نوسانات بازار از آستانه‌های زیر، هشدارها اینجا نمایش داده می‌شوند.
          </div>
        ) : (
          <div className="divide-y divide-white/[0.05]">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className={`flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between ${
                  alert.acknowledged ? 'opacity-60' : ''
                }`}
              >
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13.5px] font-semibold text-slate-100">{alert.title}</span>
                    <span aria-hidden="true" className="text-slate-600">·</span>
                    <span className="text-[11px] tabular-nums text-slate-500">
                      {formatPersianDateTime(alert.triggeredAt)}
                    </span>
                  </div>
                  <p className="text-[12px] leading-6 text-slate-400">{alert.reason}</p>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-[11px] tabular-nums text-slate-500">
                    <span>
                      حباب فعلی:{' '}
                      <strong className="font-semibold text-slate-300" dir="ltr">
                        {formatToman(alert.bubbleToman, true)}
                      </strong>{' '}
                      <span dir="ltr">{formatPercent(alert.bubblePercent, true)}</span>
                    </span>
                    {alert.previousValue !== null && (
                      <span>
                        مقدار قبلی: <span dir="ltr">{formatToman(alert.previousValue, true)}</span>
                      </span>
                    )}
                    {alert.changeAmount !== null && (
                      <span>
                        تغییر: <span dir="ltr">{formatToman(alert.changeAmount, true)}</span>
                      </span>
                    )}
                    <span>
                      مرجع: <span dir="ltr">{formatToman(alert.referencePriceToman)}</span>
                    </span>
                    <span>
                      تئوری: <span dir="ltr">{formatToman(alert.theoreticalPriceToman)}</span>
                    </span>
                  </div>
                </div>

                {!alert.acknowledged && (
                  <button
                    type="button"
                    onClick={() => void onAcknowledgeAlert(alert.id)}
                    className="inline-flex min-h-[38px] shrink-0 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[11.5px] font-medium text-slate-200 transition-colors hover:border-amber-400/40 hover:text-amber-200"
                  >
                    <Check className="h-3.5 w-3.5" />
                    <span>تایید</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Configurable Rules */}
      <section className="space-y-4 rounded-2xl border border-white/[0.07] bg-panel p-5 md:p-6">
        <div>
          <h2 className="text-[14px] font-bold text-slate-50">تنظیم قوانین و آستانه‌های هشدار</h2>
          <p className="mt-1.5 text-[12px] leading-6 text-slate-400">
            آستانه‌ها، پنجره‌های زمانی و مدت انتظار جلوگیری از تکرار (Cooldown) به صورت زنده قابل تغییر هستند.
          </p>
          {ruleError && <p className="mt-2 text-[11.5px] text-red-300">{ruleError}</p>}
        </div>

        <div className="divide-y divide-white/[0.05]">
          <div className="hidden grid-cols-12 items-center gap-3 pb-2 lg:grid">
            <span className="col-span-4 text-[10.5px] font-medium text-slate-500">قانون</span>
            <span className="col-span-2 text-[10.5px] font-medium text-slate-500">آستانه</span>
            <span className="col-span-2 text-[10.5px] font-medium text-slate-500">بازه بررسی (دقیقه)</span>
            <span className="col-span-2 text-[10.5px] font-medium text-slate-500">تکرار مجدد (دقیقه)</span>
            <span className="col-span-2" />
          </div>
          {rules.map((rule) => {
            const draft = getDraft(rule);
            return (
              <div key={rule.id} className="grid grid-cols-3 items-center gap-2 py-4 lg:grid-cols-12 lg:gap-3">
                <div className="col-span-3 flex items-center gap-3 lg:col-span-4">
                  <label className="flex h-9 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg">
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={(e) => void onUpdateRule(rule.id, { enabled: e.target.checked })}
                      className="h-4 w-4 cursor-pointer rounded accent-amber-500"
                      aria-label={`فعال‌سازی ${rule.name}`}
                    />
                  </label>
                  <div>
                    <p className="text-[13px] font-semibold text-slate-200">{rule.name}</p>
                    <p className="mt-0.5 text-[10.5px] text-slate-500">واحد: {RULE_UNIT_MAP[rule.ruleType]}</p>
                  </div>
                </div>

                <div className="col-span-1 lg:col-span-2">
                  <label className="mb-1 block min-h-[30px] text-[10.5px] font-medium leading-4 text-slate-400 lg:hidden">آستانه</label>
                  <input
                    type="number"
                    step={rule.ruleType === 'bubble_pct_change' ? '0.1' : '1'}
                    value={draft.thresholdValue}
                    disabled={rule.ruleType === 'zero_cross'}
                    onChange={(e) => setDraftField(rule, 'thresholdValue', e.target.value)}
                    className={inputCls}
                  />
                </div>

                <div className="col-span-1 lg:col-span-2">
                  <label className="mb-1 block min-h-[30px] text-[10.5px] font-medium leading-4 text-slate-400 lg:hidden">بازه بررسی (دقیقه)</label>
                  <input
                    type="number"
                    min={1}
                    value={draft.windowMinutes}
                    onChange={(e) => setDraftField(rule, 'windowMinutes', e.target.value)}
                    className={inputCls}
                  />
                </div>

                <div className="col-span-1 lg:col-span-2">
                  <label className="mb-1 block min-h-[30px] text-[10.5px] font-medium leading-4 text-slate-400 lg:hidden">تکرار مجدد (دقیقه)</label>
                  <input
                    type="number"
                    min={1}
                    value={draft.cooldownMinutes}
                    onChange={(e) => setDraftField(rule, 'cooldownMinutes', e.target.value)}
                    className={inputCls}
                  />
                </div>

                <div className="col-span-3 flex justify-end lg:col-span-2">
                  <button
                    type="button"
                    disabled={savingRuleId === rule.id}
                    onClick={() => void handleSaveRule(rule)}
                    className="min-h-[42px] w-auto min-w-[120px] rounded-xl border border-white/10 bg-white/[0.02] px-4 py-2 text-[11.5px] font-semibold text-slate-300 transition-colors hover:border-amber-400/30 hover:text-amber-200 disabled:opacity-60"
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
