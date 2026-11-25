import { useState } from 'react';
import { Bell, LineChart, LayoutDashboard, RefreshCw, Settings } from 'lucide-react';
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
    pushSupported,
    pushSubscribed,
    pushPermission,
    refreshNow,
    selectReferenceSource,
    updateSettings,
    updateRule,
    acknowledgeAlert,
    acknowledgeAllAlerts,
    subscribePush,
    unsubscribePush,
    sendTestPush,
  } = useMarketData();

  const unreadAlerts = alerts.filter((a) => !a.acknowledged).length;

  const navItems: Array<{ key: TabKey; label: string }> = [
    { key: 'dashboard', label: 'داشبورد' },
    { key: 'charts', label: 'نمودارها' },
    { key: 'alerts', label: unreadAlerts > 0 ? `هشدارها (${new Intl.NumberFormat('fa-IR').format(unreadAlerts)})` : 'هشدارها' },
    { key: 'settings', label: 'تنظیمات' },
  ];

  return (
    <div className="min-h-screen bg-[#0B0F17] text-slate-100 pb-20 md:pb-10">
      {/* Desktop & Mobile Top Bar — Strict 3-Zone Contract */}
      <header className="sticky top-0 z-30 border-b border-slate-800/90 bg-[#0B0F17]/90 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 h-14 md:h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single-line Brand Wordmark */}
          <button
            type="button"
            onClick={() => setActiveTab('dashboard')}
            className="text-base md:text-lg font-bold tracking-tight text-amber-300 whitespace-nowrap shrink-0"
          >
            پایشگر حباب طلا
          </button>

          {/* Zone 2: 4 Single-line Navigation Links (Desktop) */}
          <nav className="hidden md:flex items-center gap-6" aria-label="ناوبری اصلی">
            {navItems.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveTab(item.key)}
                className={`text-sm font-medium transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
                  activeTab === item.key
                    ? 'text-amber-300 border-amber-400'
                    : 'text-slate-400 border-transparent hover:text-slate-100'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* Zone 3: Primary Action */}
          <div className="flex items-center gap-2.5 shrink-0">
            <PWAInstallButton compact />
            <button
              type="button"
              onClick={() => void refreshNow()}
              disabled={refreshing}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-500 px-3.5 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0 min-h-[40px] disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span>بروزرسانی</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-5 md:py-7">
        {error && (
          <div className="mb-5 rounded-xl border border-red-500/40 bg-red-950/30 px-4 py-3 text-xs text-red-300 flex items-center justify-between">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => void refreshNow()}
              className="underline hover:text-white"
            >
              تلاش مجدد
            </button>
          </div>
        )}

        {loading && !snapshot ? (
          <div className="space-y-5" aria-busy="true">
            <div className="h-44 rounded-xl border border-slate-800 bg-[#111827] animate-pulse" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div key={idx} className="h-32 rounded-xl border border-slate-800 bg-[#111827] animate-pulse" />
              ))}
            </div>
            <div className="h-80 rounded-xl border border-slate-800 bg-[#111827] animate-pulse" />
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
                pushSupported={pushSupported}
                pushSubscribed={pushSubscribed}
                pushPermission={pushPermission}
                onAcknowledgeAlert={acknowledgeAlert}
                onAcknowledgeAll={acknowledgeAllAlerts}
                onUpdateRule={updateRule}
                onSubscribePush={subscribePush}
                onUnsubscribePush={unsubscribePush}
                onSendTestPush={sendTestPush}
              />
            )}

            {activeTab === 'settings' && (
              <SettingsView settings={settings} onSaveSettings={updateSettings} />
            )}
          </>
        )}
      </main>

      {/* Mobile Fixed Bottom Thumb-Zone Tab Bar (<= 15% viewport height, >= 44px touch targets) */}
      <nav
        aria-label="ناوبری موبایل"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-slate-800 bg-[#0B0F17]/95 backdrop-blur-md"
      >
        <div className="grid grid-cols-4 h-16">
          <button
            type="button"
            onClick={() => setActiveTab('dashboard')}
            className={`flex flex-col items-center justify-center gap-1 min-h-[44px] ${
              activeTab === 'dashboard' ? 'text-amber-400' : 'text-slate-400'
            }`}
          >
            <LayoutDashboard className="w-5 h-5" />
            <span className="text-[11px] font-medium">داشبورد</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('charts')}
            className={`flex flex-col items-center justify-center gap-1 min-h-[44px] ${
              activeTab === 'charts' ? 'text-amber-400' : 'text-slate-400'
            }`}
          >
            <LineChart className="w-5 h-5" />
            <span className="text-[11px] font-medium">نمودارها</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('alerts')}
            className={`relative flex flex-col items-center justify-center gap-1 min-h-[44px] ${
              activeTab === 'alerts' ? 'text-amber-400' : 'text-slate-400'
            }`}
          >
            <Bell className="w-5 h-5" />
            <span className="text-[11px] font-medium">
              هشدارها{unreadAlerts > 0 ? ` (${new Intl.NumberFormat('fa-IR').format(unreadAlerts)})` : ''}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`flex flex-col items-center justify-center gap-1 min-h-[44px] ${
              activeTab === 'settings' ? 'text-amber-400' : 'text-slate-400'
            }`}
          >
            <Settings className="w-5 h-5" />
            <span className="text-[11px] font-medium">تنظیمات</span>
          </button>
        </div>
      </nav>

      <OfflineIndicator />
    </div>
  );
}
