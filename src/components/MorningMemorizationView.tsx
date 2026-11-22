import { Check, Eye, EyeOff, RotateCw, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { MORNING_PACKETS } from '../data/morningMemorization';
import type { MorningPacket, PlayerProgress, ReviewQuality } from '../types/study';
import { formatArabicShortDate } from '../utils/spacedRepetition';

interface MorningMemorizationViewProps {
  activePlayer: PlayerProgress;
  opponentPlayer: PlayerProgress;
  selectedDate: string;
  onSelectDate: (date: string) => void;
  onTogglePacket: (packetId: string) => void;
  onToggleCard: (cardId: string) => void;
  onReviewCard: (cardId: string, quality: ReviewQuality, reviewDate: string) => void;
}

export function MorningMemorizationView({
  activePlayer,
  opponentPlayer,
  selectedDate,
  onSelectDate,
  onTogglePacket,
  onToggleCard,
  onReviewCard,
}: MorningMemorizationViewProps) {
  const [mode, setMode] = useState<'packet' | 'flashcards' | 'index'>('packet');
  const [searchTerm, setSearchTerm] = useState('');
  const [revealedIds, setRevealedIds] = useState<Record<string, boolean>>({});
  const [flashIndex, setFlashIndex] = useState(0);
  const [flashFlipped, setFlashFlipped] = useState(false);

  const packet: MorningPacket = useMemo(
    () => MORNING_PACKETS.find((p) => p.date === selectedDate) ?? MORNING_PACKETS[0],
    [selectedDate]
  );

  const isPacketDone = Boolean(activePlayer.completedMorningPackets[packet.id]);
  const isFriendDone = Boolean(opponentPlayer.completedMorningPackets[packet.id]);

  // Build flashcards for the selected morning packet
  const packetFlashcards = useMemo(() => {
    const cards: { id: string; tag: string; front: string; back: string }[] = [];
    packet.historyDates.forEach((d, idx) => {
      cards.push({
        id: `${packet.id}-d-${idx}`,
        tag: `تاريخ · ${d.lessonRef}`,
        front: `ما هو الحدث الموافق لتاريخ: ${d.date} ؟`,
        back: d.event,
      });
    });
    packet.terms.forEach((t, idx) => {
      cards.push({
        id: `${packet.id}-t-${idx}`,
        tag: `مصطلح ${t.category} · ${t.lessonRef}`,
        front: `عرّف المصطلح التالي: ${t.term}`,
        back: t.definition,
      });
    });
    packet.figures.forEach((f, idx) => {
      cards.push({
        id: `${packet.id}-f-${idx}`,
        tag: `شخصية تاريخية · ${f.lessonRef}`,
        front: `من هو: ${f.name} ؟ (${f.identity})`,
        back: f.achievements,
      });
    });
    cards.push({
      id: `${packet.id}-isl`,
      tag: `علوم إسلامية · ${packet.islamic.lessonTitle}`,
      front: `${packet.islamic.sectionTitle} — استرجع العناصر الأساسية والشاهد`,
      back: `${packet.islamic.points.join(' | ')} — ${packet.islamic.evidence}`,
    });
    return cards;
  }, [packet]);

  const currentCard = packetFlashcards[flashIndex % packetFlashcards.length];

  const allIndexItems = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const dates = MORNING_PACKETS.flatMap((p) =>
      p.historyDates.map((d) => ({ ...d, dayLabel: p.dayLabel }))
    ).filter((d) => !q || `${d.date} ${d.event} ${d.lessonRef}`.toLowerCase().includes(q));

    const terms = MORNING_PACKETS.flatMap((p) =>
      p.terms.map((t) => ({ ...t, dayLabel: p.dayLabel }))
    ).filter((t) => !q || `${t.term} ${t.definition} ${t.category}`.toLowerCase().includes(q));

    const figures = MORNING_PACKETS.flatMap((p) =>
      p.figures.map((f) => ({ ...f, dayLabel: p.dayLabel }))
    ).filter((f) => !q || `${f.name} ${f.identity} ${f.achievements}`.toLowerCase().includes(q));

    return { dates, terms, figures };
  }, [searchTerm]);

  const toggleReveal = (id: string) => {
    setRevealedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="rounded-xl border border-slate-800 bg-slate-900 p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-xs text-slate-400">06:45 – 07:15 صباحاً · 30 دقيقة يومياً</div>
            <h1 className="mt-1 font-display text-xl sm:text-2xl font-bold text-slate-100">
              حفظ الصباح (تواريخ · مصطلحات · شخصيات · إسلامية)
            </h1>
          </div>

          <div className="flex items-center gap-1 rounded-lg bg-slate-800 p-1 shrink-0">
            {[
              { id: 'packet', label: 'بطاقة اليوم (30 د)' },
              { id: 'flashcards', label: 'اختبار الاسترجاع' },
              { id: 'index', label: 'الفهرس الشامل' },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setMode(t.id as typeof mode);
                  setFlashIndex(0);
                  setFlashFlipped(false);
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  mode === t.id
                    ? 'bg-slate-950 text-slate-100 shadow-sm'
                    : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Morning Day Picker */}
        {mode !== 'index' && (
          <div className="mt-5 flex flex-wrap items-center gap-1.5 border-t border-slate-800 pt-4">
            {MORNING_PACKETS.map((p) => {
              const active = p.date === packet.date;
              const done = Boolean(activePlayer.completedMorningPackets[p.id]);
              const dayShort = p.date.slice(8, 10) + '/' + p.date.slice(5, 7);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onSelectDate(p.date);
                    setFlashIndex(0);
                    setFlashFlipped(false);
                  }}
                  className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 font-mono-num text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'border-emerald-500 bg-emerald-600 text-white'
                      : done
                        ? 'border-emerald-800 bg-emerald-950/60 text-emerald-300 hover:bg-emerald-900/60'
                        : 'border-slate-700 bg-slate-950 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {done && <Check className="h-3 w-3" />}
                  <span>{dayShort}</span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Mode 1: Selected Morning Packet */}
      {mode === 'packet' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-900 p-5">
            <div>
              <div className="text-xs text-slate-400">
                {packet.dayLabel} · {packet.estimatedMinutes} دقيقة · +{packet.xpReward} XP
              </div>
              <h2 className="mt-1 font-display text-lg font-bold text-slate-100">
                {packet.focusTitle}
              </h2>
              {isFriendDone && (
                <div className="mt-1 text-xs font-medium text-emerald-400">
                  أتمّ {opponentPlayer.name} حفظ هذه الحقيبة الصباحية
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => onTogglePacket(packet.id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isPacketDone
                  ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                  : 'bg-slate-800 border border-slate-700 text-slate-100 hover:bg-slate-700'
              }`}
            >
              <Check className="h-4 w-4" />
              <span>{isPacketDone ? 'تم حفظ بطاقة الصباح' : 'تأكيد إتمام حفظ الصباح'}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* History Dates */}
            <section className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-base font-bold text-slate-100">
                  01. التواريخ المعلمية (10 دقائق)
                </h3>
                <span className="font-mono-num text-xs text-slate-400">
                  {packet.historyDates.length} تواريخ
                </span>
              </div>
              <div className="divide-y divide-slate-800">
                {packet.historyDates.map((item, idx) => {
                  const cardId = `${packet.id}-d-${idx}`;
                  const mastered = Boolean(activePlayer.masteredCards[cardId]);
                  const hidden = Boolean(revealedIds[`hide-${cardId}`]);
                  return (
                    <div key={cardId} className="py-3 first:pt-0 last:pb-0 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono-num text-sm font-bold text-rose-400">
                          {item.date}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => toggleReveal(`hide-${cardId}`)}
                            className="text-xs text-slate-400 hover:text-slate-100 cursor-pointer"
                            title="إخفاء الحدث للتسميع الذاتي"
                          >
                            {hidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => onToggleCard(cardId)}
                            className={`px-2.5 py-1 text-[11px] font-medium rounded-md border cursor-pointer ${
                              mastered
                                ? 'border-emerald-500 bg-emerald-600 text-white'
                                : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
                            }`}
                          >
                            {mastered ? 'محفوظ' : 'تم الحفظ'}
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        {hidden ? '•••••••••••••••• (اضغط على العين لإظهار الحدث)' : item.event}
                      </p>
                      <div className="text-[11px] text-slate-500">الدرس: {item.lessonRef}</div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Terms (History & Geography) */}
            <section className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-base font-bold text-slate-100">
                  02. المصطلحات — تاريخ وجغرافيا (8 دقائق)
                </h3>
                <span className="font-mono-num text-xs text-slate-400">
                  {packet.terms.length} مصطلحات
                </span>
              </div>
              <div className="divide-y divide-slate-800">
                {packet.terms.map((item, idx) => {
                  const cardId = `${packet.id}-t-${idx}`;
                  const mastered = Boolean(activePlayer.masteredCards[cardId]);
                  const hidden = Boolean(revealedIds[`hide-${cardId}`]);
                  return (
                    <div key={cardId} className="py-3 first:pt-0 last:pb-0 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-bold text-slate-100">
                          {item.term}{' '}
                          <span className="text-xs font-normal text-slate-400">
                            · {item.category}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => toggleReveal(`hide-${cardId}`)}
                            className="text-xs text-slate-400 hover:text-slate-100 cursor-pointer"
                          >
                            {hidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => onToggleCard(cardId)}
                            className={`px-2.5 py-1 text-[11px] font-medium rounded-md border cursor-pointer ${
                              mastered
                                ? 'border-emerald-500 bg-emerald-600 text-white'
                                : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
                            }`}
                          >
                            {mastered ? 'محفوظ' : 'تم الحفظ'}
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        {hidden ? '•••••••••••••••• (حاول تعريف المصطلح غيباً)' : item.definition}
                      </p>
                      <div className="text-[11px] text-slate-500">الدرس: {item.lessonRef}</div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Historical Figures */}
            <section className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-base font-bold text-slate-100">
                  03. الشخصيات التاريخية (6 دقائق)
                </h3>
                <span className="font-mono-num text-xs text-slate-400">
                  {packet.figures.length} شخصيات
                </span>
              </div>
              <div className="divide-y divide-slate-800">
                {packet.figures.map((item, idx) => {
                  const cardId = `${packet.id}-f-${idx}`;
                  const mastered = Boolean(activePlayer.masteredCards[cardId]);
                  return (
                    <div key={cardId} className="py-3 first:pt-0 last:pb-0 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <span className="text-sm font-bold text-slate-100">{item.name}</span>
                          <span className="text-xs text-slate-400"> · {item.identity}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => onToggleCard(cardId)}
                          className={`px-2.5 py-1 text-[11px] font-medium rounded-md border cursor-pointer ${
                            mastered
                              ? 'border-emerald-500 bg-emerald-600 text-white'
                              : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
                          }`}
                        >
                          {mastered ? 'محفوظ' : 'تم الحفظ'}
                        </button>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">{item.achievements}</p>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Islamic Sciences */}
            <section className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-base font-bold text-slate-100">
                  04. العلوم الإسلامية (6 دقائق)
                </h3>
                <button
                  type="button"
                  onClick={() => onToggleCard(`${packet.id}-isl`)}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-md border cursor-pointer ${
                    activePlayer.masteredCards[`${packet.id}-isl`]
                      ? 'border-emerald-500 bg-emerald-600 text-white'
                      : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {activePlayer.masteredCards[`${packet.id}-isl`] ? 'محفوظ' : 'تم الحفظ'}
                </button>
              </div>
              <div className="space-y-3">
                <div>
                  <div className="text-sm font-bold text-teal-400">{packet.islamic.lessonTitle}</div>
                  <div className="text-xs text-slate-400">{packet.islamic.sectionTitle}</div>
                </div>
                <ul className="space-y-2 text-xs text-slate-300 leading-relaxed list-disc list-inside">
                  {packet.islamic.points.map((pt) => (
                    <li key={pt}>{pt}</li>
                  ))}
                </ul>
                <div className="rounded-lg bg-slate-950/70 p-3 text-xs text-slate-200 border border-slate-800 leading-relaxed">
                  <span className="font-semibold text-teal-400">الشاهد الشرعي: </span>
                  {packet.islamic.evidence}
                </div>
              </div>
            </section>
          </div>
        </div>
      )}

      {/* Mode 2: Active Recall Flashcard Deck */}
      {mode === 'flashcards' && currentCard && (() => {
        const cardReview = activePlayer.cardReviews?.[currentCard.id];
        const statusLabel = cardReview
          ? `التذكير القادم: ${formatArabicShortDate(cardReview.nextDueDate)}`
          : 'اضغط على البطاقة لتتذكر الإجابة قبل كشفها';
        return (
          <section className="mx-auto max-w-2xl rounded-xl border border-slate-800 bg-slate-900 p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
              <span>{currentCard.tag}</span>
              <span className="font-mono-num">
                {(flashIndex % packetFlashcards.length) + 1} / {packetFlashcards.length}
              </span>
            </div>

            <div className="text-xs text-sky-400">{statusLabel}</div>

            <div
              onClick={() => setFlashFlipped((f) => !f)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setFlashFlipped((f) => !f);
                }
              }}
              className="min-h-[190px] flex flex-col items-center justify-center rounded-xl border border-slate-800 bg-slate-950/70 p-6 text-center cursor-pointer hover:bg-slate-800/60 transition-colors"
            >
              <div className="text-xs text-slate-400 mb-2.5">
                {flashFlipped ? 'الإجابة' : 'السؤال'}
              </div>
              <p className="text-base sm:text-lg font-bold text-slate-100 leading-relaxed max-w-xl">
                {flashFlipped ? currentCard.back : currentCard.front}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setFlashFlipped((f) => !f)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 cursor-pointer"
              >
                <RotateCw className="h-3.5 w-3.5" />
                <span>{flashFlipped ? 'إخفاء الإجابة' : 'إظهار الإجابة'}</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onReviewCard(currentCard.id, 'hard', packet.date);
                    setFlashIndex((i) => i + 1);
                    setFlashFlipped(false);
                  }}
                  className="rounded-lg border border-rose-800/70 bg-rose-950/40 px-3.5 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-900/50 cursor-pointer"
                >
                  أعد تذكيري غداً
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onReviewCard(currentCard.id, 'easy', packet.date);
                    setFlashIndex((i) => i + 1);
                    setFlashFlipped(false);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 cursor-pointer"
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>تذكرتها ✓</span>
                </button>
              </div>
            </div>
          </section>
        );
      })()}

      {/* Mode 3: Full Searchable Index */}
      {mode === 'index' && (
        <section className="space-y-6">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
            <div className="relative max-w-lg">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="ابحث عن أي تاريخ، مصطلح، أو شخصية في الفصل الأول..."
                className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2 pr-9 pl-3 text-xs text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-3">
              <h3 className="font-display text-base font-bold text-slate-100">
                كل التواريخ ({allIndexItems.dates.length})
              </h3>
              <div className="divide-y divide-slate-800 max-h-[480px] overflow-y-auto">
                {allIndexItems.dates.map((d, i) => (
                  <div key={`${d.date}-${i}`} className="py-2.5 text-xs space-y-0.5">
                    <div className="font-mono-num font-bold text-rose-400">{d.date}</div>
                    <div className="text-slate-300">{d.event}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-3">
              <h3 className="font-display text-base font-bold text-slate-100">
                كل المصطلحات ({allIndexItems.terms.length})
              </h3>
              <div className="divide-y divide-slate-800 max-h-[480px] overflow-y-auto">
                {allIndexItems.terms.map((t, i) => (
                  <div key={`${t.term}-${i}`} className="py-2.5 text-xs space-y-0.5">
                    <div className="font-bold text-slate-100">
                      {t.term} <span className="font-normal text-slate-400">· {t.category}</span>
                    </div>
                    <div className="text-slate-300 leading-relaxed">{t.definition}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-3">
              <h3 className="font-display text-base font-bold text-slate-100">
                كل الشخصيات ({allIndexItems.figures.length})
              </h3>
              <div className="divide-y divide-slate-800 max-h-[480px] overflow-y-auto">
                {allIndexItems.figures.map((f, i) => (
                  <div key={`${f.name}-${i}`} className="py-2.5 text-xs space-y-0.5">
                    <div className="font-bold text-slate-100">
                      {f.name} <span className="font-normal text-slate-400">· {f.identity}</span>
                    </div>
                    <div className="text-slate-300 leading-relaxed">{f.achievements}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
