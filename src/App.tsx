import React, { useEffect, useState } from 'react';
import { Clock, Calendar, History, Target, Trophy, Settings, Flame } from 'lucide-react';
import { appCore } from './core';
import type { SessionEvaluationResult } from './core/gamification';
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

  useEffect(() => {
    let isMounted = true;

    appCore.initialize().then(() => {
      if (isMounted) {
        setIsReady(true);
        const state = appCore.gamification.getState();
        setStreakCount(state.currentStreak);
        setCurrentLevel(state.level);
      }
    });

    const unsubGame = appCore.gamification.subscribe(() => {
      const state = appCore.gamification.getState();
      setStreakCount(state.currentStreak);
      setCurrentLevel(state.level);
    });

    const unsubCelebration = appCore.gamification.onCelebration((result) => {
      setCelebration(result);
    });

    return () => {
      isMounted = false;
      unsubGame();
      unsubCelebration();
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
    <div className="min-h-screen bg-[#06090e] text-slate-100 flex flex-col selection:bg-indigo-500 selection:text-white">
      {/* Top Header Navbar */}
      <header className="sticky top-0 z-30 glass-panel border-b border-white/5 px-4 sm:px-8 py-3.5 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          {/* Brand Logo */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setActiveTab('timer')}>
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/25">
              <Clock className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-base tracking-tight text-white">QuestTime</span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  PWA
                </span>
              </div>
              <span className="text-[11px] text-slate-400 block -mt-0.5">Focus & Gamified Targets</span>
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
                  className={`relative flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                  {item.badge && (
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                        isActive ? 'bg-indigo-700 text-indigo-200' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Streak & Level header chip */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('progress')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-orange-500/40 text-xs font-semibold transition"
            >
              <Flame className="w-4 h-4 text-orange-400 fill-current" />
              <span className="text-white font-mono">{streakCount}d</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 pb-24 md:pb-10">
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

      {/* Mobile Bottom Navigation Bar (for Android Chrome / mobile viewports) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 glass-panel border-t border-white/10 px-1.5 py-1.5 backdrop-blur-2xl">
        <div className="flex items-center justify-around">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`relative flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all ${
                  isActive ? 'text-indigo-400 font-bold scale-105' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="text-[9px] mt-0.5 tracking-tight">{item.label}</span>
                {isActive && (
                  <span className="absolute -bottom-0.5 w-1 h-1 rounded-full bg-indigo-400" />
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Celebration Modal (Confetti + XP + Badges) */}
      <CelebrationModal celebration={celebration} onClose={() => setCelebration(null)} />

      {/* PWA Install Notification Prompt */}
      <PwaInstallPrompt />
    </div>
  );
};

export default App;
