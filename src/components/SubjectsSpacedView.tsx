import { Bell, BookOpenCheck, Check, ChevronDown, ChevronUp, RotateCcw, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { SUBJECT_ORDER, SUBJECTS, TERM1_LESSONS } from '../data/curriculum';
import { isScientificSubject, SCIENTIFIC_EXERCISES } from '../data/scientificExercises';
import type {
  LessonItem,
  PlayerProgress,
  ReviewQuality,
  ScientificExercise,
  SpacedStage,
  SubjectId,
} from '../types/study';
import { computeSubjectMastery, computeWeightedOverallMastery } from '../utils/mastery';
import {
  computeLessonSpacedStatus,
  formatArabicShortDate,
  formatDaysAgoAr,
  getRemindersForDate,
} from '../utils/spacedRepetition';
import { ScientificExercisesPanel } from './ScientificExercisesPanel';
import { SubjectMasteryRing } from './SubjectMasteryRing';

interface SubjectsSpacedViewProps {
  activePlayer: PlayerProgress;
  initialSubject?: 'all' | SubjectId;
  initialExpandedLessonId?: string | null;
  onToggleStage: (lessonId: string, stage: SpacedStage, reviewDate?: string) => void;
  onReviewLesson: (lessonId: string, stage: SpacedStage, quality: ReviewQuality, reviewDate: string) => void;
  onToggleExercise: (exercise: ScientificExercise) => void;
}

const STAGES: SpacedStage[] = ['S0', 'R1', 'R2', 'R3'];

export function SubjectsSpacedView({
  activePlayer,
  initialSubject = 'all',
  initialExpandedLessonId = null,
  onToggleStage,
  onReviewLesson,
  onToggleExercise,
}: SubjectsSpacedViewProps) {
  const [selectedSubject, setSelectedSubject] = useState<'all' | SubjectId>(initialSubject);
  const [statusFilter, setStatusFilter] = useState<'all' | 'due_now' | 'reviewed' | 'not_started'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedLessonId, setExpandedLessonId] = useState<string | null>(initialExpandedLessonId);

  useEffect(() => {
    setSelectedSubject(initialSubject);
  }, [initialSubject]);

  useEffect(() => {
    if (initialExpandedLessonId) {
      setExpandedLessonId(initialExpandedLessonId);
    }
  }, [initialExpandedLessonId]);

  const referenceDate =
    activePlayer.lastActiveDate >= '2026-11-28' ? activePlayer.lastActiveDate : '2026-11-28';

  const remindersDue = useMemo(
    () => getRemindersForDate(activePlayer, referenceDate),
    [activePlayer, referenceDate]
  );

  const countCompleted = (player: PlayerProgress, lessonId: string) =>
    STAGES.filter((s) => Boolean(player.completedStages[`${lessonId}:${s}`])).length;

  const overallMastery = useMemo(
    () => computeWeightedOverallMastery(activePlayer),
    [activePlayer]
  );

  const subjectMasteryList = useMemo(
    () =>
      SUBJECT_ORDER.map((subId) => ({
        info: SUBJECTS[subId],
        mine: computeSubjectMastery(activePlayer, subId),
      })),
    [activePlayer]
  );

  const filteredLessons = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return TERM1_LESSONS.filter((lesson) => {
      if (selectedSubject !== 'all' && lesson.subjectId !== selectedSubject) return false;
      const spaced = computeLessonSpacedStatus(activePlayer, lesson.id, referenceDate);

      if (statusFilter === 'due_now') {
        const isReminderDue =
          spaced.completedCount >= 1 &&
          spaced.completedCount < 4 &&
          (spaced.status === 'due_today' || spaced.status === 'overdue');
        if (!isReminderDue) return false;
      }
      if (statusFilter === 'reviewed' && spaced.completedCount === 0) return false;
      if (statusFilter === 'not_started' && spaced.completedCount > 0) return false;

      if (q) {
        const haystack = [lesson.title, lesson.unitTitle, SUBJECTS[lesson.subjectId].name]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [selectedSubject, statusFilter, searchQuery, activePlayer, referenceDate]);

  const myReviewedLessonsCount = TERM1_LESSONS.filter(
    (l) => countCompleted(activePlayer, l.id) > 0
  ).length;
  const solvedExercisesMap = activePlayer.solvedExercises ?? {};
  const solvedExercisesCount = SCIENTIFIC_EXERCISES.filter((ex) =>
    Boolean(solvedExercisesMap[ex.id])
  ).length;

  return (
    <div className="space-y-6">
      {/* Header + Circular Mastery Rings per Subject */}
      <section className="rounded-xl border border-slate-800 bg-slate-900 p-5 sm:p-6 space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-100">
              دروس الفصل الأول، التمارين العلمية، ونسبة التمكن
            </h1>
            <p className="mt-1 text-xs text-slate-400">
              الدوائر النسبية تقيس تمكنك في كل مادة (للمواد العلمية: الدروس + حل التمارين التطبيقية).
            </p>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <SubjectMasteryRing percentage={overallMastery} size={52} strokeWidth={5} label="التمكن الإجمالي" />
            <div className="space-y-0.5">
              <div className="text-[11px] text-slate-400">التمكن الإجمالي ({activePlayer.name})</div>
              <div className="font-mono-num text-xs font-semibold text-slate-200 tabular-nums">
                {myReviewedLessonsCount}/{TERM1_LESSONS.length} درس · {solvedExercisesCount}/{SCIENTIFIC_EXERCISES.length} تمرين علمي
              </div>
            </div>
          </div>
        </div>

        {/* 4-Subject Circular Percentage Rings Grid */}
        <div className="border-t border-slate-800 pt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-200">
              الدائرة النسبية لمدى التمكن من كل مادة (اضغط على أي مادة لعرض دروسها)
            </span>
            {selectedSubject !== 'all' && (
              <button
                type="button"
                onClick={() => setSelectedSubject('all')}
                className="text-xs font-medium text-emerald-400 hover:text-emerald-300 cursor-pointer"
              >
                عرض كل المواد
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {subjectMasteryList.map(({ info, mine }) => {
              const isSelected = selectedSubject === info.id;
              return (
                <button
                  key={info.id}
                  type="button"
                  onClick={() => setSelectedSubject(isSelected ? 'all' : info.id)}
                  className={`flex items-center gap-3 rounded-lg border p-3 text-start transition-colors cursor-pointer ${
                    isSelected
                      ? 'border-emerald-500 bg-emerald-950/30'
                      : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
                  }`}
                >
                  <SubjectMasteryRing
                    subjectId={info.id}
                    percentage={mine.percentage}
                    size={52}
                    strokeWidth={5}
                    label={info.name}
                  />
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="text-xs font-bold text-slate-100 truncate">
                      {info.shortName}
                    </div>
                    <div className="text-[11px] text-slate-400 tabular-nums">
                      {mine.reviewedLessonsCount}/{mine.totalLessonsCount} دروس
                    </div>
                    {mine.isScientific && (
                      <div className="text-[11px] text-sky-400 tabular-nums">
                        {mine.solvedExercisesCount}/{mine.totalExercisesCount} تمارين
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Search & Filter Tabs */}
        <div className="flex flex-col gap-3 border-t border-slate-800 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث عن درس (مثال: الاستنساخ، الدالة الأسية، الحركة الدائرية، الحرب الباردة...)"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2 pr-9 pl-3 text-xs text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1 rounded-lg bg-slate-800 p-1 overflow-x-auto">
            {[
              { id: 'all', label: 'الكل' },
              { id: 'due_now', label: `يحتاج مراجعة (${remindersDue.length})` },
              { id: 'reviewed', label: 'تمت مراجعته' },
              { id: 'not_started', label: 'لم يُراجع' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id as typeof statusFilter)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  statusFilter === tab.id
                    ? 'bg-slate-950 text-slate-100'
                    : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Gentle Reminder Banner if any previously reviewed lessons need re-review */}
      {remindersDue.length > 0 && statusFilter !== 'due_now' && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-800/60 bg-amber-950/20 px-4 py-3 text-xs">
          <div className="flex items-center gap-2 text-amber-300 font-medium">
            <Bell className="h-4 w-4 shrink-0" />
            <span>
              لديك {remindersDue.length}{' '}
              {remindersDue.length === 1 ? 'درس مرّت أيام على مراجعته ويحتاج تذكيراً الآن' : 'دروس مرّت أيام على مراجعتها وتحتاج تذكيراً الآن'}.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setStatusFilter('due_now')}
            className="font-semibold text-amber-300 hover:text-amber-200 underline underline-offset-4 cursor-pointer"
          >
            عرضها فقط
          </button>
        </div>
      )}

      {/* Lesson List */}
      {filteredLessons.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-10 text-center space-y-3">
          <p className="text-sm text-slate-300">لا توجد دروس مطابقة.</p>
          <button
            type="button"
            onClick={() => {
              setSelectedSubject('all');
              setStatusFilter('all');
              setSearchQuery('');
            }}
            className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-500 cursor-pointer"
          >
            عرض كل الدروس
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 bg-slate-900 divide-y divide-slate-800">
          {filteredLessons.map((lesson: LessonItem) => {
            const subject = SUBJECTS[lesson.subjectId];
            const isExpanded = expandedLessonId === lesson.id;
            const spaced = computeLessonSpacedStatus(activePlayer, lesson.id, referenceDate);

            const isScientific = isScientificSubject(lesson.subjectId);
            const lessonExercises = isScientific
              ? SCIENTIFIC_EXERCISES.filter((ex) => ex.lessonId === lesson.id)
              : [];
            const solvedInLesson = lessonExercises.filter((ex) =>
              Boolean(solvedExercisesMap[ex.id])
            ).length;

            const isReminderDue =
              spaced.completedCount >= 1 &&
              spaced.completedCount < 4 &&
              (spaced.status === 'due_today' || spaced.status === 'overdue');

            const lastCompletedStage =
              spaced.completedCount > 0 ? STAGES[spaced.completedCount - 1] : null;

            return (
              <div
                key={lesson.id}
                className={`p-4 sm:p-5 transition-colors ${
                  isReminderDue ? 'bg-amber-950/15' : ''
                }`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                      <span className={`font-semibold ${subject.accentTextClass}`}>
                        {subject.name}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{lesson.unitNumber}</span>
                      {isScientific && lessonExercises.length > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono-num text-sky-400 tabular-nums">
                            تمارين: {solvedInLesson}/{lessonExercises.length}
                          </span>
                        </>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => setExpandedLessonId(isExpanded ? null : lesson.id)}
                      className="flex items-center gap-2 text-start group cursor-pointer"
                    >
                      <h3 className="text-sm sm:text-base font-bold text-slate-100 group-hover:text-emerald-400 transition-colors">
                        {lesson.title}
                      </h3>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-slate-400 shrink-0" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
                      )}
                    </button>

                    {/* Clear human reminder status */}
                    <div className="text-xs">
                      {spaced.status === 'not_started' && (
                        <span className="text-slate-400">لم يُراجع بعد</span>
                      )}
                      {isReminderDue && (
                        <span className="font-medium text-amber-400">
                          تذكير: راجعته {formatDaysAgoAr(spaced.daysSinceLastReview)} — أعد مراجعته حتى لا تنساه
                        </span>
                      )}
                      {spaced.status === 'scheduled' && spaced.completedCount > 0 && (
                        <span className="text-sky-400">
                          تمت المراجعة ({spaced.completedCount}/4) · التذكير القادم:{' '}
                          {spaced.nextDueDate ? formatArabicShortDate(spaced.nextDueDate) : ''}
                        </span>
                      )}
                      {spaced.status === 'mastered' && (
                        <span className="font-medium text-emerald-400">
                          مثبّت في الذاكرة تماماً (4/4 مراجعات)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {isScientific && lessonExercises.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setExpandedLessonId(isExpanded ? null : lesson.id)}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                          solvedInLesson === lessonExercises.length
                            ? 'border-sky-800 bg-sky-950/50 text-sky-300'
                            : 'border-slate-700 bg-slate-950 text-sky-300 hover:bg-slate-800'
                        }`}
                      >
                        <BookOpenCheck className="h-3.5 w-3.5" />
                        <span>
                          {isExpanded ? 'إخفاء التمارين' : `حل التمارين (${solvedInLesson}/${lessonExercises.length})`}
                        </span>
                      </button>
                    )}

                    {spaced.status === 'not_started' && (
                      <button
                        type="button"
                        onClick={() => onToggleStage(lesson.id, 'S0', referenceDate)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-700 transition-colors cursor-pointer"
                      >
                        <Check className="h-3.5 w-3.5" />
                        <span>تمت المراجعة</span>
                      </button>
                    )}

                    {isReminderDue && spaced.nextStage && (
                      <button
                        type="button"
                        onClick={() =>
                          onReviewLesson(lesson.id, spaced.nextStage!, 'good', referenceDate)
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-amber-500 transition-colors cursor-pointer"
                      >
                        <Check className="h-3.5 w-3.5" />
                        <span>أعدت مراجعته ✓</span>
                      </button>
                    )}

                    {spaced.status === 'scheduled' && spaced.nextStage && (
                      <button
                        type="button"
                        onClick={() =>
                          onReviewLesson(lesson.id, spaced.nextStage!, 'good', referenceDate)
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-700/70 bg-emerald-950/50 px-3.5 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-900/50 transition-colors cursor-pointer"
                      >
                        <Check className="h-3.5 w-3.5" />
                        <span>مراجعة إضافية</span>
                      </button>
                    )}

                    {spaced.status === 'mastered' && (
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white">
                        <Check className="h-3.5 w-3.5" />
                        <span>مثبّت ✓</span>
                      </span>
                    )}

                    {lastCompletedStage && (
                      <button
                        type="button"
                        onClick={() => onToggleStage(lesson.id, lastCompletedStage, referenceDate)}
                        title="تراجع عن آخر مراجعة"
                        className="rounded-lg border border-slate-800 bg-slate-950 p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Expandable Subtopics + Scientific Exercises ONLY for scientific subjects */}
                {isExpanded && (
                  <div className="mt-4 border-t border-slate-800 pt-4">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
                      <div className="md:col-span-8">
                        <div className="text-xs font-semibold text-slate-200 mb-2">عناصر الدرس:</div>
                        <ul className="space-y-1 text-xs text-slate-300 list-disc list-inside">
                          {lesson.subtopics.map((sub) => (
                            <li key={sub}>{sub}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="md:col-span-4 rounded-lg bg-slate-950/70 p-3.5 border border-slate-800">
                        <div className="text-xs font-semibold text-emerald-400 mb-1">نصيحة سريعة</div>
                        <p className="text-xs leading-relaxed text-slate-300">{lesson.bacTip}</p>
                      </div>
                    </div>

                    {isScientific && lessonExercises.length > 0 && (
                      <ScientificExercisesPanel
                        exercises={lessonExercises}
                        solvedExercises={solvedExercisesMap}
                        onToggleExercise={onToggleExercise}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
