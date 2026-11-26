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
  formatCompactNumber,
  formatPercent,
  formatPersianDateTime,
  formatToman,
  formatUsd,
  formatUsdNumber,
} from '../utils/formatters';

export type ChartMode =
  | 'bubble_toman'
  | 'comparison'
  | 'bubble_percent'
  | 'usd_toman'
  | 'ounce_usd';

const RANGE_OPTIONS: Array<{ key: ChartRange; label: string }> = [
  { key: '1h', label: '1 ساعت' },
  { key: '6h', label: '6 ساعت' },
  { key: '12h', label: '12 ساعت' },
  { key: '24h', label: '24 ساعت' },
  { key: '7d', label: '7 روز' },
  { key: '30d', label: '30 روز' },
  { key: '1y', label: '1 سال' },
  { key: '2y', label: '2 سال' },
  { key: 'all', label: 'همه' },
];

const CHART_MODE_OPTIONS: Array<{ key: ChartMode; label: string }> = [
  { key: 'bubble_toman', label: 'حباب طلا (تومان)' },
  { key: 'comparison', label: 'داخلی در برابر تئوری' },
  { key: 'bubble_percent', label: 'درصد حباب (%)' },
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
  const [isPhone, setIsPhone] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const update = () => setIsPhone(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // Keep the whole dashboard close to one phone screen.
  const chartHeight = isPhone ? Math.min(height, 210) : height;

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

    const isLongRange =
      range === '7d' || range === '30d' || range === '1y' || range === '2y' || range === 'all';
    const axisDateFormat = new Intl.DateTimeFormat('fa-IR-u-ca-persian-nu-latn', {
      month: '2-digit',
      day: '2-digit',
    });
    const axisTimeFormat = new Intl.DateTimeFormat('fa-IR-u-ca-persian-nu-latn', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const chart = createChart(el, {
      width: el.clientWidth,
      height: chartHeight,
      layout: {
        background: { type: ColorType.Solid, color: '#0D1420' },
        textColor: '#94A3B8',
        fontFamily: "'Estedad', 'IBM Plex Mono', sans-serif",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(148, 163, 184, 0.045)' },
        horzLines: { color: 'rgba(148, 163, 184, 0.06)' },
      },
      rightPriceScale: {
        borderColor: 'rgba(148, 163, 184, 0.10)',
        scaleMargins: { top: 0.16, bottom: 0.16 },
      },
      timeScale: {
        borderColor: 'rgba(148, 163, 184, 0.10)',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 4,
        barSpacing: 8,
        minBarSpacing: 2,
        fixLeftEdge: true,
        tickMarkFormatter: (time: number) =>
          isLongRange ? axisDateFormat.format(new Date(time * 1000)) : axisTimeFormat.format(new Date(time * 1000)),
      },
      crosshair: {
        vertLine: { color: 'rgba(244, 185, 66, 0.35)', width: 1, style: LineStyle.Dashed },
        horzLine: { color: 'rgba(244, 185, 66, 0.35)', width: 1, style: LineStyle.Dashed },
      },
      localization: {
        locale: 'en-US',
        priceFormatter: (price: number) => {
          if (mode === 'bubble_percent') return `${price.toFixed(2)}%`;
          if (mode === 'ounce_usd') return `$${formatUsdNumber(price)}`;
          return formatCompactNumber(price);
        },
        timeFormatter: (time: number) =>
          new Intl.DateTimeFormat('fa-IR-u-ca-persian-nu-latn', {
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
        topLineColor: '#F87171',
        topFillColor1: 'rgba(248, 113, 113, 0.16)',
        topFillColor2: 'rgba(248, 113, 113, 0.01)',
        bottomLineColor: '#34D399',
        bottomFillColor1: 'rgba(52, 211, 153, 0.01)',
        bottomFillColor2: 'rgba(52, 211, 153, 0.16)',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
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
        color: 'rgba(226, 232, 240, 0.45)',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'تعادل (0)',
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
        color: '#F4B942',
        lineWidth: 2,
        title: 'مرجع داخلی',
        priceLineVisible: false,
        lastValueVisible: false,
      });
      const theoSeries = chart.addSeries(LineSeries, {
        color: '#38BDF8',
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        title: 'تئوری جهانی',
        priceLineVisible: false,
        lastValueVisible: false,
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
        color: isUsd ? '#38BDF8' : '#F4B942',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
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
  }, [sanitizedPoints, mode, chartHeight, range]);

  const handleFitContent = () => {
    chartRef.current?.timeScale().fitContent();
  };

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-panel p-3 md:p-5">
      <div className="flex flex-col gap-2 border-b border-white/[0.06] pb-2.5 lg:flex-row lg:items-center lg:justify-between lg:gap-3 lg:pb-4">
        <div className="no-scrollbar -mx-1 flex min-w-0 items-center gap-1.5 overflow-x-auto px-1">
          {showModeTabs && onModeChange ? (
            CHART_MODE_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => onModeChange(opt.key)}
                className={`min-h-[40px] shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-colors lg:min-h-[36px] ${
                  mode === opt.key
                    ? 'bg-amber-400/10 text-amber-200 shadow-[inset_0_0_0_1px_rgba(244,185,66,0.2)]'
                    : 'text-slate-400 hover:bg-white/[0.05] hover:text-slate-100'
                }`}
              >
                {opt.label}
              </button>
            ))
          ) : (
            <h3 className="text-[13px] font-semibold text-slate-200">
              {CHART_MODE_OPTIONS.find((m) => m.key === mode)?.label}
            </h3>
          )}
        </div>

        <div className="flex min-w-0 items-center gap-2">
          <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto rounded-full border border-white/[0.06] bg-black/20 p-1 lg:flex-none">
            {RANGE_OPTIONS.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => onRangeChange(r.key)}
                className={`min-h-[36px] shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[11.5px] font-semibold transition-colors lg:min-h-[34px] ${
                  range === r.key
                    ? 'bg-white/[0.07] text-amber-200'
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
            aria-label="بازنشانی بزرگنمایی نمودار"
            className="inline-flex min-h-[40px] min-w-[40px] shrink-0 items-center justify-center rounded-full border border-white/[0.06] bg-black/20 p-2 text-slate-400 transition-colors hover:border-white/15 hover:text-slate-100 lg:min-h-[38px] lg:min-w-[38px]"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Live crosshair summary strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 py-2 text-[11px] text-slate-400 lg:py-3 lg:text-[11.5px]">
        {hoverInfo ? (
          <div className="flex flex-wrap items-center gap-3 tabular-nums">
            <span className="text-slate-300">{formatPersianDateTime(hoverInfo.timeMs)}</span>
            <span aria-hidden="true" className="text-slate-600">·</span>
            {mode === 'bubble_toman' && (
              <span className={hoverInfo.primaryValue >= 0 ? 'text-red-300' : 'text-emerald-300'}>
                حباب: <span dir="ltr">{formatToman(hoverInfo.primaryValue, true)}</span> تومان
              </span>
            )}
            {mode === 'bubble_percent' && (
              <span className={hoverInfo.primaryValue >= 0 ? 'text-red-300' : 'text-emerald-300'}>
                درصد حباب: <span dir="ltr">{formatPercent(hoverInfo.primaryValue, true)}</span>
              </span>
            )}
            {mode === 'comparison' && (
              <>
                <span className="text-amber-200">
                  مرجع داخلی: <span dir="ltr">{formatToman(hoverInfo.primaryValue)}</span> تومان
                </span>
                {hoverInfo.secondaryValue !== undefined && (
                  <span className="text-sky-300">
                    ارزش تئوری: <span dir="ltr">{formatToman(hoverInfo.secondaryValue)}</span> تومان
                  </span>
                )}
              </>
            )}
            {mode === 'usd_toman' && (
              <span className="text-sky-300">
                دلار: <span dir="ltr">{formatToman(hoverInfo.primaryValue)}</span> تومان
              </span>
            )}
            {mode === 'ounce_usd' && (
              <span className="text-amber-200">انس جهانی: {formatUsd(hoverInfo.primaryValue)}</span>
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
        <span className="tabular-nums text-slate-500">
          {new Intl.NumberFormat('en-US').format(sanitizedPoints.length)} نقطه
        </span>
      </div>

      {sanitizedPoints.length < 2 ? (
        <div
          style={{ height: chartHeight }}
          className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-canvas/40 p-6 text-center"
        >
          <p className="text-[13px] font-semibold text-slate-200">
            {sanitizedPoints.length === 0 ? 'هنوز داده‌ای برای این بازه ثبت نشده است' : 'اولین نقطه ثبت شد'}
          </p>
          <p className="mt-2 max-w-sm text-[11.5px] leading-6 text-slate-500">
            {sanitizedPoints.length === 0
              ? 'با باز ماندن صفحه، داده‌ها هر چند ثانیه بروزرسانی و روند نمودار ساخته می‌شود. برای بازه‌های بلندمدت، تا 2 سال داده روزانه هم بارگذاری می‌شود.'
              : 'برای رسم خط روند حداقل دو اندازه‌گیری لازم است. کمی صبر کنید یا بازه زمانی دیگری را انتخاب کنید.'}
          </p>
        </div>
      ) : (
        <div ref={containerRef} dir="ltr" className="w-full overflow-hidden rounded-xl" />
      )}
    </div>
  );
};
