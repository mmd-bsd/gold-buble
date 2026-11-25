import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Calculator,
  CheckCircle2,
  Clock,
  Minus,
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
  formatUsdNumber,
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

const cardCls = 'rounded-2xl border border-white/[0.07] bg-panel p-5 transition-colors hover:border-white/[0.12]';
const labelCls = 'flex items-center justify-between gap-2 text-[12.5px] font-medium text-slate-400';
const valueCls = 'mt-3 text-[26px] font-bold leading-none tabular-nums text-slate-50';
const unitCls = 'ms-1.5 text-[11px] font-normal text-slate-500';

function statusDotClass(status: string | undefined): string {
  switch (status) {
    case 'live':
      return 'bg-emerald-400';
    case 'delayed':
      return 'bg-amber-400';
    case 'cached':
      return 'bg-sky-400';
    default:
      return 'bg-red-400';
  }
}

function qualityDotClass(quality: string | undefined): string {
  switch (quality) {
    case 'live':
      return 'bg-emerald-400';
    case 'manual':
      return 'bg-amber-400';
    case 'delayed':
      return 'bg-amber-400';
    case 'partial':
      return 'bg-amber-400';
    case 'cached':
      return 'bg-sky-400';
    default:
      return 'bg-red-400';
  }
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

  const bubbleColorClass =
    bubbleSign === null || bubbleSign === undefined
      ? 'text-slate-200'
      : isNearZero || bubbleSign === 'zero'
        ? 'text-slate-100'
        : bubbleSign === 'positive'
          ? 'text-red-300'
          : 'text-emerald-300';

  const bubbleSurfaceClass =
    bubbleSign === null || bubbleSign === undefined
      ? 'border-white/[0.08] bg-panel'
      : isNearZero || bubbleSign === 'zero'
        ? 'border-white/[0.08] bg-panel'
        : bubbleSign === 'positive'
          ? 'border-red-400/20 bg-gradient-to-br from-red-500/[0.10] via-panel to-panel'
          : 'border-emerald-400/20 bg-gradient-to-br from-emerald-500/[0.10] via-panel to-panel';

  const deltaColorClass =
    (snapshot?.deltaFromPrevious.bubbleToman ?? 0) > 0
      ? 'text-red-300'
      : (snapshot?.deltaFromPrevious.bubbleToman ?? 0) < 0
        ? 'text-emerald-300'
        : 'text-slate-200';

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
    return Math.min(100, Math.max(6, ((val - minComp) / (maxComp - minComp)) * 100));
  };

  return (
    <div className="space-y-7">
      {(discrepancy?.active || latest?.dataQuality === 'unavailable' || latest?.dataQuality === 'cached' || latest?.dataQuality === 'delayed') && (
        <section className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.055] p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-amber-400/20 bg-amber-400/10 text-amber-300">
                <AlertTriangle className="h-[18px] w-[18px]" />
              </span>
              <div className="space-y-1.5">
                <h2 className="text-[14px] font-bold text-amber-100">
                  {discrepancy?.active
                    ? `اختلاف قابل توجه بین منابع داخلی (${formatToman(discrepancy.differenceToman)} تومان)`
                    : 'هشدار وضعیت کیفیت داده'}
                </h2>
                <p className="text-[12.5px] leading-6 text-slate-300">
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
                  className={`min-h-[40px] rounded-xl border px-3.5 py-2 text-[12.5px] font-semibold transition-colors ${
                    latest?.referenceMode === 'tgju'
                      ? 'border-amber-400/50 bg-amber-400/15 text-amber-100'
                      : 'border-white/10 bg-white/[0.03] text-slate-200 hover:border-amber-400/40'
                  }`}
                >
                  انتخاب TGJU
                </button>
              )}
              {discrepancy?.digikalaPriceToman && (
                <button
                  type="button"
                  disabled={savingSelection}
                  onClick={() => handleSelectSource('digikala')}
                  className={`min-h-[40px] rounded-xl border px-3.5 py-2 text-[12.5px] font-semibold transition-colors ${
                    latest?.referenceMode === 'digikala'
                      ? 'border-amber-400/50 bg-amber-400/15 text-amber-100'
                      : 'border-white/10 bg-white/[0.03] text-slate-200 hover:border-amber-400/40'
                  }`}
                >
                  انتخاب دیجی‌کالا
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowManualForm((v) => !v)}
                className="min-h-[40px] rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2 text-[12.5px] font-semibold text-slate-300 transition-colors hover:text-white"
              >
                قیمت دستی
              </button>
            </div>
          </div>

          {showManualForm && (
            <form onSubmit={handleManualSubmit} className="mt-4 flex flex-wrap items-center gap-3 border-t border-amber-400/15 pt-4">
              <input
                type="number"
                min={1}
                step={1000}
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                placeholder="قیمت هر گرم طلای ۱۸ عیار به تومان..."
                className="min-h-[44px] w-full rounded-xl border border-white/10 bg-canvas px-3.5 py-2.5 text-sm text-slate-100 tabular-nums placeholder:text-slate-500 focus:border-amber-400/50 sm:w-80"
              />
              <button
                type="submit"
                disabled={savingSelection}
                className="min-h-[44px] rounded-xl bg-gradient-to-l from-amber-500 to-amber-400 px-4 py-2 text-[12.5px] font-bold text-slate-950 transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                اعمال قیمت دستی
              </button>
            </form>
          )}
          {selectionError && <p className="mt-2 text-[12px] text-red-300">{selectionError}</p>}
        </section>
      )}

      {/* Hero overview */}
      <section className={`relative overflow-hidden rounded-2xl border p-5 md:p-7 ${bubbleSurfaceClass}`}>
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[11px] font-medium text-slate-300">
                <span className={`h-1.5 w-1.5 rounded-full ${qualityDotClass(latest?.dataQuality)}`} />
                {latest ? getDataQualityLabel(latest.dataQuality) : 'در حال دریافت'}
              </span>
              <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[11px] font-medium text-slate-400">
                {latest ? getReferenceModeLabel(latest.referenceMode) : '—'}
              </span>
            </div>

            <div>
              <p className="text-[13px] font-medium text-slate-400">حباب لحظه‌ای هر گرم طلای ۱۸ عیار</p>
              <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-2">
                <span
                  dir="ltr"
                  className={`text-[42px] font-extrabold leading-none tracking-tight tabular-nums sm:text-6xl ${bubbleColorClass}`}
                >
                  {latest?.bubbleToman !== null && latest?.bubbleToman !== undefined
                    ? formatToman(latest.bubbleToman, true)
                    : '—'}
                </span>
                <span className="pb-1 text-[13px] font-medium text-slate-400">تومان / گرم</span>
                {latest?.bubblePercent !== null && latest?.bubblePercent !== undefined && (
                  <span
                    className={`mb-1 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[13px] font-bold tabular-nums ${
                      bubbleSign === 'positive'
                        ? 'border-red-400/25 bg-red-400/10 text-red-200'
                        : bubbleSign === 'negative'
                          ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200'
                          : 'border-white/10 bg-white/[0.04] text-slate-200'
                    }`}
                  >
                    {bubbleSign === 'positive' && <ArrowUpRight className="h-3.5 w-3.5" />}
                    {bubbleSign === 'negative' && <ArrowDownRight className="h-3.5 w-3.5" />}
                    {(bubbleSign === 'zero' || isNearZero) && <Minus className="h-3.5 w-3.5" />}
                    <span dir="ltr">{formatPercent(latest.bubblePercent, true)}</span>
                  </span>
                )}
              </div>
            </div>

            <p className={`flex items-center gap-2 text-[12.5px] font-medium leading-6 text-balance ${bubbleColorClass}`}>
              {bubbleSign === 'positive' && <AlertTriangle className="h-4 w-4 shrink-0" />}
              {bubbleSign === 'negative' && <CheckCircle2 className="h-4 w-4 shrink-0" />}
              <span>{bubbleStatusText}</span>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-x-5 gap-y-4 rounded-2xl border border-white/[0.06] bg-black/15 p-4 sm:grid-cols-3 lg:min-w-[420px]">
            <div>
              <p className="text-[11px] font-medium text-slate-400">تغییر نسبت به ثبت قبلی</p>
              <p className={`mt-1.5 text-[15px] font-bold tabular-nums ${deltaColorClass}`} dir="ltr">
                {snapshot?.deltaFromPrevious.bubbleToman !== null &&
                snapshot?.deltaFromPrevious.bubbleToman !== undefined
                  ? `${formatToman(snapshot.deltaFromPrevious.bubbleToman, true)} ت`
                  : 'بدون تغییر'}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium text-slate-400">آخرین بروزرسانی</p>
              <p className="mt-1.5 text-[12px] font-semibold text-slate-200 tabular-nums">
                {formatPersianDateTime(latest?.timestamp)}
              </p>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <p className="text-[11px] font-medium text-slate-400">اختلاف منابع داخلی</p>
              <p className="mt-1.5 text-[15px] font-bold text-slate-200 tabular-nums" dir="ltr">
                {discrepancy?.differenceToman !== null && discrepancy?.differenceToman !== undefined
                  ? `${formatToman(discrepancy.differenceToman)} ت`
                  : '—'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Market rates */}
      <section aria-label="اطلاعات لحظه‌ای بازار">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[15px] font-bold text-slate-100">نرخ‌های لحظه‌ای و مرجع محاسبه</h2>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${statusDotClass(tgju?.status)}`} />
              TGJU: {tgju ? `${getSourceStatusLabel(tgju.status)} (${formatAgeSeconds(tgju.ageSeconds)})` : '—'}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${statusDotClass(digikala?.status)}`} />
              دیجی‌کالا: {digikala ? `${getSourceStatusLabel(digikala.status)} (${formatAgeSeconds(digikala.ageSeconds)})` : '—'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className={cardCls}>
            <div className={labelCls}>
              <span>قیمت تئوری ۱ گرم طلای ۱۸ عیار</span>
              <Calculator className="h-4 w-4 text-sky-400/80" />
            </div>
            <div className={valueCls}>
              <span dir="ltr">{formatToman(latest?.theoreticalPriceToman)}</span>
              <span className={unitCls}>تومان</span>
            </div>
            <p className="mt-3 font-mono text-[10.5px] text-slate-500" dir="ltr">
              ((Ounce × USD_IRR / 31.1034768) × 18/24) ÷ 10
            </p>
          </div>

          <div className="rounded-2xl border border-amber-400/25 bg-gradient-to-b from-amber-400/[0.07] to-panel p-5 transition-colors hover:border-amber-400/40">
            <div className="flex items-center justify-between gap-2 text-[12.5px] font-medium text-amber-200/90">
              <span>قیمت مرجع منتخب داخلی (۱۸ عیار)</span>
              <Scale className="h-4 w-4 text-amber-300/90" />
            </div>
            <div className="mt-3 text-[26px] font-bold leading-none tabular-nums text-amber-200">
              <span dir="ltr">{formatToman(latest?.referencePriceToman)}</span>
              <span className="ms-1.5 text-[11px] font-normal text-slate-400">تومان</span>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-slate-400">
              <span>{latest ? getReferenceModeLabel(latest.referenceMode) : '—'}</span>
              {latest && latest.referenceMode !== 'averaged' && !discrepancy?.active && (
                <button
                  type="button"
                  onClick={() => handleSelectSource('auto')}
                  className="font-medium text-amber-300 hover:text-amber-200"
                >
                  بازگشت به میانگین خودکار
                </button>
              )}
            </div>
          </div>

          <div className={cardCls}>
            <div className={labelCls}>
              <span>نرخ دلار آزاد (TGJU)</span>
              <span className="font-mono text-[10px] text-slate-500">USD / IRR</span>
            </div>
            <div className={valueCls}>
              <span dir="ltr">{formatToman(latest?.usdToman)}</span>
              <span className={unitCls}>تومان</span>
            </div>
            <p className="mt-3 text-[11px] text-slate-500 tabular-nums">
              معادل <span dir="ltr">{formatIrr(latest?.usdIrr)}</span> ریال
            </p>
          </div>

          <div className={cardCls}>
            <div className={labelCls}>
              <span>انس جهانی طلا (XAU / USD)</span>
              <span className="text-[10px] text-slate-500">۳۱٫۱۰۳۵ گرم</span>
            </div>
            <div className={valueCls}>
              <span dir="ltr">{formatUsdNumber(latest?.globalOunceUsd)}</span>
              <span className={unitCls}>دلار</span>
            </div>
            <p className="mt-3 text-[11px] text-slate-500">منبع: شبکه اطلاع‌رسانی طلا و ارز (TGJU)</p>
          </div>

          <div className={cardCls}>
            <div className={labelCls}>
              <span>طلای ۱۸ عیار TGJU</span>
              <span className="inline-flex items-center gap-1.5 text-[10.5px] text-slate-500">
                <span className={`h-1.5 w-1.5 rounded-full ${statusDotClass(tgju?.status)}`} />
                {tgju ? getSourceStatusLabel(tgju.status) : '—'}
              </span>
            </div>
            <div className={valueCls}>
              <span dir="ltr">{formatToman(latest?.tgjuGold18Toman)}</span>
              <span className={unitCls}>تومان</span>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {tgju ? formatAgeSeconds(tgju.ageSeconds) : '—'}
              </span>
              <button
                type="button"
                onClick={() => handleSelectSource('tgju')}
                className="font-medium text-slate-300 transition-colors hover:text-amber-300"
              >
                مرجع محاسبه
              </button>
            </div>
          </div>

          <div className={cardCls}>
            <div className={labelCls}>
              <span>طلای ۱۸ عیار دیجی‌کالا ولث</span>
              <span className="inline-flex items-center gap-1.5 text-[10.5px] text-slate-500">
                <span className={`h-1.5 w-1.5 rounded-full ${statusDotClass(digikala?.status)}`} />
                {digikala ? getSourceStatusLabel(digikala.status) : '—'}
              </span>
            </div>
            <div className={valueCls}>
              <span dir="ltr">{formatToman(latest?.digikalaGold18Toman)}</span>
              <span className={unitCls}>تومان</span>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-slate-500">
              <span className="truncate tabular-nums" dir="ltr">
                {digikala?.data
                  ? `${formatIrr(digikala.data.gold18IrrPerMg)} IRR/mg`
                  : digikala?.error || 'طلای آب‌شده ۱۸ عیار'}
              </span>
              <button
                type="button"
                onClick={() => handleSelectSource('digikala')}
                className="shrink-0 font-medium text-slate-300 transition-colors hover:text-amber-300"
              >
                مرجع محاسبه
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Comparison */}
      <section className="rounded-2xl border border-white/[0.07] bg-panel p-5 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] pb-4">
          <div>
            <h2 className="text-[15px] font-bold text-slate-100">مقایسه تطبیقی قیمت داخلی و ارزش تئوری</h2>
            <p className="mt-1 text-[11.5px] text-slate-400">
              فاصله واقعی هر منبع تا ارزش ذاتی جهانی هر گرم طلای ۱۸ عیار
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowManualForm((v) => !v)}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11.5px] font-medium text-slate-300 transition-colors hover:text-white"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>تغییر منبع / قیمت دستی</span>
          </button>
        </div>

        <div className="mt-5 space-y-4">
          {[
            {
              label: 'ارزش تئوری جهانی (۱۸ عیار)',
              value: latest?.theoreticalPriceToman,
              barColor: 'bg-sky-400/80',
              textColor: 'text-sky-300',
              spread: 0,
            },
            {
              label: 'TGJU (طلای ۱۸ عیار بازار)',
              value: latest?.tgjuGold18Toman,
              barColor: 'bg-slate-400/80',
              textColor: 'text-slate-200',
              spread:
                latest?.tgjuGold18Toman && latest?.theoreticalPriceToman
                  ? latest.tgjuGold18Toman - latest.theoreticalPriceToman
                  : null,
            },
            {
              label: 'دیجی‌کالا ولث (طلای دیجیتال ۱۸ عیار)',
              value: latest?.digikalaGold18Toman,
              barColor: 'bg-indigo-400/80',
              textColor: 'text-slate-200',
              spread:
                latest?.digikalaGold18Toman && latest?.theoreticalPriceToman
                  ? latest.digikalaGold18Toman - latest.theoreticalPriceToman
                  : null,
            },
            {
              label: 'قیمت مرجع منتخب',
              value: latest?.referencePriceToman,
              barColor:
                bubbleSign === 'positive'
                  ? 'bg-red-400/80'
                  : bubbleSign === 'negative'
                    ? 'bg-emerald-400/80'
                    : 'bg-amber-400/80',
              textColor: 'text-amber-200',
              spread: latest?.bubbleToman ?? null,
            },
          ].map((row) => (
            <div key={row.label} className="space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="text-[12.5px] font-medium text-slate-300">{row.label}</span>
                <div className="flex items-center gap-3 text-[12.5px] tabular-nums">
                  {row.spread !== null && row.spread !== 0 && (
                    <span className={`text-[11.5px] ${row.spread > 0 ? 'text-red-300' : 'text-emerald-300'}`} dir="ltr">
                      ({formatToman(row.spread, true)} ت)
                    </span>
                  )}
                  <span className={`font-bold ${row.textColor}`} dir="ltr">
                    {formatToman(row.value)}
                  </span>
                </div>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.04]">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${row.barColor}`}
                  style={{ width: `${getBarPct(row.value)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Chart */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-bold text-slate-100">روند تاریخی حباب طلا</h2>
          <button
            type="button"
            onClick={onOpenCharts}
            className="text-[12px] font-medium text-amber-300 transition-colors hover:text-amber-200"
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
