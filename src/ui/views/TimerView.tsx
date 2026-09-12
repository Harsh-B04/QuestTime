import React, { useEffect, useState } from 'react';
import {
  Play,
  Pause,
  Square,
  RotateCcw,
  Flame,
  CheckCircle2,
  Target,
  Sparkles,
  Calendar,
  ArrowRight,
} from 'lucide-react';
import { appCore } from '../../core';
import type { Category, Session } from '../../core';
import { CategoryIcon } from '../components/CategoryIcon';
import { sounds } from '../utils/sound';

interface TimerViewProps {
  onSessionLogged?: (session: Session) => void;
  onNavigateToCalendar?: () => void;
}

export const TimerView: React.FC<TimerViewProps> = ({ onSessionLogged, onNavigateToCalendar }) => {
  const [categories, setCategories] = useState<Category[]>(appCore.categories);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(
    appCore.categories[0]?.id || ''
  );
  const [timerStatus, setTimerStatus] = useState<'idle' | 'running' | 'paused'>(
    appCore.timer.getState()
  );
  const [elapsedSec, setElapsedSec] = useState<number>(appCore.timer.getElapsedSec());
  const [note, setNote] = useState<string>(appCore.timer.getNote());
  const [todayLoggedSec, setTodayLoggedSec] = useState<number>(0);
  const [todayCategorySec, setTodayCategorySec] = useState<number>(0);
  const [activeTargetHours, setActiveTargetHours] = useState<number>(0);
  const [dailyGoalHours, setDailyGoalHours] = useState<number | null>(null); // null = not yet set by user
  const [showDiscardConfirm, setShowDiscardConfirm] = useState<boolean>(false);

  // Sync state with AppCore
  const refreshStats = () => {
    const today = new Date();
    const totalToday = appCore.sessionLog.getTotalForDay(today);
    setTodayLoggedSec(totalToday);

    const activeCatId = appCore.timer.getCategoryId() || selectedCategoryId;
    if (activeCatId) {
      const catToday = appCore.sessionLog.getTotalForDayAndCategory(today, activeCatId);
      setTodayCategorySec(catToday);

      const target = appCore.targetTracker.getTargetForCategory(activeCatId);
      setActiveTargetHours(target ? target.targetHours : 0);
    }
  };

  useEffect(() => {
    setCategories([...appCore.categories]);
    if (!selectedCategoryId && appCore.categories.length > 0) {
      setSelectedCategoryId(appCore.categories[0].id);
    }

    appCore.storage.getSetting<number>('daily_goal_hours').then((goal) => {
      // Only set if user has explicitly saved a goal (null means never set)
      if (goal !== null && goal !== undefined && goal > 0) {
        setDailyGoalHours(goal);
      } else {
        setDailyGoalHours(null);
      }
    });

    const unsubTimerState = appCore.timer.onStateChange((status) => {
      setTimerStatus(status);
      const activeCat = appCore.timer.getCategoryId();
      if (activeCat) {
        setSelectedCategoryId(activeCat);
      }
      setNote(appCore.timer.getNote());
      refreshStats();
    });

    const unsubTimerTick = appCore.timer.onTick((sec) => {
      setElapsedSec(sec);
    });

    const unsubCategories = appCore.onCategoriesChange(() => {
      setCategories([...appCore.categories]);
      refreshStats();
    });

    const unsubLog = appCore.sessionLog.subscribe(() => {
      refreshStats();
    });

    const unsubTargets = appCore.targetTracker.subscribe(() => {
      refreshStats();
    });

    refreshStats();

    return () => {
      unsubTimerState();
      unsubTimerTick();
      unsubCategories();
      unsubLog();
      unsubTargets();
    };
  }, [selectedCategoryId]);

  const activeCategory = categories.find((c) => c.id === selectedCategoryId) || categories[0];

  const handleStart = () => {
    if (!selectedCategoryId && categories.length > 0) {
      setSelectedCategoryId(categories[0].id);
    }
    const catId = selectedCategoryId || (categories[0]?.id ?? '');
    sounds.playStart();
    appCore.timer.start(catId, note);
  };

  const handlePause = () => {
    appCore.timer.pause();
  };

  const handleResume = () => {
    sounds.playStart();
    appCore.timer.resume();
  };

  const handleStop = async () => {
    sounds.playStop();
    const session = appCore.timer.stop();
    if (session && session.durationSec > 0) {
      await appCore.sessionLog.add(session);
      await appCore.sync.queueChange('sessions', 'INSERT', session.toDTO());
      const result = await appCore.gamification.evaluateSession(
        session,
        appCore.sessionLog,
        appCore.targetTracker
      );
      if (result.leveledUp) {
        sounds.playLevelUp();
      }
      if (onSessionLogged) {
        onSessionLogged(session);
      }
    }
    setNote('');
    refreshStats();
  };

  const handleDiscard = () => {
    appCore.timer.discard();
    setNote('');
    setShowDiscardConfirm(false);
    refreshStats();
  };

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    const pad = (n: number) => String(n).padStart(2, '0');
    return {
      hours: pad(hrs),
      minutes: pad(mins),
      seconds: pad(secs),
    };
  };

  const time = formatTime(elapsedSec);
  const gameState = appCore.gamification.getState();

  // Daily quest metrics
  const todayDoneHours = Number((todayLoggedSec / 3600).toFixed(1));
  const dailyGoalIsSet = dailyGoalHours !== null && dailyGoalHours > 0;
  const todayTargetSec = dailyGoalIsSet ? dailyGoalHours! * 3600 : 0;
  const todayLeftSec = dailyGoalIsSet ? Math.max(0, todayTargetSec - todayLoggedSec) : 0;
  const todayLeftHours = Number((todayLeftSec / 3600).toFixed(1));
  const todayProgressPct = dailyGoalIsSet
    ? Math.min(100, Math.round((todayLoggedSec / todayTargetSec) * 100))
    : 0;
  const isTodayGoalMet = dailyGoalIsSet && todayLoggedSec >= todayTargetSec;

  // Circular progress for timer (loops every 60 minutes)
  const minuteProgress = ((elapsedSec % 3600) / 3600) * 100;
  const strokeDashoffset = 2 * Math.PI * 135 * (1 - minuteProgress / 100);

  return (
    <div className="flex flex-col items-center justify-center max-w-xl mx-auto px-4 py-6 sm:py-8">
      {/* Top Floating Pill: Streak & Level */}
      <div className="flex items-center gap-3 mb-8">
        <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-orange-500/10 border border-orange-500/30 text-orange-400 text-xs font-semibold shadow-sm shadow-orange-500/10">
          <Flame className="w-4 h-4 fill-current text-orange-500 animate-pulse" />
          <span>{gameState.currentStreak} Day Streak</span>
          {gameState.streakFreezesAvailable > 0 && (
            <span className="text-[10px] bg-orange-500/20 px-1.5 py-0.5 rounded text-orange-300 ml-1">
              Freeze Active
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-semibold shadow-sm shadow-indigo-500/10">
          <Sparkles className="w-4 h-4 text-indigo-400" />
          <span>Level {gameState.level}</span>
          <span className="text-slate-400 text-[10px] font-mono">({gameState.xp} XP)</span>
        </div>
      </div>

      {/* Category Selection Pills */}
      <div className="w-full mb-8">
        <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 text-center">
          Focus Category
        </label>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {categories.map((cat) => {
            const isSelected = cat.id === selectedCategoryId;
            return (
              <button
                key={cat.id}
                disabled={timerStatus !== 'idle'}
                onClick={() => setSelectedCategoryId(cat.id)}
                style={{
                  borderColor: isSelected ? cat.color : 'rgba(255, 255, 255, 0.08)',
                  backgroundColor: isSelected ? `${cat.color}22` : 'rgba(15, 23, 42, 0.45)',
                  boxShadow: isSelected ? `0 0 15px ${cat.color}33` : 'none',
                }}
                className={`flex items-center gap-2 px-4 py-2 rounded-2xl border text-sm font-semibold transition-all duration-200 ${
                  isSelected
                    ? 'text-white scale-105 ring-1'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                } ${timerStatus !== 'idle' && !isSelected ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                <div
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: cat.color }}
                />
                <CategoryIcon name={cat.icon} className="w-4 h-4" />
                <span>{cat.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Modern Circular Zen/Cyber Timer Face */}
      <div className="relative mb-8 flex items-center justify-center">
        {/* Glowing backdrop aura */}
        <div
          className={`absolute w-72 h-72 sm:w-84 sm:h-84 rounded-full blur-3xl transition-all duration-1000 pointer-events-none ${
            timerStatus === 'running'
              ? 'opacity-75 scale-110'
              : timerStatus === 'paused'
              ? 'opacity-30'
              : 'opacity-15'
          }`}
          style={{
            backgroundColor: activeCategory?.color || '#6366f1',
          }}
        />

        {/* Central Circular Dial with SVG Progress Track */}
        <div
          className={`relative w-72 h-72 sm:w-84 sm:h-84 rounded-full flex flex-col items-center justify-center bg-slate-950/85 backdrop-blur-2xl shadow-2xl transition-all duration-500 border ${
            timerStatus === 'running' ? 'timer-active-glow' : ''
          }`}
          style={{
            borderColor:
              timerStatus === 'running'
                ? activeCategory?.color || '#6366f1'
                : 'rgba(255, 255, 255, 0.1)',
          }}
        >
          {/* Animated SVG Progress Ring */}
          <svg className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none" viewBox="0 0 300 300">
            <circle
              cx="150"
              cy="150"
              r="135"
              stroke="rgba(255, 255, 255, 0.04)"
              strokeWidth="6"
              fill="transparent"
            />
            {timerStatus !== 'idle' && (
              <circle
                cx="150"
                cy="150"
                r="135"
                stroke={activeCategory?.color || '#6366f1'}
                strokeWidth="6"
                strokeDasharray={2 * Math.PI * 135}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                fill="transparent"
                className="transition-all duration-500 ease-linear"
              />
            )}
          </svg>

          {/* Category Chip in Center Dial */}
          {activeCategory && (
            <div
              className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold mb-3 shadow-sm"
              style={{
                backgroundColor: `${activeCategory.color}25`,
                color: activeCategory.color,
                border: `1px solid ${activeCategory.color}40`,
              }}
            >
              <CategoryIcon name={activeCategory.icon} className="w-3.5 h-3.5" />
              <span>{activeCategory.name}</span>
            </div>
          )}

          {/* Large Tabular Monospace Digits */}
          <div className="flex items-baseline font-mono text-5xl sm:text-6xl font-extrabold tracking-tight text-white mb-2 tabular-nums">
            <span>{time.hours}</span>
            <span className="text-slate-500 mx-1">:</span>
            <span>{time.minutes}</span>
            <span className="text-slate-500 mx-1">:</span>
            <span
              style={{ color: activeCategory?.color || '#818cf8' }}
              className="drop-shadow-[0_0_12px_rgba(99,102,241,0.5)]"
            >
              {time.seconds}
            </span>
          </div>

          {/* Status badge */}
          <div className="text-xs font-bold uppercase tracking-widest text-slate-400">
            {timerStatus === 'running' ? (
              <span className="text-emerald-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                Focus Mode Active
              </span>
            ) : timerStatus === 'paused' ? (
              <span className="text-amber-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                Session Paused
              </span>
            ) : (
              'Ready for Work'
            )}
          </div>
        </div>
      </div>

      {/* Note Input */}
      <div className="w-full max-w-sm mb-6">
        <input
          type="text"
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            if (timerStatus !== 'idle') {
              appCore.timer.setNote(e.target.value);
            }
          }}
          placeholder="What are you working on? (optional)"
          className="w-full px-4 py-2.5 rounded-2xl bg-slate-900/90 border border-slate-700/80 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition shadow-inner"
        />
      </div>

      {/* Tactile Controls Bar */}
      <div className="flex items-center gap-4 mb-8">
        {timerStatus === 'idle' && (
          <button
            onClick={handleStart}
            className="flex items-center gap-3 px-10 py-4 rounded-2xl bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-600 hover:from-indigo-600 hover:to-purple-700 text-white font-bold text-lg shadow-xl shadow-indigo-500/30 transition transform hover:-translate-y-0.5 active:scale-95"
          >
            <Play className="w-6 h-6 fill-current" />
            <span>Start Focus</span>
          </button>
        )}

        {timerStatus === 'running' && (
          <>
            <button
              onClick={handlePause}
              className="flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold border border-amber-500/30 shadow-lg transition active:scale-95"
            >
              <Pause className="w-5 h-5 fill-current" />
              <span>Pause</span>
            </button>
            <button
              onClick={handleStop}
              className="flex items-center gap-2 px-8 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-lg shadow-emerald-600/30 transition active:scale-95"
            >
              <Square className="w-5 h-5 fill-current" />
              <span>Done & Log</span>
            </button>
            <button
              onClick={() => setShowDiscardConfirm(true)}
              className="p-3.5 rounded-2xl bg-slate-800/80 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-700 transition"
              title="Discard session"
            >
              <RotateCcw className="w-5 h-5" />
            </button>
          </>
        )}

        {timerStatus === 'paused' && (
          <>
            <button
              onClick={handleResume}
              className="flex items-center gap-2 px-7 py-3.5 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-bold shadow-lg transition active:scale-95"
            >
              <Play className="w-5 h-5 fill-current" />
              <span>Resume</span>
            </button>
            <button
              onClick={handleStop}
              className="flex items-center gap-2 px-7 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-lg shadow-emerald-600/30 transition active:scale-95"
            >
              <Square className="w-5 h-5 fill-current" />
              <span>Done & Log</span>
            </button>
            <button
              onClick={() => setShowDiscardConfirm(true)}
              className="p-3.5 rounded-2xl bg-slate-800/80 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-700 transition"
              title="Discard session"
            >
              <RotateCcw className="w-5 h-5" />
            </button>
          </>
        )}
      </div>

      {/* Discard Confirmation Modal */}
      {showDiscardConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-white">Discard this session?</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Elapsed time ({time.hours}:{time.minutes}:{time.seconds}) will not be saved.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowDiscardConfirm(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleDiscard}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow"
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TODAY'S QUEST & DAILY LOGGER DIRECT ACCESS DRAWER */}
      <div className="w-full glass-panel rounded-3xl p-5 border border-indigo-500/25 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-indigo-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-white">
              Today's Daily Quest
            </span>
          </div>
          {onNavigateToCalendar && (
            <button
              onClick={onNavigateToCalendar}
              className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 font-semibold transition"
            >
              <span>Open Calendar Logger</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-baseline justify-between mb-2">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-2xl font-extrabold text-white">
              {todayDoneHours} hrs
            </span>
            <span className="text-xs text-slate-400">done today</span>
          </div>
          <div className="text-xs font-mono font-bold text-indigo-300">
            {!dailyGoalIsSet ? (
              <button
                onClick={onNavigateToCalendar}
                className="text-slate-500 hover:text-indigo-400 transition text-xs"
              >
                Set a daily goal →
              </button>
            ) : isTodayGoalMet ? (
              <span className="text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Goal Conquered!
              </span>
            ) : (
              <span>{todayLeftHours} hrs left of {dailyGoalHours}h goal</span>
            )}
          </div>
        </div>

        {/* Linear progress bar - only show when goal is set */}
        {dailyGoalIsSet ? (
          <>
            <div className="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden mb-3">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  isTodayGoalMet
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                    : 'bg-gradient-to-r from-indigo-500 to-purple-500'
                }`}
                style={{ width: `${todayProgressPct}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>{todayProgressPct}% completed</span>
              <span>{Math.floor(todayLoggedSec / 60)} minutes total focus</span>
            </div>
          </>
        ) : (
          <div className="text-[11px] text-slate-500 mt-1">
            {todayLoggedSec > 0
              ? `${Math.floor(todayLoggedSec / 60)} minutes logged today · Set a goal to track progress`
              : 'Start a session or set a daily focus goal in Calendar'}
          </div>
        )}
      </div>

      {/* Quick Summary Cards */}
      <div className="grid grid-cols-2 gap-4 w-full">
        <div className="glass-card rounded-2xl p-4 flex flex-col">
          <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold mb-1">
            <CheckCircle2 className="w-4 h-4 text-indigo-400" />
            <span>Today Total</span>
          </div>
          <div className="text-2xl font-bold text-white font-mono">
            {todayDoneHours} hrs
          </div>
          <div className="text-slate-500 text-xs mt-1 font-mono">
            {Math.floor(todayLoggedSec / 60)} mins logged
          </div>
        </div>

        <div className="glass-card rounded-2xl p-4 flex flex-col">
          <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold mb-1">
            <Target className="w-4 h-4 text-purple-400" />
            <span>{activeCategory?.name}</span>
          </div>
          <div className="text-2xl font-bold text-white font-mono">
            {Number((todayCategorySec / 3600).toFixed(1))} hrs
          </div>
          <div className="text-slate-500 text-xs mt-1">
            {activeTargetHours > 0 ? (
              <span>{activeTargetHours} hrs/wk goal</span>
            ) : (
              <span>No weekly goal</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
