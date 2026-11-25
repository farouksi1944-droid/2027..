import type { SubjectId } from '../types/study';

const STROKE_COLORS: Record<SubjectId, string> = {
  sciences: '#34d399', // emerald-400
  physics: '#38bdf8', // sky-400
  math: '#818cf8', // indigo-400
  history_geo: '#fb7185', // rose-400
};

interface SubjectMasteryRingProps {
  subjectId?: SubjectId;
  percentage: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
}

export function SubjectMasteryRing({
  subjectId,
  percentage,
  size = 64,
  strokeWidth = 6,
  label,
}: SubjectMasteryRingProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(percentage)));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (clamped / 100) * circumference;
  const strokeColor = subjectId ? STROKE_COLORS[subjectId] : '#10b981';

  return (
    <div
      className="relative inline-flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
      aria-label={label ? `${label}: ${clamped}%` : `نسبة التمكن ${clamped}%`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#1e293b"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className="transition-all duration-300"
        />
      </svg>
      <span className="absolute font-mono-num text-xs font-bold text-slate-100 tabular-nums">
        {clamped}%
      </span>
    </div>
  );
}
