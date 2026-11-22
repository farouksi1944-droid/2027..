import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { TERM1_LESSONS } from '../data/curriculum';
import { MORNING_PACKETS } from '../data/morningMemorization';
import { isScientificSubject } from '../data/scientificExercises';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from '../firebase';
import type {
  ActivityEntry,
  DuelRecord,
  PlayerProgress,
  ReviewQuality,
  ScheduleBlock,
  ScientificExercise,
  SpacedStage,
} from '../types/study';
import {
  clampStudyDate,
  computeNextCardReview,
  computeNextLessonReview,
} from '../utils/spacedRepetition';

const LOCAL_STORAGE_KEY = 'dz_3as_single_account_v1';

interface ParticipantDocPayload {
  uid: string;
  visibility: 'public_competition';
  name: string;
  xp: number;
  duelHighScore: number;
  duelBestTimeSec: number;
  duelsPlayed: number;
  lastActiveDate: string;
  completedStages: Record<string, string>;
  lessonReviews: Record<string, NonNullable<PlayerProgress['lessonReviews']>[string]>;
  completedMorningPackets: Record<string, string>;
  completedBlocks: Record<string, string>;
  masteredCards: Record<string, boolean>;
  cardReviews: Record<string, NonNullable<PlayerProgress['cardReviews']>[string]>;
  solvedExercises: Record<string, string>;
  activityDates: string[];
  recentDuels: DuelRecord[];
  recentActivities: ActivityEntry[];
}

function sanitizeName(raw: string | null | undefined, fallback: string): string {
  const cleaned = (raw ?? '').trim().slice(0, 30);
  return cleaned.length > 0 ? cleaned : fallback;
}

function createInitialAccount(id: string, name: string): PlayerProgress {
  return {
    id,
    name: sanitizeName(name, 'فاروق'),
    completedStages: {},
    lessonReviews: {},
    completedMorningPackets: {},
    completedBlocks: {},
    masteredCards: {},
    cardReviews: {},
    solvedExercises: {},
    duelHighScore: 0,
    duelBestTimeSec: 0,
    duelsPlayed: 0,
    xp: 0,
    lastActiveDate: '2026-11-23',
    activityDates: [],
    recentDuels: [],
    recentActivities: [],
  };
}

function buildParticipantPayload(
  uid: string,
  player: PlayerProgress,
  recentDuels: DuelRecord[],
  recentActivities: ActivityEntry[]
): ParticipantDocPayload {
  return {
    uid,
    visibility: 'public_competition',
    name: sanitizeName(player.name, 'متسابق'),
    xp: Math.max(0, Math.min(1000000, Math.round(player.xp || 0))),
    duelHighScore: Math.max(0, Math.min(100, Math.round(player.duelHighScore || 0))),
    duelBestTimeSec: Math.max(0, Math.min(86400, Math.round(player.duelBestTimeSec || 0))),
    duelsPlayed: Math.max(0, Math.min(10000, Math.round(player.duelsPlayed || 0))),
    lastActiveDate: (player.lastActiveDate || '2026-11-23').slice(0, 16),
    completedStages: player.completedStages ?? {},
    lessonReviews: player.lessonReviews ?? {},
    completedMorningPackets: player.completedMorningPackets ?? {},
    completedBlocks: player.completedBlocks ?? {},
    masteredCards: player.masteredCards ?? {},
    cardReviews: player.cardReviews ?? {},
    solvedExercises: player.solvedExercises ?? {},
    activityDates: Array.from(new Set(player.activityDates ?? [])).slice(-40),
    recentDuels: recentDuels.slice(0, 15),
    recentActivities: recentActivities.slice(0, 25),
  };
}

