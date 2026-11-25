import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Calculator,
  CheckCircle2,
  Clock,
  Minus,
  RefreshCw,
  Scale,
  SlidersHorizontal,
} from 'lucide-react';
import type { ChartRange, MarketSnapshot, PreferredSource } from '../../shared/types.ts';
import {
  formatAgeSeconds,
  formatIrr,
  formatPercent,
  formatPersianDateTime,
  formatToman,
  formatUsd,
  getDataQualityLabel,
  getReferenceModeLabel,
  getSourceStatusLabel,
} from '../utils/formatters';
import { BubbleChartPanel, type ChartMode } from './BubbleChartPanel';

interface DashboardViewProps {
  snapshot: MarketSnapshot | null;
  historyPoints: MarketSnapshot['latest'] extends infer T ? Array<NonNullable<T>> : never;
  chartRange: ChartRange;
  onRangeChange: (range: ChartRange) => void;
  onRefresh: () => Promise<void>;
  refreshing: boolean;
  onSelectReference: (mode: PreferredSource | 'manual', manualPrice?: number) => Promise<void>;
  onOpenCharts: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  snapshot,
  historyPoints,
  chartRange,
  onRangeChange,
  onRefresh,
  refreshing,
  onSelectReference,
  onOpenCharts,
}) => {
  const [chartMode, setChartMode] = useState<ChartMode>('bubble_toman');
  const [manualInput, setManualInput] = useState('');
  const [showManualForm, setShowManualForm] = useState(false);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [savingSelection, setSavingSelection] = useState(false);

  const latest = snapshot?.latest ?? null;
  const tgju = snapshot?.collectors.tgju;
  const digikala = snapshot?.collectors.digikala;
  const discrepancy = snapshot?.discrepancy;
  const bubbleSign = snapshot?.bubbleStatus.sign;
  const isNearZero = snapshot?.bubbleStatus.isNearZero ?? false;

  const handleSelectSource = async (mode: PreferredSource) => {
    setSavingSelection(true);
    setSelectionError(null);
    try {
      await onSelectReference(mode);
      setShowManualForm(false);
    } catch (err) {
      setSelectionError(err instanceof Error ? err.message : 'خطا در ثبت انتخاب');
    } finally {
      setSavingSelection(false);
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numeric = Number(manualInput.replace(/[,٬\s]/g, ''));
    if (!Number.isFinite(numeric) || numeric <= 0) {
      setSelectionError('لطفاً مبلغ معتبر به تومان وارد کنید.');
      return;
    }
    setSavingSelection(true);
    setSelectionError(null);
    try {
      await onSelectReference('manual', numeric);
      setShowManualForm(false);
      setManualInput('');
    } catch (err) {
      setSelectionError(err instanceof Error ? err.message : 'خطا در ثبت قیمت دستی');
    } finally {
      setSavingSelection(false);
    }
  };

  // Determine bubble styling (red = positive, green = negative, neutral = near-zero/zero)
  const bubbleColorClass =
    bubbleSign === null || bubbleSign === undefined
      ? 'text-slate-300'
      : isNearZero || bubbleSign === 'zero'
        ? 'text-slate-200'
        : bubbleSign === 'positive'
          ? 'text-red-400'
          : 'text-emerald-400';

  const bubbleSurfaceClass =
    bubbleSign === null || bubbleSign === undefined
      ? 'border-slate-800 bg-[#111827]'
      : isNearZero || bubbleSign === 'zero'
        ? 'border-slate-700/80 bg-[#111827]'
        : bubbleSign === 'positive'
          ? 'border-red-500/30 bg-gradient-to-b from-red-950/25 to-[#111827]'
          : 'border-emerald-500/30 bg-gradient-to-b from-emerald-950/25 to-[#111827]';

  const bubbleStatusText =
    latest?.bubbleToman === null || latest?.bubbleToman === undefined
      ? discrepancy?.requiresSelection
        ? 'در انتظار انتخاب منبع مرجع توسط کاربر'
        : 'داده معتبر برای محاسبه حباب در دسترس نیست'
      : isNearZero || bubbleSign === 'zero'
        ? 'حباب خنثی / نزدیک به تعادل ارزش جهانی'
        : bubbleSign === 'positive'
          ? 'حباب مثبت — طلای داخلی گران‌تر از ارزش ذاتی جهانی است'
          : 'حباب منفی — طلای داخلی ارزان‌تر از ارزش ذاتی جهانی است';

  // Comparison bar scaling
  const comparisonPrices = [
    latest?.theoreticalPriceToman,
    latest?.tgjuGold18Toman,
    latest?.digikalaGold18Toman,
    latest?.referencePriceToman,
  ].filter((v): v is number => typeof v === 'number' && v > 0);
  const minComp = comparisonPrices.length ? Math.min(...comparisonPrices) * 0.985 : 0;
  const maxComp = comparisonPrices.length ? Math.max(...comparisonPrices) * 1.005 : 1;
  const getBarPct = (val: number | null | undefined) => {
    if (!val || maxComp <= minComp) return 0;
    return Math.min(100, Math.max(8, ((val - minComp) / (maxComp - minComp)) * 100));
  };

  return (
    <div className="space-y-6">
      {/* Discrepancy / Unreliable Data Banner */}
      {(discrepancy?.active || latest?.dataQuality === 'unavailable' || latest?.dataQuality === 'cached' || latest?.dataQuality === 'delayed') && (
        <section className="rounded-xl border border-amber-500/40 bg-amber-950/20 p-4 md:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h2 className="text-sm font-semibold text-amber-200">
                  {discrepancy?.active
                    ? `اختلاف قابل توجه بین منابع داخلی (${formatToman(discrepancy.differenceToman)} تومان)`
                    : 'هشدار وضعیت کیفیت داده'}
                </h2>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {discrepancy?.active
                    ? `اختلاف قیمت طلای ۱۸ عیار TGJU (${formatToman(discrepancy.tgjuPriceToman)} تومان) و دیجی‌کالا ولث (${formatToman(discrepancy.digikalaPriceToman)} تومان) از حد مجاز ${formatToman(discrepancy.thresholdToman)} تومان بیشتر است. میانگین‌گیری خودکار متوقف شد؛ منبع مرجع را انتخاب کنید.`
                    : `وضعیت فعلی داده: ${latest ? getDataQualityLabel(latest.dataQuality) : 'در حال بررسی'}. در صورت خطای موقت منبع، می‌توانید قیمت دستی وارد کنید.`}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {discrepancy?.tgjuPriceToman && (
                <button
                  type="button"
                  disabled={savingSelection}
                  onClick={() => handleSelectSource('tgju')}
                  className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors min-h-[40px] whitespace-nowrap ${
                    latest?.referenceMode === 'tgju'
                      ? 'border-amber-400 bg-amber-500/20 text-amber-200'
                      : 'border-slate-700 bg-slate-900 text-slate-200 hover:border-amber-500/50'
                  }`}
                >
                  انتخاب TGJU ({formatToman(discrepancy.tgjuPriceToman)})
                </button>
              )}
              {discrepancy?.digikalaPriceToman && (
                <button
                  type="button"
                  disabled={savingSelection}
                  onClick={() => handleSelectSource('digikala')}
                  className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors min-h-[40px] whitespace-nowrap ${
                    latest?.referenceMode === 'digikala'
                      ? 'border-amber-400 bg-amber-500/20 text-amber-200'
                      : 'border-slate-700 bg-slate-900 text-slate-200 hover:border-amber-500/50'
                  }`}
                >
                  انتخاب دیجی‌کالا ({formatToman(discrepancy.digikalaPriceToman)})
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowManualForm((v) => !v)}
                className="px-3 py-2 rounded-lg text-xs font-medium border border-slate-700 bg-slate-900 text-slate-300 hover:text-white transition-colors min-h-[40px] whitespace-nowrap"
              >
                قیمت دستی
              </button>
            </div>
          </div>

          {showManualForm && (
            <form onSubmit={handleManualSubmit} className="mt-4 pt-4 border-t border-amber-500/20 flex flex-wrap items-center gap-3">
              <input
                type="number"
                min={1}
                step={1000}
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                placeholder="قیمت هر گرم طلای ۱۸ عیار به تومان..."
                className="w-full sm:w-72 rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 text-sm text-slate-100 font-mono-tabular focus:outline-none focus:border-amber-400 min-h-[40px]"
              />
              <button
                type="submit"
                disabled={savingSelection}
                className="px-4 py-2 rounded-lg bg-amber-500 text-slate-950 text-xs font-semibold hover:bg-amber-400 transition-colors min-h-[40px]"
              >
                اعمال قیمت دستی
              </button>
            </form>
          )}
          {selectionError && <p className="mt-2 text-xs text-red-400">{selectionError}</p>}
        </section>
      )}

      {/* B. Hero Gold Bubble Overview — Primary Visual Anchor */}
      <section className={`rounded-xl border p-5 md:p-7 transition-colors ${bubbleSurfaceClass}`}>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span className="font-medium text-slate-300">شاخص لحظه‌ای حباب طلای ۱۸ عیار</span>
              <span aria-hidden="true">·</span>
              <span>{latest ? getDataQualityLabel(latest.dataQuality) : 'در حال دریافت'}</span>
              <span aria-hidden="true">·</span>
              <span>{latest ? getReferenceModeLabel(latest.referenceMode) : '—'}</span>
            </div>

            <div className="flex flex-wrap items-baseline gap-4">
              <div className={`text-4xl sm:text-5xl font-bold tracking-tight font-mono-tabular ${bubbleColorClass}`}>
                {latest?.bubbleToman !== null && latest?.bubbleToman !== undefined
                  ? `${formatToman(latest.bubbleToman, true)}`
                  : '—'}
              </div>
              <span className="text-base sm:text-lg text-slate-400 font-medium">تومان / گرم</span>
              {latest?.bubblePercent !== null && latest?.bubblePercent !== undefined && (
                <div className={`inline-flex items-center gap-1.5 text-xl sm:text-2xl font-semibold font-mono-tabular ${bubbleColorClass}`}>
                  {bubbleSign === 'positive' && <ArrowUpRight className="w-5 h-5" />}
                  {bubbleSign === 'negative' && <ArrowDownRight className="w-5 h-5" />}
                  {(bubbleSign === 'zero' || isNearZero) && <Minus className="w-5 h-5" />}
                  <span>{formatPercent(latest.bubblePercent, true)}</span>
                </div>
              )}
            </div>

            <p className={`text-sm font-medium flex items-center gap-2 ${bubbleColorClass}`}>
              {bubbleSign === 'positive' && <AlertTriangle className="w-4 h-4 shrink-0" />}
              {bubbleSign === 'negative' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
              <span>{bubbleStatusText}</span>
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-4 lg:pt-0 border-t lg:border-t-0 lg:border-r border-slate-800/80 lg:pr-6">
            <div>
              <p className="text-xs text-slate-400">تغییر نسبت به ثبت قبلی</p>
              <p
                className={`mt-1 text-base font-semibold font-mono-tabular ${
                  (snapshot?.deltaFromPrevious.bubbleToman ?? 0) > 0
                    ? 'text-red-400'
                    : (snapshot?.deltaFromPrevious.bubbleToman ?? 0) < 0
                      ? 'text-emerald-400'
                      : 'text-slate-300'
                }`}
              >
                {snapshot?.deltaFromPrevious.bubbleToman !== null &&
                snapshot?.deltaFromPrevious.bubbleToman !== undefined
                  ? `${formatToman(snapshot.deltaFromPrevious.bubbleToman, true)} ت`
                  : 'بدون تغییر'}
              </p>
            </div>

            <div>
              <p className="text-xs text-slate-400">آخرین بروزرسانی</p>
              <p className="mt-1 text-sm font-medium text-slate-200 font-mono-tabular">
                {formatPersianDateTime(latest?.timestamp)}
              </p>
            </div>

            <div className="col-span-2 sm:col-span-1 flex items-center justify-between sm:block">
              <div>
                <p className="text-xs text-slate-400">اختلاف منابع داخلی</p>
                <p className="mt-1 text-base font-semibold text-slate-200 font-mono-tabular">
                  {discrepancy?.differenceToman !== null && discrepancy?.differenceToman !== undefined
                    ? `${formatToman(discrepancy.differenceToman)} ت`
                    : '—'}
                </p>
              </div>
              <button
                type="button"
                onClick={onRefresh}
                disabled={refreshing}
                className="sm:hidden inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                بروزرسانی
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* A. Current Market Information Grid (Single-Elevation Flat Cards) */}
      <section aria-label="اطلاعات لحظه‌ای بازار">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-200">نرخ‌های لحظه‌ای و مرجع محاسبه</h2>
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span>TGJU: {tgju ? `${getSourceStatusLabel(tgju.status)} (${formatAgeSeconds(tgju.ageSeconds)})` : '—'}</span>
            <span aria-hidden="true">·</span>
            <span>دیجی‌کالا: {digikala ? `${getSourceStatusLabel(digikala.status)} (${formatAgeSeconds(digikala.ageSeconds)})` : '—'}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Theoretical 18K Gold */}
          <div className="rounded-xl border border-slate-800 bg-[#111827] p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>قیمت تئوری ۱ گرم طلای ۱۸ عیار</span>
              <Calculator className="w-4 h-4 text-sky-400" />
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold text-sky-300 font-mono-tabular">
                {formatToman(latest?.theoreticalPriceToman)}
                <span className="text-xs font-normal text-slate-400 mr-1.5">تومان</span>
              </div>
              <p className="mt-2 text-xs text-slate-400 leading-relaxed font-mono-tabular" dir="ltr">
                ((Ounce × USD_IRR / 31.1034768) × 18/24) ÷ 10
              </p>
            </div>
          </div>

          {/* Selected Reference Price */}
          <div className="rounded-xl border border-amber-500/35 bg-[#111827] p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-amber-300/90">
              <span>قیمت مرجع منتخب داخلی (۱۸ عیار)</span>
              <Scale className="w-4 h-4 text-amber-400" />
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold text-amber-300 font-mono-tabular">
                {formatToman(latest?.referencePriceToman)}
                <span className="text-xs font-normal text-slate-400 mr-1.5">تومان</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                <span>{latest ? getReferenceModeLabel(latest.referenceMode) : '—'}</span>
                {latest && latest.referenceMode !== 'averaged' && !discrepancy?.active && (
                  <button
                    type="button"
                    onClick={() => handleSelectSource('auto')}
                    className="text-amber-400 hover:text-amber-300 underline underline-offset-4"
                  >
                    بازگشت به میانگین خودکار
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* USD Exchange Rate */}
          <div className="rounded-xl border border-slate-800 bg-[#111827] p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>نرخ دلار آزاد (TGJU)</span>
              <span>USD / IRR</span>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold text-slate-100 font-mono-tabular">
                {formatToman(latest?.usdToman)}
                <span className="text-xs font-normal text-slate-400 mr-1.5">تومان</span>
              </div>
              <p className="mt-2 text-xs text-slate-400 font-mono-tabular">
                معادل {formatIrr(latest?.usdIrr)} ریال
              </p>
            </div>
          </div>

          {/* Global Gold Ounce */}
          <div className="rounded-xl border border-slate-800 bg-[#111827] p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>انس جهانی طلا (XAU / USD)</span>
              <span>۳۱٫۱۰۳۵ گرم عیار ۲۴</span>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold text-slate-100 font-mono-tabular">
                {formatUsd(latest?.globalOunceUsd)}
              </div>
              <p className="mt-2 text-xs text-slate-400">
                منبع: شبکه اطلاع‌رسانی طلا و ارز (TGJU)
              </p>
            </div>
          </div>

          {/* TGJU Domestic 18K */}
          <div className="rounded-xl border border-slate-800 bg-[#111827] p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>طلای ۱۸ عیار TGJU (geram18)</span>
              <span>{tgju ? getSourceStatusLabel(tgju.status) : '—'}</span>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold text-slate-100 font-mono-tabular">
                {formatToman(latest?.tgjuGold18Toman)}
                <span className="text-xs font-normal text-slate-400 mr-1.5">تومان</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                <span className="inline-flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {tgju ? formatAgeSeconds(tgju.ageSeconds) : '—'}
                </span>
                <button
                  type="button"
                  onClick={() => handleSelectSource('tgju')}
                  className="text-slate-300 hover:text-amber-300 transition-colors"
                >
                  استفاده به عنوان مرجع
                </button>
              </div>
            </div>
          </div>

          {/* Digikala Wealth 18K */}
          <div className="rounded-xl border border-slate-800 bg-[#111827] p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>طلای ۱۸ عیار دیجی‌کالا ولث (gold18)</span>
              <span>{digikala ? getSourceStatusLabel(digikala.status) : '—'}</span>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold text-slate-100 font-mono-tabular">
                {formatToman(latest?.digikalaGold18Toman)}
                <span className="text-xs font-normal text-slate-400 mr-1.5">تومان</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                <span className="font-mono-tabular">
                  {digikala?.data
                    ? `نرخ خام: ${formatIrr(digikala.data.gold18IrrPerMg)} ریال/میلی‌گرم`
                    : digikala?.error || 'طلای آب‌شده ۱۸ عیار'}
                </span>
                <button
                  type="button"
                  onClick={() => handleSelectSource('digikala')}
                  className="text-slate-300 hover:text-amber-300 transition-colors"
                >
                  استفاده به عنوان مرجع
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* C. Price Comparison Spread */}
      <section className="rounded-xl border border-slate-800 bg-[#111827] p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-800/80">
          <div>
            <h2 className="text-sm font-semibold text-slate-200">مقایسه تطبیقی قیمت داخلی و ارزش تئوری</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              نمایش فاصله واقعی هر منبع تا ارزش ذاتی جهانی هر گرم طلای ۱۸ عیار
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowManualForm((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-300 hover:text-white transition-colors min-h-[36px]"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>تغییر منبع / قیمت دستی</span>
          </button>
        </div>

        <div className="mt-4 space-y-3.5">
          {[
            {
              label: 'ارزش تئوری جهانی (۱۸ عیار)',
              value: latest?.theoreticalPriceToman,
              barColor: 'bg-sky-400',
              textColor: 'text-sky-300',
              spread: 0,
            },
            {
              label: 'TGJU (طلای ۱۸ عیار بازار)',
              value: latest?.tgjuGold18Toman,
              barColor: 'bg-slate-400',
              textColor: 'text-slate-200',
              spread:
                latest?.tgjuGold18Toman && latest?.theoreticalPriceToman
                  ? latest.tgjuGold18Toman - latest.theoreticalPriceToman
                  : null,
            },
            {
              label: 'دیجی‌کالا ولث (طلای دیجیتال ۱۸ عیار)',
              value: latest?.digikalaGold18Toman,
              barColor: 'bg-indigo-400',
              textColor: 'text-slate-200',
              spread:
                latest?.digikalaGold18Toman && latest?.theoreticalPriceToman
                  ? latest.digikalaGold18Toman - latest.theoreticalPriceToman
                  : null,
            },
            {
              label: 'قیمت مرجع منتخب',
              value: latest?.referencePriceToman,
              barColor: bubbleSign === 'positive' ? 'bg-red-400' : bubbleSign === 'negative' ? 'bg-emerald-400' : 'bg-amber-400',
              textColor: 'text-amber-300',
              spread: latest?.bubbleToman ?? null,
            },
          ].map((row) => (
            <div key={row.label} className="space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-slate-300 font-medium">{row.label}</span>
                <div className="flex items-center gap-3 font-mono-tabular">
                  {row.spread !== null && row.spread !== 0 && (
                    <span className={row.spread > 0 ? 'text-red-400' : 'text-emerald-400'}>
                      ({formatToman(row.spread, true)} ت اختلاف)
                    </span>
                  )}
                  <span className={`font-semibold ${row.textColor}`}>
                    {formatToman(row.value)} تومان
                  </span>
                </div>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-900 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${row.barColor}`}
                  style={{ width: `${getBarPct(row.value)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Embedded Main Historical Bubble Chart */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-200">روند تاریخی حباب طلا</h2>
          <button
            type="button"
            onClick={onOpenCharts}
            className="text-xs font-medium text-amber-400 hover:text-amber-300 transition-colors"
          >
            مشاهده تمام ۵ نمودار و جدول سوابق ←
          </button>
        </div>
        <BubbleChartPanel
          points={historyPoints}
          range={chartRange}
          onRangeChange={onRangeChange}
          mode={chartMode}
          onModeChange={setChartMode}
          showModeTabs
          height={340}
        />
      </section>
    </div>
  );
};
