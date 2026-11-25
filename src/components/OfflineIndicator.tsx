import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed bottom-24 left-4 z-50 flex items-center gap-2 rounded-xl border border-amber-400/25 bg-amber-950/95 px-3.5 py-2.5 text-[11.5px] font-medium text-amber-100 shadow-xl backdrop-blur-md md:bottom-6 md:left-6"
    >
      <WifiOff className="h-4 w-4 shrink-0 text-amber-300" />
      <span>حالت آفلاین — نمایش آخرین داده‌های ذخیره‌شده</span>
    </div>
  );
};
