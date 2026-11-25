import { useOnlineStatus } from '../hooks/useOnlineStatus';

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-lg border border-amber-700/70 bg-amber-950/95 px-3 py-1.5 text-xs font-medium text-amber-200 shadow-lg">
      <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
      <span>وضع عدم الاتصال — البرنامج محفوظ ويعمل محلياً</span>
    </div>
  );
}
