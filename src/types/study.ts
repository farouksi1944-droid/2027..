export type SubjectId =
  | 'sciences'
  | 'physics'
  | 'math'
  | 'arabic'
  | 'history_geo'
  | 'islamic'
  | 'philosophy'
  | 'french'
  | 'english';

export type SpacedStage = 'S0' | 'R1' | 'R2' | 'R3';

export interface SubjectInfo {
  id: SubjectId;
  name: string;
  shortName: string;
  coefficient: number;
  examDuration: string;
  priorityNote: string;
  accentTextClass: string;
  accentBgClass: string;
  accentBorderClass: string;
}

export interface LessonItem {
  id: string;
  subjectId: SubjectId;
  unitNumber: string;
  unitTitle: string;
  title: string;
  subtopics: string[];
  estimatedMinutes: number;
  bacTip: string;
  difficulty: 'أساسي' | 'متوسط' | 'مكثف';
}

export type BlockType =
  | 'morning_memo'
  | 'school_locked'
  | 'monday_unavailable'
  | 'jumuah_break'
  | 'study_new'
  | 'spaced_review'
  | 'exam_day';

export interface ScheduleBlock {
  id: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  durationLabel: string;
  type: BlockType;
  title: string;
  subtitle: string;
  subjectId?: SubjectId;
  lessonId?: string;
  stage?: SpacedStage;
  morningPacketId?: string;
  xpReward: number;
}

export interface DayPlan {
  date: string; // YYYY-MM-DD
  dayNameAr: string;
  dateLabelAr: string;
  dayType: 'saturday_free' | 'school_day' | 'monday_closed' | 'friday_weekend' | 'exam_day';
  summaryTitle: string;
  availabilityNote: string;
  blocks: ScheduleBlock[];
}

export interface MemoDateItem {
  date: string;
  event: string;
  lessonRef: string;
}

export interface MemoTermItem {
  term: string;
  definition: string;
  category: 'تاريخ' | 'جغرافيا';
  lessonRef: string;
}

export interface MemoFigureItem {
  name: string;
  identity: string;
  achievements: string;
  lessonRef: string;
}

export interface IslamicMemoItem {
  lessonTitle: string;
  sectionTitle: string;
  points: string[];
  evidence: string;
}

export interface MorningPacket {
  id: string;
  date: string; // YYYY-MM-DD
  dayLabel: string;
  focusTitle: string;
  estimatedMinutes: number;
  historyDates: MemoDateItem[];
  terms: MemoTermItem[];
  figures: MemoFigureItem[];
  islamic: IslamicMemoItem;
  xpReward: number;
}

export interface QuizQuestion {
  id: string;
  category: 'تواريخ' | 'مصطلحات' | 'شخصيات' | 'علوم إسلامية' | 'مفاهيم علمية';
  prompt: string;
  answer: string;
  options: string[];
  hint: string;
}

export type ReviewQuality = 'hard' | 'good' | 'easy';

export interface LessonReviewState {
  stage: SpacedStage;
  nextDueDate: string; // YYYY-MM-DD
  intervalDays: number;
  lastQuality?: ReviewQuality;
  reviewCount: number;
}

export interface CardReviewState {
  box: 1 | 2 | 3 | 4; // 1: +1d, 2: +3d, 3: +7d, 4: mastered
  nextDueDate: string; // YYYY-MM-DD
  lastReviewedAt: string;
}

export interface ScientificExercise {
  id: string;
  lessonId: string;
  subjectId: 'sciences' | 'physics' | 'math';
  title: string;
  prompt: string;
  question: string;
  options: string[];
  correctOption: string;
  solutionSteps: string;
  xpReward: number;
}

export interface PlayerProgress {
  id: 'player1' | 'player2';
  name: string;
  /** Key: `${lessonId}:${stage}` */
  completedStages: Record<string, string>; // ISO timestamp
  /** Key: lessonId -> dynamic SM-2 / interval schedule */
  lessonReviews?: Record<string, LessonReviewState>;
  /** Key: morningPacketId */
  completedMorningPackets: Record<string, string>;
  /** Key: scheduleBlockId */
  completedBlocks: Record<string, string>;
  /** Key: flashcard / memo item id */
  masteredCards: Record<string, boolean>;
  /** Key: cardId -> dynamic Leitner spaced box */
  cardReviews?: Record<string, CardReviewState>;
  /** Key: scientific exerciseId -> ISO timestamp (scientific subjects only) */
  solvedExercises?: Record<string, string>;
  duelHighScore: number;
  duelBestTimeSec: number;
  duelsPlayed: number;
  xp: number;
  lastActiveDate: string;
  activityDates: string[];
}

export interface ActivityEntry {
  id: string;
  playerId: 'player1' | 'player2';
  playerName: string;
  message: string;
  xpDelta: number;
  timestamp: string;
}

export interface DuelRecord {
  id: string;
  playerId: 'player1' | 'player2';
  playerName: string;
  category: string;
  score: number;
  total: number;
  elapsedSec: number;
  timestamp: string;
}

export interface ChallengeRoom {
  code: string;
  createdAt: string;
  player1Uid?: string;
  player2Uid?: string;
  players: {
    player1: PlayerProgress;
    player2: PlayerProgress;
  };
  duelHistory: DuelRecord[];
  activityLog: ActivityEntry[];
}
