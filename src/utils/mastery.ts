import { SUBJECT_ORDER, SUBJECTS, TERM1_LESSONS } from '../data/curriculum';
import { isScientificSubject, SCIENTIFIC_EXERCISES } from '../data/scientificExercises';
import type { PlayerProgress, SpacedStage, SubjectId } from '../types/study';

const STAGES: SpacedStage[] = ['S0', 'R1', 'R2', 'R3'];

export interface SubjectMasteryMetrics {
  subjectId: SubjectId;
  percentage: number;
  isScientific: boolean;
  reviewedLessonsCount: number;
  totalLessonsCount: number;
  completedStagesCount: number;
  totalStagesCount: number;
  solvedExercisesCount: number;
  totalExercisesCount: number;
}

export function computeSubjectMastery(
  player: PlayerProgress,
  subjectId: SubjectId
): SubjectMasteryMetrics {
  const lessons = TERM1_LESSONS.filter((l) => l.subjectId === subjectId);
  const totalLessonsCount = lessons.length;
  const totalStagesCount = totalLessonsCount * STAGES.length;

  let completedStagesCount = 0;
  let reviewedLessonsCount = 0;

  for (const lesson of lessons) {
    const doneForLesson = STAGES.filter((stage) =>
      Boolean(player.completedStages[`${lesson.id}:${stage}`])
    ).length;
    completedStagesCount += doneForLesson;
    if (doneForLesson > 0) reviewedLessonsCount += 1;
  }

  const scientific = isScientificSubject(subjectId);
  const exercises = scientific
    ? SCIENTIFIC_EXERCISES.filter((ex) => ex.subjectId === subjectId)
    : [];
  const totalExercisesCount = exercises.length;
  const solvedExercisesCount = exercises.filter((ex) =>
    Boolean(player.solvedExercises?.[ex.id])
  ).length;

  const lessonRatio = totalStagesCount > 0 ? completedStagesCount / totalStagesCount : 0;

  let percentage = 0;
  if (scientific && totalExercisesCount > 0) {
    const exerciseRatio = solvedExercisesCount / totalExercisesCount;
    // Scientific subjects: 60% lesson mastery & spaced reviews + 40% practical exercises solved
    percentage = Math.round((lessonRatio * 0.6 + exerciseRatio * 0.4) * 100);
  } else {
    percentage = Math.round(lessonRatio * 100);
  }

  return {
    subjectId,
    percentage: Math.max(0, Math.min(100, percentage)),
    isScientific: scientific,
    reviewedLessonsCount,
    totalLessonsCount,
    completedStagesCount,
    totalStagesCount,
    solvedExercisesCount,
    totalExercisesCount,
  };
}

export function computeWeightedOverallMastery(player: PlayerProgress): number {
  let weightedSum = 0;
  let totalCoef = 0;
  for (const subjectId of SUBJECT_ORDER) {
    const coef = SUBJECTS[subjectId].coefficient;
    const { percentage } = computeSubjectMastery(player, subjectId);
    weightedSum += percentage * coef;
    totalCoef += coef;
  }
  return totalCoef > 0 ? Math.round(weightedSum / totalCoef) : 0;
}
