import React, { useEffect, useState, useRef, useCallback } from 'react';
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
  Clock,
  Zap,
  Monitor,
  Pencil,
} from 'lucide-react';
import { appCore } from '../../core';
import type { Category, Session } from '../../core';
import { CategoryIcon } from '../components/CategoryIcon';
import { HabitCueModal } from '../components/HabitCueModal';
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
  const [showIdleNudge, setShowIdleNudge] = useState<boolean>(false);
  const [_nudgeDismissed, setNudgeDismissed] = useState<boolean>(false);
  const nudgeDismissedRef = useRef<boolean>(false);
  const [lastCategory, setLastCategory] = useState<Category | null>(null);
  // True when the running timer was started by a different device
  const [isRemoteTimer, setIsRemoteTimer] = useState<boolean>(false);
  const localSessionStartRef = useRef<string | null>(null); // tracks if WE started it
  const [activeCosmetic, setActiveCosmetic] = useState(appCore.gamification.getActiveOrTrialCosmetic());
  // gameState as proper reactive state — subscribes to gamification so XP/streak update immediately
  const [gameState, setGameState] = useState(appCore.gamification.getState());
  const [isCueModalOpen, setIsCueModalOpen] = useState<boolean>(false);
  const [dailyCommitmentNote, setDailyCommitmentNote] = useState<string | null>(null);

  // Sync state with AppCore — stable callback reference via useCallback
  const refreshStats = useCallback(() => {
    const today = new Date();
    const totalToday = appCore.sessionLog.getTotalForDay(today);
    setTodayLoggedSec(totalToday);

    const allSessions = appCore.sessionLog.getAll();
    if (allSessions.length > 0) {
      const sorted = [...allSessions].sort(
        (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
      );
      const cat = appCore.categories.find((c) => c.id === sorted[0].categoryId);
      setLastCategory(cat || null);
    } else {
      setLastCategory(null);
    }

    const activeCatId = appCore.timer.getCategoryId() || selectedCategoryId;
    if (activeCatId) {
      const catToday = appCore.sessionLog.getTotalForDayAndCategory(today, activeCatId);
      setTodayCategorySec(catToday);

      const target = appCore.targetTracker.getTargetForCategory(activeCatId);
      setActiveTargetHours(target ? target.targetHours : 0);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    appCore.storage.getSetting<number>('daily_goal_hours').then((goal) => {
      // Only set if user has explicitly saved a goal (null means never set)
      if (goal !== null && goal !== undefined && goal > 0) {
        setDailyGoalHours(goal);
      } else {
        setDailyGoalHours(null);
      }
    });

    appCore.storage.getSetting<string>('commitment_note').then((noteVal) => {
      setDailyCommitmentNote(noteVal || null);
    });

    const unsubTimerState = appCore.timer.onStateChange((status) => {
      setTimerStatus(status);
      const activeCat = appCore.timer.getCategoryId();
      if (activeCat) {
        setSelectedCategoryId(activeCat);
      }
      if (status === 'idle') {
        setShowIdleNudge(false);
        setNudgeDismissed(false);
        nudgeDismissedRef.current = false;
      }
      setNote(appCore.timer.getNote());
      refreshStats();
    });

    const unsubTimerTick = appCore.timer.onTick((sec) => {
      setElapsedSec(sec);
      const continuous = appCore.timer.getContinuousRunningSec();
      if (continuous >= 5400 && !nudgeDismissedRef.current) {
        setShowIdleNudge(true);
      }
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

    const unsubGamification = appCore.gamification.subscribe(() => {
      setGameState(appCore.gamification.getState());
      setActiveCosmetic(appCore.gamification.getActiveOrTrialCosmetic());
    });

    refreshStats();

    return () => {
      unsubTimerState();
      unsubTimerTick();
      unsubCategories();
      unsubLog();
      unsubTargets();
      unsubGamification();
    };
  }, [refreshStats]);

  // Track whether the active timer was started locally or remotely
  // so we can show the "Synced from another device" pill
  useEffect(() => {
    const unsubState = appCore.timer.onStateChange((status) => {
      if (status === 'idle') {
        setIsRemoteTimer(false);
        localSessionStartRef.current = null;
      }
    });
    return unsubState;
  }, []);

  const activeCategory = categories.find((c) => c.id === selectedCategoryId) || categories[0];

  const handleStart = () => {
    if (!selectedCategoryId && categories.length > 0) {
      setSelectedCategoryId(categories[0].id);
    }
    const catId = selectedCategoryId || (categories[0]?.id ?? '');
    sounds.playStart();
    const mood = appCore.moodEngine.getMood(gameState.currentStreak, true);
    sounds.playMoodChime(mood.tier);
    appCore.timer.start(catId, note);
    // Mark this session as locally-started
    setIsRemoteTimer(false);
    localSessionStartRef.current = appCore.timer.getSessionStartTime();
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
      if (typeof document !== 'undefined' && document.hidden) {
        const cat = categories.find((c) => c.id === session.categoryId);
        void appCore.notifications.notifyTimerComplete(
          cat?.name || 'Focus Session',
          Math.max(1, Math.round(session.durationSec / 60))
        );
      }
    }
    setNote('');
    refreshStats();
  };

  const handleDiscard = () => {
    appCore.timer.discard();
    setNote('');
    setIsRemoteTimer(false);
    localSessionStartRef.current = null;
    setShowDiscardConfirm(false);
    refreshStats();
  };

  // Called by coreContext when a remote timer broadcast arrives and gets applied
  // We detect "remote" by checking if sessionStartTime changed without a local handleStart
  useEffect(() => {
    const unsubTick = appCore.timer.onTick(() => {
      const currentStart = appCore.timer.getSessionStartTime();
      const status = appCore.timer.getStatus();
      if (status !== 'idle' && currentStart && currentStart !== localSessionStartRef.current) {
        // sessionStartTime exists but wasn't set by our handleStart — it came from remote
        setIsRemoteTimer(true);
      }
    });
    return unsubTick;
  }, []);

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
  const streakMultiplier = appCore.gamification.getStreakMultiplier();

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

  const currentMood = appCore.moodEngine.getMood(
    gameState.currentStreak,
    timerStatus === 'running'
  );

  return (
    <div className="flex flex-col items-center justify-center max-w-xl mx-auto px-4 py-6 sm:py-8">
      {/* Top Floating Pill: Streak, Level, Mood Atmosphere */}
      <div className="flex flex-wrap items-center justify-center gap-2.5 mb-6 sm:mb-8">
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

        {/* Mood Tier Atmosphere Badge */}
        <div
          className="flex items-center gap-1 px-3 py-1.5 rounded-full border text-xs font-semibold shadow-sm transition-all duration-500 cursor-help"
          style={{
            backgroundColor: `${currentMood.accentColor}18`,
            borderColor: `${currentMood.accentColor}40`,
            color: currentMood.accentColor,
            boxShadow: `0 0 10px ${currentMood.glowColor}`,
          }}
          title={currentMood.subtitle}
        >
          <span>{currentMood.badgeLabel}</span>
        </div>

        {streakMultiplier > 1 && (
          <div className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold shadow-sm shadow-amber-500/10">
            <Zap className="w-3.5 h-3.5 text-amber-400 fill-current" />
            <span>{streakMultiplier}x XP</span>
          </div>
        )}
      </div>

      {/* Monday Fresh Start or Gloomy Streak Motivation Banner */}
      {currentMood.isFreshStartMonday && timerStatus !== 'running' ? (
        <div className="flex items-center gap-2 mb-4 px-4 py-2 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-semibold shadow-sm animate-fade-in text-center">
          <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
          <span>New week, clean slate · Start a session to light up your streak!</span>
        </div>
      ) : currentMood.tier === 'gloomy' && timerStatus === 'idle' ? (
        <div className="flex items-center gap-2 mb-4 px-4 py-2 rounded-2xl bg-slate-800/80 border border-slate-700/60 text-slate-300 text-xs shadow-sm animate-fade-in text-center">
          <span className="text-slate-400">☁️ Streak broken · Start a session to ignite heat and revive Day 1!</span>
        </div>
      ) : null}

      {/* Remote device live sync indicator */}
      {isRemoteTimer && timerStatus !== 'idle' && (
        <div className="flex items-center gap-2 mb-4 px-4 py-2 rounded-2xl bg-indigo-500/10 border border-indigo-500/25 text-indigo-300 text-xs font-semibold animate-fade-in">
          <Monitor className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse shrink-0" />
          <span>Synced live from another device</span>
        </div>
      )}

      {/* Category Selection Pills */}
      <div className="w-full mb-6 sm:mb-8">
        <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2.5 text-center">
          Focus Category
        </label>
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1 px-1 justify-start sm:justify-center">
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
                className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl sm:rounded-2xl border text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0 transition-all duration-200 ${
                  isSelected
                    ? 'text-white scale-105 ring-1'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                } ${timerStatus !== 'idle' && !isSelected ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                <div
                  className="w-2 sm:w-2.5 h-2 sm:h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: cat.color }}
                />
                <CategoryIcon name={cat.icon} className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span>{cat.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Category If-Then Habit Cue Banner with Inline Edit */}
      <div className="w-full mb-5 -mt-3 flex flex-col items-center justify-center gap-2">
        {activeCategory?.ifThenCue ? (
          <div className="px-3.5 py-1.5 rounded-xl bg-slate-900/70 border border-slate-700/50 flex items-center justify-between gap-2.5 text-xs text-slate-300 shadow-sm animate-fade-in max-w-md w-full">
            <div className="flex items-center gap-2 overflow-hidden text-left">
              <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 shrink-0">
                Habit Cue
              </span>
              <span className="italic truncate text-slate-200">"{activeCategory.ifThenCue}"</span>
            </div>
            <button
              onClick={() => setIsCueModalOpen(true)}
              className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition shrink-0"
              title="Edit Habit Cue"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsCueModalOpen(true)}
            className="text-[11px] text-slate-400 hover:text-indigo-300 px-3 py-1 rounded-full border border-dashed border-slate-700/70 hover:border-indigo-500/40 hover:bg-indigo-500/10 transition flex items-center gap-1.5"
          >
            <Sparkles className="w-3 h-3 text-indigo-400" />
            <span>+ Add Habit Cue for {activeCategory?.name}</span>
          </button>
        )}

        {dailyCommitmentNote && (
          <div className="text-center px-3.5 py-1 rounded-full bg-slate-900/40 border border-slate-800 text-[11px] text-slate-400 max-w-md truncate">
            <span className="text-amber-400 font-semibold mr-1">Daily Anchor:</span>
            <span className="italic text-slate-300">"{dailyCommitmentNote}"</span>
          </div>
        )}
      </div>

      {/* Modern Circular Zen/Cyber Timer Face */}
      <div className="relative mb-6 sm:mb-8 flex items-center justify-center">
        {/* Glowing backdrop aura */}
        <div
          className={`absolute w-64 h-64 sm:w-80 sm:h-80 rounded-full blur-3xl transition-all duration-1000 pointer-events-none ${
            timerStatus === 'running'
              ? 'opacity-75 scale-110'
              : timerStatus === 'paused'
              ? 'opacity-30'
              : 'opacity-15'
          }`}
          style={{
            backgroundColor:
              activeCosmetic.id === 'theme-infernal-phoenix'
                ? '#ff4500'
                : activeCategory?.color || '#6366f1',
          }}
        />

        {/* Central Circular Dial with SVG Progress Track */}
        <div
          className={`relative w-[268px] h-[268px] sm:w-80 sm:h-80 rounded-full flex flex-col items-center justify-center bg-slate-950/85 backdrop-blur-2xl shadow-2xl transition-all duration-500 border ${
            timerStatus === 'running'
              ? activeCosmetic.id === 'theme-infernal-phoenix'
                ? 'phoenix-glow timer-active-glow'
                : 'timer-active-glow'
              : ''
          }`}
          style={{
            borderColor:
              timerStatus === 'running'
                ? activeCosmetic.id === 'theme-infernal-phoenix'
                  ? '#ff4500'
                  : activeCategory?.color || '#6366f1'
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
                stroke={
                  activeCosmetic.id === 'theme-infernal-phoenix'
                    ? '#ff4500'
                    : appCore.moodEngine.isEnabled()
                    ? appCore.moodEngine.getRingColor(elapsedSec, currentMood.ringHue)
                    : activeCategory?.color || '#6366f1'
                }
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
              className="flex items-center gap-1.5 px-3 py-0.5 sm:py-1 rounded-full text-xs font-bold mb-2 sm:mb-3 shadow-sm"
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
          <div className="flex items-baseline font-mono text-4xl sm:text-6xl font-extrabold tracking-tight text-white mb-2 tabular-nums">
            <span>{time.hours}</span>
            <span className="text-slate-500 mx-0.5 sm:mx-1">:</span>
            <span>{time.minutes}</span>
            <span className="text-slate-500 mx-0.5 sm:mx-1">:</span>
            <span
              style={{ color: activeCategory?.color || '#818cf8' }}
              className="drop-shadow-[0_0_12px_rgba(99,102,241,0.5)]"
            >
              {time.seconds}
            </span>
          </div>

          {/* Status badge */}
          <div className="text-[11px] sm:text-xs font-bold uppercase tracking-widest text-slate-400">
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
      <div className="w-full max-w-sm mb-5 sm:mb-6 px-1">
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
          className="w-full px-4 py-2.5 rounded-2xl bg-slate-900/90 border border-slate-700/80 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition shadow-inner"
        />
      </div>

      {/* Resume Last Category Quick Action */}
      {timerStatus === 'idle' && lastCategory && (
        <div className="w-full max-w-sm mb-2 px-1">
          <button
            onClick={() => {
              setSelectedCategoryId(lastCategory.id);
              sounds.playStart();
              appCore.timer.start(lastCategory.id, note);
            }}
            className="w-full flex items-center justify-between px-4 py-2.5 rounded-2xl bg-slate-900/80 hover:bg-slate-800 border border-slate-800 hover:border-indigo-500/40 text-xs font-semibold transition shadow-md active:scale-95 select-none"
            title={`Quick resume focus for ${lastCategory.name}`}
          >
            <div className="flex items-center gap-2">
              <RotateCcw className="w-3.5 h-3.5 text-indigo-400" />
              <span className="text-slate-400">Resume:</span>
              <span className="flex items-center gap-1.5 text-white font-bold">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: lastCategory.color }} />
                {lastCategory.name}
              </span>
            </div>
            <span className="text-[10px] text-indigo-300 uppercase tracking-wider font-mono">Quick Start →</span>
          </button>
        </div>
      )}

      {/* Tactile Controls Bar */}
      <div className="flex items-center justify-center gap-2 sm:gap-4 mb-6 sm:mb-8 w-full max-w-sm px-1">
        {timerStatus === 'idle' && (
          <button
            onClick={handleStart}
            className="w-full flex items-center justify-center gap-2.5 sm:gap-3 px-8 sm:px-10 py-3.5 sm:py-4 rounded-2xl bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-600 hover:from-indigo-600 hover:to-purple-700 text-white font-bold text-base sm:text-lg shadow-xl shadow-indigo-500/30 transition transform hover:-translate-y-0.5 active:scale-95 select-none"
          >
            <Play className="w-5 h-5 sm:w-6 sm:h-6 fill-current" />
            <span>Start Focus</span>
          </button>
        )}

        {timerStatus === 'running' && (
          <>
            <button
              onClick={handlePause}
              className="flex-1 flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-6 py-3 sm:py-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold text-xs sm:text-sm border border-amber-500/30 shadow-lg transition active:scale-95 select-none"
            >
              <Pause className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />
              <span>Pause</span>
            </button>
            <button
              onClick={handleStop}
              className="flex-[1.4] flex items-center justify-center gap-1.5 sm:gap-2 px-4 sm:px-8 py-3 sm:py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs sm:text-sm shadow-lg shadow-emerald-600/30 transition active:scale-95 select-none"
            >
              <Square className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />
              <span>Done & Log</span>
            </button>
            <button
              onClick={() => setShowDiscardConfirm(true)}
              className="p-3 sm:p-3.5 rounded-2xl bg-slate-800/80 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-700 transition shrink-0 select-none"
              title="Discard session"
            >
              <RotateCcw className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </>
        )}

        {timerStatus === 'paused' && (
          <>
            <button
              onClick={handleResume}
              className="flex-1 flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-7 py-3 sm:py-3.5 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-bold text-xs sm:text-sm shadow-lg transition active:scale-95 select-none"
            >
              <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />
              <span>Resume</span>
            </button>
            <button
              onClick={handleStop}
              className="flex-[1.4] flex items-center justify-center gap-1.5 sm:gap-2 px-4 sm:px-7 py-3 sm:py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs sm:text-sm shadow-lg shadow-emerald-600/30 transition active:scale-95 select-none"
            >
              <Square className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />
              <span>Done & Log</span>
            </button>
            <button
              onClick={() => setShowDiscardConfirm(true)}
              className="p-3 sm:p-3.5 rounded-2xl bg-slate-800/80 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-700 transition shrink-0 select-none"
              title="Discard session"
            >
              <RotateCcw className="w-4 h-4 sm:w-5 sm:h-5" />
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

      {/* Idle Nudge Prompt (90+ min continuous focus) */}
      {showIdleNudge && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm bg-slate-900 border border-indigo-500/30 rounded-3xl p-6 shadow-2xl text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto shadow-lg shadow-amber-500/10">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white mb-1">Still on this?</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                You have been focusing continuously for over 90 minutes. Take a quick stretch, stay hydrated, or keep pushing!
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-2 pt-2">
              <button
                onClick={() => {
                  nudgeDismissedRef.current = true;
                  setNudgeDismissed(true);
                  setShowIdleNudge(false);
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow transition active:scale-95"
              >
                I'm still focusing
              </button>
              <button
                onClick={() => {
                  setShowIdleNudge(false);
                  handleStop();
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition active:scale-95"
              >
                Done & Log
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

      {/* Habit Cue Self-Note Modal */}
      <HabitCueModal
        category={activeCategory || null}
        isOpen={isCueModalOpen}
        onClose={() => setIsCueModalOpen(false)}
        onSaved={() => {
          setCategories([...appCore.categories]);
          refreshStats();
        }}
      />
    </div>
  );
};
