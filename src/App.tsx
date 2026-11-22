import { useState } from 'react';
import { CompetitionArenaView } from './components/CompetitionArenaView';
import { DailyScheduleView } from './components/DailyScheduleView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { MorningMemorizationView } from './components/MorningMemorizationView';
import { SubjectsSpacedView } from './components/SubjectsSpacedView';
import { TopBar, type ActiveTab } from './components/TopBar';
import { useStudyRoom } from './hooks/useStudyRoom';
import type { SubjectId } from './types/study';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('schedule');
  const [morningDate, setMorningDate] = useState<string>('2026-11-23');
  const [focusedSubject, setFocusedSubject] = useState<'all' | SubjectId>('all');
  const [focusedLessonId, setFocusedLessonId] = useState<string | null>(null);

  const {
    user,
    authBusy,
    isCloudConnected,
    hasOpponentJoined,
    room,
    activePlayerId,
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
  } = useStudyRoom();

  const handleOpenMorningPacket = (date: string) => {
    setMorningDate(date === '2026-12-06' ? '2026-12-05' : date);
    setActiveTab('morning');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleStartQuickDuel = () => {
    setActiveTab('arena');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenSubjectMastery = (subjectId: SubjectId, lessonId?: string) => {
    setFocusedSubject(subjectId);
    setFocusedLessonId(lessonId ?? null);
    setActiveTab('subjects');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <ErrorBoundary>
      <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
        <TopBar
          activeTab={activeTab}
          onSelectTab={(tab) => {
            setActiveTab(tab);
            if (tab === 'subjects') {
              setFocusedLessonId(null);
            }
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          onStartQuickDuel={handleStartQuickDuel}
        />

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6">
          {activeTab === 'schedule' && (
            <DailyScheduleView
              activePlayer={activePlayer}
              opponentPlayer={opponentPlayer}
              isSignedIn={Boolean(user)}
              isCloudConnected={isCloudConnected}
              hasOpponentJoined={hasOpponentJoined}
              authBusy={authBusy}
              onSignIn={() => void signInWithGoogle()}
              onToggleBlock={toggleScheduleBlock}
              onReviewLesson={reviewLessonWithQuality}
              onOpenMorningPacket={handleOpenMorningPacket}
              onOpenArena={handleStartQuickDuel}
              onOpenSubjectMastery={handleOpenSubjectMastery}
              onResetMyAccount={resetMyAccount}
            />
          )}

          {activeTab === 'subjects' && (
            <SubjectsSpacedView
              activePlayer={activePlayer}
              opponentPlayer={opponentPlayer}
              initialSubject={focusedSubject}
              initialExpandedLessonId={focusedLessonId}
              onToggleStage={toggleLessonStage}
              onReviewLesson={reviewLessonWithQuality}
              onToggleExercise={toggleScientificExercise}
            />
          )}

          {activeTab === 'morning' && (
            <MorningMemorizationView
              activePlayer={activePlayer}
              opponentPlayer={opponentPlayer}
              selectedDate={morningDate}
              onSelectDate={setMorningDate}
              onTogglePacket={toggleMorningPacket}
              onToggleCard={toggleMasteredCard}
              onReviewCard={reviewCardWithQuality}
            />
          )}

          {activeTab === 'arena' && (
            <CompetitionArenaView
              room={room}
              activePlayerId={activePlayerId}
              isSignedIn={Boolean(user)}
              userEmail={user?.email ?? null}
              authBusy={authBusy}
              isCloudConnected={isCloudConnected}
              hasOpponentJoined={hasOpponentJoined}
              syncStatus={syncStatus}
              syncError={syncError}
              onSignIn={signInWithGoogle}
              onSignOut={signOutUser}
              onCreateRoom={createRoom}
              onJoinRoom={joinRoom}
              onLeaveRoom={leaveRoom}
              onRenameMyAccount={renameMyAccount}
              onResetMyAccount={resetMyAccount}
              onSubmitDuel={submitDuelResult}
            />
          )}
        </main>

        <footer className="border-t border-slate-800 bg-slate-900">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-3 text-xs text-slate-400 sm:px-6">
            <span>برنامج 3 ثانوي علوم تجريبية · 23 نوفمبر – 6 ديسمبر</span>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => setActiveTab('schedule')}
                className="hover:text-slate-100 cursor-pointer"
              >
                الجدول اليومي
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('subjects')}
                className="hover:text-slate-100 cursor-pointer"
              >
                الدروس والتذكير
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('morning')}
                className="hover:text-slate-100 cursor-pointer"
              >
                حفظ الصباح
              </button>
            </div>
          </div>
        </footer>
      </div>
    </ErrorBoundary>
  );
}
