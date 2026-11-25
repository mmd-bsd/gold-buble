import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BaselineSeries,
  ColorType,
  LineSeries,
  LineStyle,
  createChart,
  type IChartApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import { Maximize2 } from 'lucide-react';
import type { ChartRange, MeasurementRecord } from '../../shared/types.ts';
import {
  formatPercent,
  formatPersianDateTime,
  formatToman,
  formatUsd,
} from '../utils/formatters';

export type ChartMode =
  | 'bubble_toman'
  | 'comparison'
  | 'bubble_percent'
  | 'usd_toman'
  | 'ounce_usd';

const RANGE_OPTIONS: Array<{ key: ChartRange; label: string }> = [
  { key: '1h', label: '۱ ساعت' },
  { key: '6h', label: '۶ ساعت' },
  { key: '12h', label: '۱۲ ساعت' },
  { key: '24h', label: '۲۴ ساعت' },
  { key: '7d', label: '۷ روز' },
  { key: '30d', label: '۳۰ روز' },
  { key: 'all', label: 'کل تاریخچه' },
];

const CHART_MODE_OPTIONS: Array<{ key: ChartMode; label: string }> = [
  { key: 'bubble_toman', label: 'حباب طلا (تومان)' },
  { key: 'comparison', label: 'داخلی در برابر تئوری' },
  { key: 'bubble_percent', label: 'درصد حباب (٪)' },
  { key: 'usd_toman', label: 'نرخ دلار (تومان)' },
  { key: 'ounce_usd', label: 'انس جهانی (دلار)' },
];

interface BubbleChartPanelProps {
  points: MeasurementRecord[];
  range: ChartRange;
  onRangeChange: (range: ChartRange) => void;
  mode: ChartMode;
  onModeChange?: (mode: ChartMode) => void;
  showModeTabs?: boolean;
  height?: number;
}

interface TooltipInfo {
  timeMs: number;
  primaryValue: number;
  secondaryValue?: number;
}

