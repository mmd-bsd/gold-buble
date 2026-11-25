import { useState } from 'react';
import { Bell, Coins, LineChart, LayoutDashboard, RefreshCw, Settings } from 'lucide-react';
import { useMarketData } from './hooks/useMarketData';
import { DashboardView } from './components/DashboardView';
import { ChartsView } from './components/ChartsView';
import { AlertsView } from './components/AlertsView';
import { SettingsView } from './components/SettingsView';
import { PWAInstallButton } from './components/PWAInstallButton';
import { OfflineIndicator } from './components/OfflineIndicator';

type TabKey = 'dashboard' | 'charts' | 'alerts' | 'settings';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const {
    snapshot,
    history,
    chartRange,
    setChartRange,
    alerts,
    rules,
    settings,
    loading,
    refreshing,
    error,
    refreshNow,
    selectReferenceSource,
    updateSettings,
    updateRule,
    acknowledgeAlert,
    acknowledgeAllAlerts,
  } = useMarketData();

  const unreadAlerts = alerts.filter((a) => !a.acknowledged).length;

  const navItems: Array<{ key: TabKey; label: string }> = [
    { key: 'dashboard', label: 'داشبورد' },
    { key: 'charts', label: 'نمودارها' },
    {
      key: 'alerts',
      label: unreadAlerts > 0 ? `هشدارها (${new Intl.NumberFormat('fa-IR').format(unreadAlerts)})` : 'هشدارها',
    },
    { key: 'settings', label: 'تنظیمات' },
  ];

  const mobileNav: Array<{ key: TabKey; label: string; icon: typeof LayoutDashboard }> = [
    { key: 'dashboard', label: 'داشبورد', icon: LayoutDashboard },
    { key: 'charts', label: 'نمودارها', icon: LineChart },
    { key: 'alerts', label: 'هشدارها', icon: Bell },
    { key: 'settings', label: 'تنظیمات', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-canvas text-slate-100 pb-24 md:pb-12">
      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-canvas/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <button
            type="button"
            onClick={() => setActiveTab('dashboard')}
            className="flex shrink-0 items-center gap-2.5"
            aria-label="پایشگر حباب طلا — داشبورد"
          >
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-amber-300 to-amber-600 text-slate-950 shadow-[0_8px_26px_-10px_rgba(245,158,11,0.7)]">
              <Coins className="h-[18px] w-[18px]" strokeWidth={2.2} />
            </span>
            <span className="flex flex-col items-start leading-none">
              <span className="text-[15px] font-extrabold tracking-tight text-slate-50">
                حباب <span className="text-amber-300">طلا</span>
              </span>
              <span className="mt-1 hidden text-[10.5px] font-medium text-slate-500 sm:block">
                پایشگر بازار ایران
              </span>
            </span>
          </button>

          <nav
            className="hidden items-center gap-1 rounded-full border border-white/[0.06] bg-white/[0.025] p-1 md:flex"
            aria-label="ناوبری اصلی"
          >
            {navItems.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveTab(item.key)}
                className={`rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors ${
                  activeTab === item.key
                    ? 'bg-amber-400/10 text-amber-200 shadow-[inset_0_0_0_1px_rgba(244,185,66,0.18)]'
                    : 'text-slate-400 hover:bg-white/[0.05] hover:text-slate-100'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <PWAInstallButton compact />
            <button
              type="button"
              onClick={() => void refreshNow()}
              disabled={refreshing}
              aria-label="بروزرسانی داده‌ها"
              className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl border border-amber-400/25 bg-amber-400/10 px-3.5 py-2 text-[13px] font-semibold text-amber-200 transition-colors hover:border-amber-400/40 hover:bg-amber-400/15 disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">بروزرسانی</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 md:py-8">
        {error && (
          <div className="mb-6 flex items-center justify-between gap-3 rounded-2xl border border-red-400/25 bg-red-500/[0.07] px-4 py-3 text-[13px] text-red-200">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => void refreshNow()}
              className="shrink-0 font-semibold text-red-100 underline underline-offset-4 hover:text-white"
            >
              تلاش مجدد
            </button>
          </div>
        )}

        {loading && !snapshot ? (
          <div className="space-y-5" aria-busy="true">
            <div className="h-48 animate-pulse rounded-2xl border border-white/[0.05] bg-panel" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div key={idx} className="h-36 animate-pulse rounded-2xl border border-white/[0.05] bg-panel" />
              ))}
            </div>
            <div className="h-80 animate-pulse rounded-2xl border border-white/[0.05] bg-panel" />
          </div>
        ) : (
          <>
            {activeTab === 'dashboard' && (
              <DashboardView
                snapshot={snapshot}
                historyPoints={history?.points ?? []}
                chartRange={chartRange}
                onRangeChange={setChartRange}
                onRefresh={refreshNow}
                refreshing={refreshing}
                onSelectReference={selectReferenceSource}
                onOpenCharts={() => setActiveTab('charts')}
              />
            )}

            {activeTab === 'charts' && (
              <ChartsView
                points={history?.points ?? []}
                totalCount={history?.totalCount ?? 0}
                range={chartRange}
                onRangeChange={setChartRange}
              />
            )}

            {activeTab === 'alerts' && (
              <AlertsView
                alerts={alerts}
                rules={rules}
                onAcknowledgeAlert={acknowledgeAlert}
                onAcknowledgeAll={acknowledgeAllAlerts}
                onUpdateRule={updateRule}
              />
            )}

            {activeTab === 'settings' && (
              <SettingsView settings={settings} onSaveSettings={updateSettings} />
            )}
          </>
        )}
      </main>

      <nav
        aria-label="ناوبری موبایل"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.06] bg-canvas/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
      >
        <div className="mx-auto grid h-[68px] max-w-md grid-cols-4">
          {mobileNav.map(({ key, label, icon: Icon }) => {
            const active = activeTab === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                className={`relative flex min-h-[48px] flex-col items-center justify-center gap-1 transition-colors ${
                  active ? 'text-amber-300' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {active && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-amber-400" />}
                <Icon className="h-[21px] w-[21px]" strokeWidth={active ? 2.2 : 1.9} />
                <span className="text-[10.5px] font-semibold">{label}</span>
                {key === 'alerts' && unreadAlerts > 0 && (
                  <span className="absolute right-4 top-2 grid h-4 min-w-4 place-items-center rounded-full bg-amber-400 px-1 text-[9px] font-bold text-slate-950">
                    {new Intl.NumberFormat('fa-IR').format(unreadAlerts)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      <OfflineIndicator />
    </div>
  );
}
