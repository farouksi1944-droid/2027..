import { Check, Copy, LogIn, LogOut, Play, RotateCcw, Trophy, Users, Zap } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { SUBJECT_ORDER, SUBJECTS, TERM1_LESSONS } from '../data/curriculum';
import { MORNING_PACKETS, QUIZ_BANK } from '../data/morningMemorization';
import { SCIENTIFIC_EXERCISES } from '../data/scientificExercises';
import type { ActivityEntry, DuelRecord, PlayerProgress, QuizQuestion } from '../types/study';
import { computeSubjectMastery, computeWeightedOverallMastery } from '../utils/mastery';
import { SubjectMasteryRing } from './SubjectMasteryRing';

interface CompetitionArenaViewProps {
  activePlayer: PlayerProgress;
  leaderboard: PlayerProgress[];
  otherParticipants: PlayerProgress[];
  myRank: number;
  duelHistory: DuelRecord[];
  activityLog: ActivityEntry[];
  isSignedIn: boolean;
  userEmail: string | null;
  authBusy: boolean;
  isCloudConnected: boolean;
  syncStatus: 'local' | 'syncing' | 'connected' | 'error';
  syncError: string | null;
  onSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onRenameMyAccount: (newName: string) => Promise<void>;
  onResetMyAccount: () => Promise<void>;
  onSubmitDuel: (category: string, score: number, total: number, elapsedSec: number) => void;
}

const DUEL_CATEGORIES = ['الكل', 'تواريخ', 'مصطلحات', 'شخصيات', 'مفاهيم علمية'] as const;

