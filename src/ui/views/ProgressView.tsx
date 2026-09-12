import React, { useEffect, useState } from 'react';
import { Trophy, Flame, Shield, Sparkles, Clock, CheckCircle2, Lock } from 'lucide-react';
import { appCore } from '../../core';
import type { GamificationStateDTO } from '../../types';
import { CategoryIcon } from '../components/CategoryIcon';

export const ProgressView: React.FC = () => {
  const [gameState, setGameState] = useState<GamificationStateDTO>(appCore.gamification.getState());
  const [totalSessionsCount, setTotalSessionsCount] = useState<number>(0);
  const [totalAllTimeSec, setTotalAllTimeSec] = useState<number>(0);

  const loadData = () => {
    setGameState(appCore.gamification.getState());
    const all = appCore.sessionLog.getAll();
    setTotalSessionsCount(all.length);
    setTotalAllTimeSec(all.reduce((sum, s) => sum + s.durationSec, 0));
  };

  useEffect(() => {
    loadData();
    const unsubGame = appCore.gamification.subscribe(loadData);
    const unsubLog = appCore.sessionLog.subscribe(loadData);
    return () => {
      unsubGame();
      unsubLog();
    };
  }, []);

  const nextLevelInfo = appCore.gamification.getXPToNextLevel();
  const totalAllTimeHours = (totalAllTimeSec / 3600).toFixed(1);

  const getLevelTitle = (lvl: number) => {
    if (lvl === 0) return 'Initiate';
    if (lvl === 1) return 'Novice Tracker';
    if (lvl < 3) return 'Focus Apprentice';
    if (lvl < 5) return 'Time Adept';
    if (lvl < 10) return 'Productivity Master';
    if (lvl < 20) return 'Grandmaster of Focus';
    return 'Temporal Sage';
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 sm:py-8">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white tracking-tight">Gamified Progress</h2>
        <p className="text-sm text-slate-400">
          Level up by logging minutes, protect your streaks, and unlock master badges.
        </p>
      </div>

      {/* Main Hero Card: Level & XP Bar */}
      <div className="relative glass-panel rounded-3xl p-6 sm:p-8 mb-8 overflow-hidden border-indigo-500/30">
        <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-60 h-60 bg-purple-600/15 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col sm:flex-row items-center gap-6 mb-6">
          {/* Level Emblem */}
          <div className="relative w-24 h-24 rounded-3xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-amber-500 flex flex-col items-center justify-center shadow-xl shadow-indigo-500/25 shrink-0">
            <Trophy className="w-8 h-8 text-amber-300 mb-1" />
            <div className="text-xl font-extrabold text-white font-mono leading-none">
              LVL {gameState.level}
            </div>
          </div>

          <div className="text-center sm:text-left flex-1">
            <div className="flex items-center justify-center sm:justify-start gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-semibold uppercase tracking-wider">
                Rank {gameState.level}
              </span>
              <span className="text-slate-400 text-xs">•</span>
              <span className="text-slate-300 text-xs font-medium">
                {getLevelTitle(gameState.level)}
              </span>
            </div>
            <h3 className="text-2xl sm:text-3xl font-bold text-white mb-2">
              {gameState.xp} <span className="text-lg font-medium text-slate-400">Total XP</span>
            </h3>
            <p className="text-xs text-slate-400">
              1 XP per minute logged • +50 XP bonus when you hit daily pro-rated goals!
            </p>
          </div>
        </div>

        {/* XP Progress to Next Level */}
        <div className="relative z-10">
          <div className="flex items-center justify-between text-xs font-semibold mb-2">
            <span className="text-slate-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              Level {nextLevelInfo.currentLevel + 1} Progress
            </span>
            <span className="text-slate-400 font-mono">
              {gameState.xp} / {nextLevelInfo.nextLevelXP} XP ({nextLevelInfo.progressPct}%)
            </span>
          </div>
          <div className="w-full h-3 rounded-full bg-slate-800 overflow-hidden p-0.5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-amber-400 transition-all duration-700"
              style={{ width: `${nextLevelInfo.progressPct}%` }}
            />
          </div>
          <div className="text-right text-[11px] text-slate-500 mt-1.5">
            {nextLevelInfo.nextLevelXP - gameState.xp} XP needed for Level {nextLevelInfo.currentLevel + 1}
          </div>
        </div>
      </div>

      {/* Streak & Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {/* Streak */}
        <div className="glass-card rounded-2xl p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold mb-2">
            <span>Daily Streak</span>
            <Flame className="w-5 h-5 text-orange-400 fill-current" />
          </div>
          <div className="text-3xl font-extrabold text-white font-mono mb-1">
            {gameState.currentStreak} <span className="text-sm font-normal text-slate-400">days</span>
          </div>
          <div className="text-xs text-slate-400">
            Record: <span className="text-orange-300 font-semibold">{gameState.longestStreak} days</span>
          </div>
        </div>

        {/* Streak Freeze */}
        <div className="glass-card rounded-2xl p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold mb-2">
            <span>Streak Freeze</span>
            <Shield className="w-5 h-5 text-cyan-400" />
          </div>
          <div className="text-3xl font-extrabold text-white font-mono mb-1">
            {gameState.streakFreezesAvailable}{' '}
            <span className="text-sm font-normal text-slate-400">available</span>
          </div>
          <div className="text-xs text-cyan-300 font-medium">
            1 free freeze allowed per week
          </div>
        </div>

        {/* Total Time Logged */}
        <div className="glass-card rounded-2xl p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold mb-2">
            <span>Total Logged</span>
            <Clock className="w-5 h-5 text-indigo-400" />
          </div>
          <div className="text-3xl font-extrabold text-white font-mono mb-1">
            {totalAllTimeHours} <span className="text-sm font-normal text-slate-400">hrs</span>
          </div>
          <div className="text-xs text-slate-400">
            Across {totalSessionsCount} logged sessions
          </div>
        </div>
      </div>

      {/* Badges Section */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-400" />
            <span>Badges & Achievements</span>
          </h3>
          <span className="text-xs font-semibold text-slate-400 font-mono">
            {gameState.badges.filter((b) => b.unlockedAt).length} / {gameState.badges.length} Unlocked
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {gameState.badges.map((badge) => {
            const isUnlocked = badge.unlockedAt !== null;

            return (
              <div
                key={badge.id}
                className={`p-4 rounded-2xl border transition-all ${
                  isUnlocked
                    ? 'bg-slate-900/90 border-amber-500/40 shadow-lg shadow-amber-500/10'
                    : 'bg-slate-900/40 border-slate-800/80 opacity-60'
                }`}
              >
                <div className="flex items-start gap-3.5">
                  <div
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-md ${
                      isUnlocked
                        ? 'bg-gradient-to-tr from-amber-500 to-indigo-600 text-white'
                        : 'bg-slate-800 text-slate-600'
                    }`}
                  >
                    <CategoryIcon name={badge.icon} className="w-6 h-6" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <h4
                        className={`text-sm font-bold truncate ${
                          isUnlocked ? 'text-white' : 'text-slate-400'
                        }`}
                      >
                        {badge.title}
                      </h4>
                      {isUnlocked ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <Lock className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mb-2 leading-relaxed">
                      {badge.description}
                    </p>

                    {isUnlocked ? (
                      <div className="text-[11px] text-amber-400/90 font-medium">
                        Unlocked on {new Date(badge.unlockedAt!).toLocaleDateString()}
                      </div>
                    ) : (
                      <div className="text-[11px] text-slate-500">Locked</div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
