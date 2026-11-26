import React, { useEffect, useState } from 'react';
import { Check, Database, Save, Smartphone } from 'lucide-react';
import type { AppSettings, ChartRange, PreferredSource, UsdRateSource } from '../../shared/types.ts';
import { PWAInstallButton } from './PWAInstallButton';

interface SettingsViewProps {
  settings: AppSettings | null;
  onSaveSettings: (partial: Partial<AppSettings>) => Promise<AppSettings>;
}

const controlCls =
  'min-h-[42px] w-full rounded-xl border border-white/10 bg-canvas px-3 py-2 text-[12.5px] text-slate-100 tabular-nums transition-colors focus:border-amber-400/50';

const Field: React.FC<{
  label: string;
  hint?: string;
  children: React.ReactNode;
}> = ({ label, hint, children }) => (
  <div>
    <p className="text-[12px] font-medium text-slate-300">{label}</p>
    {hint && <p className="mt-1 text-[10.5px] text-slate-500">{hint}</p>}
    <div className="mt-2">{children}</div>
  </div>
);

export const SettingsView: React.FC<SettingsViewProps> = ({ settings, onSaveSettings }) => {
  const [form, setForm] = useState<AppSettings | null>(settings);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  useEffect(() => {
    if (settings) {
      setForm(settings);
    }
  }, [settings]);

  if (!form) {
    return (
      <div className="rounded-2xl border border-white/[0.07] bg-panel p-8 text-center text-[13px] text-slate-400">
        در حال بارگذاری تنظیمات...
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedNotice(null);
    setErrorNotice(null);
    try {
      await onSaveSettings(form);
      setSavedNotice('تنظیمات در این مرورگر ذخیره و در محاسبات اعمال شد.');
    } catch (err) {
      setErrorNotice(err instanceof Error ? err.message : 'خطا در ذخیره تنظیمات');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-7">
      <div>
        <h1 className="text-[22px] font-extrabold tracking-tight text-slate-50">تنظیمات سامانه، منابع داده و نگهداری</h1>
        <p className="mt-1.5 text-[12.5px] leading-6 text-slate-400">
          پیکربندی بازه بروزرسانی، نحوه محاسبه قیمت مرجع، آستانه اختلاف منابع و رفتار هشدارها
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 rounded-2xl border border-white/[0.07] bg-panel p-5 md:p-6">
        <div className="grid grid-cols-1 gap-x-8 gap-y-5 lg:grid-cols-2">
          <Field label="بازه بروزرسانی خودکار (ثانیه)" hint="حداقل 10 ثانیه، پیشنهاد: 30 ثانیه">
            <input
              type="number"
              min={10}
              max={3600}
              value={form.refreshIntervalSec}
              onChange={(e) => setForm({ ...form, refreshIntervalSec: Number(e.target.value) })}
              className={controlCls}
            />
          </Field>

          <Field label="آستانه اختلاف منابع داخلی (تومان)" hint="مقدار پیش‌فرض: 100,000 تومان">
            <input
              type="number"
              min={0}
              step={10000}
              value={form.discrepancyThresholdToman}
              onChange={(e) => setForm({ ...form, discrepancyThresholdToman: Number(e.target.value) })}
              className={controlCls}
            />
          </Field>

          <Field label="منبع ترجیحی قیمت طلای 18 عیار داخلی">
            <select
              value={form.preferredSource}
              onChange={(e) => setForm({ ...form, preferredSource: e.target.value as PreferredSource })}
              className={controlCls}
            >
              <option value="auto">خودکار (میانگین در محدوده مجاز)</option>
              <option value="tgju">همیشه TGJU</option>
              <option value="digikala">همیشه دیجی‌کالا ولث</option>
            </select>
          </Field>

          <Field
            label="مبنای نرخ ارز در ارزش تئوری"
            hint="دلار آزاد TGJU یا تتر (USDT) — قیمت هر دو از TGJU خوانده می‌شود"
          >
            <select
              value={form.usdRateSource}
              onChange={(e) => setForm({ ...form, usdRateSource: e.target.value as UsdRateSource })}
              className={controlCls}
            >
              <option value="dollar">دلار آزاد TGJU</option>
              <option value="tether">تتر (USDT)</option>
            </select>
          </Field>

          <Field label="بازه زمانی پیش‌فرض نمودارها">
            <select
              value={form.defaultChartRange}
              onChange={(e) => setForm({ ...form, defaultChartRange: e.target.value as ChartRange })}
              className={controlCls}
            >
              <option value="1h">1 ساعت</option>
              <option value="6h">6 ساعت</option>
              <option value="12h">12 ساعت</option>
              <option value="24h">24 ساعت</option>
              <option value="7d">7 روز</option>
              <option value="30d">30 روز</option>
              <option value="1y">1 سال</option>
              <option value="2y">2 سال</option>
              <option value="all">کل تاریخچه</option>
            </select>
          </Field>

          <Field label="آستانه تشخیص داده قدیمی / تاخیر (ثانیه)" hint="پیش‌فرض: 300 ثانیه">
            <input
              type="number"
              min={30}
              max={86400}
              value={form.staleThresholdSec}
              onChange={(e) => setForm({ ...form, staleThresholdSec: Number(e.target.value) })}
              className={controlCls}
            />
          </Field>

          <Field label="محدوده خنثی / نزدیک به صفر (تومان)" hint="پیش‌فرض: 25,000 تومان">
            <input
              type="number"
              min={0}
              step={5000}
              value={form.nearZeroBandToman}
              onChange={(e) => setForm({ ...form, nearZeroBandToman: Number(e.target.value) })}
              className={controlCls}
            />
          </Field>
        </div>

        {/* Toggles */}
        <div className="grid grid-cols-1 gap-4 border-t border-white/[0.06] pt-5 sm:grid-cols-2">
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={form.autoAveraging}
              onChange={(e) => setForm({ ...form, autoAveraging: e.target.checked })}
              className="h-4 w-4 rounded accent-amber-500"
            />
            <span className="text-[12.5px] text-slate-200">میانگین‌گیری خودکار در اختلاف کم</span>
          </label>

          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={form.soundAlertsEnabled}
              onChange={(e) => setForm({ ...form, soundAlertsEnabled: e.target.checked })}
              className="h-4 w-4 rounded accent-amber-500"
            />
            <span className="text-[12.5px] text-slate-200">پخش صدای ظریف هنگام هشدار جدید</span>
          </label>
        </div>

        {/* Manual Price Override */}
        <div className="space-y-3 border-t border-white/[0.06] pt-5">
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={form.manualOverrideEnabled}
              onChange={(e) => setForm({ ...form, manualOverrideEnabled: e.target.checked })}
              className="h-4 w-4 rounded accent-amber-500"
            />
            <span className="text-[12.5px] font-semibold text-amber-200">
              فعال‌سازی قیمت دستی مرجع (در زمان اختلال یا تصمیم تحلیلگر)
            </span>
          </label>

          {form.manualOverrideEnabled && (
            <div className="max-w-sm rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-4">
              <label className="mb-1.5 block text-[11.5px] text-slate-300">
                قیمت دستی هر گرم طلای 18 عیار (تومان)
              </label>
              <input
                type="number"
                min={1}
                step={1000}
                value={form.manualOverridePriceToman ?? ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    manualOverridePriceToman: e.target.value ? Number(e.target.value) : null,
                  })
                }
                placeholder="مثال: 25500000"
                className={`${controlCls} border-amber-400/30`}
              />
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-5">
          <div className="text-[11.5px]">
            {savedNotice && (
              <span className="inline-flex items-center gap-1.5 text-emerald-300">
                <Check className="h-4 w-4" />
                {savedNotice}
              </span>
            )}
            {errorNotice && <span className="text-red-300">{errorNotice}</span>}
          </div>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-gradient-to-l from-amber-500 to-amber-400 px-5 py-2.5 text-[12.5px] font-bold text-slate-950 transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            <span>{saving ? 'در حال ذخیره...' : 'ذخیره تنظیمات'}</span>
          </button>
        </div>
      </form>

      {/* Website installation & local storage guide */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="space-y-3 rounded-2xl border border-white/[0.07] bg-panel p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-lg border border-amber-400/15 bg-amber-400/10 text-amber-300">
                <Smartphone className="h-4 w-4" />
              </span>
              <h2 className="text-[13.5px] font-bold text-slate-100">افزودن به صفحه اصلی موبایل یا دسکتاپ</h2>
            </div>
            <PWAInstallButton compact />
          </div>
          <ol className="list-inside list-decimal space-y-2 text-[11.5px] leading-6 text-slate-400">
            <li>نشانی وب‌اپلیکیشن را در Chrome (اندروید یا دسکتاپ) باز کنید.</li>
            <li>دکمه «نصب اپلیکیشن» در بالای صفحه یا گزینه Add to Home Screen / Install App منوی مرورگر را انتخاب کنید.</li>
            <li>پس از نصب، با یک لمس آیکون برنامه باز می‌شود. بروزرسانی داده‌ها و بررسی هشدارها هنگام باز بودن صفحه انجام می‌شود.</li>
          </ol>
        </section>

        <section className="space-y-3 rounded-2xl border border-white/[0.07] bg-panel p-5">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg border border-sky-400/15 bg-sky-400/10 text-sky-300">
              <Database className="h-4 w-4" />
            </span>
            <h2 className="text-[13.5px] font-bold text-slate-100">محل ذخیره داده‌ها در نسخه وب</h2>
          </div>
          <ul className="list-inside list-disc space-y-2 text-[11.5px] leading-6 text-slate-400">
            <li>این نسخه بدون سرور دائمی و پایگاه داده مرکزی کار می‌کند؛ قیمت‌ها هنگام باز بودن صفحه از منابع دریافت و در همین مرورگر ذخیره می‌شوند.</li>
            <li>سوابق نمودارها، تنظیمات، قوانین هشدار و تاریخچه هشدارها در حافظه محلی مرورگر (localStorage) نگه‌داری می‌شوند و بین گوشی و دسکتاپ همگام نمی‌شوند.</li>
            <li>برای بازه‌های بلندمدت، تا 2 سال داده روزانه TGJU به‌صورت خودکار بارگذاری می‌شود. پاک کردن داده‌های مرورگر این سوابق را حذف می‌کند.</li>
          </ul>
        </section>
      </div>
    </div>
  );
};
