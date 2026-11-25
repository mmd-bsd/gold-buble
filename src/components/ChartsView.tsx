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
          کل رکوردهای ذخیره‌شده: {new Intl.NumberFormat('fa-IR').format(totalCount)}
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
          <span className="text-[11.5px] text-slate-400">۴۰ رکورد اخیر در بازه انتخابی</span>
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
