import React, { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="inline-flex min-h-[40px] shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[12.5px] font-semibold text-slate-200 transition-colors hover:border-amber-400/40 hover:text-amber-200"
      >
        <Download className="w-4 h-4 shrink-0" />
        <span>{compact ? 'نصب' : 'نصب اپلیکیشن'}</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowGuide(true)}
          className="inline-flex min-h-[40px] shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[12.5px] font-semibold text-slate-200 transition-colors hover:border-amber-400/40 hover:text-amber-200"
        >
          <Smartphone className="w-4 h-4 shrink-0" />
          <span>نصب در آیفون</span>
        </button>

        {showGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-2xl border border-white/[0.08] bg-panel p-6 text-right shadow-2xl">
              <div className="flex items-center justify-between">
                <h3 className="text-[15px] font-bold text-slate-50">نصب در iPhone و iPad</h3>
                <button
                  type="button"
                  onClick={() => setShowGuide(false)}
                  className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-white/[0.05] hover:text-slate-200"
                  aria-label="بستن"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <ol className="mt-4 list-inside list-decimal space-y-2.5 text-[12.5px] leading-6 text-slate-300">
                <li>در نوار پایین مرورگر Safari دکمه <strong>Share</strong> را بزنید.</li>
                <li>به پایین اسکرول کرده و گزینه <strong>Add to Home Screen</strong> را انتخاب کنید.</li>
                <li>دکمه <strong>Add</strong> را بزنید تا آیکون برنامه روی صفحه اصلی قرار گیرد.</li>
              </ol>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="mt-5 min-h-[44px] w-full rounded-xl bg-gradient-to-l from-amber-500 to-amber-400 py-2.5 text-[12.5px] font-bold text-slate-950 transition-opacity hover:opacity-90"
              >
                متوجه شدم
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
