import React, { useEffect, useState, useMemo } from 'react';
import {
  Target,
  CheckCircle,
  Check,
  TrendingUp,
  Plus,
  Minus,
  Calendar,
  ChevronDown,
  Sparkles,
  Lock,
  Unlock,
  ShieldAlert,
} from 'lucide-react';
import { appCore } from '../../core';
import type { Category } from '../../core';
import { CategoryIcon } from '../components/CategoryIcon';
import { EmergencyEditModal } from '../components/EmergencyEditModal';

const DAYS_OF_WEEK = [
  { day: 1, name: 'Monday', short: 'Mon' },
  { day: 2, name: 'Tuesday', short: 'Tue' },
  { day: 3, name: 'Wednesday', short: 'Wed' },
  { day: 4, name: 'Thursday', short: 'Thu' },
  { day: 5, name: 'Friday', short: 'Fri' },
  { day: 6, name: 'Saturday', short: 'Sat' },
  { day: 7, name: 'Sunday', short: 'Sun' },
];

export const TargetsView: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>(appCore.categories);
  const [expandedCatIds, setExpandedCatIds] = useState<Set<string>>(new Set());
  const [syncedFeedbackCatId, setSyncedFeedbackCatId] = useState<string | null>(null);
  const [trigger, setTrigger] = useState<number>(0);
  const [lockStatus, setLockStatus] = useState(appCore.targetLockPolicy.canEdit());
  const [isEmergencyModalOpen, setIsEmergencyModalOpen] = useState<boolean>(false);

  const forceRefresh = () => setTrigger((t) => t + 1);

  const toggleScheduleExpand = (catId: string) => {
    setExpandedCatIds((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };

  useEffect(() => {
    const unsubTargets = appCore.targetTracker.subscribe(forceRefresh);
    const unsubLog = appCore.sessionLog.subscribe(forceRefresh);
    const unsubCats = appCore.onCategoriesChange(() => {
      setCategories([...appCore.categories]);
      forceRefresh();
    });
    const unsubLock = appCore.targetLockPolicy.subscribe(() => {
      setLockStatus(appCore.targetLockPolicy.canEdit());
      forceRefresh();
    });

    return () => {
      unsubTargets();
      unsubLog();
      unsubCats();
      unsubLock();
    };
  }, []);

  const weekStartDate = appCore.targetTracker.getCurrentWeekStartDate();
  
  // Memoize aggregated metrics to avoid repeated full session log scans
  const aggregated = useMemo(() => {
    void trigger;
    return appCore.targetTracker.getAggregatedProgress(appCore.sessionLog, weekStartDate);
  }, [trigger, weekStartDate]);

  // Pre-calculate logged seconds per category for week and today in a single pass
  const { categoryLoggedMap, todayLoggedMap } = useMemo(() => {
    void trigger;
    const today = new Date();
    const { startOfWeek, endOfWeek } = appCore.sessionLog.getWeekBoundaries(today);
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    const weekSessions = appCore.sessionLog.getByDateRange(startOfWeek, endOfWeek);
    const catMap: Record<string, number> = {};
    const todayMap: Record<string, number> = {};

    for (const s of weekSessions) {
      catMap[s.categoryId] = (catMap[s.categoryId] || 0) + s.durationSec;
      const sDate = new Date(s.startTime);
      if (sDate >= startOfDay && sDate <= endOfDay) {
        todayMap[s.categoryId] = (todayMap[s.categoryId] || 0) + s.durationSec;
      }
    }

    return { categoryLoggedMap: catMap, todayLoggedMap: todayMap };
  }, [trigger]);

  const checkLockGate = (): boolean => {
    const status = appCore.targetLockPolicy.canEdit();
    if (!status.allowed) {
      setIsEmergencyModalOpen(true);
      return false;
    }
    return true;
  };

  const handleToggleDaily = async (categoryId: string, isDaily: boolean) => {
    if (!checkLockGate()) return;
    const updated = await appCore.targetTracker.setIsDaily(categoryId, isDaily, weekStartDate);
    await appCore.sync.queueChange('weekly_targets', 'UPDATE', updated.toDTO());
  };

  const handleUpdateTargetHours = async (categoryId: string, delta: number) => {
    if (!checkLockGate()) return;
    const current = appCore.targetTracker.getTargetForCategory(categoryId, weekStartDate);
    const currentHours = current ? current.targetHours : 0;
    const newHours = Math.max(0, currentHours + delta);

    const updated = await appCore.targetTracker.setTarget(categoryId, newHours, weekStartDate);
    await appCore.sync.queueChange('weekly_targets', 'UPDATE', updated.toDTO());
  };

  const handleUpdateDailyTargetHours = async (categoryId: string, delta: number) => {
    if (!checkLockGate()) return;
    const current = appCore.targetTracker.getTargetForCategory(categoryId, weekStartDate);
    const currentDaily = current?.dailyTargetHours ?? 0;
    const newDaily = Math.max(0, Number((currentDaily + delta).toFixed(1)));

    const updated = await appCore.targetTracker.setDailyTarget(categoryId, newDaily, weekStartDate);
    await appCore.sync.queueChange('weekly_targets', 'UPDATE', updated.toDTO());
  };

  const handleUpdateDayTarget = async (categoryId: string, dayOfWeek: number, delta: number) => {
    if (!checkLockGate()) return;
    const current = appCore.targetTracker.getTargetForCategory(categoryId, weekStartDate);
    const currentDayHours = current?.dailySchedule?.[dayOfWeek] ?? current?.dailyTargetHours ?? 0;
    const newHours = Math.max(0, Number((currentDayHours + delta).toFixed(1)));

    const updated = await appCore.targetTracker.setDayTarget(categoryId, dayOfWeek, newHours, weekStartDate);
    await appCore.sync.queueChange('weekly_targets', 'UPDATE', updated.toDTO());
  };

  const handleApplyPreset = async (categoryId: string, type: 'weekdays' | 'weekends', hours: number) => {
    if (!checkLockGate()) return;
    const current = appCore.targetTracker.getTargetForCategory(categoryId, weekStartDate);
    const baseDaily = current?.dailyTargetHours ?? 0;
    const currentSchedule: Record<number, number> = current?.dailySchedule
      ? { ...current.dailySchedule }
      : { 1: baseDaily, 2: baseDaily, 3: baseDaily, 4: baseDaily, 5: baseDaily, 6: baseDaily, 7: baseDaily };

    if (type === 'weekdays') {
      [1, 2, 3, 4, 5].forEach((d) => {
        currentSchedule[d] = hours;
      });
    } else {
      [6, 7].forEach((d) => {
        currentSchedule[d] = hours;
      });
    }

    const updated = await appCore.targetTracker.setDaySchedule(categoryId, currentSchedule, weekStartDate);
    await appCore.sync.queueChange('weekly_targets', 'UPDATE', updated.toDTO());
  };

  const handleAutoSumWeekly = async (categoryId: string) => {
    if (!checkLockGate()) return;
    const updated = await appCore.targetTracker.syncWeeklyToSchedule(categoryId, weekStartDate, true);
    await appCore.sync.queueChange('weekly_targets', 'UPDATE', updated.toDTO());
    setSyncedFeedbackCatId(categoryId);
    setTimeout(() => {
      setSyncedFeedbackCatId((prev) => (prev === categoryId ? null : prev));
    }, 2500);
  };

  const handleToggleAutoSync = async (categoryId: string, autoSync: boolean) => {
    if (!checkLockGate()) return;
    const updated = await appCore.targetTracker.setAutoSyncWeekly(categoryId, autoSync, weekStartDate);
    await appCore.sync.queueChange('weekly_targets', 'UPDATE', updated.toDTO());
    if (autoSync) {
      setSyncedFeedbackCatId(categoryId);
      setTimeout(() => {
        setSyncedFeedbackCatId((prev) => (prev === categoryId ? null : prev));
      }, 2500);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 sm:py-8">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white tracking-tight">Targets & Daily Quests</h2>
        <p className="text-sm text-slate-400">
          Set daily quests and weekly targets per category. Both track and update independently from your logged focus time.
        </p>
      </div>

      {/* Target Locker Status Banner (Anti-Goal Erosion Gate) */}
      <div
        className="mb-6 p-4 rounded-3xl border transition-all duration-300 shadow-sm overflow-hidden relative"
        style={{
          backgroundColor: lockStatus.allowed
            ? lockStatus.reason === 'emergency'
              ? 'rgba(245, 158, 11, 0.08)'
              : 'rgba(99, 102, 241, 0.08)'
            : 'rgba(239, 68, 68, 0.08)',
          borderColor: lockStatus.allowed
            ? lockStatus.reason === 'emergency'
              ? 'rgba(245, 158, 11, 0.3)'
              : 'rgba(99, 102, 241, 0.3)'
            : 'rgba(239, 68, 68, 0.3)',
        }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 border ${
                lockStatus.allowed
                  ? lockStatus.reason === 'emergency'
                    ? 'bg-amber-500/20 border-amber-500/30 text-amber-400'
                    : 'bg-indigo-500/20 border-indigo-500/30 text-indigo-400'
                  : 'bg-rose-500/20 border-rose-500/30 text-rose-400'
              }`}
            >
              {lockStatus.allowed ? (
                lockStatus.reason === 'emergency' ? (
                  <ShieldAlert className="w-4 h-4" />
                ) : (
                  <Unlock className="w-4 h-4" />
                )
              ) : (
                <Lock className="w-4 h-4" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Target Locker
                </span>
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                    lockStatus.allowed
                      ? lockStatus.reason === 'emergency'
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                        : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                      : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                  }`}
                >
                  {lockStatus.allowed
                    ? lockStatus.reason === 'emergency'
                      ? 'Emergency Edit Active'
                      : 'Monday Planning Window'
                    : 'Locked (Mid-Week)'}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                {lockStatus.allowed
                  ? lockStatus.reason === 'emergency'
                    ? '1-session emergency valve active. Adjustments will be logged in target_edit_log.'
                    : 'Monday planning open. Set your weekly focus goals and Mon–Sun day schedules.'
                  : `${lockStatus.nextWindowLabel}. Targets are locked to prevent mid-week goal erosion.`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
            {!lockStatus.allowed && !lockStatus.emergencyUsed && (
              <button
                onClick={() => setIsEmergencyModalOpen(true)}
                className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition shadow-md shadow-amber-500/10 flex items-center gap-1.5 active:scale-95"
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>Emergency Unlock</span>
              </button>
            )}

            {!lockStatus.allowed && lockStatus.emergencyUsed && (
              <span className="text-[10px] font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2.5 py-1 rounded-xl">
                Emergency Edit Used
              </span>
            )}
          </div>
        </div>
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
      <div className="space-y-4">
        {categories.map((cat) => {
          const target = appCore.targetTracker.getTargetForCategory(cat.id, weekStartDate);
          const targetHours = target ? target.targetHours : 0;
          const dailyTargetHours = target?.dailyTargetHours ?? 0;
          const isDaily = target?.isDaily !== false; // defaults to true
          const todayDayOfWeek = new Date().getDay() === 0 ? 7 : new Date().getDay();
          const todayDayObj = DAYS_OF_WEEK.find((d) => d.day === todayDayOfWeek);
          const todayTargetHours = target ? target.getTargetHoursForDate(new Date()) : dailyTargetHours;
          const hasCustomSchedule = !!target?.dailySchedule;
          const isScheduleExpanded = expandedCatIds.has(cat.id);
          const isRestDay = isDaily && hasCustomSchedule && todayTargetHours === 0;

          const scheduledWeeklyHours = target ? target.getScheduledWeeklyHours() : Number((dailyTargetHours * 7).toFixed(1));
          const autoSyncWeekly = target?.autoSyncWeekly ?? false;
          const isSynced = Math.abs(targetHours - scheduledWeeklyHours) <= 0.05;
          const isFeedbackActive = syncedFeedbackCatId === cat.id;

          // Weekly metrics (ultra fast memoized lookup)
          const loggedSec = categoryLoggedMap[cat.id] || 0;
          const loggedHours = Number((loggedSec / 3600).toFixed(1));
          const pct = targetHours > 0 ? Math.min(100, Number(((loggedHours / targetHours) * 100).toFixed(1))) : 0;
          const isOnTrack = target ? target.isOnTrack(appCore.sessionLog) : false;
          const isCompleted = targetHours > 0 && loggedHours >= targetHours;

          // Daily metrics (ultra fast memoized lookup)
          const loggedTodaySec = todayLoggedMap[cat.id] || 0;
          const loggedTodayHours = Number((loggedTodaySec / 3600).toFixed(1));
          const dailyPct = (isDaily && todayTargetHours > 0) ? Math.min(100, Number(((loggedTodaySec / (todayTargetHours * 3600)) * 100).toFixed(1))) : 0;
          const isDailyMet = isDaily && todayTargetHours > 0 && loggedTodayHours >= todayTargetHours;

          return (
            <div
              key={cat.id}
              className="glass-card rounded-2xl p-4 sm:p-5 border hover:border-slate-600/60 transition space-y-4"
              style={{
                borderColor: (targetHours > 0 || (isDaily && todayTargetHours > 0)) ? `${cat.color}35` : undefined,
              }}
            >
              {/* Category Header */}
              <div className="flex items-center justify-between gap-3">
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
                        {loggedTodayHours}h today • {loggedHours}h this week
                      </span>
                    </div>
                  </div>
                </div>

                {isCompleted && (
                  <span className="text-[11px] px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30 shrink-0 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> Week Met!
                  </span>
                )}
              </div>

              {/* Frequency Selector: Is this a daily target? */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
                <div className="flex items-center gap-2 text-xs">
                  <Calendar className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span className="font-semibold text-slate-200">Is this a daily target?</span>
                  <span className="text-[11px] text-slate-400 hidden sm:inline">
                    {isDaily ? '(Daily routine / quest)' : '(Non-daily / flexible event)'}
                  </span>
                </div>
                <div className="flex items-center p-0.5 rounded-xl bg-slate-800/90 border border-slate-700/80 text-xs">
                  <button
                    onClick={() => handleToggleDaily(cat.id, true)}
                    className={`px-3 py-1 rounded-lg font-semibold transition-all ${
                      isDaily
                        ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Daily
                  </button>
                  <button
                    onClick={() => handleToggleDaily(cat.id, false)}
                    className={`px-3 py-1 rounded-lg font-semibold transition-all ${
                      !isDaily
                        ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Not Daily
                  </button>
                </div>
              </div>

              {/* 1. Daily Quest Target Section (Only if isDaily is true) */}
              {isDaily ? (
                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="w-2 h-2 rounded-full bg-amber-400" />
                      <span className="text-xs font-bold text-white">
                        {hasCustomSchedule ? `Today's Quest (${todayDayObj?.short})` : 'Daily Quest'}
                      </span>
                      {hasCustomSchedule && (
                        <span className="text-[10px] text-purple-300 font-semibold bg-purple-500/20 px-1.5 py-0.5 rounded border border-purple-500/30">
                          Custom Schedule
                        </span>
                      )}
                      {todayTargetHours > 0 && isDailyMet && (
                        <span className="text-[10px] text-emerald-400 font-semibold bg-emerald-500/20 px-1.5 py-0.5 rounded">
                          Done!
                        </span>
                      )}
                      {isRestDay && (
                        <span className="text-[10px] text-indigo-300 font-semibold bg-indigo-500/20 px-1.5 py-0.5 rounded">
                          Rest Day
                        </span>
                      )}
                    </div>

                    {/* Today's Stepper */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <div className="flex items-center gap-1 bg-slate-800/80 p-0.5 rounded-xl border border-slate-700">
                        <button
                          onClick={() => {
                            if (hasCustomSchedule) {
                              handleUpdateDayTarget(cat.id, todayDayOfWeek, -0.5);
                            } else {
                              handleUpdateDailyTargetHours(cat.id, -0.5);
                            }
                          }}
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition active:scale-90"
                          title="Decrease 0.5 hour"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="min-w-[2.8rem] text-center font-mono font-bold text-sm text-white tabular-nums select-none">
                          {todayTargetHours}
                        </span>
                        <button
                          onClick={() => {
                            if (hasCustomSchedule) {
                              handleUpdateDayTarget(cat.id, todayDayOfWeek, 0.5);
                            } else {
                              handleUpdateDailyTargetHours(cat.id, 0.5);
                            }
                          }}
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition active:scale-90"
                          title="Increase 0.5 hour"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                      <span className="text-[10px] text-slate-400">h/day</span>
                    </div>
                  </div>

                  {/* Daily Progress Bar */}
                  {todayTargetHours > 0 ? (
                    <div>
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <span className="text-slate-400">
                          {dailyPct}% Today ({todayDayObj?.name})
                        </span>
                        <span className="font-mono text-slate-400">
                          {loggedTodayHours} / {todayTargetHours} hrs
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-amber-500 to-orange-400"
                          style={{ width: `${dailyPct}%` }}
                        />
                      </div>
                    </div>
                  ) : isRestDay ? (
                    <div className="text-[11px] text-indigo-300 italic flex items-center gap-1.5 py-0.5">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                      <span>Today is scheduled as a Rest Day (0h). Logged focus time is bonus!</span>
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-500 italic">
                      Set a daily goal (e.g. 1h/day) to activate your Daily Quest
                    </div>
                  )}

                  {/* Expand/Collapse Custom Day Schedule */}
                  <div className="pt-1.5 border-t border-slate-800/60">
                    <button
                      onClick={() => toggleScheduleExpand(cat.id)}
                      className="w-full py-1.5 px-2 rounded-lg flex items-center justify-between text-[11px] text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 transition"
                    >
                      <div className="flex items-center gap-1.5 font-medium">
                        <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                        <span>
                          {hasCustomSchedule
                            ? 'Day-by-Day Schedule Active (Mon–Sun)'
                            : 'Customize by Day (e.g. higher Sunday target)'}
                        </span>
                      </div>
                      <ChevronDown
                        className={`w-3.5 h-3.5 transition-transform duration-200 ${
                          isScheduleExpanded ? 'rotate-180 text-indigo-400' : ''
                        }`}
                      />
                    </button>

                    {/* Expandable 7-day schedule drawer */}
                    {isScheduleExpanded && (
                      <div className="mt-2 p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">
                            Daily Hours Schedule
                          </span>
                          <span className="text-[10px] text-slate-500">
                            Scheduled total:{' '}
                            <strong className="text-indigo-300 font-mono">
                              {target ? target.getScheduledWeeklyHours() : dailyTargetHours * 7}h/wk
                            </strong>
                          </span>
                        </div>

                        {/* 7-Day Steppers Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
                          {DAYS_OF_WEEK.map((d) => {
                            const isToday = d.day === todayDayOfWeek;
                            const dayHours = target?.dailySchedule?.[d.day] ?? dailyTargetHours;

                            return (
                              <div
                                key={d.day}
                                className={`p-2 rounded-xl flex flex-col items-center gap-1 border transition-all ${
                                  isToday
                                    ? 'bg-indigo-950/40 border-indigo-500/50 ring-1 ring-indigo-500/30'
                                    : 'bg-slate-900/80 border-slate-800'
                                }`}
                              >
                                <div className="flex items-center gap-1">
                                  <span className={`text-[11px] font-bold ${isToday ? 'text-indigo-300' : 'text-slate-300'}`}>
                                    {d.short}
                                  </span>
                                  {isToday && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" title="Today" />
                                  )}
                                </div>
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => handleUpdateDayTarget(cat.id, d.day, -0.5)}
                                    className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-white hover:bg-slate-800 transition active:scale-90"
                                    title={`Decrease ${d.name} target`}
                                  >
                                    <Minus className="w-2.5 h-2.5" />
                                  </button>
                                  <span className="min-w-[1.6rem] text-center font-mono font-bold text-xs text-white tabular-nums">
                                    {dayHours}
                                  </span>
                                  <button
                                    onClick={() => handleUpdateDayTarget(cat.id, d.day, 0.5)}
                                    className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-white hover:bg-slate-800 transition active:scale-90"
                                    title={`Increase ${d.name} target`}
                                  >
                                    <Plus className="w-2.5 h-2.5" />
                                  </button>
                                </div>
                                <span className="text-[9px] text-slate-500">hrs</span>
                              </div>
                            );
                          })}
                        </div>

                        {/* Quick Presets & Auto-Sum */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-900 text-xs">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[10px] text-slate-500 font-medium">Quick presets:</span>
                            <button
                              onClick={() => handleApplyPreset(cat.id, 'weekdays', 1.5)}
                              className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition active:scale-95"
                            >
                              Mon–Fri 1.5h
                            </button>
                            <button
                              onClick={() => handleApplyPreset(cat.id, 'weekends', 4.0)}
                              className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition active:scale-95"
                            >
                              Sat–Sun 4h
                            </button>
                            <button
                              onClick={() => handleApplyPreset(cat.id, 'weekends', 0)}
                              className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition active:scale-95"
                            >
                              Weekend Off
                            </button>
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="flex items-center gap-1.5 text-[11px] text-slate-300 hover:text-white cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={autoSyncWeekly}
                                onChange={(e) => handleToggleAutoSync(cat.id, e.target.checked)}
                                className="w-3.5 h-3.5 rounded bg-slate-800 border-slate-700 text-indigo-500 focus:ring-0 cursor-pointer"
                              />
                              <span>Keep auto-synced</span>
                            </label>
                            <button
                              onClick={() => handleAutoSumWeekly(cat.id)}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition flex items-center gap-1 shrink-0 ${
                                isFeedbackActive
                                  ? 'text-emerald-300 bg-emerald-500/20 border border-emerald-500/40'
                                  : isSynced
                                  ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20'
                                  : 'text-indigo-300 hover:text-white bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 active:scale-95'
                              }`}
                              title={isSynced ? 'Weekly target is matched with day schedule' : 'Sync weekly target to match schedule total'}
                            >
                              {isFeedbackActive || isSynced ? (
                                <Check className="w-3 h-3 text-emerald-400" />
                              ) : (
                                <Sparkles className="w-3 h-3 text-indigo-400" />
                              )}
                              <span>
                                {isFeedbackActive
                                  ? 'Synced!'
                                  : isSynced
                                  ? `In Sync (${scheduledWeeklyHours}h)`
                                  : `Sync Weekly (${scheduledWeeklyHours}h)`}
                              </span>
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* Not Daily State */
                <div className="p-3.5 rounded-xl bg-slate-900/40 border border-dashed border-purple-500/30 flex items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <div className="w-2 h-2 rounded-full bg-purple-400 shrink-0 mt-1.5" />
                    <div>
                      <div className="text-xs font-bold text-purple-300">Non-Daily Event</div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        No daily quest required. Log focus time whenever this event happens and track towards your weekly target.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleToggleDaily(cat.id, true)}
                    className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium underline underline-offset-2 shrink-0"
                  >
                    Make Daily
                  </button>
                </div>
              )}

              {/* 2. Weekly Target Section */}
              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
                    <span className="text-xs font-bold text-white">Weekly Target</span>
                    {targetHours > 0 && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        !isDaily
                          ? 'text-purple-300 bg-purple-500/20 border border-purple-500/30'
                          : isOnTrack
                          ? 'text-indigo-300 bg-indigo-500/20'
                          : 'text-amber-400 bg-amber-500/20'
                      }`}>
                        {!isDaily ? 'Flexible Schedule' : isOnTrack ? 'On Pace' : 'Behind'}
                      </span>
                    )}
                    {isDaily && autoSyncWeekly && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold text-emerald-400 bg-emerald-500/15 border border-emerald-500/25 flex items-center gap-1">
                        <Check className="w-2.5 h-2.5" /> Auto-synced
                      </span>
                    )}
                    {isDaily && scheduledWeeklyHours > 0 && !isSynced && (
                      <button
                        onClick={() => handleAutoSumWeekly(cat.id)}
                        className="px-2 py-0.5 rounded text-[10px] font-bold text-indigo-300 hover:text-white bg-indigo-600/25 hover:bg-indigo-600/40 border border-indigo-500/40 transition flex items-center gap-1 active:scale-95 shadow-sm"
                        title={`Schedule sum is ${scheduledWeeklyHours}h/wk. Click to sync weekly target.`}
                      >
                        <Sparkles className="w-2.5 h-2.5 text-indigo-400" />
                        <span>Sync to Schedule ({scheduledWeeklyHours}h)</span>
                      </button>
                    )}
                    {isFeedbackActive && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-bold text-emerald-300 bg-emerald-500/20 border border-emerald-500/30 flex items-center gap-1 animate-fade-in">
                        <Check className="w-2.5 h-2.5 text-emerald-400" /> Synced to {scheduledWeeklyHours}h!
                      </span>
                    )}
                  </div>

                  {/* Weekly Stepper */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <div className="flex items-center gap-1 bg-slate-800/80 p-0.5 rounded-xl border border-slate-700">
                      <button
                        onClick={() => handleUpdateTargetHours(cat.id, -1)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition active:scale-90"
                        title="Decrease 1 hour"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="min-w-[2.8rem] text-center font-mono font-bold text-sm text-white tabular-nums select-none">
                        {targetHours}
                      </span>
                      <button
                        onClick={() => handleUpdateTargetHours(cat.id, 1)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition active:scale-90"
                        title="Increase 1 hour"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                    <span className="text-[10px] text-slate-400">h/wk</span>
                  </div>
                </div>

                {/* Weekly Progress Bar */}
                {targetHours > 0 ? (
                  <div>
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="text-slate-400">
                        {pct}% Completed
                      </span>
                      <span className="font-mono text-slate-400">
                        {Math.max(0, Number((targetHours - loggedHours).toFixed(1)))} hrs remaining
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
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
                  <div className="text-[11px] text-slate-500 italic">
                    Set a weekly goal to track completion for {cat.name}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Target Locker Emergency Unlock Modal */}
      <EmergencyEditModal
        isOpen={isEmergencyModalOpen}
        onClose={() => setIsEmergencyModalOpen(false)}
        onUnlocked={() => {
          setLockStatus(appCore.targetLockPolicy.canEdit());
          forceRefresh();
        }}
      />
    </div>
  );
};
