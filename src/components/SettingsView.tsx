import React, { useEffect, useState } from 'react';
import { Check, Database, Save, Smartphone } from 'lucide-react';
import type { AppSettings, ChartRange, PreferredSource } from '../../shared/types.ts';
import { PWAInstallButton } from './PWAInstallButton';

interface SettingsViewProps {
  settings: AppSettings | null;
  onSaveSettings: (partial: Partial<AppSettings>) => Promise<AppSettings>;
}

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
      <div className="rounded-xl border border-slate-800 bg-[#111827] p-8 text-center text-sm text-slate-400">
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
      setSavedNotice('تنظیمات با موفقیت ذخیره و در موتور محاسبه اعمال شد.');
    } catch (err) {
      setErrorNotice(err instanceof Error ? err.message : 'خطا در ذخیره تنظیمات');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-100">تنظیمات سامانه، منابع داده و نگهداری</h1>
        <p className="text-xs text-slate-400 mt-1">
          پیکربندی بازه جمع‌آوری داده، نحوه محاسبه قیمت مرجع، آستانه اختلاف منابع و راهنمای استقرار اندروید
        </p>
      </div>

      <form onSubmit={handleSubmit} className="rounded-xl border border-slate-800 bg-[#111827] p-5 md:p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-2">
              بازه بروزرسانی خودکار سرور (ثانیه)
            </label>
            <input
              type="number"
              min={10}
              max={3600}
              value={form.refreshIntervalSec}
              onChange={(e) => setForm({ ...form, refreshIntervalSec: Number(e.target.value) })}
              className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2.5 text-sm text-slate-100 font-mono-tabular"
            />
            <p className="text-[11px] text-slate-500 mt-1">حداقل ۱۰ ثانیه، پیشنهاد: ۳۰ ثانیه</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-2">
              آستانه اختلاف منابع داخلی (تومان)
            </label>
            <input
              type="number"
              min={0}
              step={10000}
              value={form.discrepancyThresholdToman}
              onChange={(e) => setForm({ ...form, discrepancyThresholdToman: Number(e.target.value) })}
              className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2.5 text-sm text-slate-100 font-mono-tabular"
            />
            <p className="text-[11px] text-slate-500 mt-1">مقدار پیش‌فرض: ۱۰۰٬۰۰۰ تومان</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-2">
              منبع ترجیحی قیمت طلای ۱۸ عیار داخلی
            </label>
            <select
              value={form.preferredSource}
              onChange={(e) => setForm({ ...form, preferredSource: e.target.value as PreferredSource })}
              className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2.5 text-sm text-slate-100"
            >
              <option value="auto">خودکار (میانگین در محدوده مجاز)</option>
              <option value="tgju">همیشه TGJU</option>
              <option value="digikala">همیشه دیجی‌کالا ولث</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-2">
              بازه زمانی پیش‌فرض نمودارها
            </label>
            <select
              value={form.defaultChartRange}
              onChange={(e) => setForm({ ...form, defaultChartRange: e.target.value as ChartRange })}
              className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2.5 text-sm text-slate-100"
            >
              <option value="1h">۱ ساعت</option>
              <option value="6h">۶ ساعت</option>
              <option value="12h">۱۲ ساعت</option>
              <option value="24h">۲۴ ساعت</option>
              <option value="7d">۷ روز</option>
              <option value="30d">۳۰ روز</option>
              <option value="all">کل تاریخچه</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-2">
              آستانه تشخیص داده قدیمی / تاخیر (ثانیه)
            </label>
            <input
              type="number"
              min={30}
              max={86400}
              value={form.staleThresholdSec}
              onChange={(e) => setForm({ ...form, staleThresholdSec: Number(e.target.value) })}
              className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2.5 text-sm text-slate-100 font-mono-tabular"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-2">
              محدوده خنثی / نزدیک به صفر (تومان)
            </label>
            <input
              type="number"
              min={0}
              step={5000}
              value={form.nearZeroBandToman}
              onChange={(e) => setForm({ ...form, nearZeroBandToman: Number(e.target.value) })}
              className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2.5 text-sm text-slate-100 font-mono-tabular"
            />
          </div>
        </div>

        {/* Toggles */}
        <div className="pt-4 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.autoAveraging}
              onChange={(e) => setForm({ ...form, autoAveraging: e.target.checked })}
              className="w-4 h-4 accent-amber-500"
            />
            <span className="text-xs text-slate-200">میانگین‌گیری خودکار در اختلاف کم</span>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.notificationsEnabled}
              onChange={(e) => setForm({ ...form, notificationsEnabled: e.target.checked })}
              className="w-4 h-4 accent-amber-500"
            />
            <span className="text-xs text-slate-200">ارسال اعلان‌های پوش پس‌زمینه</span>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.soundAlertsEnabled}
              onChange={(e) => setForm({ ...form, soundAlertsEnabled: e.target.checked })}
              className="w-4 h-4 accent-amber-500"
            />
            <span className="text-xs text-slate-200">پخش صدای ظریف هنگام هشدار جدید</span>
          </label>
        </div>

        {/* Manual Price Override */}
        <div className="pt-4 border-t border-slate-800 space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.manualOverrideEnabled}
              onChange={(e) => setForm({ ...form, manualOverrideEnabled: e.target.checked })}
              className="w-4 h-4 accent-amber-500"
            />
            <span className="text-sm font-medium text-amber-300">
              فعال‌سازی قیمت دستی مرجع (Override در زمان اختلال یا تصمیم تحلیلگر)
            </span>
          </label>

          {form.manualOverrideEnabled && (
            <div className="max-w-sm">
              <label className="block text-xs text-slate-400 mb-1.5">
                قیمت دستی هر گرم طلای ۱۸ عیار (تومان)
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
                placeholder="مثال: ۲۵۵۰۰۰۰۰"
                className="w-full rounded-lg border border-amber-500/40 bg-[#0B0F17] px-3 py-2.5 text-sm text-slate-100 font-mono-tabular"
              />
            </div>
          )}
        </div>

        <div className="pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs">
            {savedNotice && (
              <span className="inline-flex items-center gap-1.5 text-emerald-400">
                <Check className="w-4 h-4" />
                {savedNotice}
              </span>
            )}
            {errorNotice && <span className="text-red-400">{errorNotice}</span>}
          </div>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-5 py-2.5 text-xs font-semibold text-slate-950 hover:bg-amber-400 transition-colors min-h-[42px]"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'در حال ذخیره...' : 'ذخیره تنظیمات'}</span>
          </button>
        </div>
      </form>

      {/* Phase 5: Android PWA Installation & Backup Guide */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <section className="rounded-xl border border-slate-800 bg-[#111827] p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-semibold text-slate-100">نصب روی اندروید (PWA)</h2>
            </div>
            <PWAInstallButton compact />
          </div>
          <ol className="text-xs text-slate-300 space-y-2 leading-relaxed list-decimal list-inside">
            <li>نشانی وب‌اپلیکیشن را در مرورگر Chrome گوشی اندروید باز کنید.</li>
            <li>دکمه «نصب اپلیکیشن» در بالای صفحه یا گزینه Add to Home Screen منوی کروم را انتخاب کنید.</li>
            <li>برای دریافت هشدارها حتی هنگام بسته بودن مرورگر، در بخش «هشدارها» گزینه «فعال‌سازی اعلان پوش» را تایید کنید.</li>
          </ol>
        </section>

        <section className="rounded-xl border border-slate-800 bg-[#111827] p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-sky-400" />
            <h2 className="text-sm font-semibold text-slate-100">استقرار سرور و پشتیبان‌گیری</h2>
          </div>
          <ul className="text-xs text-slate-300 space-y-2 leading-relaxed list-disc list-inside">
            <li>اجرای دائمی سرور پس‌زمینه روی لینوکس/سرور ابری با دستور <code className="font-mono text-amber-300" dir="ltr">npm run build && npm start</code> و مدیریت فرآیند توسط PM2 یا systemd.</li>
            <li>تمام سوابق تاریخی، قوانین هشدار و تنظیمات در فایل SQLite مسیر <code className="font-mono text-sky-300" dir="ltr">data/gold_monitor.db</code> ذخیره می‌شوند.</li>
            <li>برای پشتیبان‌گیری روزانه، کپی‌برداری از فایل <code className="font-mono text-slate-200" dir="ltr">data/gold_monitor.db</code> و برای بازیابی، جایگزینی آن پیش از شروع سرور کافی است.</li>
          </ul>
        </section>
      </div>
    </div>
  );
};
