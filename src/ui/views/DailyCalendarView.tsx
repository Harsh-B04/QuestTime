import React, { useState, useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  CheckCircle2,
  Clock,
  Plus,
  Edit2,
  Trash2,
  Target,
  ArrowRight,
  X,
} from 'lucide-react';
import { appCore } from '../../core';
import { Session, type Category } from '../../core';
import { CategoryIcon } from '../components/CategoryIcon';

interface DailyCalendarViewProps {
  onSwitchToTimer?: () => void;
}

export const DailyCalendarView: React.FC<DailyCalendarViewProps> = ({ onSwitchToTimer }) => {
  const [categories, setCategories] = useState<Category[]>(appCore.categories);
  const [currentMonthDate, setCurrentMonthDate] = useState<Date>(new Date());
  const [selectedDateStr, setSelectedDateStr] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [dailyGoalHours, setDailyGoalHours] = useState<number>(4); // Default 4 hours daily focus goal
  const [isEditingDailyGoal, setIsEditingDailyGoal] = useState<boolean>(false);
  const [customGoalInput, setCustomGoalInput] = useState<number>(4);

  // Modal states
  const [editingSession, setEditingSession] = useState<Session | null>(null);
  const [editNote, setEditNote] = useState<string>('');
  const [editDurationMin, setEditDurationMin] = useState<number>(0);
  const [editCategoryId, setEditCategoryId] = useState<string>('');

  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [addDurationMin, setAddDurationMin] = useState<number>(45);
  const [addCategoryId, setAddCategoryId] = useState<string>(appCore.categories[0]?.id || '');
  const [addNote, setAddNote] = useState<string>('');

  const [deleteSessionId, setDeleteSessionId] = useState<string | null>(null);
  const [, setTrigger] = useState<number>(0);

  const forceRefresh = () => setTrigger((t) => t + 1);

  useEffect(() => {
    setCategories([...appCore.categories]);

    // Load saved daily focus goal
    appCore.storage.getSetting<number>('daily_goal_hours').then((saved) => {
      if (saved && saved > 0) {
        setDailyGoalHours(saved);
        setCustomGoalInput(saved);
      }
    });

    const unsubLog = appCore.sessionLog.subscribe(forceRefresh);
    const unsubTargets = appCore.targetTracker.subscribe(forceRefresh);
    const unsubCats = appCore.onCategoriesChange(() => {
      setCategories([...appCore.categories]);
      forceRefresh();
    });

    return () => {
      unsubLog();
      unsubTargets();
      unsubCats();
    };
  }, []);

  const saveDailyGoal = async (hours: number) => {
    const val = Math.max(0.5, Math.min(24, hours));
    setDailyGoalHours(val);
    await appCore.storage.setSetting('daily_goal_hours', val);
    setIsEditingDailyGoal(false);
  };

  const year = currentMonthDate.getFullYear();
  const month = currentMonthDate.getMonth();

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  const handlePrevMonth = () => {
    setCurrentMonthDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonthDate(new Date(year, month + 1, 1));
  };

  const handleTodayJump = () => {
    const today = new Date();
    setCurrentMonthDate(today);
    setSelectedDateStr(today.toISOString().split('T')[0]);
  };

  const pad = (n: number) => String(n).padStart(2, '0');
  const todayStr = new Date().toISOString().split('T')[0];

  // All sessions
  const allSessions = appCore.sessionLog.getAll();

  // Sessions grouped by day string
  const sessionsByDay = allSessions.reduce<Record<string, Session[]>>((acc, s) => {
    const day = s.startTime.split('T')[0];
    if (!acc[day]) acc[day] = [];
    acc[day].push(s);
    return acc;
  }, {});

  // Selected Day Calculations
  const selectedDaySessions = sessionsByDay[selectedDateStr] || [];
  const selectedDayDoneSec = selectedDaySessions.reduce((sum, s) => sum + s.durationSec, 0);
  const selectedDayDoneHours = Number((selectedDayDoneSec / 3600).toFixed(1));
  const selectedDayTargetSec = dailyGoalHours * 3600;
  const selectedDayLeftSec = Math.max(0, selectedDayTargetSec - selectedDayDoneSec);
  const selectedDayLeftHours = Number((selectedDayLeftSec / 3600).toFixed(1));
  const selectedDayProgressPct = Math.min(100, Math.round((selectedDayDoneSec / selectedDayTargetSec) * 100));
  const isSelectedDayCompleted = selectedDayDoneSec >= selectedDayTargetSec;

  // Calendar Grid Days Calculation
  const firstDayOfMonth = new Date(year, month, 1);
  let startDayOfWeek = firstDayOfMonth.getDay() - 1;
  if (startDayOfWeek === -1) startDayOfWeek = 6; // Monday = 0

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  interface CalendarGridCell {
    dateStr: string;
    dayNumber: number;
    isCurrentMonth: boolean;
    isToday: boolean;
    doneSec: number;
    doneHours: number;
    progressPct: number;
    isGoalMet: boolean;
    categoryColors: string[];
    sessions: Session[];
  }

  const calendarGrid: CalendarGridCell[] = [];

  // Previous month padding
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const dNum = daysInPrevMonth - i;
    const prevDate = new Date(year, month - 1, dNum);
    const dStr = `${prevDate.getFullYear()}-${pad(prevDate.getMonth() + 1)}-${pad(dNum)}`;
    const dSessions = sessionsByDay[dStr] || [];
    const dSec = dSessions.reduce((sum, s) => sum + s.durationSec, 0);
    const dHours = Number((dSec / 3600).toFixed(1));
    const pct = Math.min(100, Math.round((dSec / selectedDayTargetSec) * 100));
    const colors = Array.from(
      new Set(dSessions.map((s) => categories.find((c) => c.id === s.categoryId)?.color || '#6366f1'))
    );

    calendarGrid.push({
      dateStr: dStr,
      dayNumber: dNum,
      isCurrentMonth: false,
      isToday: dStr === todayStr,
      doneSec: dSec,
      doneHours: dHours,
      progressPct: pct,
      isGoalMet: dSec >= selectedDayTargetSec,
      categoryColors: colors,
      sessions: dSessions,
    });
  }

  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    const dStr = `${year}-${pad(month + 1)}-${pad(d)}`;
    const dSessions = sessionsByDay[dStr] || [];
    const dSec = dSessions.reduce((sum, s) => sum + s.durationSec, 0);
    const dHours = Number((dSec / 3600).toFixed(1));
    const pct = Math.min(100, Math.round((dSec / selectedDayTargetSec) * 100));
    const colors = Array.from(
      new Set(dSessions.map((s) => categories.find((c) => c.id === s.categoryId)?.color || '#6366f1'))
    );

    calendarGrid.push({
      dateStr: dStr,
      dayNumber: d,
      isCurrentMonth: true,
      isToday: dStr === todayStr,
      doneSec: dSec,
      doneHours: dHours,
      progressPct: pct,
      isGoalMet: dSec >= selectedDayTargetSec,
      categoryColors: colors,
      sessions: dSessions,
    });
  }

  // Next month padding
  const remainingCells = (7 - (calendarGrid.length % 7)) % 7;
  for (let d = 1; d <= remainingCells; d++) {
    const nextDate = new Date(year, month + 1, d);
    const dStr = `${nextDate.getFullYear()}-${pad(nextDate.getMonth() + 1)}-${pad(d)}`;
    const dSessions = sessionsByDay[dStr] || [];
    const dSec = dSessions.reduce((sum, s) => sum + s.durationSec, 0);
    const dHours = Number((dSec / 3600).toFixed(1));
    const pct = Math.min(100, Math.round((dSec / selectedDayTargetSec) * 100));
    const colors = Array.from(
      new Set(dSessions.map((s) => categories.find((c) => c.id === s.categoryId)?.color || '#6366f1'))
    );

    calendarGrid.push({
      dateStr: dStr,
      dayNumber: d,
      isCurrentMonth: false,
      isToday: dStr === todayStr,
      doneSec: dSec,
      doneHours: dHours,
      progressPct: pct,
      isGoalMet: dSec >= selectedDayTargetSec,
      categoryColors: colors,
      sessions: dSessions,
    });
  }

  const formatDuration = (sec: number) => {
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    if (hrs > 0) return `${hrs}h ${mins > 0 ? `${mins}m` : ''}`;
    return `${mins}m`;
  };

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const getDayHeading = (dateStr: string) => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    if (dateStr === todayStr) return 'Today';
    if (dateStr === yesterday) return 'Yesterday';
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Actions
  const handleSaveEdit = async () => {
    if (!editingSession) return;
    editingSession.update({
      categoryId: editCategoryId,
      note: editNote,
      durationSec: Math.max(60, editDurationMin * 60),
    });
    await appCore.sessionLog.update(editingSession);
    await appCore.sync.queueChange('sessions', 'UPDATE', editingSession.toDTO());
    setEditingSession(null);
    forceRefresh();
  };

  const handleDeleteSession = async (id: string) => {
    await appCore.sessionLog.delete(id);
    await appCore.sync.queueChange('sessions', 'DELETE', { id });
    setDeleteSessionId(null);
    forceRefresh();
  };

  const handleManualAdd = async () => {
    if (!addCategoryId) return;
    const selectedDate = new Date(selectedDateStr + 'T12:00:00');
    const startTime = new Date(selectedDate.getTime() - addDurationMin * 60000).toISOString();
    const endTime = selectedDate.toISOString();

    const newSession = new Session({
      id: crypto.randomUUID(),
      categoryId: addCategoryId,
      startTime,
      endTime,
      durationSec: addDurationMin * 60,
      note: addNote.trim() || undefined,
      createdAt: endTime,
      updatedAt: endTime,
    });

    await appCore.sessionLog.add(newSession);
    await appCore.sync.queueChange('sessions', 'INSERT', newSession.toDTO());
    await appCore.gamification.evaluateSession(newSession, appCore.sessionLog, appCore.targetTracker);

    setShowAddModal(false);
    setAddNote('');
    forceRefresh();
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 sm:py-8 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-semibold uppercase tracking-wider">
              Daily Focus Logger
            </span>
            <span className="text-slate-400 text-xs">•</span>
            <span className="text-slate-300 text-xs">Work Done vs Work Left</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Daily Quest Calendar
          </h2>
        </div>

        {/* Daily Goal Stepper / Setter */}
        <div className="flex items-center gap-3 p-2 rounded-2xl bg-slate-900/80 border border-white/10 self-start sm:self-auto">
          <Target className="w-4 h-4 text-indigo-400 ml-1" />
          <div className="text-xs text-slate-300 font-medium">
            Daily Goal:{' '}
            {isEditingDailyGoal ? (
              <span className="inline-flex items-center gap-1">
                <input
                  type="number"
                  min="0.5"
                  max="24"
                  step="0.5"
                  value={customGoalInput}
                  onChange={(e) => setCustomGoalInput(Number(e.target.value))}
                  className="w-14 px-1.5 py-0.5 rounded bg-slate-800 border border-indigo-500 text-white font-mono text-xs"
                />
                <button
                  onClick={() => saveDailyGoal(customGoalInput)}
                  className="px-2 py-0.5 rounded bg-indigo-600 text-white text-[10px] font-bold hover:bg-indigo-500"
                >
                  Save
                </button>
              </span>
            ) : (
              <span
                onClick={() => setIsEditingDailyGoal(true)}
                className="font-mono text-white font-bold cursor-pointer hover:underline underline-offset-2 ml-1"
                title="Click to edit daily goal"
              >
                {dailyGoalHours} hrs / day
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Gamified Hero Card: Work Done vs Work Left on Selected Day */}
      <div className="relative glass-panel rounded-2xl sm:rounded-3xl p-4 sm:p-8 border-indigo-500/30 overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-60 h-60 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-6 mb-4 sm:mb-6">
          <div>
            <div className="flex items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
              <CalendarIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-indigo-400" />
              <span>{getDayHeading(selectedDateStr)}</span>
            </div>
            <h3 className="text-xl sm:text-3xl font-extrabold text-white font-mono">
              {selectedDayDoneHours} <span className="text-sm sm:text-base text-slate-400 font-normal">hrs done</span>
              <span className="text-slate-500 mx-1.5 sm:mx-2">/</span>
              <span className="text-indigo-300">{dailyGoalHours} hrs goal</span>
            </h3>

            <div className="flex items-center gap-2 mt-2">
              {isSelectedDayCompleted ? (
                <div className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-[11px] sm:text-xs font-bold border border-emerald-500/30">
                  <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400 shrink-0" />
                  <span>Daily Quest Conquered! (+50 XP)</span>
                </div>
              ) : (
                <div className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full bg-amber-500/15 text-amber-300 text-[11px] sm:text-xs font-semibold border border-amber-500/30">
                  <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-400 shrink-0" />
                  <span>{selectedDayLeftHours} hrs left today</span>
                </div>
              )}
            </div>
          </div>

          {/* Big Circular Progress Indicator */}
          <div className="flex items-center gap-3 sm:gap-4 self-center md:self-auto">
            <div className="relative w-20 h-20 sm:w-28 sm:h-28 flex items-center justify-center shrink-0">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  className="text-slate-800"
                  strokeWidth="8"
                  stroke="currentColor"
                  fill="transparent"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  stroke={isSelectedDayCompleted ? '#10b981' : '#6366f1'}
                  strokeWidth="8"
                  strokeDasharray={2 * Math.PI * 40}
                  strokeDashoffset={2 * Math.PI * 40 * (1 - selectedDayProgressPct / 100)}
                  strokeLinecap="round"
                  fill="transparent"
                  className="transition-all duration-700 ease-out"
                />
              </svg>
              <div className="absolute flex flex-col items-center justify-center text-center">
                <span className="text-lg sm:text-2xl font-black text-white font-mono leading-none">
                  {selectedDayProgressPct}%
                </span>
                <span className="text-[9px] sm:text-[10px] uppercase font-bold text-slate-400 mt-0.5">
                  {isSelectedDayCompleted ? 'Done' : 'Paced'}
                </span>
              </div>
            </div>

            {selectedDateStr === todayStr && onSwitchToTimer && (
              <button
                onClick={onSwitchToTimer}
                className="flex flex-col items-center justify-center gap-1 p-2.5 sm:p-4 rounded-xl sm:rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold text-xs shadow-lg shadow-indigo-500/25 transition active:scale-95 select-none"
              >
                <div className="flex items-center gap-1 font-bold">
                  <span>Focus</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>
                <span className="text-[9px] sm:text-[10px] text-indigo-200 font-normal hidden sm:inline">Knock out remaining</span>
              </button>
            )}
          </div>
        </div>

        {/* Linear Progress Bar */}
        <div className="w-full h-2 sm:h-3 rounded-full bg-slate-800/80 overflow-hidden p-0.5 border border-white/5">
          <div
            className={`h-full rounded-full transition-all duration-700 ${
              isSelectedDayCompleted
                ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                : 'bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-400'
            }`}
            style={{ width: `${selectedDayProgressPct}%` }}
          />
        </div>
      </div>

      {/* Interactive Month Calendar Grid */}
      <div className="glass-panel rounded-2xl sm:rounded-3xl p-3 sm:p-6 border border-white/10">
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <div className="flex items-center gap-2">
            <CalendarIcon className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-400" />
            <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
              {monthNames[month]} {year}
            </h3>
          </div>
          <div className="flex items-center gap-1 sm:gap-1.5">
            <button
              onClick={handleTodayJump}
              className="px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 border border-slate-700 transition"
            >
              Today
            </button>
            <button
              onClick={handlePrevMonth}
              className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition active:scale-95"
              aria-label="Previous Month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={handleNextMonth}
              className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition active:scale-95"
              aria-label="Next Month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Days of Week Header */}
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
          <span>Mon</span>
          <span>Tue</span>
          <span>Wed</span>
          <span>Thu</span>
          <span>Fri</span>
          <span>Sat</span>
          <span>Sun</span>
        </div>

        {/* 7-column Calendar Cells */}
        <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
          {calendarGrid.map((cell) => {
            const isSelected = cell.dateStr === selectedDateStr;

            return (
              <button
                key={cell.dateStr}
                onClick={() => setSelectedDateStr(cell.dateStr)}
                className={`relative min-h-[58px] sm:min-h-[76px] p-1 sm:p-2 rounded-xl sm:rounded-2xl flex flex-col justify-between items-center transition-all border select-none ${
                  cell.isGoalMet
                    ? 'bg-emerald-950/40 border-emerald-500/40 hover:bg-emerald-900/50'
                    : cell.doneSec > 0
                    ? 'bg-indigo-950/40 border-indigo-500/30 hover:bg-indigo-900/50'
                    : 'bg-slate-900/40 border-white/5 hover:bg-slate-800/60'
                } ${
                  isSelected
                    ? 'ring-2 ring-indigo-400 border-indigo-400 shadow-xl shadow-indigo-500/25 z-10 scale-[1.02]'
                    : ''
                } ${!cell.isCurrentMonth ? 'opacity-30' : 'opacity-100'}`}
              >
                {/* Header: Day number & Goal Checkmark */}
                <div className="w-full flex items-center justify-between">
                  <span
                    className={`text-[11px] sm:text-xs font-bold rounded-full w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center ${
                      cell.isToday
                        ? 'bg-indigo-500 text-white'
                        : isSelected
                        ? 'text-indigo-300'
                        : 'text-slate-300'
                    }`}
                  >
                    {cell.dayNumber}
                  </span>
                  {cell.isGoalMet ? (
                    <CheckCircle2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-400 shrink-0" />
                  ) : cell.doneSec > 0 ? (
                    <span className="text-[9px] sm:text-[10px] font-mono text-indigo-300 font-bold hidden sm:inline">
                      {cell.doneHours}h
                    </span>
                  ) : null}
                </div>

                {/* Category Color Dots */}
                <div className="flex items-center justify-center gap-0.5 sm:gap-1 w-full my-0.5 sm:my-1">
                  {cell.categoryColors.slice(0, 3).map((c, i) => (
                    <span
                      key={i}
                      className="w-1 sm:w-1.5 h-1 sm:h-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                  {cell.categoryColors.length > 3 && (
                    <span className="text-[7px] sm:text-[8px] text-slate-400 font-bold">+</span>
                  )}
                </div>

                {/* Bottom Mini Progress Bar */}
                <div className="w-full h-1 sm:h-1.5 rounded-full bg-slate-800/80 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      cell.isGoalMet ? 'bg-emerald-400' : 'bg-indigo-500'
                    }`}
                    style={{ width: `${cell.progressPct}%` }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Day Logged Sessions Breakdown */}
      <div className="glass-panel rounded-3xl p-5 sm:p-6 border border-white/10">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h4 className="text-lg font-bold text-white flex items-center gap-2">
              <span>{getDayHeading(selectedDateStr)} Breakdown</span>
            </h4>
            <span className="text-xs text-slate-400">
              {selectedDaySessions.length} sessions logged •{' '}
              <span className="font-mono text-indigo-300 font-semibold">{formatDuration(selectedDayDoneSec)} total</span>
            </span>
          </div>

          <button
            onClick={() => {
              setAddCategoryId(categories[0]?.id || '');
              setShowAddModal(true);
            }}
            className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow transition active:scale-95 self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Log Time on this Day</span>
          </button>
        </div>

        {selectedDaySessions.length === 0 ? (
          <div className="py-10 text-center text-slate-500 text-xs italic bg-slate-900/40 rounded-2xl border border-white/5">
            No focus sessions logged on this day. Tap "+ Log Time on this Day" or start the timer to begin!
          </div>
        ) : (
          <div className="space-y-2.5">
            {selectedDaySessions.map((session) => {
              const cat = categories.find((c) => c.id === session.categoryId);
              return (
                <div
                  key={session.id}
                  className="glass-card rounded-2xl p-4 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                      style={{
                        backgroundColor: `${cat?.color || '#6366f1'}20`,
                        color: cat?.color || '#6366f1',
                      }}
                    >
                      <CategoryIcon name={cat?.icon || 'Clock'} className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-sm font-semibold text-white">{cat?.name || 'Category'}</span>
                      {/* Time range - prominent */}
                      <div className="flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3 text-indigo-400 shrink-0" />
                        <span className="text-xs font-mono text-indigo-300 font-semibold">
                          {formatTime(session.startTime)} → {formatTime(session.endTime)}
                        </span>
                      </div>
                      {session.note ? (
                        <p className="text-xs text-slate-300 truncate mt-0.5">{session.note}</p>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono text-xs font-bold text-white px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700">
                      {formatDuration(session.durationSec)}
                    </span>
                    <button
                      onClick={() => {
                        setEditingSession(session);
                        setEditNote(session.note || '');
                        setEditDurationMin(Math.round(session.durationSec / 60));
                        setEditCategoryId(session.categoryId);
                      }}
                      className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
                      title="Edit session"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeleteSessionId(session.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition"
                      title="Delete session"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Manual Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Log Work for {selectedDateStr}</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">Category</label>
              <select
                value={addCategoryId}
                onChange={(e) => setAddCategoryId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">Duration (Minutes)</label>
              <input
                type="number"
                min="1"
                value={addDurationMin}
                onChange={(e) => setAddDurationMin(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">What did you accomplish?</label>
              <input
                type="text"
                value={addNote}
                onChange={(e) => setAddNote(e.target.value)}
                placeholder="Notes / task completed..."
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleManualAdd}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow"
              >
                Save to Calendar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Session Modal */}
      {editingSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Edit Session</h3>
              <button onClick={() => setEditingSession(null)} className="text-slate-400 hover:text-white p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">Category</label>
              <select
                value={editCategoryId}
                onChange={(e) => setEditCategoryId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">Duration (Minutes)</label>
              <input
                type="number"
                min="1"
                value={editDurationMin}
                onChange={(e) => setEditDurationMin(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">Note</label>
              <input
                type="text"
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setEditingSession(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteSessionId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-white">Delete this session?</h3>
            <p className="text-xs text-slate-400">
              This will remove the logged time from this day and recalculate your daily and weekly progress.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setDeleteSessionId(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteSession(deleteSessionId)}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
