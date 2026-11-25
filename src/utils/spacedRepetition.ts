import { TERM1_LESSONS } from '../data/curriculum';
import { THIRTEEN_DAY_PLAN } from '../data/scheduleGenerator';
import type {
  CardReviewState,
  LessonReviewState,
  PlayerProgress,
  ReviewQuality,
  SpacedStage,
} from '../types/study';

const MAX_REVIEW_DATE = '2026-12-05';
const MIN_START_DATE = '2026-11-28';

export function clampStudyDate(dateStr: string): string {
  if (!dateStr || dateStr < MIN_START_DATE) return MIN_START_DATE;
  if (dateStr > MAX_REVIEW_DATE) return MAX_REVIEW_DATE;
  return dateStr;
}

export function addDaysClamped(dateStr: string, days: number): string {
  const base = new Date(dateStr + 'T00:00:00Z');
  base.setUTCDate(base.getUTCDate() + days);
  const iso = base.toISOString().slice(0, 10);
  if (iso > MAX_REVIEW_DATE) return MAX_REVIEW_DATE;
  if (iso < MIN_START_DATE) return MIN_START_DATE;
  return iso;
}

export function diffDaysBetween(fromDate: string, toDate: string): number {
  const a = new Date(fromDate + 'T00:00:00Z').getTime();
  const b = new Date(toDate + 'T00:00:00Z').getTime();
  return Math.max(0, Math.round((b - a) / (1000 * 60 * 60 * 24)));
}

export function formatArabicShortDate(dateStr: string): string {
  const day = Number(dateStr.slice(8, 10));
  const month = dateStr.slice(5, 7) === '11' ? 'نوفمبر' : 'ديسمبر';
  return `${day} ${month}`;
}

export function formatDaysAgoAr(days: number): string {
  if (days <= 0) return 'اليوم';
  if (days === 1) return 'منذ يوم واحد';
  if (days === 2) return 'منذ يومين';
  if (days <= 10) return `منذ ${days} أيام`;
  return `منذ ${days} يوماً`;
}

const plannedS0DateMap = new Map<string, string>();
for (const day of THIRTEEN_DAY_PLAN) {
  for (const blk of day.blocks) {
    if (blk.lessonId && blk.stage === 'S0' && !plannedS0DateMap.has(blk.lessonId)) {
      plannedS0DateMap.set(blk.lessonId, day.date);
    }
  }
}

export function getBaselineScheduleDates(lessonId: string): Record<SpacedStage, string> {
  const s0 = plannedS0DateMap.get(lessonId) ?? '2026-11-28';
  const avoidMonday = (d: string) => (d === '2026-11-30' ? '2026-12-01' : d);
  return {
    S0: s0,
    R1: avoidMonday(addDaysClamped(s0, 1)),
    R2: avoidMonday(addDaysClamped(s0, 3)),
    R3: MAX_REVIEW_DATE,
  };
}

export interface LessonSpacedStatus {
  lessonId: string;
  nextStage: SpacedStage | null;
  nextDueDate: string | null;
  lastReviewedDate: string | null;
  daysSinceLastReview: number;
  status: 'not_started' | 'overdue' | 'due_today' | 'scheduled' | 'mastered';
  completedCount: number;
  intervalDays: number;
  lastQuality?: ReviewQuality;
}

const STAGES_ORDER: SpacedStage[] = ['S0', 'R1', 'R2', 'R3'];

export function computeLessonSpacedStatus(
  player: PlayerProgress,
  lessonId: string,
  referenceDate: string
): LessonSpacedStatus {
  const completed = STAGES_ORDER.filter((s) => Boolean(player.completedStages[`${lessonId}:${s}`]));
  const completedCount = completed.length;
  const dynamic = player.lessonReviews?.[lessonId];
  const baseline = getBaselineScheduleDates(lessonId);

  const lastStage = completed.length > 0 ? completed[completed.length - 1] : null;
  const lastRaw = lastStage ? player.completedStages[`${lessonId}:${lastStage}`] : undefined;
  const lastReviewedDate = lastRaw
    ? clampStudyDate(lastRaw.slice(0, 10))
    : lastStage
      ? baseline[lastStage]
      : null;
  const daysSinceLastReview = lastReviewedDate
    ? diffDaysBetween(lastReviewedDate, referenceDate)
    : 0;

  if (completedCount === 4) {
    return {
      lessonId,
      nextStage: null,
      nextDueDate: null,
      lastReviewedDate,
      daysSinceLastReview,
      status: 'mastered',
      completedCount: 4,
      intervalDays: dynamic?.intervalDays ?? 6,
      lastQuality: dynamic?.lastQuality,
    };
  }

  const nextStage = STAGES_ORDER.find((s) => !player.completedStages[`${lessonId}:${s}`]) ?? 'S0';

  if (completedCount === 0 && !dynamic) {
    return {
      lessonId,
      nextStage: 'S0',
      nextDueDate: baseline.S0,
      lastReviewedDate: null,
      daysSinceLastReview: 0,
      status: 'not_started',
      completedCount: 0,
      intervalDays: 0,
    };
  }

  let nextDueDate = dynamic?.nextDueDate;
  if (!nextDueDate && lastReviewedDate) {
    const gap = nextStage === 'R1' ? 1 : nextStage === 'R2' ? 3 : 5;
    let candidate = addDaysClamped(lastReviewedDate, gap);
    if (candidate === '2026-11-30') candidate = '2026-12-01';
    nextDueDate = candidate;
  }

  const resolvedDue = nextDueDate ?? MAX_REVIEW_DATE;
  const status =
    resolvedDue < referenceDate
      ? 'overdue'
      : resolvedDue === referenceDate
        ? 'due_today'
        : 'scheduled';

  return {
    lessonId,
    nextStage,
    nextDueDate: resolvedDue,
    lastReviewedDate,
    daysSinceLastReview,
    status,
    completedCount,
    intervalDays: dynamic?.intervalDays ?? (nextStage === 'R1' ? 1 : nextStage === 'R2' ? 3 : 5),
    lastQuality: dynamic?.lastQuality,
  };
}