function participantDocToPlayer(docData: ParticipantDocPayload): PlayerProgress {
  return {
    id: docData.uid,
    name: docData.name,
    completedStages: docData.completedStages ?? {},
    lessonReviews: docData.lessonReviews ?? {},
    completedMorningPackets: docData.completedMorningPackets ?? {},
    completedBlocks: docData.completedBlocks ?? {},
    masteredCards: docData.masteredCards ?? {},
    cardReviews: docData.cardReviews ?? {},
    solvedExercises: docData.solvedExercises ?? {},
    duelHighScore: docData.duelHighScore ?? 0,
    duelBestTimeSec: docData.duelBestTimeSec ?? 0,
    duelsPlayed: docData.duelsPlayed ?? 0,
    xp: docData.xp ?? 0,
    lastActiveDate: docData.lastActiveDate ?? '2026-11-23',
    activityDates: docData.activityDates ?? [],
    recentDuels: docData.recentDuels ?? [],
    recentActivities: docData.recentActivities ?? [],
  };
}

const lessonById = new Map(TERM1_LESSONS.map((l) => [l.id, l]));
const packetById = new Map(MORNING_PACKETS.map((p) => [p.id, p]));

export function useStudyAccount() {
  const [localAccount, setLocalAccount] = useState<PlayerProgress>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved) as PlayerProgress;
      }
    } catch {
      // ignore malformed storage
    }
    return createInitialAccount('local', 'حسابي');
  });

  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [cloudDoc, setCloudDoc] = useState<ParticipantDocPayload | null>(null);
  const [cloudLeaderboard, setCloudLeaderboard] = useState<PlayerProgress[]>([]);
  const [syncStatus, setSyncStatus] = useState<'local' | 'syncing' | 'connected' | 'error'>('local');
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(localAccount));
    } catch {
      // ignore storage quota errors
    }
  }, [localAccount]);

  // Listen for Firebase Auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
      if (!u) {
        setCloudDoc(null);
        setCloudLeaderboard([]);
        setSyncStatus('local');
      }
    });
    return () => unsub();
  }, []);

  // Bootstrap private PII profile + single participant leaderboard document on sign-in
  useEffect(() => {
    if (!authReady || !user) return;
    let cancelled = false;

    async function bootstrapSingleAccount() {
      if (!user) return;
      setSyncStatus('syncing');

      // 1. Ensure isolated private PII profile exists
      const profilePath = `users/${user.uid}/private/profile`;
      const profileRef = doc(db, 'users', user.uid, 'private', 'profile');
      try {
        const snap = await getDoc(profileRef);
        if (!snap.exists()) {
          await setDoc(profileRef, {
            uid: user.uid,
            email: (user.email ?? '').slice(0, 254),
            createdAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, profilePath);
      }

      if (cancelled) return;

      // 2. Ensure my single participant document exists in /participants/{uid}
      const participantPath = `participants/${user.uid}`;
      const participantRef = doc(db, 'participants', user.uid);
      try {
        const snap = await getDoc(participantRef);
        if (!snap.exists()) {
          const displayName = sanitizeName(
            localAccount.name !== 'حسابي' ? localAccount.name : user.displayName,
            sanitizeName(user.displayName, 'متسابق')
          );
          const initPlayer =
            localAccount.xp > 0
              ? { ...localAccount, id: user.uid, name: displayName }
              : createInitialAccount(user.uid, displayName);
          const initActivity: ActivityEntry = {
            id: `act-${Date.now()}`,
            playerId: user.uid,
            playerName: displayName,
            message: `انضم ${displayName} إلى برنامج المراجعة والمنافسة`,
            xpDelta: 0,
            timestamp: new Date().toISOString(),
          };
          const payload = buildParticipantPayload(
            user.uid,
            initPlayer,
            localAccount.recentDuels ?? [],
            [initActivity, ...(localAccount.recentActivities ?? [])]
          );
          await setDoc(participantRef, {
            ...payload,
            updatedAt: serverTimestamp(),
          });
        }
        if (!cancelled) {
          setSyncStatus('connected');
          setSyncError(null);
        }
      } catch (err) {
        if (!cancelled) setSyncStatus('error');
        handleFirestoreError(err, OperationType.WRITE, participantPath);
      }
    }

    void bootstrapSingleAccount();
    return () => {
      cancelled = true;
    };
  }, [authReady, user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Real-time onSnapshot listener on MY OWN single account
  useEffect(() => {
    if (!authReady || !user) return;
    const myPath = `participants/${user.uid}`;
    const unsub = onSnapshot(
      doc(db, 'participants', user.uid),
      (snap) => {
        if (snap.exists()) {
          setCloudDoc(snap.data() as ParticipantDocPayload);
        } else {
          setCloudDoc(null);
        }
        setSyncStatus('connected');
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, myPath);
      }
    );
    return () => unsub();
  }, [authReady, user]);

  // Real-time onSnapshot listener on ALL participants for points comparison
  useEffect(() => {
    if (!authReady || !user) return;
    const leaderboardQuery = query(
      collection(db, 'participants'),
      where('visibility', '==', 'public_competition'),
      limit(50)
    );
    const unsub = onSnapshot(
      leaderboardQuery,
      (snap) => {
        const list = snap.docs
          .map((d) => participantDocToPlayer(d.data() as ParticipantDocPayload))
          .sort((a, b) => {
            if (b.xp !== a.xp) return b.xp - a.xp;
            return Object.keys(b.completedStages).length - Object.keys(a.completedStages).length;
          });
        setCloudLeaderboard(list);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'participants');
      }
    );
    return () => unsub();
  }, [authReady, user]);

  const isCloudConnected = Boolean(user && cloudDoc);

  const activePlayer: PlayerProgress = useMemo(() => {
    if (isCloudConnected && cloudDoc) {
      return participantDocToPlayer(cloudDoc);
    }
    return localAccount;
  }, [isCloudConnected, cloudDoc, localAccount]);

  const leaderboard: PlayerProgress[] = useMemo(() => {
    if (!user) return [activePlayer];
    if (cloudLeaderboard.length === 0) return [activePlayer];
    const hasMe = cloudLeaderboard.some((p) => p.id === activePlayer.id);
    const merged = hasMe ? cloudLeaderboard : [activePlayer, ...cloudLeaderboard];
    return [...merged].sort((a, b) => {
      if (b.xp !== a.xp) return b.xp - a.xp;
      return Object.keys(b.completedStages).length - Object.keys(a.completedStages).length;
    });
  }, [user, cloudLeaderboard, activePlayer]);

  const myRank = useMemo(() => {
    const idx = leaderboard.findIndex((p) => p.id === activePlayer.id);
    return idx >= 0 ? idx + 1 : 1;
  }, [leaderboard, activePlayer.id]);

  const otherParticipants = useMemo(
    () => leaderboard.filter((p) => p.id !== activePlayer.id),
    [leaderboard, activePlayer.id]
  );

  const duelHistory = useMemo(() => {
    return leaderboard
      .flatMap((p) => p.recentDuels ?? [])
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, 20);
  }, [leaderboard]);

  const activityLog = useMemo(() => {
    return leaderboard
      .flatMap((p) => p.recentActivities ?? [])
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, 30);
  }, [leaderboard]);

  const signInWithGoogle = useCallback(async () => {
    setAuthBusy(true);
    setSyncError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('popup-closed-by-user')) {
        setSyncError('تعذر تسجيل الدخول بحساب Google. تأكد من السماح بالنوافذ المنبثقة.');
      }
    } finally {
      setAuthBusy(false);
    }
  }, []);

  const signOutUser = useCallback(async () => {
    await signOut(auth);
    setCloudDoc(null);
    setCloudLeaderboard([]);
  }, []);

  const saveMyCloudUpdate = useCallback(
    async (
      nextPlayer: PlayerProgress,
      newActivity?: ActivityEntry,
      newDuel?: DuelRecord
    ) => {
      if (!user || !cloudDoc) return;
      setSyncStatus('syncing');
      const nextActivities = newActivity
        ? [newActivity, ...(cloudDoc.recentActivities ?? [])].slice(0, 25)
        : cloudDoc.recentActivities ?? [];
      const nextDuels = newDuel
        ? [newDuel, ...(cloudDoc.recentDuels ?? [])].slice(0, 15)
        : cloudDoc.recentDuels ?? [];

      const payload = buildParticipantPayload(
        user.uid,
        nextPlayer,
        nextDuels,
        nextActivities
      );

      setCloudDoc(payload);

      const participantPath = `participants/${user.uid}`;
      try {
        await setDoc(doc(db, 'participants', user.uid), {
          ...payload,
          updatedAt: serverTimestamp(),
        });
        setSyncStatus('connected');
      } catch (err) {
        setSyncStatus('error');
        handleFirestoreError(err, OperationType.WRITE, participantPath);
      }
    },
    [user, cloudDoc]
  );

  const renameMyAccount = useCallback(
    async (newName: string) => {
      const cleaned = sanitizeName(newName, 'متسابق');
      if (isCloudConnected && cloudDoc) {
        const nextPlayer: PlayerProgress = {
          ...participantDocToPlayer(cloudDoc),
          name: cleaned,
        };
        await saveMyCloudUpdate(nextPlayer);
        return;
      }
      setLocalAccount((prev) => ({ ...prev, name: cleaned }));
    },
    [isCloudConnected, cloudDoc, saveMyCloudUpdate]
  );

  const resetMyAccount = useCallback(async () => {
    const cleanName = activePlayer.name;
    const resetPlayer = createInitialAccount(activePlayer.id, cleanName);
    const resetActivity: ActivityEntry = {
      id: `act-${Date.now()}`,
      playerId: activePlayer.id,
      playerName: cleanName,
      message: `أعاد ${cleanName} حسابه إلى 0 نقطة وبداية جديدة`,
      xpDelta: 0,
      timestamp: new Date().toISOString(),
    };

    if (isCloudConnected && user && cloudDoc) {
      setSyncStatus('syncing');
      const payload = buildParticipantPayload(user.uid, resetPlayer, [], [resetActivity]);
      setCloudDoc(payload);
      const participantPath = `participants/${user.uid}`;
      try {
        await setDoc(doc(db, 'participants', user.uid), {
          ...payload,
          updatedAt: serverTimestamp(),
        });
        setSyncStatus('connected');
      } catch (err) {
        setSyncStatus('error');
        handleFirestoreError(err, OperationType.WRITE, participantPath);
      }
      return;
    }

    setLocalAccount({
      ...resetPlayer,
      recentDuels: [],
      recentActivities: [resetActivity],
    });
  }, [activePlayer.id, activePlayer.name, isCloudConnected, user, cloudDoc]);

  const applyMyMutation = useCallback(
    (
      mutator: (current: PlayerProgress) => {
        player: PlayerProgress;
        activity?: ActivityEntry;
        duel?: DuelRecord;
      }
    ) => {
      if (isCloudConnected && cloudDoc) {
        const current = participantDocToPlayer(cloudDoc);
        const result = mutator(current);
        void saveMyCloudUpdate(result.player, result.activity, result.duel);
      } else {
        setLocalAccount((prev) => {
          const result = mutator(prev);
          return {
            ...result.player,
            recentDuels: result.duel
              ? [result.duel, ...(prev.recentDuels ?? [])].slice(0, 15)
              : prev.recentDuels ?? [],
            recentActivities: result.activity
              ? [result.activity, ...(prev.recentActivities ?? [])].slice(0, 25)
              : prev.recentActivities ?? [],
          };
        });
      }
    },
    [isCloudConnected, cloudDoc, saveMyCloudUpdate]
  );

  const toggleLessonStage = useCallback(
    (lessonId: string, stage: SpacedStage, reviewDate?: string) => {
      const key = `${lessonId}:${stage}`;
      const xpTable: Record<SpacedStage, number> = { S0: 60, R1: 35, R2: 50, R3: 70 };
      const stageNames: Record<SpacedStage, string> = {
        S0: 'المراجعة الأولى',
        R1: 'إعادة المراجعة (1)',
        R2: 'إعادة المراجعة (2)',
        R3: 'التثبيت النهائي',
      };
      const lesson = lessonById.get(lessonId);
      const effectiveDate = clampStudyDate(reviewDate ?? new Date().toISOString().slice(0, 10));

      applyMyMutation((current) => {
        const wasDone = Boolean(current.completedStages[key]);
        const nextStages = { ...current.completedStages };
        const nextReviews = { ...(current.lessonReviews ?? {}) };

        let xpDelta = 0;
        if (wasDone) {
          delete nextStages[key];
          xpDelta = -xpTable[stage];
          delete nextReviews[lessonId];
        } else {
          nextStages[key] = `${effectiveDate}T12:00:00.000Z`;
          xpDelta = xpTable[stage];
          const scheduled = computeNextLessonReview(current, lessonId, stage, 'good', effectiveDate);
          nextReviews[lessonId] = scheduled.reviewState;
        }

        const nextDates = wasDone
          ? current.activityDates
          : Array.from(new Set([...current.activityDates, effectiveDate]));

        const updatedPlayer: PlayerProgress = {
          ...current,
          completedStages: nextStages,
          lessonReviews: nextReviews,
          xp: Math.max(0, current.xp + xpDelta),
          lastActiveDate: effectiveDate,
          activityDates: nextDates,
        };

        const activity: ActivityEntry | undefined = wasDone
          ? undefined
          : {
              id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              playerId: current.id,
              playerName: current.name,
              message: `أتمّ ${stageNames[stage]} لدرس «${lesson?.title ?? lessonId}»`,
              xpDelta,
              timestamp: new Date().toISOString(),
            };

        return { player: updatedPlayer, activity };
      });
    },
    [applyMyMutation]
  );

  const reviewLessonWithQuality = useCallback(
    (lessonId: string, stage: SpacedStage, quality: ReviewQuality, reviewDate: string) => {
      const lesson = lessonById.get(lessonId);
      const cleanDate = clampStudyDate(reviewDate);

      applyMyMutation((current) => {
        const { completedStageToMark, reviewState, xpDelta } = computeNextLessonReview(
          current,
          lessonId,
          stage,
          quality,
          cleanDate
        );

        const nextStages = { ...current.completedStages };
        if (completedStageToMark) {
          nextStages[`${lessonId}:${completedStageToMark}`] = `${cleanDate}T12:00:00.000Z`;
        }
        const nextReviews = {
          ...(current.lessonReviews ?? {}),
          [lessonId]: reviewState,
        };

        const qualityLabels: Record<ReviewQuality, string> = {
          hard: 'تذكير غداً',
          good: 'تمت إعادة المراجعة',
          easy: 'مُتقن تماماً',
        };

        const activity: ActivityEntry = {
          id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          playerId: current.id,
          playerName: current.name,
          message: `راجع درس «${lesson?.title ?? lessonId}»: ${qualityLabels[quality]}`,
          xpDelta,
          timestamp: new Date().toISOString(),
        };

        const updatedPlayer: PlayerProgress = {
          ...current,
          completedStages: nextStages,
          lessonReviews: nextReviews,
          xp: current.xp + xpDelta,
          lastActiveDate: cleanDate,
          activityDates: Array.from(new Set([...current.activityDates, cleanDate])),
        };

        return { player: updatedPlayer, activity };
      });
    },
    [applyMyMutation]
  );

  const reviewCardWithQuality = useCallback(
    (cardId: string, quality: ReviewQuality, reviewDate: string) => {
      const cleanDate = clampStudyDate(reviewDate);
      applyMyMutation((current) => {
        const prevCard = current.cardReviews?.[cardId];
        const nextCard = computeNextCardReview(prevCard, quality, cleanDate);
        const nextCardReviews = {
          ...(current.cardReviews ?? {}),
          [cardId]: nextCard,
        };
        const nextMastered = { ...current.masteredCards };
        if (quality === 'hard') {
          delete nextMastered[cardId];
        } else if (nextCard.box >= 3 || quality === 'easy') {
          nextMastered[cardId] = true;
        }

        const xpDelta = quality === 'hard' ? 3 : quality === 'good' ? 6 : 10;
        const updatedPlayer: PlayerProgress = {
          ...current,
          cardReviews: nextCardReviews,
          masteredCards: nextMastered,
          xp: current.xp + xpDelta,
          lastActiveDate: cleanDate,
          activityDates: Array.from(new Set([...current.activityDates, cleanDate])),
        };
        return { player: updatedPlayer };
      });
    },
    [applyMyMutation]
  );

  const toggleMorningPacket = useCallback(
    (packetId: string) => {
      const packet = packetById.get(packetId);
      const xpVal = packet?.xpReward ?? 40;
      const effectiveDate = clampStudyDate(packet?.date ?? new Date().toISOString().slice(0, 10));

      applyMyMutation((current) => {
        const wasDone = Boolean(current.completedMorningPackets[packetId]);
        const nextPackets = { ...current.completedMorningPackets };
        let xpDelta = 0;

        if (wasDone) {
          delete nextPackets[packetId];
          xpDelta = -xpVal;
        } else {
          nextPackets[packetId] = `${effectiveDate}T07:15:00.000Z`;
          xpDelta = xpVal;
        }

        const nextDates = wasDone
          ? current.activityDates
          : Array.from(new Set([...current.activityDates, effectiveDate]));

        const updatedPlayer: PlayerProgress = {
          ...current,
          completedMorningPackets: nextPackets,
          xp: Math.max(0, current.xp + xpDelta),
          lastActiveDate: effectiveDate,
          activityDates: nextDates,
        };

        const activity: ActivityEntry | undefined = wasDone
          ? undefined
          : {
              id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              playerId: current.id,
              playerName: current.name,
              message: `حفظ بطاقة الصباح (${packet?.dayLabel ?? packetId})`,
              xpDelta,
              timestamp: new Date().toISOString(),
            };

        return { player: updatedPlayer, activity };
      });
    },
    [applyMyMutation]
  );

  const toggleScheduleBlock = useCallback(
    (block: ScheduleBlock) => {
      if (
        block.type === 'school_locked' ||
        block.type === 'monday_unavailable' ||
        block.type === 'jumuah_break'
      ) {
        return;
      }

      const effectiveDate = clampStudyDate(block.date || new Date().toISOString().slice(0, 10));

      applyMyMutation((current) => {
        const wasDone = Boolean(current.completedBlocks[block.id]);
        const nextBlocks = { ...current.completedBlocks };
        const nextStages = { ...current.completedStages };
        const nextReviews = { ...(current.lessonReviews ?? {}) };
        const nextPackets = { ...current.completedMorningPackets };

        let xpDelta = 0;
        if (wasDone) {
          delete nextBlocks[block.id];
          xpDelta = -block.xpReward;
          if (block.lessonId && block.stage) {
            delete nextStages[`${block.lessonId}:${block.stage}`];
            delete nextReviews[block.lessonId];
          }
          if (block.morningPacketId) {
            delete nextPackets[block.morningPacketId];
          }
        } else {
          nextBlocks[block.id] = `${effectiveDate}T19:00:00.000Z`;
          xpDelta = block.xpReward;
          if (block.lessonId && block.stage) {
            nextStages[`${block.lessonId}:${block.stage}`] = `${effectiveDate}T19:00:00.000Z`;
            const scheduled = computeNextLessonReview(
              current,
              block.lessonId,
              block.stage,
              'good',
              effectiveDate
            );
            nextReviews[block.lessonId] = scheduled.reviewState;
          }
          if (block.morningPacketId) {
            nextPackets[block.morningPacketId] = `${effectiveDate}T07:15:00.000Z`;
          }
        }

        const nextDates = wasDone
          ? current.activityDates
          : Array.from(new Set([...current.activityDates, effectiveDate]));

        const updatedPlayer: PlayerProgress = {
          ...current,
          completedBlocks: nextBlocks,
          completedStages: nextStages,
          lessonReviews: nextReviews,
          completedMorningPackets: nextPackets,
          xp: Math.max(0, current.xp + xpDelta),
          lastActiveDate: effectiveDate,
          activityDates: nextDates,
        };

        const activity: ActivityEntry | undefined = wasDone
          ? undefined
          : {
              id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              playerId: current.id,
              playerName: current.name,
              message: `أنجز حصة: ${block.title}`,
              xpDelta,
              timestamp: new Date().toISOString(),
            };

        return { player: updatedPlayer, activity };
      });
    },
    [applyMyMutation]
  );

  const toggleMasteredCard = useCallback(
    (cardId: string) => {
      applyMyMutation((current) => {
        const nextCards = { ...current.masteredCards };
        const wasDone = Boolean(nextCards[cardId]);
        if (wasDone) {
          delete nextCards[cardId];
        } else {
          nextCards[cardId] = true;
        }
        const updatedPlayer: PlayerProgress = {
          ...current,
          masteredCards: nextCards,
          xp: Math.max(0, current.xp + (wasDone ? -5 : 5)),
        };
        return { player: updatedPlayer };
      });
    },
    [applyMyMutation]
  );

  const toggleScientificExercise = useCallback(
    (exercise: ScientificExercise) => {
      if (!isScientificSubject(exercise.subjectId)) return;
      const effectiveDate = clampStudyDate(new Date().toISOString().slice(0, 10));

      applyMyMutation((current) => {
        const currentSolved = current.solvedExercises ?? {};
        const wasSolved = Boolean(currentSolved[exercise.id]);
        const nextSolved = { ...currentSolved };
        let xpDelta = 0;

        if (wasSolved) {
          delete nextSolved[exercise.id];
          xpDelta = -exercise.xpReward;
        } else {
          nextSolved[exercise.id] = new Date().toISOString();
          xpDelta = exercise.xpReward;
        }

        const nextDates = wasSolved
          ? current.activityDates
          : Array.from(new Set([...current.activityDates, effectiveDate]));

        const updatedPlayer: PlayerProgress = {
          ...current,
          solvedExercises: nextSolved,
          xp: Math.max(0, current.xp + xpDelta),
          lastActiveDate: effectiveDate,
          activityDates: nextDates,
        };

        const activity: ActivityEntry | undefined = wasSolved
          ? undefined
          : {
              id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              playerId: current.id,
              playerName: current.name,
              message: `حلّ تمرين المادة العلمية: ${exercise.title}`,
              xpDelta,
              timestamp: new Date().toISOString(),
            };

        return { player: updatedPlayer, activity };
      });
    },
    [applyMyMutation]
  );

  const submitDuelResult = useCallback(
    (category: string, score: number, total: number, elapsedSec: number) => {
      const today = clampStudyDate(new Date().toISOString().slice(0, 10));
      applyMyMutation((current) => {
        const xpEarned = score * 12 + (score === total ? 25 : 0);
        const isNewBest =
          score > current.duelHighScore ||
          (score === current.duelHighScore &&
            (current.duelBestTimeSec === 0 || elapsedSec < current.duelBestTimeSec));

        const updatedPlayer: PlayerProgress = {
          ...current,
          duelsPlayed: current.duelsPlayed + 1,
          duelHighScore: Math.max(current.duelHighScore, score),
          duelBestTimeSec: isNewBest ? elapsedSec : current.duelBestTimeSec,
          xp: current.xp + xpEarned,
          lastActiveDate: today,
          activityDates: Array.from(new Set([...current.activityDates, today])),
        };

        const duelRecord: DuelRecord = {
          id: `duel-${Date.now()}`,
          playerId: current.id,
          playerName: current.name,
          category,
          score,
          total,
          elapsedSec,
          timestamp: new Date().toISOString(),
        };

        const activity: ActivityEntry = {
          id: `act-${Date.now()}`,
          playerId: current.id,
          playerName: current.name,
          message: `أنهى تحدي الاسترجاع (${category}) بنتيجة ${score}/${total} في ${elapsedSec} ثانية`,
          xpDelta: xpEarned,
          timestamp: new Date().toISOString(),
        };

        return { player: updatedPlayer, activity, duel: duelRecord };
      });
    },
    [applyMyMutation]
  );

  return {
    user,
    authReady,
    authBusy,
    isCloudConnected,
    activePlayer,
    leaderboard,
    otherParticipants,
    myRank,
    duelHistory,
    activityLog,
    syncStatus,
    syncError,
    signInWithGoogle,
    signOutUser,
    renameMyAccount,
    resetMyAccount,
    toggleLessonStage,
    reviewLessonWithQuality,
    reviewCardWithQuality,
    toggleMorningPacket,
    toggleScheduleBlock,
    toggleMasteredCard,
    toggleScientificExercise,
    submitDuelResult,
  };
}
