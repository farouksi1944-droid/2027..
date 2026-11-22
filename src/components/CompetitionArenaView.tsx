import { Check, Copy, LogIn, LogOut, Play, RotateCcw, Trophy, Users, Zap } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { SUBJECT_ORDER, SUBJECTS, TERM1_LESSONS } from '../data/curriculum';
import { MORNING_PACKETS, QUIZ_BANK } from '../data/morningMemorization';
import type { ChallengeRoom, PlayerProgress, QuizQuestion } from '../types/study';
import { computeSubjectMastery } from '../utils/mastery';
import { SubjectMasteryRing } from './SubjectMasteryRing';

interface CompetitionArenaViewProps {
  room: ChallengeRoom;
  activePlayerId: 'player1' | 'player2';
  isSignedIn: boolean;
  userEmail: string | null;
  authBusy: boolean;
  isCloudConnected: boolean;
  hasOpponentJoined: boolean;
  syncStatus: 'local' | 'syncing' | 'connected' | 'error';
  syncError: string | null;
  onSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onCreateRoom: (customCode?: string, myName?: string, friendName?: string) => Promise<string | null>;
  onJoinRoom: (code: string, myName?: string) => Promise<boolean>;
  onLeaveRoom: () => Promise<void>;
  onRenameMyAccount: (newName: string) => Promise<void>;
  onResetMyAccount: () => Promise<void>;
  onSubmitDuel: (category: string, score: number, total: number, elapsedSec: number) => void;
}

const DUEL_CATEGORIES = ['الكل', 'تواريخ', 'مصطلحات', 'شخصيات', 'علوم إسلامية', 'مفاهيم علمية'] as const;

