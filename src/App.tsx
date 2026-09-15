import React, { useEffect, useState } from 'react';
import { Clock, Calendar, History, Target, Trophy, Settings, Flame, Cloud, RefreshCw, Eye, ShoppingBag } from 'lucide-react';
import { appCore } from './core';
import type { SessionEvaluationResult } from './core/gamification';
import type { SyncStatus } from './core/sync';
import { TimerView } from './ui/views/TimerView';
import { DailyCalendarView } from './ui/views/DailyCalendarView';
import { HistoryView } from './ui/views/HistoryView';
import { TargetsView } from './ui/views/TargetsView';
import { ProgressView } from './ui/views/ProgressView';
import { SettingsView } from './ui/views/SettingsView';
import { CelebrationModal } from './ui/components/CelebrationModal';
import { PwaInstallPrompt } from './ui/components/PwaInstallPrompt';

type Tab = 'timer' | 'calendar' | 'targets' | 'progress' | 'history' | 'settings';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('timer');
  const [isReady, setIsReady] = useState<boolean>(false);
  const [celebration, setCelebration] = useState<SessionEvaluationResult | null>(null);
  const [streakCount, setStreakCount] = useState<number>(0);
  const [currentLevel, setCurrentLevel] = useState<number>(0);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(appCore.sync.getStatus());
  const [activeCosmetic, setActiveCosmetic] = useState(appCore.gamification.getActiveOrTrialCosmetic());
  const [trialCosmeticId, setTrialCosmeticId] = useState<string | null>(appCore.gamification.getTrialCosmeticId());
  const [mood, setMood] = useState(
    appCore.moodEngine.getMood(0, appCore.timer.getState() === 'running')
  );

  useEffect(() => {
    let isMounted = true;

    const updateMood = () => {
      if (!isMounted) return;
      const state = appCore.gamification.getState();
      const isRunning = appCore.timer.getState() === 'running';
      setMood(appCore.moodEngine.getMood(state.currentStreak, isRunning));
    };

    appCore.initialize().then(() => {
      if (isMounted) {
        setIsReady(true);
        const state = appCore.gamification.getState();
        setStreakCount(state.currentStreak);
        setCurrentLevel(state.level);
        setActiveCosmetic(appCore.gamification.getActiveOrTrialCosmetic());
        setTrialCosmeticId(appCore.gamification.getTrialCosmeticId());
        updateMood();
      }
    });

    const unsubGame = appCore.gamification.subscribe(() => {
      const state = appCore.gamification.getState();
      setStreakCount(state.currentStreak);
      setCurrentLevel(state.level);
      setActiveCosmetic(appCore.gamification.getActiveOrTrialCosmetic());
      setTrialCosmeticId(appCore.gamification.getTrialCosmeticId());
      updateMood();
    });

    const unsubTimer = appCore.timer.onStateChange(() => {
      updateMood();
    });

    const unsubMood = appCore.moodEngine.subscribe(() => {
      updateMood();
    });

    const unsubCelebration = appCore.gamification.onCelebration((result) => {
      setCelebration(result);
    });

    const unsubSync = appCore.sync.subscribe((status) => {
      setSyncStatus(status);
    });

    return () => {
      isMounted = false;
      unsubGame();
      unsubTimer();
      unsubMood();
      unsubCelebration();
      unsubSync();
    };
  }, []);

  if (!isReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#06090e] text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center animate-pulse shadow-lg shadow-indigo-500/25">
            <Clock className="w-6 h-6 text-white" />
          </div>
          <p className="text-sm text-slate-400 font-medium">Loading QuestTime...</p>
        </div>
      </div>
    );
  }

  interface NavItem {
    id: Tab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: string;
  }

  const navItems: NavItem[] = [
    { id: 'timer', label: 'Timer', icon: Clock },
    { id: 'calendar', label: 'Calendar', icon: Calendar },
    { id: 'targets', label: 'Targets', icon: Target },
    { id: 'progress', label: 'Progress', icon: Trophy, badge: `Lvl ${currentLevel}` },
    { id: 'history', label: 'History', icon: History },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div 
      className={`min-h-screen text-slate-100 flex flex-col selection:bg-indigo-500 selection:text-white relative transition-all duration-700 mood-${mood.tier}`}
      style={{
        background: appCore.moodEngine.isEnabled() ? mood.bgGradient : '#06090e',
        '--theme-accent': activeCosmetic.accentColor,
        '--theme-glow': activeCosmetic.glowColor,
        '--mood-accent': mood.accentColor,
        '--mood-glow': mood.glowColor,
      } as React.CSSProperties}
    >
      {/* Smooth GPU fixed background */}
      <div className="fixed-bg-aura" />

      {/* Dynamic ambient backdrop aura based on active cosmetic theme and mood */}
      <div 
        className="fixed inset-0 pointer-events-none opacity-25 transition-all duration-700 z-0"
        style={{
          background: `radial-gradient(circle at 15% 15%, ${activeCosmetic.glowColor} 0%, transparent 45%), radial-gradient(circle at 85% 85%, ${mood.glowColor} 0%, transparent 45%)`,
        }}
      />

      {/* Top Header Navbar */}
      <header className="sticky top-0 z-30 glass-panel border-b border-white/5 px-3.5 sm:px-8 py-2.5 sm:py-3.5 pt-safe backdrop-blur-xl">
        <div className="max-w-5xl mx-auto flex items-center justify-between relative z-10">
          {/* Brand Logo */}
          <div className="flex items-center gap-2.5 sm:gap-3 cursor-pointer select-none" onClick={() => setActiveTab('timer')}>
            <div 
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl flex items-center justify-center shadow-lg shrink-0 transition-all duration-500"
              style={{
                background: `linear-gradient(135deg, ${activeCosmetic.accentColor}, #4f46e5)`,
                boxShadow: `0 4px 16px ${activeCosmetic.glowColor}`,
              }}
            >
              <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="font-extrabold text-sm sm:text-base tracking-tight text-white">QuestTime</span>
                <span 
                  className="text-[9px] sm:text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded border transition-colors duration-300"
                  style={{
                    backgroundColor: `${activeCosmetic.accentColor}20`,
                    color: activeCosmetic.accentColor,
                    borderColor: `${activeCosmetic.accentColor}40`,
                  }}
                >
                  PWA
                </span>
              </div>
              <span className="text-[10px] sm:text-[11px] text-slate-400 hidden sm:block -mt-0.5">Focus & Gamified Targets</span>
            </div>
          </div>

          {/* Desktop Navigation Tabs */}
          <nav className="hidden md:flex items-center gap-1 bg-slate-900/80 p-1 rounded-2xl border border-white/5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  style={{
                    backgroundColor: isActive ? activeCosmetic.accentColor : undefined,
                    boxShadow: isActive ? `0 2px 12px ${activeCosmetic.glowColor}` : undefined,
                  }}
                  className={`relative flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all duration-200 ${
                    isActive
                      ? 'text-white shadow-md'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                  {item.badge && (
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                        isActive ? 'bg-black/25 text-white' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Streak & Sync Status header chips */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Synced / Queued Indicator */}
            <button
              onClick={() => setActiveTab('settings')}
              title={
                syncStatus.isSyncing
                  ? 'Syncing changes with cloud...'
                  : syncStatus.pendingCount > 0
                  ? `${syncStatus.pendingCount} changes queued offline`
                  : syncStatus.lastSyncedAt
                  ? `All synced (last: ${new Date(syncStatus.lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`
                  : 'Cloud sync idle'
              }
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs font-semibold transition shrink-0 select-none active:scale-95"
            >
              {syncStatus.isSyncing ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
                  <span className="text-[11px] text-indigo-300 hidden sm:inline">Syncing</span>
                </>
              ) : syncStatus.pendingCount > 0 ? (
                <>
                  <Cloud className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-[11px] text-amber-300 font-mono font-bold">{syncStatus.pendingCount}</span>
                  <span className="text-[11px] text-amber-300 hidden sm:inline">queued</span>
                </>
              ) : (
                <>
                  <Cloud className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-[11px] text-emerald-400/90 hidden sm:inline">Synced</span>
                </>
              )}
            </button>

            <button
              onClick={() => setActiveTab('progress')}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-orange-500/40 text-xs font-semibold transition shrink-0"
              title="Daily Streak"
            >
              <Flame className="w-4 h-4 text-orange-400 fill-current" />
              <span className="text-white font-mono">{streakCount}d</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 pb-28 sm:pb-24 md:pb-10">
        {activeTab === 'timer' && (
          <TimerView onNavigateToCalendar={() => setActiveTab('calendar')} />
        )}
        {activeTab === 'calendar' && (
          <DailyCalendarView onSwitchToTimer={() => setActiveTab('timer')} />
        )}
        {activeTab === 'targets' && <TargetsView />}
        {activeTab === 'progress' && <ProgressView />}
        {activeTab === 'history' && <HistoryView />}
        {activeTab === 'settings' && <SettingsView />}
      </main>

      {/* Mobile Bottom Navigation Bar (Optimized for touch & safe areas) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-[#070b14]/92 border-t border-white/10 px-1 pt-1 pb-safe backdrop-blur-2xl shadow-2xl">
        <div className="grid grid-cols-6 items-center max-w-md mx-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                style={{
                  color: isActive ? activeCosmetic.accentColor : undefined,
                  backgroundColor: isActive ? `${activeCosmetic.accentColor}18` : undefined,
                }}
                className={`relative flex flex-col items-center justify-center py-1.5 px-0.5 rounded-xl transition-colors duration-150 min-h-[46px] select-none active:scale-95 ${
                  isActive
                    ? 'font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className={`w-4 h-4 transition-transform ${isActive ? 'scale-110' : ''}`} />
                <span className="text-[10px] mt-1 tracking-tight leading-none truncate max-w-full font-medium">
                  {item.label}
                </span>
                {isActive && (
                  <span 
                    className="absolute bottom-1 w-1 h-1 rounded-full transition-colors duration-300"
                    style={{ backgroundColor: activeCosmetic.accentColor }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* PUBG-Style Floating Live Trial Banner */}
      {trialCosmeticId && (
        <div
          className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2.5 sm:gap-3 px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-2xl bg-slate-950/95 border shadow-2xl backdrop-blur-2xl animate-fade-in max-w-[92vw]"
          style={{
            borderColor: activeCosmetic.accentColor,
            boxShadow: `0 0 35px ${activeCosmetic.glowColor}`,
          }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Eye className="w-4 h-4 shrink-0 animate-pulse" style={{ color: activeCosmetic.accentColor }} />
            <div className="text-xs truncate">
              <span className="text-slate-400 font-medium hidden xs:inline">Live Trial: </span>
              <strong className="text-white font-bold">{activeCosmetic.name}</strong>
              {activeCosmetic.costXP > 0 && (
                <span className="hidden sm:inline text-slate-400 text-[11px] ml-2 font-mono">
                  ({Math.max(0, activeCosmetic.costXP - appCore.gamification.getState().xp)} XP to unlock)
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => setActiveTab('progress')}
              className="px-2.5 py-1 text-xs font-bold rounded-xl text-white shadow-sm transition active:scale-95 flex items-center gap-1"
              style={{
                backgroundColor: activeCosmetic.accentColor,
                boxShadow: `0 2px 10px ${activeCosmetic.glowColor}`,
              }}
            >
              <ShoppingBag className="w-3 h-3" />
              <span>Unlock</span>
            </button>
            <button
              onClick={() => appCore.gamification.stopTrial()}
              className="px-2 py-1 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition active:scale-95"
            >
              End
            </button>
          </div>
        </div>
      )}

      {/* Celebration Modal (Confetti + XP + Badges) */}
      <CelebrationModal celebration={celebration} onClose={() => setCelebration(null)} />

      {/* PWA Install Notification Prompt */}
      <PwaInstallPrompt />
    </div>
  );
};

export default App;
