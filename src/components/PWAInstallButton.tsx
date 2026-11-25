import { Check, Copy, Download, Monitor, X } from 'lucide-react';
import { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export function PWAInstallButton() {
  const { isInstallable, isInstalled, isIOS, isInIframe, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  // Already running as an installed standalone desktop/mobile app
  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      await install();
      return;
    }
    setShowGuide(true);
  };

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      setCopiedUrl(true);
      window.setTimeout(() => setCopiedUrl(false), 2500);
    } catch {
      // ignore clipboard restrictions
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void handleClick()}
        title="تثبيت التطبيق على سطح المكتب للكمبيوتر"
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
      >
        {isInstallable ? (
          <Download className="h-3.5 w-3.5 text-emerald-400" />
        ) : (
          <Monitor className="h-3.5 w-3.5 text-sky-400" />
        )}
        <span className="hidden sm:inline">تثبيت على سطح المكتب</span>
        <span className="sm:hidden">تثبيت</span>
      </button>

      {showGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-xs"
          onClick={() => setShowGuide(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 text-slate-100">
                <Monitor className="h-5 w-5 text-emerald-400 shrink-0" />
                <h3 className="font-display text-base font-bold">
                  {isIOS ? 'تثبيت التطبيق على iPhone / iPad' : 'تحميل وتثبيت التطبيق على سطح المكتب'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                aria-label="إغلاق"
                className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {isIOS ? (
              <ol className="space-y-2 text-xs text-slate-300 leading-relaxed list-decimal list-inside">
                <li>اضغط على زر المشاركة (Share) في شريط متصفح Safari.</li>
                <li>مرر للأسفل واختر «إضافة إلى الشاشة الرئيسية» (Add to Home Screen).</li>
              </ol>
            ) : (
              <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
                {isInIframe && (
                  <div className="rounded-lg border border-amber-800/60 bg-amber-950/30 p-3 space-y-2 text-amber-200">
                    <p>
                      أنت تعرض التطبيق حالياً داخل نافذة المعاينة. لتثبيته على سطح المكتب، افتح رابط التطبيق في تبويب مستقل في Chrome أو Edge:
                    </p>
                    <button
                      type="button"
                      onClick={() => void handleCopyUrl()}
                      className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:bg-slate-700 cursor-pointer"
                    >
                      {copiedUrl ? (
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      <span>{copiedUrl ? 'تم نسخ رابط التطبيق!' : 'نسخ رابط التطبيق لفتحه في المتصفح'}</span>
                    </button>
                  </div>
                )}

                <div className="space-y-2">
                  <div className="font-semibold text-slate-100">على الكمبيوتر (Chrome أو Microsoft Edge):</div>
                  <ol className="space-y-1.5 list-decimal list-inside text-slate-300">
                    <li>افتح التطبيق في نافذة متصفح Chrome أو Edge مستقلة.</li>
                    <li>اضغط على أيقونة التثبيت (⊕ أو الشاشة) في شريط العنوان بالأعلى، أو اضغط هنا على زر «تثبيت على سطح المكتب» مباشرة.</li>
                    <li>أو من قائمة المتصفح (⋮) اختر «تثبيت سباق 6 ديسمبر» أو «إضافة إلى سطح المكتب» ليعمل كبرنامج مستقل وبدون إنترنت.</li>
                  </ol>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 cursor-pointer"
              >
                فهمت
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