export function CompetitionArenaView({
  room,
  activePlayerId,
  isSignedIn,
  userEmail,
  authBusy,
  isCloudConnected,
  hasOpponentJoined,
  syncStatus,
  syncError,
  onSignIn,
  onSignOut,
  onCreateRoom,
  onJoinRoom,
  onLeaveRoom,
  onRenameMyAccount,
  onResetMyAccount,
  onSubmitDuel,
}: CompetitionArenaViewProps) {
  const p1 = room.players.player1;
  const p2 = room.players.player2;
  const activePlayer = room.players[activePlayerId];
  const opponentPlayer = room.players[activePlayerId === 'player1' ? 'player2' : 'player1'];

  const [myNameInput, setMyNameInput] = useState(activePlayer.name);
  const [friendNameInput, setFriendNameInput] = useState('سعيد');
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [savedNameFeedback, setSavedNameFeedback] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);

  useEffect(() => {
    setMyNameInput(activePlayer.name);
  }, [activePlayer.name]);

  const handleCopyInviteLink = async () => {
    if (!room.code) return;
    const url = `${window.location.origin}/?room=${encodeURIComponent(room.code)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleCopyCode = async () => {
    if (!room.code) return;
    try {
      await navigator.clipboard.writeText(room.code);
      setCopiedCode(true);
      window.setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  // 1v1 Timed Duel State
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

  const metrics = useMemo(() => {
    const calc = (p: PlayerProgress) => {
      const reviewedLessons = TERM1_LESSONS.filter((l) =>
        Boolean(p.completedStages[`${l.id}:S0`])
      ).length;
      return {
        xp: p.xp,
        lessons: reviewedLessons,
        morning: Object.keys(p.completedMorningPackets).length,
        duelBest: p.duelHighScore,
      };
    };
    return { p1: calc(p1), p2: calc(p2) };
  }, [p1, p2]);

  const leaderName = p1.xp === p2.xp ? 'تعادل تام' : p1.xp > p2.xp ? p1.name : p2.name;

  return (
    <div className="space-y-6">
      {/* Head-to-Head Scoreboard */}
      <section className="rounded-xl border border-slate-800 bg-slate-900 p-6 space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs text-slate-400">
              المتصدر حالياً: {leaderName} · حسابك الشخصي: {activePlayer.name}
            </div>
            <h1 className="mt-1 font-display text-xl sm:text-2xl font-bold text-slate-100">
              {p1.name} مقابل {p2.name}
            </h1>
          </div>

          <span className="text-xs font-medium text-emerald-400">
            {isCloudConnected
              ? hasOpponentJoined
                ? 'مزامنة سحابية فورية بين الجهازين'
                : `في انتظار انضمام ${opponentPlayer.name}`
              : 'وضع محلي'}
          </span>
        </div>

        {/* Comparison Grid */}
        <div className="grid grid-cols-1 gap-4 border-t border-slate-800 pt-5 md:grid-cols-2">
          {[
            { label: 'مجموع النقاط (XP)', v1: metrics.p1.xp, v2: metrics.p2.xp, unit: 'XP' },
            {
              label: 'الدروس المراجعة',
              v1: metrics.p1.lessons,
              v2: metrics.p2.lessons,
              unit: `/ ${totalLessons}`,
            },
            {
              label: 'بطاقات الحفظ الصباحي',
              v1: metrics.p1.morning,
              v2: metrics.p2.morning,
              unit: `/ ${totalPackets}`,
            },
            {
              label: 'أفضل نتيجة في تحدي السرعة',
              v1: metrics.p1.duelBest,
              v2: metrics.p2.duelBest,
              unit: 'إجابة صحيحة',
            },
          ].map((row) => {
            const maxVal = Math.max(1, row.v1, row.v2);
            return (
              <div key={row.label} className="rounded-lg border border-slate-800 bg-slate-950/60 p-4 space-y-2.5">
                <div className="text-xs font-semibold text-slate-100">{row.label}</div>
                <div className="space-y-2">
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-slate-300">{p1.name}</span>
                      <span className="font-mono-num font-bold text-emerald-400">
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
                      <span className="font-medium text-slate-300">{p2.name}</span>
                      <span className="font-mono-num font-bold text-sky-400">
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
        <div className="border-t border-slate-800 pt-5 space-y-3">
          <div className="text-xs font-semibold text-slate-200">
            الدائرة النسبية لمدى التمكن من المواد ({activePlayer.name} مقابل {opponentPlayer.name})
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
            {SUBJECT_ORDER.map((subId) => {
              const info = SUBJECTS[subId];
              const mine = computeSubjectMastery(activePlayer, subId);
              const opp = computeSubjectMastery(opponentPlayer, subId);
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
                      {opponentPlayer.name}: {opp.percentage}%
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Split: 1v1 Timed Quiz (7 cols) + Account & Live Cloud Room (5 cols) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="lg:col-span-7 rounded-xl border border-slate-800 bg-slate-900 p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                <Zap className="h-4 w-4" />
                <span>تحدي الـ 8 أسئلة السريع ({activePlayer.name})</span>
              </div>
              <h2 className="mt-1 font-display text-lg font-bold text-slate-100">
                اختبر حفظك وفهمك واكسب نقاطاً إضافية
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
                تم تسجيل النتيجة في حسابك ومزامنتها للمنافسة.
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

          {room.duelHistory.length > 0 && (
            <div className="border-t border-slate-800 pt-4 space-y-2.5">
              <div className="text-xs font-semibold text-slate-100">سجل التحديات الأخيرة</div>
              <div className="divide-y divide-slate-800">
                {room.duelHistory.slice(0, 5).map((rec) => (
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

        {/* Right Column: Account & Real-Time Cloud Sync */}
        <aside className="lg:col-span-5 space-y-6">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-100">
                <Users className="h-4 w-4 text-emerald-400" />
                <span>حسابي والمزامنة مع سعيد</span>
              </div>
              <span className="text-xs text-slate-400">
                {syncStatus === 'connected' && isCloudConnected
                  ? 'مباشر'
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
                  سجّل الدخول بحسابك في Google ليكون لك حسابك وعملك الخاص ومراجعاتك المستقلة، وتظهر نقاطك وتقدمك لسعيد تلقائياً بعد نشر الموقع.
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
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs">
                  <div className="truncate text-slate-300">
                    مسجل بحساب: <span className="font-semibold text-slate-100">{userEmail}</span>
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

                {isCloudConnected && room.code ? (
                  <div className="space-y-3 rounded-lg border border-emerald-800/70 bg-emerald-950/40 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs text-slate-400">رمز الغرفة السحابية:</div>
                        <div className="font-mono-num text-lg font-bold text-slate-100">{room.code}</div>
                      </div>
                      <button
                        type="button"
                        onClick={handleCopyCode}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 cursor-pointer"
                      >
                        {copiedCode ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                        <span>{copiedCode ? 'نُسخ' : 'نسخ الرمز'}</span>
                      </button>
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed">
                      {hasOpponentJoined
                        ? `${opponentPlayer.name} متصل الآن بحسابه المستقل — كل تحديث تنجزه يظهر عنده لحظياً.`
                        : `أرسل هذا الرابط لسعيد ليفتح حسابه الخاص وينضم فوراً للمنافسة معك:`}
                    </p>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleCopyInviteLink}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors cursor-pointer"
                      >
                        {copiedLink ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        <span>{copiedLink ? 'تم نسخ الرابط!' : 'نسخ رابط الدعوة لسعيد'}</span>
                      </button>

                      {activePlayerId === 'player2' && (
                        <button
                          type="button"
                          onClick={() => void onLeaveRoom()}
                          className="text-xs font-medium text-rose-400 hover:text-rose-300 cursor-pointer"
                        >
                          مغادرة الغرفة
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="block text-xs font-medium text-slate-300">اسمك في المنافسة:</label>
                      <input
                        type="text"
                        value={myNameInput}
                        onChange={(e) => setMyNameInput(e.target.value)}
                        placeholder="مثال: فاروق أو سعيد"
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 focus:border-emerald-500 focus:outline-none"
                      />
                    </div>

                    <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-950/60 p-3.5">
                      <div className="text-xs font-semibold text-slate-200">إنشاء غرفة جديدة (فاروق):</div>
                      <input
                        type="text"
                        value={friendNameInput}
                        onChange={(e) => setFriendNameInput(e.target.value)}
                        placeholder="اسم المنافس (سعيد)"
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 focus:border-emerald-500 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => void onCreateRoom(undefined, myNameInput, friendNameInput)}
                        className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors cursor-pointer"
                      >
                        إنشاء غرفة ومشاركة الرابط مع سعيد
                      </button>
                    </div>

                    <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-950/60 p-3.5">
                      <div className="text-xs font-semibold text-slate-200">أو الانضمام لغرفة قائمة (سعيد):</div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={joinCodeInput}
                          onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                          placeholder="أدخل الرمز (مثال: BAC-4821)"
                          className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono-num text-xs text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => void onJoinRoom(joinCodeInput, myNameInput)}
                          className="rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-500 cursor-pointer"
                        >
                          دخول
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Rename only MY OWN account */}
                {isCloudConnected && (
                  <div className="border-t border-slate-800 pt-3 space-y-2">
                    <div className="text-xs font-medium text-slate-300">تعديل اسمي الظاهر للمنافس</div>
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
                )}
              </div>
            )}

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
              سجل الإنجازات المباشر
            </h3>
            <div className="divide-y divide-slate-800 max-h-72 overflow-y-auto">
              {room.activityLog.map((act) => (
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
          </div>
        </aside>
      </div>
    </div>
  );
}
