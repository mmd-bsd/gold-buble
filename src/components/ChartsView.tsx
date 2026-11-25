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
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-100">نمودارهای تحلیلی و تاریخچه بازار</h1>
          <p className="text-xs text-slate-400 mt-1">
            تحلیل همزمان حباب تومانی، درصد حباب، مقایسه قیمت داخلی و تئوری، دلار و انس جهانی
          </p>
        </div>
        <span className="text-xs text-slate-400 font-mono-tabular">
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
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
      <section className="rounded-xl border border-slate-800 bg-[#111827] overflow-hidden">
        <div className="px-4 py-3.5 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-200">جدول آخرین اندازه‌گیری‌های ثبت‌شده</h2>
          <span className="text-xs text-slate-400">۴۰ رکورد اخیر در بازه انتخابی</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-[#0B0F17] text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3 px-3 font-medium whitespace-nowrap">زمان ثبت</th>
                <th className="py-3 px-3 font-medium whitespace-nowrap">حباب (تومان)</th>
                <th className="py-3 px-3 font-medium whitespace-nowrap">درصد حباب</th>
                <th className="py-3 px-3 font-medium whitespace-nowrap">مرجع داخلی</th>
                <th className="py-3 px-3 font-medium whitespace-nowrap">تئوری جهانی</th>
                <th className="py-3 px-3 font-medium whitespace-nowrap">دلار (تومان)</th>
                <th className="py-3 px-3 font-medium whitespace-nowrap">انس جهانی</th>
                <th className="py-3 px-3 font-medium whitespace-nowrap">وضعیت</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {recentRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500">
                    هنوز رکوردی در این بازه زمانی ثبت نشده است.
                  </td>
                </tr>
              ) : (
                recentRows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-2.5 px-3 text-slate-300 font-mono-tabular whitespace-nowrap">
                      {formatPersianDateTime(row.timestamp)}
                    </td>
                    <td
                      className={`py-2.5 px-3 font-semibold font-mono-tabular whitespace-nowrap ${
                        row.bubbleToman === null
                          ? 'text-slate-500'
                          : row.bubbleToman > 0
                            ? 'text-red-400'
                            : row.bubbleToman < 0
                              ? 'text-emerald-400'
                              : 'text-slate-200'
                      }`}
                    >
                      {formatToman(row.bubbleToman, true)}
                    </td>
                    <td
                      className={`py-2.5 px-3 font-mono-tabular whitespace-nowrap ${
                        row.bubblePercent === null
                          ? 'text-slate-500'
                          : row.bubblePercent > 0
                            ? 'text-red-400'
                            : row.bubblePercent < 0
                              ? 'text-emerald-400'
                              : 'text-slate-200'
                      }`}
                    >
                      {formatPercent(row.bubblePercent, true)}
                    </td>
                    <td className="py-2.5 px-3 text-slate-200 font-mono-tabular whitespace-nowrap">
                      {formatToman(row.referencePriceToman)}
                    </td>
                    <td className="py-2.5 px-3 text-sky-300 font-mono-tabular whitespace-nowrap">
                      {formatToman(row.theoreticalPriceToman)}
                    </td>
                    <td className="py-2.5 px-3 text-slate-300 font-mono-tabular whitespace-nowrap">
                      {formatToman(row.usdToman)}
                    </td>
                    <td className="py-2.5 px-3 text-slate-300 font-mono-tabular whitespace-nowrap">
                      {formatUsd(row.globalOunceUsd)}
                    </td>
                    <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap">
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
