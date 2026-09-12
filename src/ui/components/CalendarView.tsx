import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Edit2, Trash2 } from 'lucide-react';
import type { Session, Category } from '../../core';
import { CategoryIcon } from './CategoryIcon';

interface CalendarViewProps {
  sessions: Session[];
  categories: Category[];
  onEditSession: (session: Session) => void;
  onDeleteSession: (id: string) => void;
}

/** Returns YYYY-MM-DD in local time */
const getLocalTodayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Ms until next local midnight */
const msUntilMidnight = () => {
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return midnight.getTime() - now.getTime();
};

export const CalendarView: React.FC<CalendarViewProps> = ({
  sessions,
  categories,
  onEditSession,
  onDeleteSession,
}) => {
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [selectedDateStr, setSelectedDateStr] = useState<string>(getLocalTodayStr());
  // Reactive today string — updated at midnight via a timer
  const [todayStr, setTodayStr] = useState<string>(getLocalTodayStr());

  // Advance "today" at midnight
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timeoutId = setTimeout(() => {
        const newToday = getLocalTodayStr();
        setTodayStr(newToday);
        schedule();
      }, msUntilMidnight());
    };
    schedule();
    return () => clearTimeout(timeoutId);
  }, []);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth(); // 0-indexed

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const handleToday = () => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDateStr(today.toISOString().split('T')[0]);
  };

  // Group sessions by day string (YYYY-MM-DD)
  const sessionsByDay = sessions.reduce<Record<string, Session[]>>((acc, s) => {
    const day = s.startTime.split('T')[0];
    if (!acc[day]) acc[day] = [];
    acc[day].push(s);
    return acc;
  }, {});

  // Calculate calendar grid days
  // First day of current month
  const firstDayOfMonth = new Date(year, month, 1);
  // Day of week: 0=Sun, 1=Mon, ..., 6=Sat. We want Monday as day 0.
  let startDayOfWeek = firstDayOfMonth.getDay() - 1;
  if (startDayOfWeek === -1) startDayOfWeek = 6; // Sunday becomes 6

  // Total days in current month
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Days in previous month for padding
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  interface DayCell {
    dateStr: string;
    dayNumber: number;
    isCurrentMonth: boolean;
    isToday: boolean;
    totalSec: number;
    categoryColors: string[];
    sessions: Session[];
  }

  const calendarDays: DayCell[] = [];
  // All calendar grid derivations below use the reactive `todayStr` state

  const pad = (n: number) => String(n).padStart(2, '0');

  // Padding days from previous month
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const dNum = daysInPrevMonth - i;
    const prevMonthDate = new Date(year, month - 1, dNum);
    const dStr = `${prevMonthDate.getFullYear()}-${pad(prevMonthDate.getMonth() + 1)}-${pad(dNum)}`;
    const daySessions = sessionsByDay[dStr] || [];
    const totalSec = daySessions.reduce((sum, s) => sum + s.durationSec, 0);

    const catColors = Array.from(
      new Set(
        daySessions.map((s) => categories.find((c) => c.id === s.categoryId)?.color || '#6366f1')
      )
    );

    calendarDays.push({
      dateStr: dStr,
      dayNumber: dNum,
      isCurrentMonth: false,
      isToday: dStr === todayStr,
      totalSec,
      categoryColors: catColors,
      sessions: daySessions,
    });
  }

  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    const dStr = `${year}-${pad(month + 1)}-${pad(d)}`;
    const daySessions = sessionsByDay[dStr] || [];
    const totalSec = daySessions.reduce((sum, s) => sum + s.durationSec, 0);

    const catColors = Array.from(
      new Set(
        daySessions.map((s) => categories.find((c) => c.id === s.categoryId)?.color || '#6366f1')
      )
    );

    calendarDays.push({
      dateStr: dStr,
      dayNumber: d,
      isCurrentMonth: true,
      isToday: dStr === todayStr,
      totalSec,
      categoryColors: catColors,
      sessions: daySessions,
    });
  }

  // Padding days from next month to complete the 7-column grid
  const remainingCells = (7 - (calendarDays.length % 7)) % 7;
  for (let d = 1; d <= remainingCells; d++) {
    const nextMonthDate = new Date(year, month + 1, d);
    const dStr = `${nextMonthDate.getFullYear()}-${pad(nextMonthDate.getMonth() + 1)}-${pad(d)}`;
    const daySessions = sessionsByDay[dStr] || [];
    const totalSec = daySessions.reduce((sum, s) => sum + s.durationSec, 0);

    const catColors = Array.from(
      new Set(
        daySessions.map((s) => categories.find((c) => c.id === s.categoryId)?.color || '#6366f1')
      )
    );

    calendarDays.push({
      dateStr: dStr,
      dayNumber: d,
      isCurrentMonth: false,
      isToday: dStr === todayStr,
      totalSec,
      categoryColors: catColors,
      sessions: daySessions,
    });
  }

  const selectedDaySessions = sessionsByDay[selectedDateStr] || [];
  const selectedDayTotalSec = selectedDaySessions.reduce((sum, s) => sum + s.durationSec, 0);

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

  const getHeatmapColor = (sec: number) => {
    if (sec === 0) return 'bg-slate-900/50 hover:bg-slate-800/80';
    const hours = sec / 3600;
    if (hours < 1) return 'bg-indigo-950/70 border-indigo-500/30 hover:bg-indigo-900/60';
    if (hours < 2) return 'bg-indigo-900/60 border-indigo-500/50 hover:bg-indigo-800/70';
    if (hours < 4) return 'bg-indigo-700/60 border-indigo-400/60 hover:bg-indigo-600/70';
    return 'bg-purple-600/60 border-purple-400/80 hover:bg-purple-500/80';
  };

  const getDayHeading = (dateStr: string) => {
    const yDate = new Date();
    yDate.setDate(yDate.getDate() - 1);
    const yesterday = `${yDate.getFullYear()}-${String(yDate.getMonth() + 1).padStart(2, '0')}-${String(yDate.getDate()).padStart(2, '0')}`;
    if (dateStr === todayStr) return 'Today';
    if (dateStr === yesterday) return 'Yesterday';
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="space-y-6">
      {/* Calendar Navigation Header */}
      <div className="glass-panel rounded-3xl p-5 border border-white/10">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-indigo-400" />
            <h3 className="text-lg font-bold text-white tracking-tight">
              {monthNames[month]} {year}
            </h3>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleToday}
              className="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 border border-slate-700 transition"
            >
              Today
            </button>
            <button
              onClick={handlePrevMonth}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition active:scale-95"
              aria-label="Previous Month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={handleNextMonth}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition active:scale-95"
              aria-label="Next Month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Days of Week Header */}
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
          <span>Mon</span>
          <span>Tue</span>
          <span>Wed</span>
          <span>Thu</span>
          <span>Fri</span>
          <span>Sat</span>
          <span>Sun</span>
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-1.5">
          {calendarDays.map((cell) => {
            const isSelected = cell.dateStr === selectedDateStr;

            return (
              <button
                key={cell.dateStr}
                onClick={() => setSelectedDateStr(cell.dateStr)}
                className={`relative min-h-[58px] sm:min-h-[68px] p-1.5 rounded-2xl flex flex-col justify-between items-center transition-all border ${
                  getHeatmapColor(cell.totalSec)
                } ${
                  isSelected
                    ? 'ring-2 ring-indigo-400 border-indigo-400 shadow-lg shadow-indigo-500/20 z-10'
                    : 'border-white/5'
                } ${!cell.isCurrentMonth ? 'opacity-35' : 'opacity-100'}`}
              >
                {/* Day number & Today badge */}
                <div className="w-full flex items-center justify-between">
                  <span
                    className={`text-xs font-semibold rounded-full w-5 h-5 flex items-center justify-center ${
                      cell.isToday
                        ? 'bg-indigo-500 text-white font-bold'
                        : isSelected
                        ? 'text-indigo-300 font-bold'
                        : 'text-slate-300'
                    }`}
                  >
                    {cell.dayNumber}
                  </span>
                  {cell.totalSec > 0 && (
                    <span className="text-[10px] font-mono text-indigo-200 font-bold hidden sm:inline">
                      {formatDuration(cell.totalSec)}
                    </span>
                  )}
                </div>

                {/* Category Color Dots */}
                <div className="flex items-center justify-center gap-1 w-full mt-1">
                  {cell.categoryColors.slice(0, 4).map((color, idx) => (
                    <span
                      key={idx}
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                  {cell.categoryColors.length > 4 && (
                    <span className="text-[8px] text-slate-400 font-bold">+</span>
                  )}
                </div>

                {/* Mobile time label */}
                {cell.totalSec > 0 && (
                  <span className="sm:hidden text-[9px] font-mono text-indigo-300 font-bold">
                    {formatDuration(cell.totalSec)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Day Details Panel */}
      <div className="glass-panel rounded-3xl p-5 border border-white/10">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="text-base font-bold text-white flex items-center gap-2">
              <span>{getDayHeading(selectedDateStr)}</span>
            </h4>
            <span className="text-xs text-slate-400">
              {selectedDaySessions.length} {selectedDaySessions.length === 1 ? 'session' : 'sessions'} logged
            </span>
          </div>
          <div className="px-3 py-1.5 rounded-xl bg-slate-800 text-sm font-mono font-bold text-indigo-300 border border-slate-700">
            {formatDuration(selectedDayTotalSec)} total
          </div>
        </div>

        {selectedDaySessions.length === 0 ? (
          <div className="py-8 text-center text-slate-500 text-xs italic">
            No focus sessions logged on this day.
          </div>
        ) : (
          <div className="space-y-2">
            {selectedDaySessions.map((session) => {
              const cat = categories.find((c) => c.id === session.categoryId);
              return (
                <div
                  key={session.id}
                  className="glass-card rounded-2xl p-3.5 flex items-center justify-between gap-3 hover:border-slate-600/80 transition"
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
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white">
                          {cat?.name || 'Category'}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {formatTime(session.startTime)} - {formatTime(session.endTime)}
                        </span>
                      </div>
                      {session.note ? (
                        <p className="text-xs text-slate-300 truncate mt-0.5">{session.note}</p>
                      ) : (
                        <p className="text-xs text-slate-500 italic mt-0.5">No notes</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono text-xs font-bold text-white px-2.5 py-1 rounded-lg bg-slate-800">
                      {formatDuration(session.durationSec)}
                    </span>
                    <button
                      onClick={() => onEditSession(session)}
                      className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
                      title="Edit entry"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onDeleteSession(session.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition"
                      title="Delete entry"
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
    </div>
  );
};
