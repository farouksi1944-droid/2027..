import { PWAInstallButton } from './PWAInstallButton';

export type ActiveTab = 'schedule' | 'subjects' | 'morning' | 'arena';

interface TopBarProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  onStartQuickDuel: () => void;
}

const NAV_ITEMS: { id: ActiveTab; label: string }[] = [
  { id: 'schedule', label: 'الجدول اليومي' },
  { id: 'subjects', label: 'الدروس والتذكير' },
  { id: 'morning', label: 'حفظ الصباح' },
  { id: 'arena', label: 'التنافس' },
];

export function TopBar({ activeTab, onSelectTab, onStartQuickDuel }: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-900/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-6 px-4 py-3 sm:px-6">
        <button
          type="button"
          onClick={() => onSelectTab('schedule')}
          className="font-display text-lg font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded"
        >
          سباق 6 ديسمبر
        </button>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400" aria-label="التنقل الرئيسي">
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`relative py-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded ${
                  isActive ? 'text-slate-100 font-semibold' : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                {item.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 -bottom-[13px] h-0.5 bg-emerald-500"
                  />
                )}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <PWAInstallButton />
          <button
            type="button"
            onClick={onStartQuickDuel}
            className="px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-500 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            اختبر نفسك
          </button>
        </div>
      </div>

      {/* Mobile navigation strip */}
      <nav
        className="flex md:hidden items-center justify-around border-t border-slate-800 px-2 py-1.5 text-xs font-medium"
        aria-label="التنقل على الهاتف"
      >
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className={`px-2.5 py-1.5 rounded-md whitespace-nowrap shrink-0 transition-colors ${
                isActive ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
}
