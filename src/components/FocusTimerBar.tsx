import { Pause, Play, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';

interface FocusTimerBarProps {
  initialMinutes?: number;
}

export function FocusTimerBar({ initialMinutes = 30 }: FocusTimerBarProps) {
  const [durationMin, setDurationMin] = useState(initialMinutes);
  const [secondsLeft, setSecondsLeft] = useState(initialMinutes * 60);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    if (!isRunning) return;
    const timer = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          setIsRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isRunning]);

  const selectPreset = (mins: number) => {
    setIsRunning(false);
    setDurationMin(mins);
    setSecondsLeft(mins * 60);
  };

  const reset = () => {
    setIsRunning(false);
    setSecondsLeft(durationMin * 60);
  };

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900 px-4 py-2.5">
      <div className="flex items-center gap-3">
        <span className="font-mono-num text-xl font-bold text-slate-100">{formatted}</span>
        <span className="text-xs text-slate-400">
          {secondsLeft === 0 ? 'انتهت الجلسة — استرح قليلاً' : 'مؤقت التركيز'}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 rounded-lg bg-slate-800 p-0.5">
          {[30, 50, 90, 150].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => selectPreset(m)}
              className={`px-2 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                durationMin === m
                  ? 'bg-slate-950 text-slate-100'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              {m === 150 ? '2.5سا' : `${m}د`}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setIsRunning((v) => !v)}
          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors cursor-pointer"
        >
          {isRunning ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          <span>{isRunning ? 'إيقاف' : 'تشغيل'}</span>
        </button>

        <button
          type="button"
          onClick={reset}
          aria-label="إعادة ضبط المؤقت"
          className="inline-flex items-center justify-center rounded-lg border border-slate-700 bg-slate-800 p-1.5 text-slate-300 hover:text-slate-100 hover:bg-slate-700 transition-colors cursor-pointer"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
