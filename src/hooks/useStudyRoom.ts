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
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { TERM1_LESSONS } from '../data/curriculum';
import { MORNING_PACKETS } from '../data/morningMemorization';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from '../firebase';
import { isScientificSubject } from '../data/scientificExercises';
import type {
  ActivityEntry,
  ChallengeRoom,
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

const LOCAL_STORAGE_KEY = 'dz_3as_study_room_v3';
const CLOUD_ROOM_KEY = 'dz_3as_cloud_room_code_v3';

interface RoomMetaDoc {
  code: string;
  ownerId: string;
  player1Uid: string;
  player1Name: string;
  player2Uid: string;
  player2Name: string;
}

interface MemberDocPayload {
  uid: string;
  roomCode: string;
  role: 'player1' | 'player2';
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

function createInitialPlayer(id: 'player1' | 'player2', name: string): PlayerProgress {
  return {
    id,
    name,
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
  };
}

function createDefaultLocalRoom(): ChallengeRoom {
  return {
    code: '',
    createdAt: new Date().toISOString(),
    players: {
      player1: createInitialPlayer('player1', 'فاروق'),
      player2: createInitialPlayer('player2', 'سعيد'),
    },
    duelHistory: [],
    activityLog: [
      {
        id: 'init-1',
        playerId: 'player1',
        playerName: 'فاروق',
        message: 'انطلاق برنامج مراجعة الفصل الأول (23 نوفمبر – 6 ديسمبر)',
        xpDelta: 0,
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

function sanitizeName(raw: string | null | undefined, fallback: string): string {
  const cleaned = (raw ?? '').trim().slice(0, 30);
  return cleaned.length > 0 ? cleaned : fallback;
}

function normalizeRoomCode(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, 24);
}

function buildMemberPayload(
  uid: string,
  roomCode: string,
  role: 'player1' | 'player2',
  player: PlayerProgress,
  recentDuels: DuelRecord[],
  recentActivities: ActivityEntry[]
): MemberDocPayload {
  return {
    uid,
    roomCode,
    role,
    name: sanitizeName(player.name, role === 'player1' ? 'فاروق' : 'سعيد'),
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

function memberToPlayer(docData: MemberDocPayload): PlayerProgress {
  return {
    id: docData.role,
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
  };
}

const lessonById = new Map(TERM1_LESSONS.map((l) => [l.id, l]));
const packetById = new Map(MORNING_PACKETS.map((p) => [p.id, p]));

export function computeStreak(activityDates: string[]): number {
  if (!activityDates || activityDates.length === 0) return 0;
  const unique = Array.from(new Set(activityDates)).sort().reverse();
  let streak = 0;
  let expected = new Date(unique[0] + 'T00:00:00Z');
  for (const dateStr of unique) {
    const current = new Date(dateStr + 'T00:00:00Z');
    const diffDays = Math.round((expected.getTime() - current.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) {
      streak += 1;
      expected = new Date(current.getTime() - 1000 * 60 * 60 * 24);
    } else {
      break;
    }
  }
  return streak;
}

export function useStudyRoom() {
  // Local fallback room when user is not yet signed in
  const [localRoom, setLocalRoom] = useState<ChallengeRoom>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as ChallengeRoom;
        if (parsed?.players?.player2?.name === 'صديقي (المنافس)') {
          parsed.players.player2.name = 'سعيد';
        }
        return parsed;
      }
    } catch {
      // ignore malformed storage
    }
    return createDefaultLocalRoom();
  });

  // Firebase Auth state
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);

  // Active Cloud Room state
  const [cloudRoomCode, setCloudRoomCode] = useState<string>(
    () => localStorage.getItem(CLOUD_ROOM_KEY) || ''
  );
  const [roomMeta, setRoomMeta] = useState<RoomMetaDoc | null>(null);
  const [myMember, setMyMember] = useState<MemberDocPayload | null>(null);
  const [opponentMember, setOpponentMember] = useState<MemberDocPayload | null>(null);
  const [syncStatus, setSyncStatus] = useState<'local' | 'syncing' | 'connected' | 'error'>('local');
  const [syncError, setSyncError] = useState<string | null>(null);
  const [cloudDiscoveryDone, setCloudDiscoveryDone] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(localRoom));
    } catch {
      // ignore storage quota errors
    }
  }, [localRoom]);

  useEffect(() => {
    if (cloudRoomCode) {
      localStorage.setItem(CLOUD_ROOM_KEY, cloudRoomCode);
    } else {
      localStorage.removeItem(CLOUD_ROOM_KEY);
    }
  }, [cloudRoomCode]);

  // Listen for Firebase Auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
      if (!u) {
        setRoomMeta(null);
        setMyMember(null);
        setOpponentMember(null);
        setSyncStatus('local');
        setCloudDiscoveryDone(true);
      } else {
        setCloudDiscoveryDone(false);
      }
    });
    return () => unsub();
  }, []);

  // Ensure isolated private profile + discover/auto-join room from URL or Firestore
  useEffect(() => {
    if (!authReady || !user) return;
    let cancelled = false;

    async function bootstrapUser() {
      if (!user) return;
      setSyncStatus('syncing');

      // 1. Ensure private PII profile exists
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

      // 2. Check URL ?room=CODE
      const params = new URLSearchParams(window.location.search);
      const urlRoomParam = params.get('room');
      const urlCode = urlRoomParam ? normalizeRoomCode(urlRoomParam) : '';

      if (urlCode.length >= 3) {
        const roomRef = doc(db, 'rooms', urlCode);
        try {
          const snap = await getDoc(roomRef);
          if (snap.exists()) {
            const meta = snap.data() as RoomMetaDoc;
            if (meta.player1Uid === user.uid || meta.player2Uid === user.uid) {
              if (!cancelled) {
                setCloudRoomCode(urlCode);
                setSyncError(null);
                setCloudDiscoveryDone(true);
              }
              return;
            }
            if (meta.player2Uid === '' && meta.player1Uid !== user.uid) {
              const p2Name = sanitizeName(user.displayName, 'سعيد');
              await updateDoc(roomRef, {
                player2Uid: user.uid,
                player2Name: p2Name,
                updatedAt: serverTimestamp(),
              });
              const myDocRef = doc(db, 'rooms', urlCode, 'members', user.uid);
              const myDocSnap = await getDoc(myDocRef);
              if (!myDocSnap.exists()) {
                const initPlayer = createInitialPlayer('player2', p2Name);
                const initActivity: ActivityEntry = {
                  id: `act-${Date.now()}`,
                  playerId: 'player2',
                  playerName: p2Name,
                  message: `انضم ${p2Name} إلى غرفة المنافسة بحسابه المستقل`,
                  xpDelta: 0,
                  timestamp: new Date().toISOString(),
                };
                await setDoc(myDocRef, {
                  ...buildMemberPayload(user.uid, urlCode, 'player2', initPlayer, [], [initActivity]),
                  updatedAt: serverTimestamp(),
                });
              }
              if (!cancelled) {
                setCloudRoomCode(urlCode);
                setSyncError(null);
                setCloudDiscoveryDone(true);
              }
              return;
            }
          }
        } catch {
          if (!cancelled) {
            setSyncError('هذه الغرفة ممتلئة بالفعل (يوجد بها لاعبان) أو لا يمكنك الوصول إليها.');
          }
        }
      }

      // 3. Verify saved cloudRoomCode if any
      const savedCode = normalizeRoomCode(localStorage.getItem(CLOUD_ROOM_KEY) || '');
      if (savedCode.length >= 3) {
        try {
          const snap = await getDoc(doc(db, 'rooms', savedCode));
          if (snap.exists()) {
            const meta = snap.data() as RoomMetaDoc;
            if (meta.player1Uid === user.uid || meta.player2Uid === user.uid) {
              if (!cancelled) {
                setCloudRoomCode(savedCode);
                setCloudDiscoveryDone(true);
              }
              return;
            }
          }
        } catch {
          // clear invalid cached room code
        }
        if (!cancelled) setCloudRoomCode('');
      }

      // 4. Discover any room this user belongs to across devices
      try {
        const roomsCol = collection(db, 'rooms');
        const [q1, q2] = await Promise.all([
          getDocs(query(roomsCol, where('player1Uid', '==', user.uid), limit(1))),
          getDocs(query(roomsCol, where('player2Uid', '==', user.uid), limit(1))),
        ]);
        const found = q1.docs[0] ?? q2.docs[0];
        if (found && !cancelled) {
          setCloudRoomCode(found.id);
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'rooms');
      }

      if (!cancelled) {
        setCloudDiscoveryDone(true);
        setSyncStatus('connected');
      }
    }

    void bootstrapUser();
    return () => {
      cancelled = true;
    };
  }, [authReady, user]);

  // Real-time onSnapshot listener on active room metadata
  useEffect(() => {
    if (!authReady || !user || !cloudRoomCode) return;
    const roomPath = `rooms/${cloudRoomCode}`;
    const unsub = onSnapshot(
      doc(db, 'rooms', cloudRoomCode),
      (snap) => {
        if (!snap.exists()) {
          setRoomMeta(null);
          setCloudRoomCode('');
          return;
        }
        setRoomMeta(snap.data() as RoomMetaDoc);
        setSyncStatus('connected');
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, roomPath);
      }
    );
    return () => unsub();
  }, [authReady, user, cloudRoomCode]);

  // Real-time onSnapshot listener on MY OWN member progress document
  useEffect(() => {
    if (!authReady || !user || !cloudRoomCode) return;
    const memberPath = `rooms/${cloudRoomCode}/members/${user.uid}`;
    const unsub = onSnapshot(
      doc(db, 'rooms', cloudRoomCode, 'members', user.uid),
      (snap) => {
        if (snap.exists()) {
          setMyMember(snap.data() as MemberDocPayload);
        } else {
          setMyMember(null);
        }
        setSyncStatus('connected');
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, memberPath);
      }
    );
    return () => unsub();
  }, [authReady, user, cloudRoomCode]);

  // Real-time onSnapshot listener on OPPONENT'S member progress document (Read-Only for competition)
  const opponentUid = useMemo(() => {
    if (!user || !roomMeta) return '';
    if (roomMeta.player1Uid === user.uid) return roomMeta.player2Uid;
    if (roomMeta.player2Uid === user.uid) return roomMeta.player1Uid;
    return '';
  }, [user, roomMeta]);

  useEffect(() => {
    if (!authReady || !user || !cloudRoomCode || !opponentUid) {
      setOpponentMember(null);
      return;
    }
    const oppPath = `rooms/${cloudRoomCode}/members/${opponentUid}`;
    const unsub = onSnapshot(
      doc(db, 'rooms', cloudRoomCode, 'members', opponentUid),
      (snap) => {
        if (snap.exists()) {
          setOpponentMember(snap.data() as MemberDocPayload);
        } else {
          setOpponentMember(null);
        }
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, oppPath);
      }
    );
    return () => unsub();
  }, [authReady, user, cloudRoomCode, opponentUid]);

  // Derive unified ChallengeRoom view for UI components
  const isCloudConnected = Boolean(user && cloudRoomCode && roomMeta && myMember);
  const myRole: 'player1' | 'player2' =
    isCloudConnected && myMember ? myMember.role : 'player1';

  const room: ChallengeRoom = useMemo(() => {
    if (!isCloudConnected || !roomMeta || !myMember) {
      return localRoom;
    }

    const myProgress = memberToPlayer(myMember);
    const oppFallbackName =
      myMember.role === 'player1'
        ? roomMeta.player2Name || 'سعيد'
        : roomMeta.player1Name || 'فاروق';
    const oppProgress = opponentMember
      ? memberToPlayer(opponentMember)
      : createInitialPlayer(myMember.role === 'player1' ? 'player2' : 'player1', oppFallbackName);

    const player1 = myMember.role === 'player1' ? myProgress : oppProgress;
    const player2 = myMember.role === 'player2' ? myProgress : oppProgress;

    const mergedDuels = [
      ...(myMember.recentDuels ?? []),
      ...(opponentMember?.recentDuels ?? []),
    ]
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, 20);

    const mergedActivities = [
      ...(myMember.recentActivities ?? []),
      ...(opponentMember?.recentActivities ?? []),
    ]
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, 30);

    return {
      code: roomMeta.code,
      createdAt: new Date().toISOString(),
      player1Uid: roomMeta.player1Uid,
      player2Uid: roomMeta.player2Uid,
      players: { player1, player2 },
      duelHistory: mergedDuels,
      activityLog: mergedActivities,
    };
  }, [isCloudConnected, roomMeta, myMember, opponentMember, localRoom]);

  const activePlayer = room.players[myRole];
  const opponentPlayer = room.players[myRole === 'player1' ? 'player2' : 'player1'];

  // Sign-In / Sign-Out
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
    setCloudRoomCode('');
    setRoomMeta(null);
    setMyMember(null);
    setOpponentMember(null);
  }, []);

  // Helper to persist MY OWN member state to Firestore (never touches opponent!)
  const saveMyCloudUpdate = useCallback(
    async (
      nextPlayer: PlayerProgress,
      newActivity?: ActivityEntry,
      newDuel?: DuelRecord
    ) => {
      if (!user || !cloudRoomCode || !myMember) return;
      setSyncStatus('syncing');
      const nextActivities = newActivity
        ? [newActivity, ...(myMember.recentActivities ?? [])].slice(0, 25)
        : myMember.recentActivities ?? [];
      const nextDuels = newDuel
        ? [newDuel, ...(myMember.recentDuels ?? [])].slice(0, 15)
        : myMember.recentDuels ?? [];

      const payload = buildMemberPayload(
        user.uid,
        cloudRoomCode,
        myMember.role,
        nextPlayer,
        nextDuels,
        nextActivities
      );

      // Optimistic local state
      setMyMember(payload);

      const memberPath = `rooms/${cloudRoomCode}/members/${user.uid}`;
      try {
        await setDoc(doc(db, 'rooms', cloudRoomCode, 'members', user.uid), {
          ...payload,
          updatedAt: serverTimestamp(),
        });
        setSyncStatus('connected');
      } catch (err) {
        setSyncStatus('error');
        handleFirestoreError(err, OperationType.WRITE, memberPath);
      }
    },
    [user, cloudRoomCode, myMember]
  );

  // Create a new cloud competition room (or local fallback if not signed in)
  const createRoom = useCallback(
    async (customCode?: string, myDisplayName?: string, friendName?: string) => {
      if (!user) {
        setSyncError('سجّل دخولك بحساب Google أولاً لإنشاء غرفة سحابية.');
        return null;
      }

      setSyncStatus('syncing');
      setSyncError(null);

      const code = normalizeRoomCode(
        customCode && customCode.trim().length >= 3
          ? customCode
          : `BAC-${Math.floor(1000 + Math.random() * 9000)}`
      );
      if (code.length < 3) {
        setSyncError('رمز الغرفة يجب أن يكون 3 أحرف أو أرقام على الأقل.');
        setSyncStatus('error');
        return null;
      }

      const p1Name = sanitizeName(myDisplayName || user.displayName, 'فاروق');
      const p2Name = sanitizeName(friendName, 'سعيد');
      const roomRef = doc(db, 'rooms', code);

      try {
        const existingSnap = await getDoc(roomRef);
        if (existingSnap.exists()) {
          setSyncError('هذا الرمز مستخدم بالفعل، اختر رمزاً آخر أو انضم إليه.');
          setSyncStatus('error');
          return null;
        }

        await setDoc(roomRef, {
          code,
          ownerId: user.uid,
          player1Uid: user.uid,
          player1Name: p1Name,
          player2Uid: '',
          player2Name: p2Name,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        // Preserve any local work Farouk did before signing in if starting fresh
        const baseProgress =
          localRoom.players.player1.xp > 0
            ? { ...localRoom.players.player1, id: 'player1' as const, name: p1Name }
            : createInitialPlayer('player1', p1Name);

        const initActivity: ActivityEntry = {
          id: `act-${Date.now()}`,
          playerId: 'player1',
          playerName: p1Name,
          message: `أنشأ ${p1Name} غرفة المنافسة (${code}) بحسابه الخاص`,
          xpDelta: 0,
          timestamp: new Date().toISOString(),
        };

        const memberPayload = buildMemberPayload(
          user.uid,
          code,
          'player1',
          baseProgress,
          localRoom.duelHistory.filter((d) => d.playerId === 'player1').slice(0, 15),
          [initActivity]
        );

        await setDoc(doc(db, 'rooms', code, 'members', user.uid), {
          ...memberPayload,
          updatedAt: serverTimestamp(),
        });

        setCloudRoomCode(code);
        setSyncStatus('connected');
        return code;
      } catch (err) {
        setSyncStatus('error');
        handleFirestoreError(err, OperationType.CREATE, `rooms/${code}`);
      }
    },
    [user, localRoom]
  );

  // Join an existing cloud competition room by code (claims open player2 slot or rejoins own slot)
  const joinRoom = useCallback(
    async (rawCode: string, myDisplayName?: string) => {
      if (!user) {
        setSyncError('سجّل دخولك بحساب Google أولاً للانضمام للغرفة.');
        return false;
      }

      const code = normalizeRoomCode(rawCode);
      if (code.length < 3) {
        setSyncError('أدخل رمز غرفة صحيح (3 أحرف على الأقل).');
        return false;
      }

      setSyncStatus('syncing');
      setSyncError(null);
      const roomRef = doc(db, 'rooms', code);

      try {
        const snap = await getDoc(roomRef);
        if (!snap.exists()) {
          setSyncError('لم يتم العثور على غرفة بهذا الرمز.');
          setSyncStatus('error');
          return false;
        }

        const meta = snap.data() as RoomMetaDoc;
        if (meta.player1Uid === user.uid || meta.player2Uid === user.uid) {
          setCloudRoomCode(code);
          setSyncStatus('connected');
          return true;
        }

        if (meta.player2Uid !== '') {
          setSyncError('هذه الغرفة مكتملة بالفعل (تضم لاعبين اثنين).');
          setSyncStatus('error');
          return false;
        }

        const p2Name = sanitizeName(myDisplayName || user.displayName, 'سعيد');
        await updateDoc(roomRef, {
          player2Uid: user.uid,
          player2Name: p2Name,
          updatedAt: serverTimestamp(),
        });

        const initPlayer = createInitialPlayer('player2', p2Name);
        const initActivity: ActivityEntry = {
          id: `act-${Date.now()}`,
          playerId: 'player2',
          playerName: p2Name,
          message: `انضم ${p2Name} إلى الغرفة بحسابه الخاص`,
          xpDelta: 0,
          timestamp: new Date().toISOString(),
        };

        await setDoc(doc(db, 'rooms', code, 'members', user.uid), {
          ...buildMemberPayload(user.uid, code, 'player2', initPlayer, [], [initActivity]),
          updatedAt: serverTimestamp(),
        });

        setCloudRoomCode(code);
        setSyncStatus('connected');
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (msg.includes('permission') || msg.includes('PERMISSION_DENIED')) {
          setSyncError('الغرفة غير متاحة أو مكتملة بالفعل.');
          setSyncStatus('error');
          return false;
        }
        setSyncStatus('error');
        handleFirestoreError(err, OperationType.WRITE, `rooms/${code}`);
      }
    },
    [user]
  );

  const leaveRoom = useCallback(async () => {
    if (user && cloudRoomCode && roomMeta && roomMeta.player2Uid === user.uid) {
      try {
        await updateDoc(doc(db, 'rooms', cloudRoomCode), {
          player2Uid: '',
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `rooms/${cloudRoomCode}`);
      }
    }
    setCloudRoomCode('');
    setRoomMeta(null);
    setMyMember(null);
    setOpponentMember(null);
    setSyncStatus(user ? 'connected' : 'local');
    setSyncError(null);
  }, [user, cloudRoomCode, roomMeta]);

  const renameMyAccount = useCallback(
    async (newName: string) => {
      const cleaned = sanitizeName(newName, myRole === 'player1' ? 'فاروق' : 'سعيد');
      if (!isCloudConnected || !user || !roomMeta || !myMember) {
        setLocalRoom((prev) => ({
          ...prev,
          players: {
            ...prev.players,
            player1: { ...prev.players.player1, name: cleaned },
          },
        }));
        return;
      }

      const nextPlayer: PlayerProgress = { ...memberToPlayer(myMember), name: cleaned };
      await saveMyCloudUpdate(nextPlayer);

      const nameField = myMember.role === 'player1' ? 'player1Name' : 'player2Name';
      try {
        await updateDoc(doc(db, 'rooms', roomMeta.code), {
          [nameField]: cleaned,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `rooms/${roomMeta.code}`);
      }
    },
    [isCloudConnected, user, roomMeta, myMember, myRole, saveMyCloudUpdate]
  );

  // Helper to apply mutation to MY OWN progress (either Cloud or Local)
  const applyMyMutation = useCallback(
    (
      mutator: (current: PlayerProgress) => {
        player: PlayerProgress;
        activity?: ActivityEntry;
        duel?: DuelRecord;
      }
    ) => {
      if (isCloudConnected && myMember) {
        const current = memberToPlayer(myMember);
        const result = mutator(current);
        void saveMyCloudUpdate(result.player, result.activity, result.duel);
      } else {
        setLocalRoom((prev) => {
          const current = prev.players.player1;
          const result = mutator(current);
          return {
            ...prev,
            players: {
              ...prev.players,
              player1: result.player,
            },
            duelHistory: result.duel
              ? [result.duel, ...prev.duelHistory].slice(0, 25)
              : prev.duelHistory,
            activityLog: result.activity
              ? [result.activity, ...prev.activityLog].slice(0, 40)
              : prev.activityLog,
          };
        });
      }
    },
    [isCloudConnected, myMember, saveMyCloudUpdate]
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

  const resetMyAccount = useCallback(async () => {
    const cleanName = activePlayer.name;
    const resetPlayer = createInitialPlayer(myRole, cleanName);
    const resetActivity: ActivityEntry = {
      id: `act-${Date.now()}`,
      playerId: myRole,
      playerName: cleanName,
      message: `أعاد ${cleanName} حسابه إلى 0 نقطة وبداية جديدة`,
      xpDelta: 0,
      timestamp: new Date().toISOString(),
    };

    if (isCloudConnected && user && cloudRoomCode && myMember) {
      setSyncStatus('syncing');
      const payload = buildMemberPayload(
        user.uid,
        cloudRoomCode,
        myMember.role,
        resetPlayer,
        [],
        [resetActivity]
      );
      setMyMember(payload);
      const memberPath = `rooms/${cloudRoomCode}/members/${user.uid}`;
      try {
        await setDoc(doc(db, 'rooms', cloudRoomCode, 'members', user.uid), {
          ...payload,
          updatedAt: serverTimestamp(),
        });
        setSyncStatus('connected');
      } catch (err) {
        setSyncStatus('error');
        handleFirestoreError(err, OperationType.WRITE, memberPath);
      }
      return;
    }

    setLocalRoom((prev) => ({
      ...prev,
      players: {
        ...prev.players,
        player1: createInitialPlayer('player1', prev.players.player1.name),
      },
      duelHistory: prev.duelHistory.filter((d) => d.playerId !== 'player1'),
      activityLog: [resetActivity],
    }));
  }, [activePlayer.name, myRole, isCloudConnected, user, cloudRoomCode, myMember]);

  return {
    user,
    authReady,
    authBusy,
    cloudDiscoveryDone,
    isCloudConnected,
    hasOpponentJoined: Boolean(opponentUid),
    room,
    activePlayerId: myRole,
    activePlayer,
    opponentPlayer,
    syncStatus,
    syncError,
    signInWithGoogle,
    signOutUser,
    createRoom,
    joinRoom,
    leaveRoom,
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
