import React, { useEffect, useState } from 'react';
import { Target, CheckCircle, TrendingUp, AlertCircle, Plus, Minus } from 'lucide-react';
import { appCore } from '../../core';
import type { Category } from '../../core';
import { CategoryIcon } from '../components/CategoryIcon';

export const TargetsView: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>(appCore.categories);
  const [, setTrigger] = useState<number>(0);

  const forceRefresh = () => setTrigger((t) => t + 1);

  useEffect(() => {
    setCategories([...appCore.categories]);

    const unsubTargets = appCore.targetTracker.subscribe(forceRefresh);
    const unsubLog = appCore.sessionLog.subscribe(forceRefresh);
    const unsubCats = appCore.onCategoriesChange(() => {
      setCategories([...appCore.categories]);
      forceRefresh();
    });

    return () => {
      unsubTargets();
      unsubLog();
      unsubCats();
    };
  }, []);

  const weekStartDate = appCore.targetTracker.getCurrentWeekStartDate();
  const aggregated = appCore.targetTracker.getAggregatedProgress(appCore.sessionLog, weekStartDate);

  const handleUpdateTargetHours = async (categoryId: string, delta: number) => {
    const current = appCore.targetTracker.getTargetForCategory(categoryId, weekStartDate);
    const currentHours = current ? current.targetHours : 0;
    const newHours = Math.max(0, currentHours + delta);

    const updated = await appCore.targetTracker.setTarget(categoryId, newHours, weekStartDate);
    await appCore.sync.queueChange('weekly_targets', 'UPDATE', updated.toDTO());
    forceRefresh();
  };

  const handleSetTargetDirect = async (categoryId: string, hours: number) => {
    const newHours = Math.max(0, hours);
    const updated = await appCore.targetTracker.setTarget(categoryId, newHours, weekStartDate);
    await appCore.sync.queueChange('weekly_targets', 'UPDATE', updated.toDTO());
    forceRefresh();
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 sm:py-8">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white tracking-tight">Weekly Targets</h2>
        <p className="text-sm text-slate-400">
          Set weekly hour targets per category. Progress recalculates in real-time from your logged sessions.
        </p>
      </div>

      {/* Aggregated Week Card */}
      <div className="glass-panel rounded-3xl p-5 sm:p-6 mb-6 sm:mb-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex items-center justify-between gap-3 mb-3 sm:mb-4">
          <div>
            <div className="flex items-center gap-1.5 text-indigo-400 text-[11px] sm:text-xs font-bold uppercase tracking-wider mb-1">
              <Target className="w-3.5 h-3.5" />
              <span>Week Starting {weekStartDate}</span>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-white font-mono">
              {aggregated.totalLoggedHours} / {aggregated.totalTargetHours} hrs
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 rounded-2xl bg-slate-800/80 border border-slate-700 shrink-0">
            <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-400" />
            <span className="text-xl sm:text-2xl font-bold text-white font-mono">
              {aggregated.overallProgressPct}%
            </span>
          </div>
        </div>

        {/* Global Progress Bar */}
        <div className="w-full h-3 rounded-full bg-slate-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-400 transition-all duration-500"
            style={{ width: `${Math.min(100, aggregated.overallProgressPct)}%` }}
          />
        </div>
      </div>

      {/* Category Targets Grid */}
      <div className="space-y-3 sm:space-y-4">
        {categories.map((cat) => {
          const target = appCore.targetTracker.getTargetForCategory(cat.id, weekStartDate);
          const targetHours = target ? target.targetHours : 0;
          const loggedSec = target ? target.getLoggedSeconds(appCore.sessionLog) : appCore.sessionLog.getTotalForWeekAndCategory(new Date(), cat.id);
          const loggedHours = Number((loggedSec / 3600).toFixed(1));
          const pct = targetHours > 0 ? Math.min(100, Number(((loggedHours / targetHours) * 100).toFixed(1))) : 0;
          const isOnTrack = target ? target.isOnTrack(appCore.sessionLog) : false;
          const isCompleted = targetHours > 0 && loggedHours >= targetHours;

          return (
            <div
              key={cat.id}
              className="glass-card rounded-2xl p-4 sm:p-5 border hover:border-slate-600/60 transition"
              style={{
                borderColor: targetHours > 0 ? `${cat.color}30` : undefined,
              }}
            >
              <div className="flex items-center justify-between gap-3 mb-3">
                {/* Category info */}
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0 shadow-md"
                    style={{
                      backgroundColor: `${cat.color}20`,
                      color: cat.color,
                    }}
                  >
                    <CategoryIcon name={cat.icon} className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm sm:text-base font-bold text-white truncate">{cat.name}</h3>
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] sm:text-xs mt-0.5">
                      <span className="font-mono text-slate-300 font-semibold">
                        {loggedHours}h logged
                      </span>
                      {targetHours > 0 && (
                        <>
                          <span className="text-slate-600">•</span>
                          {isCompleted ? (
                            <span className="text-emerald-400 font-medium flex items-center gap-1">
                              <CheckCircle className="w-3 h-3" /> Met!
                            </span>
                          ) : isOnTrack ? (
                            <span className="text-indigo-400 font-medium flex items-center gap-1">
                              <TrendingUp className="w-3 h-3" /> On Pace
                            </span>
                          ) : (
                            <span className="text-amber-400 font-medium flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" /> Behind
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Target Hours Stepper */}
                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                  <div className="text-right">
                    <span className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold block">
                      Goal
                    </span>
                    <div className="flex items-baseline justify-end gap-1">
                      <input
                        type="number"
                        min="0"
                        max="168"
                        value={targetHours}
                        onChange={(e) => handleSetTargetDirect(cat.id, Number(e.target.value))}
                        className="w-12 sm:w-16 px-1.5 py-1 text-right font-mono font-bold text-sm sm:text-base text-white bg-slate-800 rounded-lg border border-slate-700 focus:outline-none focus:border-indigo-500"
                      />
                      <span className="text-[11px] sm:text-xs text-slate-400">h</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-0.5 sm:gap-1 bg-slate-800 p-0.5 sm:p-1 rounded-xl border border-slate-700">
                    <button
                      onClick={() => handleUpdateTargetHours(cat.id, -1)}
                      className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition active:scale-95"
                      title="Decrease 1 hour"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleUpdateTargetHours(cat.id, 1)}
                      className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition active:scale-95"
                      title="Increase 1 hour"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Progress Bar */}
              {targetHours > 0 ? (
                <div>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-slate-400 font-medium">
                      {pct}% Completed
                    </span>
                    <span className="font-mono text-slate-400">
                      {Math.max(0, Number((targetHours - loggedHours).toFixed(1)))} hrs remaining
                    </span>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: cat.color,
                      }}
                    />
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-500 italic py-1">
                  Use the stepper on the right to set a weekly goal for {cat.name}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
