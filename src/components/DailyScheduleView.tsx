import {
  Bell,
  BookOpen,
  BookOpenCheck,
  Calendar,
  Check,
  Clock,
  Lock,
  LogIn,
  Repeat,
  RotateCcw,
  Sun,
  Trophy,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { SUBJECT_ORDER, SUBJECTS, TERM1_LESSONS } from '../data/curriculum';
import { THIRTEEN_DAY_PLAN } from '../data/scheduleGenerator';
import { isScientificSubject, SCIENTIFIC_EXERCISES } from '../data/scientificExercises';
import type {
  DayPlan,
  PlayerProgress,
  ReviewQuality,
  ScheduleBlock,
  SpacedStage,
  SubjectId,
} from '../types/study';
import { computeSubjectMastery, computeWeightedOverallMastery } from '../utils/mastery';
import {
  formatArabicShortDate,
  formatDaysAgoAr,
  getRemindersForDate,
} from '../utils/spacedRepetition';
import { FocusTimerBar } from './FocusTimerBar';
import { SubjectMasteryRing } from './SubjectMasteryRing';

interface DailyScheduleViewProps {
  activePlayer: PlayerProgress;
  topOtherCompetitor: PlayerProgress | null;
  myRank: number;
  totalParticipants: number;
  isSignedIn: boolean;
  isCloudConnected: boolean;
  authBusy: boolean;
  onSignIn: () => void;
  onToggleBlock: (block: ScheduleBlock) => void;
  onReviewLesson: (lessonId: string, stage: SpacedStage, quality: ReviewQuality, reviewDate: string) => void;
  onOpenMorningPacket: (date: string) => void;
  onOpenArena: () => void;
  onOpenSubjectMastery: (subjectId: SubjectId, lessonId?: string) => void;
  onResetMyAccount: () => Promise<void>;
}

const lessonMap = new Map(TERM1_LESSONS.map((l) => [l.id, l]));

export function DailyScheduleView({
  activePlayer,
  topOtherCompetitor,
  myRank,
  totalParticipants,
  isSignedIn,
  isCloudConnected,
  authBusy,
  onSignIn,
  onToggleBlock,
  onReviewLesson,
  onOpenMorningPacket,
  onOpenArena,
  onOpenSubjectMastery,
  onResetMyAccount,
}: DailyScheduleViewProps) {
  const [selectedDate, setSelectedDate] = useState<string>('2026-11-24');
  const [confirmingReset, setConfirmingReset] = useState(false);

  const remindersDue = useMemo(
    () => getRemindersForDate(activePlayer, selectedDate),
    [activePlayer, selectedDate]
  );

  const selectedDay: DayPlan = useMemo(
    () => THIRTEEN_DAY_PLAN.find((d) => d.date === selectedDate) ?? THIRTEEN_DAY_PLAN[0],
    [selectedDate]
  );

  const daysRemaining = useMemo(() => {
    const selected = new Date(selectedDate + 'T00:00:00Z');
    const exam = new Date('2026-12-06T00:00:00Z');
    return Math.max(0, Math.round((exam.getTime() - selected.getTime()) / (1000 * 60 * 60 * 24)));
  }, [selectedDate]);

  const totalActionableBlocks = useMemo(
    () =>
      THIRTEEN_DAY_PLAN.flatMap((d) => d.blocks).filter(
        (b) =>
          b.type !== 'school_locked' &&
          b.type !== 'monday_unavailable' &&
          b.type !== 'jumuah_break'
      ).length,
    []
  );

  const overallMastery = useMemo(
    () => computeWeightedOverallMastery(activePlayer),
    [activePlayer]
  );

  const subjectMasteries = useMemo(
    () =>
      SUBJECT_ORDER.map((subId) => ({
        info: SUBJECTS[subId],
        metrics: computeSubjectMastery(activePlayer, subId),
      })),
    [activePlayer]
  );

  const myCompletedCount = Object.keys(activePlayer.completedBlocks).length;
  const solvedExercisesMap = activePlayer.solvedExercises ?? {};

  const dayActionable = selectedDay.blocks.filter(
    (b) =>
      b.type !== 'school_locked' &&
      b.type !== 'monday_unavailable' &&
      b.type !== 'jumuah_break'
  );
  const dayDone = dayActionable.filter((b) => Boolean(activePlayer.completedBlocks[b.id])).length;

  return (
    <div className="space-y-6">
      {/* Compact Single-Account Header */}
      <section className="rounded-xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs text-slate-400">
              3 ثانوي علوم تجريبية · 24 نوفمبر – 6 ديسمبر
            </div>
            <h1 className="mt-1 font-display text-xl sm:text-2xl font-bold text-slate-100">
              برنامجي للمراجعة — {activePlayer.name}
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {!isSignedIn ? (
              <button
                type="button"
                disabled={authBusy}
                onClick={onSignIn}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors cursor-pointer disabled:opacity-60"
              >
                <LogIn className="h-3.5 w-3.5" />
                <span>{authBusy ? 'جاري الدخول...' : 'دخول بحساب Google لحفظ ومقارنة النقاط'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onOpenArena}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-700/70 bg-emerald-950/50 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-900/50 transition-colors cursor-pointer"
              >
                <Trophy className="h-3.5 w-3.5" />
                <span>
                  {isCloudConnected && totalParticipants > 1
                    ? `ترتيبك الآن: #${myRank} من ${totalParticipants} · قارن النقاط`
                    : 'حسابك محفوظ سحابياً · عرض المنافسة'}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* 3 Clean Numbers */}
        <div className="mt-5 grid grid-cols-3 gap-4 border-t border-slate-800 pt-4">
          <div>
            <div className="text-xs text-slate-400">للامتحان</div>
            <div className="mt-0.5 font-mono-num text-lg sm:text-xl font-bold text-slate-100">
              {daysRemaining} {daysRemaining === 1 ? 'يوم' : 'أيام'}
            </div>
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-400">نقاطي ({activePlayer.name})</span>
              {activePlayer.xp > 0 && !confirmingReset && (
                <button
                  type="button"
                  onClick={() => setConfirmingReset(true)}
                  className="inline-flex items-center gap-1 text-[11px] text-rose-400 hover:text-rose-300 cursor-pointer"
                  title="إعادة حسابي إلى 0 نقطة"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>تصفير إلى 0</span>
                </button>
              )}
            </div>
            <div className="mt-0.5 font-mono-num text-lg sm:text-xl font-bold text-emerald-400 tabular-nums">
              {activePlayer.xp} XP
            </div>
            <div className="text-[11px] text-slate-400 tabular-nums">
              {myCompletedCount}/{totalActionableBlocks} حصة
            </div>

            {confirmingReset && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    void onResetMyAccount().then(() => setConfirmingReset(false));
                  }}
                  className="rounded-md bg-rose-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-rose-500 cursor-pointer"
                >
                  تأكيد التصفير (0 XP)
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingReset(false)}
                  className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-700 cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            )}
          </div>

          <div>
            <div className="text-xs text-slate-400">
              {topOtherCompetitor ? `المنافسة (${topOtherCompetitor.name})` : 'المنافسة'}
            </div>
            {topOtherCompetitor ? (
              <>
                <div className="mt-0.5 font-mono-num text-lg sm:text-xl font-bold text-slate-100 tabular-nums">
                  {topOtherCompetitor.xp} XP
                </div>
                <button
                  type="button"
                  onClick={onOpenArena}
                  className="text-[11px] text-emerald-400 hover:underline cursor-pointer"
                >
                  مقارنة {totalParticipants} متنافسين ←
                </button>
              </>
            ) : (
              <>
                <div className="mt-0.5 font-mono-num text-base font-bold text-slate-300">
                  {isSignedIn ? `${totalParticipants} مشارك` : 'محلي'}
                </div>
                <button
                  type="button"
                  onClick={onOpenArena}
                  className="text-[11px] text-emerald-400 hover:underline cursor-pointer"
                >
                  لوحة مقارنة النقاط ←
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Circular Mastery Percentage Rings Strip */}
      <section className="rounded-xl border border-slate-800 bg-slate-900 p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-bold text-slate-100">
            الدائرة النسبية لمدى التمكن من المواد
          </div>
          <div className="font-mono-num text-xs text-emerald-400 tabular-nums">
            المعدل العام للتمكن: {overallMastery}%
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5 lg:grid-cols-9">
          {subjectMasteries.map(({ info, metrics }) => (
            <button
              key={info.id}
              type="button"
              onClick={() => onOpenSubjectMastery(info.id)}
              className="flex flex-col items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950/60 p-2.5 hover:border-slate-700 transition-colors cursor-pointer"
            >
              <SubjectMasteryRing
                subjectId={info.id}
                percentage={metrics.percentage}
                size={52}
                strokeWidth={5}
                label={info.shortName}
              />
              <span className="text-[11px] font-semibold text-slate-200 text-center leading-tight">
                {info.shortName}
              </span>
              {metrics.isScientific && (
                <span className="text-[10px] text-sky-400 tabular-nums">
                  {metrics.solvedExercisesCount}/{metrics.totalExercisesCount} ت
                </span>
              )}
            </button>
          ))}
        </div>
      </section>

      {/* Compact Focus Timer */}
      <FocusTimerBar />

      {/* 13-Day Selector */}
      <section className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-7">
        {THIRTEEN_DAY_PLAN.map((day) => {
          const isSelected = day.date === selectedDate;
          const actionable = day.blocks.filter(
            (b) =>
              b.type !== 'school_locked' &&
              b.type !== 'monday_unavailable' &&
              b.type !== 'jumuah_break'
          );
          const done = actionable.filter((b) => Boolean(activePlayer.completedBlocks[b.id])).length;
          const dayNum = day.date.slice(8, 10);
          const monthLabel = day.date.startsWith('2026-11') ? 'نوفمبر' : 'ديسمبر';

          return (
            <button
              key={day.date}
              type="button"
              onClick={() => setSelectedDate(day.date)}
              className={`flex flex-col items-start rounded-lg border p-2.5 text-start transition-colors cursor-pointer ${
                isSelected
                  ? 'border-emerald-500 bg-emerald-950/50 text-slate-100'
                  : 'border-slate-800 bg-slate-900 hover:border-slate-700'
              }`}
            >
              <div className="flex w-full items-center justify-between text-[11px]">
                <span className="font-semibold text-slate-100">{day.dayNameAr}</span>
                <span className="font-mono-num text-slate-400">
                  {done}/{actionable.length}
                </span>
              </div>
              <div className="mt-1 font-mono-num text-sm font-bold text-slate-100">
                {dayNum} <span className="text-[11px] font-normal text-slate-400">{monthLabel}</span>
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400 truncate w-full">
                {day.dayType === 'saturday_free'
                  ? 'دراسة في المنزل'
                  : day.dayType === 'monday_closed'
                    ? 'مساءً غير متاح'
                    : day.dayType === 'friday_weekend'
                      ? 'الجمعة (في المنزل)'
                      : day.dayType === 'exam_day'
                        ? 'الامتحان'
                        : 'مدرسة + مساءً'}
              </div>
            </button>
          );
        })}
      </section>

      {/* Gentle Automatic Spaced Repetition Reminder */}
      {remindersDue.length > 0 && (
        <section className="rounded-xl border border-amber-800/60 bg-amber-950/20 p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-bold text-amber-300">
              <Bell className="h-4 w-4 shrink-0" />
              <span>تذكير لمراجعة دروس سابقة حتى لا تنساها</span>
            </div>
            <span className="font-mono-num text-xs text-amber-400">
              {remindersDue.length} {remindersDue.length === 1 ? 'درس' : 'دروس'}
            </span>
          </div>

          <div className="divide-y divide-amber-900/40">
            {remindersDue.map((item) => {
              const lesson = lessonMap.get(item.lessonId);
              if (!lesson || !item.nextStage) return null;
              return (
                <div
                  key={item.lessonId}
                  className="flex flex-col gap-2 py-2.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="text-xs font-semibold text-slate-100">
                      <span className={SUBJECTS[lesson.subjectId].accentTextClass}>
                        {SUBJECTS[lesson.subjectId].shortName}:{' '}
                      </span>
                      {lesson.title}
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-400">
                      راجعته {formatDaysAgoAr(item.daysSinceLastReview)}
                      {item.lastReviewedDate ? ` (${formatArabicShortDate(item.lastReviewedDate)})` : ''} · أعد مراجعته سريعاً اليوم
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onReviewLesson(lesson.id, item.nextStage!, 'good', selectedDate)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-500 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Check className="h-3.5 w-3.5" />
                    <span>تمت إعادة المراجعة</span>
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Clean Single-Column Day Schedule */}
      <section className="rounded-xl border border-slate-800 bg-slate-900">
        <div className="border-b border-slate-800 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Calendar className="h-3.5 w-3.5" />
              <span>
                {selectedDay.dayNameAr} {selectedDay.dateLabelAr}
              </span>
            </div>
            <span className="font-mono-num text-xs font-semibold text-emerald-400">
              إنجاز اليوم: {dayDone}/{dayActionable.length}
            </span>
          </div>
          <h2 className="mt-1.5 font-display text-lg font-bold text-slate-100">
            {selectedDay.summaryTitle}
          </h2>
          <p className="mt-0.5 text-xs text-slate-400">{selectedDay.availabilityNote}</p>
        </div>

        <div className="divide-y divide-slate-800">
          {selectedDay.blocks.map((block) => {
            const isLocked =
              block.type === 'school_locked' ||
              block.type === 'monday_unavailable' ||
              block.type === 'jumuah_break';
            const isDone = Boolean(activePlayer.completedBlocks[block.id]);
            const subject = block.subjectId ? SUBJECTS[block.subjectId] : null;
            const isSciBlock = Boolean(
              block.subjectId && block.lessonId && isScientificSubject(block.subjectId)
            );
            const blockExercises = isSciBlock
              ? SCIENTIFIC_EXERCISES.filter((ex) => ex.lessonId === block.lessonId)
              : [];
            const blockExercisesSolved = blockExercises.filter((ex) =>
              Boolean(solvedExercisesMap[ex.id])
            ).length;

            return (
              <div
                key={block.id}
                className={`flex flex-col gap-3 p-4 sm:p-5 transition-colors sm:flex-row sm:items-center sm:justify-between ${
                  isLocked
                    ? 'bg-slate-950/50 text-slate-500'
                    : isDone
                      ? 'bg-emerald-950/20'
                      : 'bg-slate-900 hover:bg-slate-800/30'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className="w-20 shrink-0 pt-0.5">
                    <div className="font-mono-num text-sm font-semibold text-slate-100">
                      {block.startTime}
                    </div>
                    <div className="font-mono-num text-[11px] text-slate-400">
                      إلى {block.endTime}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                      {block.type === 'morning_memo' && (
                        <span className="inline-flex items-center gap-1 font-semibold text-amber-400">
                          <Sun className="h-3.5 w-3.5" />
                          نصف ساعة صباحاً
                        </span>
                      )}
                      {block.type === 'study_new' && subject && (
                        <span className={`inline-flex items-center gap-1 font-semibold ${subject.accentTextClass}`}>
                          <BookOpen className="h-3.5 w-3.5" />
                          {subject.name}
                        </span>
                      )}
                      {block.type === 'spaced_review' && subject && (
                        <span className="inline-flex items-center gap-1 font-semibold text-sky-400">
                          <Repeat className="h-3.5 w-3.5" />
                          {subject.name} · تذكير ومراجعة
                        </span>
                      )}
                      {block.type === 'school_locked' && (
                        <span className="inline-flex items-center gap-1 text-slate-400">
                          <Lock className="h-3.5 w-3.5" />
                          وقت المدرسة
                        </span>
                      )}
                      {block.type === 'monday_unavailable' && (
                        <span className="inline-flex items-center gap-1 text-rose-400">
                          <Lock className="h-3.5 w-3.5" />
                          غير متاح مساءً
                        </span>
                      )}
                      {block.type === 'jumuah_break' && (
                        <span className="inline-flex items-center gap-1 text-slate-400">
                          <Clock className="h-3.5 w-3.5" />
                          صلاة واستراحة
                        </span>
                      )}
                      {block.type === 'exam_day' && (
                        <span className="inline-flex items-center gap-1 font-semibold text-emerald-400">
                          <Trophy className="h-3.5 w-3.5" />
                          يوم الامتحان
                        </span>
                      )}
                      {!isLocked && block.xpReward > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono-num text-emerald-400">+{block.xpReward} XP</span>
                        </>
                      )}
                    </div>

                    <h3
                      className={`text-sm sm:text-base font-semibold ${
                        isDone ? 'text-slate-500 line-through' : 'text-slate-100'
                      }`}
                    >
                      {block.title}
                    </h3>
                    <p className="text-xs text-slate-400">{block.subtitle}</p>
                  </div>
                </div>

                {!isLocked && (
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {block.type === 'morning_memo' && (
                      <button
                        type="button"
                        onClick={() => onOpenMorningPacket(selectedDay.date)}
                        className="px-3 py-1.5 text-xs font-medium text-slate-200 border border-slate-700 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors whitespace-nowrap cursor-pointer"
                      >
                        افتح البطاقة
                      </button>
                    )}
                    {isSciBlock && block.subjectId && block.lessonId && blockExercises.length > 0 && (
                      <button
                        type="button"
                        onClick={() => onOpenSubjectMastery(block.subjectId!, block.lessonId)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-sky-300 border border-slate-700 rounded-lg bg-slate-950 hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <BookOpenCheck className="h-3.5 w-3.5" />
                        <span>تمارين ({blockExercisesSolved}/{blockExercises.length})</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onToggleBlock(block)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                        isDone
                          ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                          : 'border border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700'
                      }`}
                    >
                      <Check className="h-3.5 w-3.5" />
                      <span>{isDone ? 'تم ✓' : 'تحديد كمنجز'}</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
