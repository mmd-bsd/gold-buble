import React, { useState } from 'react';
import type { ChartRange, MeasurementRecord } from '../../shared/types.ts';
import {
  formatPercent,
  formatPersianDateTime,
  formatToman,
  formatUsd,
  getDataQualityLabel,
} from '../utils/formatters';
import { BubbleChartPanel, type ChartMode } from './BubbleChartPanel';

interface ChartsViewProps {
  points: MeasurementRecord[];
  totalCount: number;
  range: ChartRange;
  onRangeChange: (range: ChartRange) => void;
}

export const ChartsView: React.FC<ChartsViewProps> = ({
  points,
  totalCount,
  range,
  onRangeChange,
}) => {
  const [primaryMode, setPrimaryMode] = useState<ChartMode>('bubble_toman');
  const recentRows = [...points].reverse().slice(0, 40);

  const lastPoint = points.length > 0 ? points[points.length - 1] : null;
  const comparisonPrices = [
    lastPoint?.theoreticalPriceToman,
    lastPoint?.tgjuGold18Toman,
    lastPoint?.digikalaGold18Toman,
    lastPoint?.referencePriceToman,
  ].filter((v): v is number => typeof v === 'number' && v > 0);
  const minComp = comparisonPrices.length ? Math.min(...comparisonPrices) * 0.985 : 0;
  const maxComp = comparisonPrices.length ? Math.max(...comparisonPrices) * 1.005 : 1;
  const getBarPct = (val: number | null | undefined) => {
    if (!val || maxComp <= minComp) return 0;
    return Math.min(100, Math.max(6, ((val - minComp) / (maxComp - minComp)) * 100));
  };
  const bubbleSign = lastPoint?.bubbleToman ?? null;
  const comparisonRows = [
    {
      label: 'ارزش تئوری جهانی (18 عیار)',
      value: lastPoint?.theoreticalPriceToman,
      barColor: 'bg-sky-400/80',
      textColor: 'text-sky-300',
      spread: 0,
    },
    {
      label: 'TGJU (طلای 18 عیار بازار)',
      value: lastPoint?.tgjuGold18Toman,
      barColor: 'bg-slate-400/80',
      textColor: 'text-slate-200',
      spread:
        lastPoint?.tgjuGold18Toman && lastPoint?.theoreticalPriceToman
          ? lastPoint.tgjuGold18Toman - lastPoint.theoreticalPriceToman
          : null,
    },
    {
      label: 'دیجی‌کالا ولث (طلای دیجیتال 18 عیار)',
      value: lastPoint?.digikalaGold18Toman,
      barColor: 'bg-indigo-400/80',
      textColor: 'text-slate-200',
      spread:
        lastPoint?.digikalaGold18Toman && lastPoint?.theoreticalPriceToman
          ? lastPoint.digikalaGold18Toman - lastPoint.theoreticalPriceToman
          : null,
    },
    {
      label: 'قیمت مرجع منتخب',
      value: lastPoint?.referencePriceToman,
      barColor:
        bubbleSign !== null && bubbleSign > 0
          ? 'bg-red-400/80'
          : bubbleSign !== null && bubbleSign < 0
            ? 'bg-emerald-400/80'
            : 'bg-amber-400/80',
      textColor: 'text-amber-200',
      spread: lastPoint?.bubbleToman ?? null,
    },
  ];

  return (
    <div className="space-y-7">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight text-slate-50">نمودارهای تحلیلی و تاریخچه بازار</h1>
          <p className="mt-1.5 text-[12.5px] leading-6 text-slate-400">
            تحلیل همزمان حباب تومانی، درصد حباب، مقایسه قیمت داخلی و تئوری، دلار و انس جهانی
          </p>
        </div>
        <span className="text-[11.5px] tabular-nums text-slate-500">
          کل رکوردهای ذخیره‌شده: {new Intl.NumberFormat('en-US').format(totalCount)}
        </span>
      </div>

      {/* Main Interactive Chart */}
      <BubbleChartPanel
        points={points}
        range={range}
        onRangeChange={onRangeChange}
        mode={primaryMode}
        onModeChange={setPrimaryMode}
        showModeTabs
        height={400}
      />

      {/* Comparative price bars (moved off the dashboard to keep it compact) */}
      <section className="rounded-2xl border border-white/[0.07] bg-panel p-5 md:p-6">
        <h2 className="text-[14px] font-bold text-slate-100">مقایسه قیمت داخلی با ارزش تئوری</h2>
        <div className="mt-4 space-y-3.5">
          {comparisonRows.map((row) => (
            <div key={row.label} className="space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="text-[12px] font-medium text-slate-300">{row.label}</span>
                <div className="flex items-center gap-3 text-[12px] tabular-nums">
                  {row.spread !== null && row.spread !== 0 && (
                    <span className={`text-[11px] ${row.spread > 0 ? 'text-red-300' : 'text-emerald-300'}`} dir="ltr">
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

      {/* Secondary Grid of All 4 Analytical Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BubbleChartPanel
          points={points}
          range={range}
          onRangeChange={onRangeChange}
          mode="comparison"
          showModeTabs={false}
          height={260}
        />
        <BubbleChartPanel
          points={points}
          range={range}
          onRangeChange={onRangeChange}
          mode="bubble_percent"
          showModeTabs={false}
          height={260}
        />
        <BubbleChartPanel
          points={points}
          range={range}
          onRangeChange={onRangeChange}
          mode="usd_toman"
          showModeTabs={false}
          height={260}
        />
        <BubbleChartPanel
          points={points}
          range={range}
          onRangeChange={onRangeChange}
          mode="ounce_usd"
          showModeTabs={false}
          height={260}
        />
      </div>

      {/* Historical Measurements Ledger Table */}
      <section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-panel">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3.5">
          <h2 className="text-[13.5px] font-semibold text-slate-100">جدول آخرین اندازه‌گیری‌های ثبت‌شده</h2>
          <span className="text-[11.5px] text-slate-400">40 رکورد اخیر در بازه انتخابی</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-[11.5px]">
            <thead className="border-b border-white/[0.06] bg-black/20 text-slate-400">
              <tr>
                <th className="whitespace-nowrap px-3 py-3 font-medium">زمان ثبت</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium">حباب (تومان)</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium">درصد حباب</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium">مرجع داخلی</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium">تئوری جهانی</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium">دلار (تومان)</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium">انس جهانی</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium">وضعیت</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {recentRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-500">
                    هنوز رکوردی در این بازه زمانی ثبت نشده است.
                  </td>
                </tr>
              ) : (
                recentRows.map((row) => (
                  <tr key={row.id} className="transition-colors hover:bg-white/[0.02]">
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-300 tabular-nums">
                      {formatPersianDateTime(row.timestamp)}
                    </td>
                    <td
                      className={`whitespace-nowrap px-3 py-2.5 font-semibold tabular-nums ${
                        row.bubbleToman === null
                          ? 'text-slate-500'
                          : row.bubbleToman > 0
                            ? 'text-red-300'
                            : row.bubbleToman < 0
                              ? 'text-emerald-300'
                              : 'text-slate-200'
                      }`}
                      dir="ltr"
                    >
                      {formatToman(row.bubbleToman, true)}
                    </td>
                    <td
                      className={`whitespace-nowrap px-3 py-2.5 tabular-nums ${
                        row.bubblePercent === null
                          ? 'text-slate-500'
                          : row.bubblePercent > 0
                            ? 'text-red-300'
                            : row.bubblePercent < 0
                              ? 'text-emerald-300'
                              : 'text-slate-200'
                      }`}
                      dir="ltr"
                    >
                      {formatPercent(row.bubblePercent, true)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-200 tabular-nums" dir="ltr">
                      {formatToman(row.referencePriceToman)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-sky-300 tabular-nums" dir="ltr">
                      {formatToman(row.theoreticalPriceToman)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-300 tabular-nums" dir="ltr">
                      {formatToman(row.usdToman)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-300 tabular-nums">
                      {formatUsd(row.globalOunceUsd)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-400">
                      {getDataQualityLabel(row.dataQuality)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
