import { BookOpenCheck, Check, Eye, EyeOff, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import type { ScientificExercise } from '../types/study';

interface ScientificExercisesPanelProps {
  exercises: ScientificExercise[];
  solvedExercises: Record<string, string>;
  onToggleExercise: (exercise: ScientificExercise) => void;
}

export function ScientificExercisesPanel({
  exercises,
  solvedExercises,
  onToggleExercise,
}: ScientificExercisesPanelProps) {
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({});
  const [revealedSolutions, setRevealedSolutions] = useState<Record<string, boolean>>({});

  if (exercises.length === 0) return null;

  const solvedCount = exercises.filter((ex) => Boolean(solvedExercises[ex.id])).length;

  const handleChooseOption = (exercise: ScientificExercise, option: string) => {
    setSelectedAnswers((prev) => ({ ...prev, [exercise.id]: option }));
    if (option === exercise.correctOption) {
      setRevealedSolutions((prev) => ({ ...prev, [exercise.id]: true }));
      if (!solvedExercises[exercise.id]) {
        onToggleExercise(exercise);
      }
    }
  };

  return (
    <div className="mt-4 border-t border-slate-800 pt-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-400">
          <BookOpenCheck className="h-4 w-4 shrink-0" />
          <span>تمارين تطبيقية للمواد العلمية ({solvedCount}/{exercises.length})</span>
        </div>
        <span className="text-[11px] text-slate-400">
          حل التمارين يرفع نسبة تمكنك الدائرية من المادة (+25 XP لكل تمرين)
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {exercises.map((exercise) => {
          const isSolved = Boolean(solvedExercises[exercise.id]);
          const chosen = selectedAnswers[exercise.id];
          const isSolutionOpen = Boolean(revealedSolutions[exercise.id]) || isSolved;

          return (
            <div
              key={exercise.id}
              className={`rounded-lg border p-4 space-y-3 transition-colors ${
                isSolved
                  ? 'border-emerald-800/70 bg-emerald-950/20'
                  : 'border-slate-800 bg-slate-950/70'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <h4 className="text-xs sm:text-sm font-bold text-slate-100 leading-snug">
                  {exercise.title}
                </h4>
                <span
                  className={`font-mono-num text-[11px] font-semibold shrink-0 ${
                    isSolved ? 'text-emerald-400' : 'text-slate-400'
                  }`}
                >
                  {isSolved ? 'محلول ✓' : `+${exercise.xpReward} XP`}
                </span>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">{exercise.prompt}</p>
              <div className="text-xs font-semibold text-slate-100">{exercise.question}</div>

              <div className="grid grid-cols-1 gap-1.5">
                {exercise.options.map((opt) => {
                  const isChosen = chosen === opt;
                  const isCorrect = opt === exercise.correctOption;

                  let btnClass =
                    'border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-slate-100';
                  if (chosen) {
                    if (isCorrect) {
                      btnClass =
                        'border-emerald-500/80 bg-emerald-950/70 text-emerald-200 font-semibold';
                    } else if (isChosen) {
                      btnClass = 'border-rose-500/80 bg-rose-950/70 text-rose-200';
                    }
                  } else if (isSolved && isCorrect) {
                    btnClass =
                      'border-emerald-700/70 bg-emerald-950/50 text-emerald-300 font-semibold';
                  }

                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => handleChooseOption(exercise, opt)}
                      className={`w-full rounded-lg border px-3 py-2 text-start text-xs leading-relaxed transition-colors cursor-pointer ${btnClass}`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>

              {chosen && chosen !== exercise.correctOption && (
                <div className="text-[11px] font-medium text-rose-400">
                  إجابة غير دقيقة — راجع المعطيات أو اطلع على الحل النموذجي أدناه.
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  onClick={() =>
                    setRevealedSolutions((prev) => ({
                      ...prev,
                      [exercise.id]: !isSolutionOpen,
                    }))
                  }
                  className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-100 cursor-pointer"
                >
                  {isSolutionOpen ? (
                    <>
                      <EyeOff className="h-3.5 w-3.5" />
                      <span>إخفاء الحل</span>
                    </>
                  ) : (
                    <>
                      <Eye className="h-3.5 w-3.5" />
                      <span>الحل النموذجي</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => onToggleExercise(exercise)}
                  className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                    isSolved
                      ? 'border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
                      : 'bg-emerald-600 text-white hover:bg-emerald-500'
                  }`}
                >
                  {isSolved ? (
                    <>
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>إلغاء الحل</span>
                    </>
                  ) : (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      <span>حللته على الورق ✓</span>
                    </>
                  )}
                </button>
              </div>

              {isSolutionOpen && (
                <div className="rounded-lg border border-slate-800 bg-slate-900 p-3 space-y-1">
                  <div className="text-[11px] font-semibold text-emerald-400">
                    منهجية الحل:
                  </div>
                  <p className="text-xs leading-relaxed text-slate-300">
                    {exercise.solutionSteps}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