export function CompetitionArenaView({
  activePlayer,
  leaderboard,
  otherParticipants,
  myRank,
  duelHistory,
  activityLog,
  isSignedIn,
  userEmail,
  authBusy,
  isCloudConnected,
  syncStatus,
  syncError,
  onSignIn,
  onSignOut,
  onRenameMyAccount,
  onResetMyAccount,
  onSubmitDuel,
}: CompetitionArenaViewProps) {
  const [selectedCompareId, setSelectedCompareId] = useState<string>('');
  const [myNameInput, setMyNameInput] = useState(activePlayer.name);
  const [copiedLink, setCopiedLink] = useState(false);
  const [savedNameFeedback, setSavedNameFeedback] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);

  useEffect(() => {
    setMyNameInput(activePlayer.name);
  }, [activePlayer.name]);

  // Automatically pick top other participant to compare against if none selected
  const comparedPlayer: PlayerProgress | null = useMemo(() => {
    if (otherParticipants.length === 0) return null;
    const found = otherParticipants.find((p) => p.id === selectedCompareId);
    return found ?? otherParticipants[0];
  }, [otherParticipants, selectedCompareId]);

  const handleCopySiteLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      // ignore clipboard errors
    }
  };

  // Timed Quiz Challenge State
  const [duelCategory, setDuelCategory] = useState<(typeof DUEL_CATEGORIES)[number]>('الكل');
  const [duelState, setDuelState] = useState<'idle' | 'playing' | 'finished'>('idle');
  const [duelQuestions, setDuelQuestions] = useState<QuizQuestion[]>([]);
  const [qIndex, setQIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    if (duelState !== 'playing') return;
    const timer = window.setInterval(() => {
      setElapsedSec((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [duelState]);

  const startDuel = () => {
    const pool =
      duelCategory === 'الكل'
        ? QUIZ_BANK
        : QUIZ_BANK.filter((q) => q.category === duelCategory);
    const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, 8);
    setDuelQuestions(shuffled);
    setQIndex(0);
    setScore(0);
    setSelectedOption(null);
    setElapsedSec(0);
    setShowHint(false);
    setDuelState('playing');
  };

  const handleAnswer = (option: string) => {
    if (selectedOption !== null) return;
    const current = duelQuestions[qIndex];
    const isCorrect = option === current.answer;
    setSelectedOption(option);
    const nextScore = isCorrect ? score + 1 : score;
    if (isCorrect) setScore(nextScore);

    window.setTimeout(() => {
      if (qIndex + 1 >= duelQuestions.length) {
        setDuelState('finished');
        onSubmitDuel(duelCategory, nextScore, duelQuestions.length, elapsedSec);
      } else {
        setQIndex((i) => i + 1);
        setSelectedOption(null);
        setShowHint(false);
      }
    }, 850);
  };

  const totalLessons = TERM1_LESSONS.length;
  const totalPackets = MORNING_PACKETS.length;
  const totalExercises = SCIENTIFIC_EXERCISES.length;

  const summarizePlayer = (p: PlayerProgress) => {
    const lessons = TERM1_LESSONS.filter((l) =>
      Boolean(p.completedStages[`${l.id}:S0`])
    ).length;
    const exercises = SCIENTIFIC_EXERCISES.filter((ex) =>
      Boolean(p.solvedExercises?.[ex.id])
    ).length;
    return {
      xp: p.xp,
      lessons,
      morning: Object.keys(p.completedMorningPackets).length,
      exercises,
      duelBest: p.duelHighScore,
      overallMastery: computeWeightedOverallMastery(p),
    };
  };

  const myStats = useMemo(() => summarizePlayer(activePlayer), [activePlayer]);
  const oppStats = useMemo(
    () => (comparedPlayer ? summarizePlayer(comparedPlayer) : null),
    [comparedPlayer]
  );

  return (
    <div className="space-y-6">
      {/* Live Open Competition Leaderboard */}
      <section className="rounded-xl border border-slate-800 bg-slate-900 p-6 space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs text-slate-400">
              ترتيبك الآن: #{myRank} من أصل {leaderboard.length} · حسابك: {activePlayer.name}
            </div>
            <h1 className="mt-1 font-display text-xl sm:text-2xl font-bold text-slate-100">
              لوحة التنافس ومقارنة النقاط
            </h1>
          </div>

          <button
            type="button"
            onClick={handleCopySiteLink}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors self-start sm:self-auto cursor-pointer"
          >
            {copiedLink ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copiedLink ? 'تم نسخ رابط الموقع!' : 'نسخ رابط الموقع للمنافسة'}</span>
          </button>
        </div>

        {/* All Participants Ranking List */}
        {!isSignedIn ? (
          <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-300 leading-relaxed">
              سجّل الدخول بحساب Google ليُحفظ تقدمك في الترتيب العام وتقارن نقاطك تلقائياً مع كل من يعمل بالبرنامج.
            </p>
            <button
              type="button"
              disabled={authBusy}
              onClick={() => void onSignIn()}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors shrink-0 cursor-pointer disabled:opacity-60"
            >
              <LogIn className="h-4 w-4" />
              <span>{authBusy ? 'جاري الدخول...' : 'تسجيل الدخول بحساب Google'}</span>
            </button>
          </div>
        ) : (
          <div className="border-t border-slate-800 pt-4 space-y-2.5">
            <div className="text-xs font-semibold text-slate-300">
              ترتيب المتنافسين ({leaderboard.length}) — اضغط على أي متنافس لمقارنة نقاطه وتفاصيله معك
            </div>

            <div className="divide-y divide-slate-800 rounded-lg border border-slate-800 bg-slate-950/50">
              {leaderboard.map((participant, idx) => {
                const isMe = participant.id === activePlayer.id;
                const isCompared = comparedPlayer?.id === participant.id;
                const stats = summarizePlayer(participant);

                return (
                  <button
                    key={participant.id}
                    type="button"
                    disabled={isMe}
                    onClick={() => {
                      if (!isMe) setSelectedCompareId(participant.id);
                    }}
                    className={`w-full flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-start transition-colors ${
                      isMe
                        ? 'bg-emerald-950/30 cursor-default'
                        : isCompared
                          ? 'bg-sky-950/30 cursor-pointer'
                          : 'hover:bg-slate-900 cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`font-mono-num text-sm font-bold w-6 text-center shrink-0 tabular-nums ${
                          idx === 0 ? 'text-amber-400' : 'text-slate-400'
                        }`}
                      >
                        #{idx + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs sm:text-sm font-bold text-slate-100 truncate">
                          {participant.name}{' '}
                          {isMe && <span className="text-emerald-400 text-xs">(أنت)</span>}
                          {!isMe && isCompared && (
                            <span className="text-sky-400 text-xs">· قيد المقارنة</span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 tabular-nums">
                          {stats.lessons}/{totalLessons} درس · {stats.exercises}/{totalExercises} تمرين علمي · تمكن {stats.overallMastery}%
                        </div>
                      </div>
                    </div>

                    <div className="font-mono-num text-sm font-bold text-emerald-400 tabular-nums shrink-0">
                      {stats.xp} XP
                    </div>
                  </button>
                );
              })}
            </div>

            {otherParticipants.length === 0 && (
              <p className="text-xs text-slate-400 pt-1">
                أنت المتسابق الوحيد المسجّل حالياً — شارك رابط الموقع ليفتح أصدقاؤك حساباتهم ويعملوا بالبرنامج، وستظهر نقاطهم هنا تلقائياً للمقارنة.
              </p>
            )}
          </div>
        )}

        {/* Direct Comparison Grid when another participant exists */}
        {comparedPlayer && oppStats && (
          <div className="space-y-5 border-t border-slate-800 pt-5">
            <div className="text-sm font-bold text-slate-100">
              مقارنة مباشرة: {activePlayer.name} مقابل {comparedPlayer.name}
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {[
                { label: 'مجموع النقاط (XP)', v1: myStats.xp, v2: oppStats.xp, unit: 'XP' },
                {
                  label: 'الدروس المراجعة',
                  v1: myStats.lessons,
                  v2: oppStats.lessons,
                  unit: `/ ${totalLessons}`,
                },
                {
                  label: 'التمارين العلمية المحلولة',
                  v1: myStats.exercises,
                  v2: oppStats.exercises,
                  unit: `/ ${totalExercises}`,
                },
                {
                  label: 'بطاقات الحفظ الصباحي',
                  v1: myStats.morning,
                  v2: oppStats.morning,
                  unit: `/ ${totalPackets}`,
                },
              ].map((row) => {
                const maxVal = Math.max(1, row.v1, row.v2);
                return (
                  <div
                    key={row.label}
                    className="rounded-lg border border-slate-800 bg-slate-950/60 p-4 space-y-2.5"
                  >
                    <div className="text-xs font-semibold text-slate-100">{row.label}</div>
                    <div className="space-y-2">
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="font-medium text-slate-300">{activePlayer.name} (أنت)</span>
                          <span className="font-mono-num font-bold text-emerald-400 tabular-nums">
                            {row.v1} {row.unit}
                          </span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 transition-all"
                            style={{ width: `${Math.round((row.v1 / maxVal) * 100)}%` }}
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="font-medium text-slate-300">{comparedPlayer.name}</span>
                          <span className="font-mono-num font-bold text-sky-400 tabular-nums">
                            {row.v2} {row.unit}
                          </span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className="h-full bg-sky-500 transition-all"
                            style={{ width: `${Math.round((row.v2 / maxVal) * 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Circular Subject Mastery Comparison */}
            <div className="space-y-3 pt-2">
              <div className="text-xs font-semibold text-slate-200">
                الدائرة النسبية لمدى التمكن في كل مادة ({activePlayer.name} مقابل {comparedPlayer.name})
              </div>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {SUBJECT_ORDER.map((subId) => {
                  const info = SUBJECTS[subId];
                  const mine = computeSubjectMastery(activePlayer, subId);
                  const opp = computeSubjectMastery(comparedPlayer, subId);
                  return (
                    <div
                      key={subId}
                      className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3"
                    >
                      <SubjectMasteryRing
                        subjectId={subId}
                        percentage={mine.percentage}
                        size={48}
                        strokeWidth={5}
                        label={info.shortName}
                      />
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="text-xs font-semibold text-slate-100 truncate">
                          {info.shortName}
                        </div>
                        <div className="text-[11px] text-emerald-400 tabular-nums">
                          أنت: {mine.percentage}%
                        </div>
                        <div className="text-[11px] text-slate-400 tabular-nums">
                          {comparedPlayer.name}: {opp.percentage}%
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Split: Timed Quiz (7 cols) + Single Account & Live Activity (5 cols) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="lg:col-span-7 rounded-xl border border-slate-800 bg-slate-900 p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                <Zap className="h-4 w-4" />
                <span>تحدي الـ 8 أسئلة السريع ({activePlayer.name})</span>
              </div>
              <h2 className="mt-1 font-display text-lg font-bold text-slate-100">
                اختبر حفظك وفهمك لرفع ترتيبك في النقاط
              </h2>
            </div>
            {duelState === 'playing' && (
              <div className="font-mono-num text-sm font-bold text-slate-100">
                {elapsedSec} ثا · {score}/{duelQuestions.length}
              </div>
            )}
          </div>

          {duelState === 'idle' && (
            <div className="space-y-5 border-t border-slate-800 pt-5">
              <div>
                <div className="text-xs font-semibold text-slate-300 mb-2">اختر مجال التحدي:</div>
                <div className="flex flex-wrap gap-1.5">
                  {DUEL_CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setDuelCategory(cat)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                        duelCategory === cat
                          ? 'border-emerald-500 bg-emerald-600 text-white'
                          : 'border-slate-700 bg-slate-950 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={startDuel}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors cursor-pointer"
              >
                <Play className="h-4 w-4" />
                <span>بدء تحدي ({duelCategory}) الآن</span>
              </button>
            </div>
          )}

          {duelState === 'playing' && duelQuestions[qIndex] && (
            <div className="space-y-4 border-t border-slate-800 pt-5">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>التصنيف: {duelQuestions[qIndex].category}</span>
                <span className="font-mono-num">
                  السؤال {qIndex + 1} من {duelQuestions.length}
                </span>
              </div>

              <h3 className="text-base font-bold text-slate-100 leading-relaxed">
                {duelQuestions[qIndex].prompt}
              </h3>

              <div className="grid grid-cols-1 gap-2.5">
                {duelQuestions[qIndex].options.map((option) => {
                  const isChosen = selectedOption === option;
                  const isCorrect = option === duelQuestions[qIndex].answer;
                  const showFeedback = selectedOption !== null;

                  let styleClass =
                    'border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-800';
                  if (showFeedback) {
                    if (isCorrect) {
                      styleClass = 'border-emerald-500 bg-emerald-950/70 text-emerald-200 font-semibold';
                    } else if (isChosen) {
                      styleClass = 'border-rose-500 bg-rose-950/70 text-rose-200';
                    }
                  }

                  return (
                    <button
                      key={option}
                      type="button"
                      disabled={selectedOption !== null}
                      onClick={() => handleAnswer(option)}
                      className={`w-full rounded-lg border px-4 py-3 text-start text-xs leading-relaxed transition-colors cursor-pointer ${styleClass}`}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setShowHint((h) => !h)}
                  className="text-xs font-medium text-slate-400 hover:text-slate-100 cursor-pointer"
                >
                  {showHint ? 'إخفاء التلميح' : 'عرض تلميح سريع'}
                </button>
                {showHint && (
                  <span className="text-xs text-amber-400">{duelQuestions[qIndex].hint}</span>
                )}
              </div>
            </div>
          )}

          {duelState === 'finished' && (
            <div className="rounded-lg border border-emerald-800 bg-emerald-950/50 p-5 space-y-4">
              <div className="flex items-center gap-2 text-emerald-300">
                <Trophy className="h-5 w-5" />
                <span className="font-display text-lg font-bold">
                  النتيجة: {score} / {duelQuestions.length} في {elapsedSec} ثانية
                </span>
              </div>
              <p className="text-xs text-slate-300">
                تمت إضافة النقاط إلى حسابك وتحديث ترتيبك في لوحة المنافسة.
              </p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={startDuel}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 cursor-pointer"
                >
                  إعادة التحدي
                </button>
                <button
                  type="button"
                  onClick={() => setDuelState('idle')}
                  className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 cursor-pointer"
                >
                  تغيير التصنيف
                </button>
              </div>
            </div>
          )}

          {duelHistory.length > 0 && (
            <div className="border-t border-slate-800 pt-4 space-y-2.5">
              <div className="text-xs font-semibold text-slate-100">سجل التحديات الأخيرة</div>
              <div className="divide-y divide-slate-800">
                {duelHistory.slice(0, 5).map((rec) => (
                  <div key={rec.id} className="flex items-center justify-between py-2 text-xs">
                    <span className="text-slate-200 font-medium">
                      {rec.playerName} · {rec.category}
                    </span>
                    <span className="font-mono-num text-slate-400">
                      {rec.score}/{rec.total} ({rec.elapsedSec} ثا)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Right Column: Single Account Management & Live Activity */}
        <aside className="lg:col-span-5 space-y-6">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-100">
                <Users className="h-4 w-4 text-emerald-400" />
                <span>حسابي الشخصي</span>
              </div>
              <span className="text-xs text-slate-400">
                {syncStatus === 'connected' && isCloudConnected
                  ? 'مزامنة سحابية'
                  : syncStatus === 'syncing'
                    ? 'جاري الحفظ...'
                    : syncStatus === 'error'
                      ? 'تنبيه'
                      : 'محلي'}
              </span>
            </div>

            {!isSignedIn ? (
              <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-950/70 p-4">
                <p className="text-xs text-slate-300 leading-relaxed">
                  حساب واحد لكل مستخدم: سجّل دخولك بحساب Google لحفظ عملك ومقارنة نقاطك مع كل من يعمل بالبرنامج.
                </p>
                <button
                  type="button"
                  disabled={authBusy}
                  onClick={() => void onSignIn()}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors cursor-pointer disabled:opacity-60"
                >
                  <LogIn className="h-4 w-4" />
                  <span>{authBusy ? 'جاري تسجيل الدخول...' : 'تسجيل الدخول بحساب Google'}</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs">
                <div className="truncate text-slate-300">
                  الحساب: <span className="font-semibold text-slate-100">{userEmail}</span>
                </div>
                <button
                  type="button"
                  onClick={() => void onSignOut()}
                  className="inline-flex items-center gap-1 text-rose-400 hover:text-rose-300 shrink-0 cursor-pointer"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>خروج</span>
                </button>
              </div>
            )}

            {/* Rename my account */}
            <div className="space-y-2">
              <div className="text-xs font-medium text-slate-300">اسمك الظاهر في لوحة النقاط</div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={myNameInput}
                  onChange={(e) => setMyNameInput(e.target.value)}
                  className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-100 focus:border-emerald-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    void onRenameMyAccount(myNameInput).then(() => {
                      setSavedNameFeedback(true);
                      window.setTimeout(() => setSavedNameFeedback(false), 2000);
                    });
                  }}
                  className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 cursor-pointer"
                >
                  {savedNameFeedback ? 'حُفظ ✓' : 'حفظ'}
                </button>
              </div>
            </div>

            {/* Reset my account to 0 XP */}
            <div className="border-t border-slate-800 pt-3 flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-slate-400">
                نقاطك الحالية: <span className="font-mono-num font-bold text-slate-100">{activePlayer.xp} XP</span>
              </div>
              {!confirmingReset ? (
                <button
                  type="button"
                  onClick={() => setConfirmingReset(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-rose-800/70 bg-rose-950/40 px-3 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-900/50 transition-colors cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>إعادة حسابي إلى 0 نقطة</span>
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      void onResetMyAccount().then(() => setConfirmingReset(false));
                    }}
                    className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500 cursor-pointer"
                  >
                    تأكيد التصفير (0 XP)
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingReset(false)}
                    className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700 cursor-pointer"
                  >
                    إلغاء
                  </button>
                </div>
              )}
            </div>

            {syncError && <p className="text-xs text-rose-400">{syncError}</p>}
          </div>

          {/* Live Shared Activity Log */}
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-3">
            <h3 className="font-display text-base font-bold text-slate-100">
              آخر نشاطات المتنافسين
            </h3>
            {activityLog.length === 0 ? (
              <p className="text-xs text-slate-400">
                ابدأ بحل حصة أو تمرين علمي ليظهر إنجازك هنا في الترتيب العام.
              </p>
            ) : (
              <div className="divide-y divide-slate-800 max-h-72 overflow-y-auto">
                {activityLog.map((act) => (
                  <div key={act.id} className="py-2.5 text-xs space-y-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-100">{act.playerName}</span>
                      {act.xpDelta > 0 && (
                        <span className="font-mono-num font-semibold text-emerald-400">
                          +{act.xpDelta} XP
                        </span>
                      )}
                    </div>
                    <p className="text-slate-300 leading-relaxed">{act.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
