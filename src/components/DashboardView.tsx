import React, { useState } from 'react';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Minus, SlidersHorizontal } from 'lucide-react';
import type {
  ChartRange,
  MarketSnapshot,
  PreferredSource,
  UsdRateSource,
} from '../../shared/types.ts';
import {
  formatPercent,
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
  onSelectReference: (mode: PreferredSource | 'manual', manualPrice?: number) => Promise<void>;
  onOpenCharts: () => void;
  rateSource: UsdRateSource;
  onRateSourceChange: (source: UsdRateSource) => Promise<void>;
}

const tileCls =
  'rounded-xl border border-white/[0.07] bg-panel px-3 py-2 transition-colors hover:border-white/[0.12]';
const tileLabelCls = 'text-[10.5px] font-medium leading-tight text-slate-400';
const tileValueCls = 'mt-1.5 text-[17px] font-bold leading-none tabular-nums text-slate-50';
const unitCls = 'ms-1 text-[10px] font-normal text-slate-500';

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
    case 'delayed':
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
  onSelectReference,
  onOpenCharts,
  rateSource,
  onRateSourceChange,
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

  const handleRateChange = async (source: UsdRateSource) => {
    if (source === rateSource || savingSelection) return;
    setSavingSelection(true);
    setSelectionError(null);
    try {
      await onRateSourceChange(source);
    } catch (err) {
      setSelectionError(err instanceof Error ? err.message : 'خطا در تغییر مبنای نرخ');
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

  const bubbleMissing = latest?.bubbleToman === null || latest?.bubbleToman === undefined;
  const rateValueToman = rateSource === 'tether' ? latest?.usdtToman : latest?.usdToman;

  return (
    <div className="space-y-3 md:space-y-4">
      {(discrepancy?.active || latest?.dataQuality === 'unavailable' || latest?.dataQuality === 'cached' || latest?.dataQuality === 'delayed') && (
        <section className="rounded-xl border border-amber-400/25 bg-amber-400/[0.055] px-3.5 py-3">
          <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
              <p className="text-[11.5px] leading-5 text-slate-300">
                {discrepancy?.active
                  ? 'اختلاف قیمت TGJU و دیجی‌کالا از حد مجاز بیشتر است. منبع مرجع را انتخاب کنید.'
                  : `وضعیت داده: ${latest ? getDataQualityLabel(latest.dataQuality) : 'در حال بررسی'}.`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              {discrepancy?.tgjuPriceToman && (
                <button
                  type="button"
                  disabled={savingSelection}
                  onClick={() => handleSelectSource('tgju')}
                  className={`min-h-[32px] rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    latest?.referenceMode === 'tgju'
                      ? 'border-amber-400/50 bg-amber-400/15 text-amber-100'
                      : 'border-white/10 bg-white/[0.03] text-slate-200 hover:border-amber-400/40'
                  }`}
                >
                  TGJU
                </button>
              )}
              {discrepancy?.digikalaPriceToman && (
                <button
                  type="button"
                  disabled={savingSelection}
                  onClick={() => handleSelectSource('digikala')}
                  className={`min-h-[32px] rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    latest?.referenceMode === 'digikala'
                      ? 'border-amber-400/50 bg-amber-400/15 text-amber-100'
                      : 'border-white/10 bg-white/[0.03] text-slate-200 hover:border-amber-400/40'
                  }`}
                >
                  دیجی‌کالا
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowManualForm((v) => !v)}
                className="min-h-[32px] rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] font-semibold text-slate-300 transition-colors hover:text-white"
              >
                قیمت دستی
              </button>
            </div>
          </div>

          {showManualForm && (
            <form onSubmit={handleManualSubmit} className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-amber-400/15 pt-2.5">
              <input
                type="number"
                min={1}
                step={1000}
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                placeholder="قیمت هر گرم طلای 18 عیار به تومان..."
                className="min-h-[36px] w-full rounded-lg border border-white/10 bg-canvas px-2.5 py-1.5 text-[12px] text-slate-100 tabular-nums placeholder:text-slate-500 focus:border-amber-400/50 sm:w-64"
              />
              <button
                type="submit"
                disabled={savingSelection}
                className="min-h-[36px] rounded-lg bg-gradient-to-l from-amber-500 to-amber-400 px-3 py-1.5 text-[11.5px] font-bold text-slate-950 transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                اعمال
              </button>
            </form>
          )}
          {selectionError && <p className="mt-1.5 text-[11px] text-red-300">{selectionError}</p>}
        </section>
      )}

      {/* Compact hero */}
      <section className={`relative overflow-hidden rounded-2xl border px-3.5 py-3.5 md:px-5 md:py-4 ${bubbleSurfaceClass}`}>
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[10px] font-medium text-slate-300">
            <span className={`h-1.5 w-1.5 rounded-full ${qualityDotClass(latest?.dataQuality)}`} />
            {latest ? getDataQualityLabel(latest.dataQuality) : 'در حال دریافت'}
          </span>
          <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[10px] font-medium text-slate-400">
            {latest ? getReferenceModeLabel(latest.referenceMode) : '—'}
          </span>
          <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[10px] font-medium text-slate-400">
            مبنا: {rateSource === 'tether' ? 'تتر' : 'دلار آزاد'}
          </span>
        </div>

        <p className="mt-2 text-[11.5px] font-medium text-slate-400">حباب هر گرم طلای 18 عیار</p>
        <div className="mt-1 flex flex-wrap items-end gap-x-3 gap-y-1">
          <span
            dir="ltr"
            className={`text-[38px] font-extrabold leading-none tracking-tight tabular-nums sm:text-5xl ${bubbleColorClass}`}
          >
            {bubbleMissing ? '—' : formatToman(latest?.bubbleToman, true)}
          </span>
          <span className="pb-1 text-[11px] font-medium text-slate-400">تومان / گرم</span>
          {latest?.bubblePercent !== null && latest?.bubblePercent !== undefined && (
            <span
              className={`mb-0.5 inline-flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-[11.5px] font-bold tabular-nums ${
                bubbleSign === 'positive'
                  ? 'border-red-400/25 bg-red-400/10 text-red-200'
                  : bubbleSign === 'negative'
                    ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200'
                    : 'border-white/10 bg-white/[0.04] text-slate-200'
              }`}
            >
              {bubbleSign === 'positive' && <ArrowUpRight className="h-3 w-3" />}
              {bubbleSign === 'negative' && <ArrowDownRight className="h-3 w-3" />}
              {(bubbleSign === 'zero' || isNearZero) && <Minus className="h-3 w-3" />}
              <span dir="ltr">{formatPercent(latest.bubblePercent, true)}</span>
            </span>
          )}
        </div>
      </section>

      {/* Compact rate tiles — all visible on the first screen */}
      <section aria-label="اطلاعات لحظه‌ای بازار" className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        <div className={tileCls}>
          <p className={tileLabelCls}>قیمت تئوری 18 عیار</p>
          <p className={tileValueCls}>
            <span dir="ltr">{formatToman(latest?.theoreticalPriceToman)}</span>
            <span className={unitCls}>تومان</span>
          </p>
        </div>

        <div className={`${tileCls} border-amber-400/25 bg-gradient-to-b from-amber-400/[0.07] to-panel`}>
          <p className={tileLabelCls}>قیمت مرجع داخلی</p>
          <p className={`${tileValueCls} text-amber-200`}>
            <span dir="ltr">{formatToman(latest?.referencePriceToman)}</span>
            <span className={unitCls}>تومان</span>
          </p>
        </div>

        <div className={tileCls}>
          <div className="flex items-center justify-between gap-1">
            <p className={tileLabelCls}>{rateSource === 'tether' ? 'تتر (USDT)' : 'دلار آزاد'}</p>
            <div className="flex shrink-0 rounded-full border border-white/[0.08] bg-black/20 p-0.5">
              <button
                type="button"
                onClick={() => void handleRateChange('dollar')}
                className={`rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold transition-colors ${
                  rateSource === 'dollar' ? 'bg-white/[0.09] text-amber-200' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                دلار
              </button>
              <button
                type="button"
                onClick={() => void handleRateChange('tether')}
                className={`rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold transition-colors ${
                  rateSource === 'tether' ? 'bg-white/[0.09] text-amber-200' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                تتر
              </button>
            </div>
          </div>
          <p className={tileValueCls}>
            <span dir="ltr">{formatToman(rateValueToman)}</span>
            <span className={unitCls}>تومان</span>
          </p>
        </div>

        <div className={tileCls}>
          <p className={tileLabelCls}>انس جهانی طلا</p>
          <p className={tileValueCls}>
            <span dir="ltr">{formatUsdNumber(latest?.globalOunceUsd)}</span>
            <span className={unitCls}>دلار</span>
          </p>
        </div>

        <div className={tileCls}>
          <div className="flex items-center justify-between gap-1">
            <p className={tileLabelCls}>طلای 18 TGJU</p>
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDotClass(tgju?.status)}`} />
          </div>
          <p className={tileValueCls}>
            <span dir="ltr">{formatToman(latest?.tgjuGold18Toman)}</span>
            <span className={unitCls}>تومان</span>
          </p>
        </div>

        <div className={tileCls}>
          <div className="flex items-center justify-between gap-1">
            <p className={tileLabelCls}>طلای 18 دیجی‌کالا</p>
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDotClass(digikala?.status)}`} />
          </div>
          <p className={tileValueCls}>
            <span dir="ltr">{formatToman(latest?.digikalaGold18Toman)}</span>
            <span className={unitCls}>تومان</span>
          </p>
        </div>
      </section>

      <section className="space-y-2">
        <div className="hidden items-center justify-between sm:flex">
          <h2 className="text-[13px] font-bold text-slate-100">روند تاریخی حباب طلا</h2>
          <button
            type="button"
            onClick={onOpenCharts}
            className="text-[11.5px] font-medium text-amber-300 transition-colors hover:text-amber-200"
          >
            نمودارها و سوابق ←
          </button>
        </div>
        <BubbleChartPanel
          points={historyPoints}
          range={chartRange}
          onRangeChange={onRangeChange}
          mode={chartMode}
          onModeChange={setChartMode}
          showModeTabs
          height={320}
        />
      </section>

      {bubbleMissing && latest?.dataQuality === 'unavailable' && (
        <p className="flex items-center gap-1.5 text-[11px] text-amber-300">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          داده معتبر برای محاسبه حباب در دسترس نیست.
        </p>
      )}
    </div>
  );
};