/**
 * Returns ONLY lessons the student has ALREADY reviewed at least once
 * and whose spaced-repetition reminder date has arrived (so they don't forget it).
 */
export function getRemindersForDate(
  player: PlayerProgress,
  referenceDate: string
): LessonSpacedStatus[] {
  return TERM1_LESSONS.map((l) => computeLessonSpacedStatus(player, l.id, referenceDate))
    .filter(
      (st) =>
        st.completedCount >= 1 &&
        st.completedCount < 4 &&
        (st.status === 'due_today' || st.status === 'overdue')
    )
    .sort((a, b) => {
      if (b.daysSinceLastReview !== a.daysSinceLastReview) {
        return b.daysSinceLastReview - a.daysSinceLastReview;
      }
      return (a.nextDueDate ?? '').localeCompare(b.nextDueDate ?? '');
    });
}

export function computeNextLessonReview(
  player: PlayerProgress,
  lessonId: string,
  stageBeingReviewed: SpacedStage,
  quality: ReviewQuality,
  reviewDate: string
): {
  completedStageToMark: SpacedStage | null;
  reviewState: LessonReviewState;
  xpDelta: number;
} {
  const prev = player.lessonReviews?.[lessonId];
  const prevCount = prev?.reviewCount ?? 0;
  const cleanDate = clampStudyDate(reviewDate);

  if (quality === 'hard') {
    let nextDate = addDaysClamped(cleanDate, 1);
    if (nextDate === '2026-11-30') nextDate = '2026-12-01';
    return {
      completedStageToMark: null,
      reviewState: {
        stage: stageBeingReviewed,
        nextDueDate: nextDate,
        intervalDays: 1,
        lastQuality: 'hard',
        reviewCount: prevCount + 1,
      },
      xpDelta: 15,
    };
  }

  const idx = STAGES_ORDER.indexOf(stageBeingReviewed);
  const nextStage = idx < 3 ? STAGES_ORDER[idx + 1] : 'R3';

  const gapMap: Record<SpacedStage, { good: number; easy: number }> = {
    S0: { good: 1, easy: 3 },
    R1: { good: 3, easy: 5 },
    R2: { good: 5, easy: 6 },
    R3: { good: 0, easy: 0 },
  };

  const intervalDays =
    quality === 'easy' ? gapMap[stageBeingReviewed].easy : gapMap[stageBeingReviewed].good;
  let nextDueDate = intervalDays > 0 ? addDaysClamped(cleanDate, intervalDays) : MAX_REVIEW_DATE;
  if (nextDueDate === '2026-11-30') nextDueDate = '2026-12-01';

  const xpBase: Record<SpacedStage, number> = { S0: 60, R1: 35, R2: 50, R3: 70 };
  const xpDelta = xpBase[stageBeingReviewed] + (quality === 'easy' ? 10 : 0);

  return {
    completedStageToMark: stageBeingReviewed,
    reviewState: {
      stage: nextStage,
      nextDueDate,
      intervalDays,
      lastQuality: quality,
      reviewCount: prevCount + 1,
    },
    xpDelta,
  };
}

export function computeNextCardReview(
  prev: CardReviewState | undefined,
  quality: ReviewQuality,
  reviewDate: string
): CardReviewState {
  const currentBox = prev?.box ?? 1;
  let nextBox: 1 | 2 | 3 | 4 = currentBox;
  let days = 1;

  if (quality === 'hard') {
    nextBox = 1;
    days = 1;
  } else if (quality === 'good') {
    nextBox = Math.min(4, currentBox + 1) as 1 | 2 | 3 | 4;
    days = nextBox === 2 ? 3 : nextBox === 3 ? 6 : 10;
  } else {
    nextBox = Math.min(4, currentBox + 2) as 1 | 2 | 3 | 4;
    days = nextBox === 3 ? 6 : 10;
  }

  return {
    box: nextBox,
    nextDueDate: addDaysClamped(clampStudyDate(reviewDate), days),
    lastReviewedAt: new Date().toISOString(),
  };
}