export const BubbleChartPanel: React.FC<BubbleChartPanelProps> = ({
  points,
  range,
  onRangeChange,
  mode,
  onModeChange,
  showModeTabs = true,
  height = 360,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [hoverInfo, setHoverInfo] = useState<TooltipInfo | null>(null);

  const sanitizedPoints = useMemo(() => {
    const bySec = new Map<number, MeasurementRecord>();
    for (const p of points) {
      const sec = Math.floor(p.timestamp / 1000);
      bySec.set(sec, p);
    }
    return [...bySec.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([sec, record]) => ({ sec: sec as UTCTimestamp, record }));
  }, [points]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      width: el.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: '#0F1623' },
        textColor: '#94A3B8',
        fontFamily: "'Vazirmatn', 'JetBrains Mono', sans-serif",
        fontSize: 12,
      },
      grid: {
        vertLines: { color: 'rgba(148, 163, 184, 0.07)' },
        horzLines: { color: 'rgba(148, 163, 184, 0.08)' },
      },
      rightPriceScale: {
        borderColor: 'rgba(148, 163, 184, 0.14)',
        scaleMargins: { top: 0.12, bottom: 0.12 },
      },
      timeScale: {
        borderColor: 'rgba(148, 163, 184, 0.14)',
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        vertLine: { color: 'rgba(212, 175, 55, 0.45)', width: 1, style: LineStyle.Dashed },
        horzLine: { color: 'rgba(212, 175, 55, 0.45)', width: 1, style: LineStyle.Dashed },
      },
      localization: {
        locale: 'fa-IR',
        priceFormatter: (price: number) => {
          if (mode === 'bubble_percent') return `${price.toFixed(2)}%`;
          if (mode === 'ounce_usd') return `$${price.toFixed(1)}`;
          return new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 0 }).format(Math.round(price));
        },
        timeFormatter: (time: number) =>
          new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          }).format(new Date(time * 1000)),
      },
    });

    chartRef.current = chart;

    if (mode === 'bubble_toman' || mode === 'bubble_percent') {
      const baselineSeries = chart.addSeries(BaselineSeries, {
        baseValue: { type: 'price', price: 0 },
        topLineColor: '#EF4444',
        topFillColor1: 'rgba(239, 68, 68, 0.34)',
        topFillColor2: 'rgba(239, 68, 68, 0.04)',
        bottomLineColor: '#10B981',
        bottomFillColor1: 'rgba(16, 185, 129, 0.04)',
        bottomFillColor2: 'rgba(16, 185, 129, 0.34)',
        lineWidth: 2,
      });

      const data = sanitizedPoints
        .filter((item) =>
          mode === 'bubble_toman'
            ? item.record.bubbleToman !== null
            : item.record.bubblePercent !== null
        )
        .map((item) => ({
          time: item.sec,
          value:
            mode === 'bubble_toman'
              ? (item.record.bubbleToman as number)
              : (item.record.bubblePercent as number),
        }));

      baselineSeries.setData(data);
      baselineSeries.createPriceLine({
        price: 0,
        color: '#E2E8F0',
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'خط تعادل (۰)',
      });

      chart.subscribeCrosshairMove((param) => {
        if (!param.time || typeof param.time !== 'number') {
          setHoverInfo(null);
          return;
        }
        const seriesVal = param.seriesData.get(baselineSeries) as { value?: number } | undefined;
        if (seriesVal && typeof seriesVal.value === 'number') {
          setHoverInfo({
            timeMs: param.time * 1000,
            primaryValue: seriesVal.value,
          });
        } else {
          setHoverInfo(null);
        }
      });
    } else if (mode === 'comparison') {
      const refSeries = chart.addSeries(LineSeries, {
        color: '#D4AF37',
        lineWidth: 2,
        title: 'مرجع داخلی',
      });
      const theoSeries = chart.addSeries(LineSeries, {
        color: '#38BDF8',
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        title: 'تئوری جهانی',
      });

      const refData = sanitizedPoints
        .filter((i) => i.record.referencePriceToman !== null)
        .map((i) => ({ time: i.sec, value: i.record.referencePriceToman as number }));
      const theoData = sanitizedPoints
        .filter((i) => i.record.theoreticalPriceToman !== null)
        .map((i) => ({ time: i.sec, value: i.record.theoreticalPriceToman as number }));

      refSeries.setData(refData);
      theoSeries.setData(theoData);

      chart.subscribeCrosshairMove((param) => {
        if (!param.time || typeof param.time !== 'number') {
          setHoverInfo(null);
          return;
        }
        const rVal = param.seriesData.get(refSeries) as { value?: number } | undefined;
        const tVal = param.seriesData.get(theoSeries) as { value?: number } | undefined;
        if (typeof rVal?.value === 'number') {
          setHoverInfo({
            timeMs: param.time * 1000,
            primaryValue: rVal.value,
            secondaryValue: tVal?.value,
          });
        } else {
          setHoverInfo(null);
        }
      });
    } else {
      const isUsd = mode === 'usd_toman';
      const lineSeries = chart.addSeries(LineSeries, {
        color: isUsd ? '#38BDF8' : '#F59E0B',
        lineWidth: 2,
      });

      const data = sanitizedPoints
        .filter((i) => (isUsd ? i.record.usdToman !== null : i.record.globalOunceUsd !== null))
        .map((i) => ({
          time: i.sec,
          value: isUsd ? (i.record.usdToman as number) : (i.record.globalOunceUsd as number),
        }));

      lineSeries.setData(data);

      chart.subscribeCrosshairMove((param) => {
        if (!param.time || typeof param.time !== 'number') {
          setHoverInfo(null);
          return;
        }
        const val = param.seriesData.get(lineSeries) as { value?: number } | undefined;
        if (typeof val?.value === 'number') {
          setHoverInfo({
            timeMs: param.time * 1000,
            primaryValue: val.value,
          });
        } else {
          setHoverInfo(null);
        }
      });
    }

    chart.timeScale().fitContent();

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        chart.applyOptions({ width: Math.floor(entry.contentRect.width) });
      }
    });
    observer.observe(el);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [sanitizedPoints, mode, height]);

  const handleFitContent = () => {
    chartRef.current?.timeScale().fitContent();
  };

  return (
    <div className="rounded-xl border border-slate-800/90 bg-[#0F1623] p-4 md:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between pb-4 border-b border-slate-800/80">
        <div className="flex flex-wrap items-center gap-1.5">
          {showModeTabs && onModeChange ? (
            CHART_MODE_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => onModeChange(opt.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 min-h-[36px] ${
                  mode === opt.key
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/70 border border-transparent'
                }`}
              >
                {opt.label}
              </button>
            ))
          ) : (
            <h3 className="text-sm font-semibold text-slate-200">
              {CHART_MODE_OPTIONS.find((m) => m.key === mode)?.label}
            </h3>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex flex-wrap items-center gap-1 rounded-lg bg-[#0B0F17] p-1 border border-slate-800">
            {RANGE_OPTIONS.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => onRangeChange(r.key)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 min-h-[32px] ${
                  range === r.key
                    ? 'bg-slate-800 text-amber-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={handleFitContent}
            title="بازنشانی بزرگنمایی نمودار"
            className="inline-flex items-center justify-center rounded-lg border border-slate-800 bg-[#0B0F17] p-2 text-slate-400 hover:text-slate-200 hover:border-slate-700 transition-colors min-h-[36px] min-w-[36px]"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Live crosshair summary strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-xs text-slate-400">
        {hoverInfo ? (
          <div className="flex flex-wrap items-center gap-3 font-mono-tabular">
            <span className="text-slate-300">{formatPersianDateTime(hoverInfo.timeMs)}</span>
            <span aria-hidden="true">·</span>
            {mode === 'bubble_toman' && (
              <span className={hoverInfo.primaryValue >= 0 ? 'text-red-400' : 'text-emerald-400'}>
                حباب: {formatToman(hoverInfo.primaryValue, true)} تومان
              </span>
            )}
            {mode === 'bubble_percent' && (
              <span className={hoverInfo.primaryValue >= 0 ? 'text-red-400' : 'text-emerald-400'}>
                درصد حباب: {formatPercent(hoverInfo.primaryValue, true)}
              </span>
            )}
            {mode === 'comparison' && (
              <>
                <span className="text-amber-300">
                  مرجع داخلی: {formatToman(hoverInfo.primaryValue)} تومان
                </span>
                {hoverInfo.secondaryValue !== undefined && (
                  <span className="text-sky-400">
                    ارزش تئوری: {formatToman(hoverInfo.secondaryValue)} تومان
                  </span>
                )}
              </>
            )}
            {mode === 'usd_toman' && (
              <span className="text-sky-400">دلار: {formatToman(hoverInfo.primaryValue)} تومان</span>
            )}
            {mode === 'ounce_usd' && (
              <span className="text-amber-300">انس جهانی: {formatUsd(hoverInfo.primaryValue)}</span>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span>
              {mode === 'bubble_toman' || mode === 'bubble_percent'
                ? 'ناحیه قرمز: حباب مثبت · ناحیه سبز: حباب منفی · خط‌چین: تعادل صفر'
                : mode === 'comparison'
                  ? 'طلایی: قیمت مرجع داخلی · آبی: ارزش تئوری جهانی'
                  : 'برای بزرگنمایی از اسکرول یا لمس دو انگشتی استفاده کنید'}
            </span>
          </div>
        )}
        <span className="font-mono-tabular text-slate-500">
          {new Intl.NumberFormat('fa-IR').format(sanitizedPoints.length)} نقطه ثبت‌شده
        </span>
      </div>

      {sanitizedPoints.length === 0 ? (
        <div
          style={{ height }}
          className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-800 bg-[#0B0F17]/60 text-center p-6"
        >
          <p className="text-sm text-slate-300 font-medium">در حال جمع‌آوری اولین نقاط تاریخی...</p>
          <p className="text-xs text-slate-500 mt-1.5">
            با هر چرخه پایش خودکار، نقاط جدید در پایگاه داده ذخیره و روی نمودار ترسیم می‌شوند.
          </p>
        </div>
      ) : (
        <div ref={containerRef} dir="ltr" className="w-full overflow-hidden rounded-lg" />
      )}
    </div>
  );
};
