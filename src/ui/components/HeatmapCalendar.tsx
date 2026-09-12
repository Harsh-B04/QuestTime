import React, { useMemo, useState, useEffect } from 'react';
import type { SessionLog } from '../../core/sessionLog';
import { Calendar, Flame } from 'lucide-react';

interface HeatmapCalendarProps {
  sessionLog: SessionLog;
}

interface DayData {
  date: Date;
  dateStr: string; // YYYY-MM-DD
  durationSec: number;
  durationMinutes: number;
  level: number; // 0..4
}

/** Returns today's date string YYYY-MM-DD in local time */
const getTodayStr = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/** Ms until next local midnight */
const msUntilMidnight = () => {
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return midnight.getTime() - now.getTime();
};

export const HeatmapCalendar: React.FC<HeatmapCalendarProps> = ({ sessionLog }) => {
  const [selectedDay, setSelectedDay] = useState<DayData | null>(null);
  // Kept as state so useMemo recomputes on day-change
  const [todayStr, setTodayStr] = useState<string>(getTodayStr());

  // Reschedule at every midnight so the heatmap always shows the correct "today"
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timeoutId = setTimeout(() => {
        setTodayStr(getTodayStr());
        schedule(); // re-arm for next midnight
      }, msUntilMidnight());
    };
    schedule();
    return () => clearTimeout(timeoutId);
  }, []);

  // Generate the last 14 weeks (98 days) ending at the end of the current week (Sunday)
  const { weeks, monthLabels, totalSecLogged, activeDaysCount } = useMemo(() => {
    const today = new Date(todayStr + 'T00:00:00');
    today.setHours(0, 0, 0, 0);

    // Find coming Sunday (or today if Sunday) to end the grid cleanly
    const dayOfWeek = today.getDay(); // 0 is Sun, 1 is Mon...
    const daysToSunday = (7 - dayOfWeek) % 7;
    const endGridDate = new Date(today);
    endGridDate.setDate(today.getDate() + daysToSunday);

    const totalWeeks = 14;
    const totalDays = totalWeeks * 7;
    const startGridDate = new Date(endGridDate);
    startGridDate.setDate(endGridDate.getDate() - totalDays + 1);

    const weeksArray: DayData[][] = [];
    const months: { label: string; weekIndex: number }[] = [];
    let currentMonth = -1;
    let totalSec = 0;
    let activeDays = 0;

    const curr = new Date(startGridDate);

    for (let w = 0; w < totalWeeks; w++) {
      const weekDays: DayData[] = [];
      for (let d = 0; d < 7; d++) {
        const dateObj = new Date(curr);
        const dateStr = dateObj.toISOString().split('T')[0];
        
        // Only query if date is not in future relative to today
        const isFuture = dateObj.getTime() > today.getTime();
        const durationSec = isFuture ? 0 : sessionLog.getTotalForDay(dateObj);
        const durationMinutes = Math.floor(durationSec / 60);

        if (durationSec > 0) {
          totalSec += durationSec;
          activeDays++;
        }

        let level = 0;
        if (!isFuture && durationMinutes > 0) {
          if (durationMinutes < 30) level = 1;
          else if (durationMinutes < 60) level = 2;
          else if (durationMinutes < 120) level = 3;
          else level = 4;
        }

        weekDays.push({
          date: dateObj,
          dateStr,
          durationSec,
          durationMinutes,
          level,
        });

        // Check if month changed at start of week
        if (d === 0) {
          const m = dateObj.getMonth();
          if (m !== currentMonth) {
            currentMonth = m;
            const monthName = dateObj.toLocaleDateString('default', { month: 'short' });
            months.push({ label: monthName, weekIndex: w });
          }
        }

        curr.setDate(curr.getDate() + 1);
      }
      weeksArray.push(weekDays);
    }

    return {
      weeks: weeksArray,
      monthLabels: months,
      totalSecLogged: totalSec,
      activeDaysCount: activeDays,
    };
  }, [sessionLog, todayStr]);

  const getCellClass = (level: number, isSelected: boolean) => {
    let base = 'w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-sm transition-all duration-150 cursor-pointer ';
    if (isSelected) {
      base += 'ring-2 ring-white scale-125 z-10 ';
    }
    switch (level) {
      case 1:
        return base + 'bg-emerald-900/80 border border-emerald-600/40 hover:bg-emerald-800';
      case 2:
        return base + 'bg-emerald-600 border border-emerald-400/50 hover:bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.3)]';
      case 3:
        return base + 'bg-emerald-500 border border-emerald-300/70 hover:bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.5)]';
      case 4:
        return base + 'bg-emerald-300 border border-white hover:bg-emerald-200 shadow-[0_0_14px_rgba(52,211,153,0.7)]';
      default:
        return base + 'bg-slate-800/70 border border-slate-700/40 hover:border-slate-500';
    }
  };

  const formatTotalTime = (sec: number) => {
    const hours = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  const dayLabels = ['M', '', 'W', '', 'F', '', 'S'];

  return (
    <div className="glass-panel rounded-2xl p-4 sm:p-5 border border-slate-800/80">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Calendar className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-semibold text-white text-sm sm:text-base flex items-center gap-1.5">
              Focus Heatmap
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 font-normal">
                Last 14 Weeks
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              {activeDaysCount} active focus days • {formatTotalTime(totalSecLogged)} logged
            </p>
          </div>
        </div>

        {selectedDay && (
          <div className="text-xs px-2.5 py-1 rounded-lg bg-slate-800/90 border border-slate-700 text-slate-200 flex items-center gap-1.5 self-start sm:self-auto">
            <span className="font-semibold text-emerald-400">
              {selectedDay.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}:
            </span>
            <span>
              {selectedDay.durationMinutes > 0
                ? `${formatTotalTime(selectedDay.durationSec)} focus`
                : 'No sessions logged'}
            </span>
          </div>
        )}
      </div>

      {/* Grid container with horizontal scroll for mobile */}
      <div className="overflow-x-auto pb-2 -mx-1 px-1 no-scrollbar">
        <div className="min-w-fit">
          {/* Month labels */}
          <div className="flex pl-6 mb-1 text-[10px] text-slate-400 font-mono">
            {weeks.map((_, idx) => {
              const month = monthLabels.find((m) => m.weekIndex === idx);
              return (
                <div key={idx} className="w-4 sm:w-5 text-left">
                  {month ? month.label : ''}
                </div>
              );
            })}
          </div>

          {/* Grid rows (Days Mon-Sun) */}
          <div className="flex">
            {/* Day of week labels */}
            <div className="flex flex-col gap-1 pr-2 text-[9px] text-slate-400 font-mono justify-between">
              {dayLabels.map((lbl, idx) => (
                <div key={idx} className="h-3 sm:h-3.5 flex items-center">
                  {lbl}
                </div>
              ))}
            </div>

            {/* Heatmap columns */}
            <div className="flex gap-1">
              {weeks.map((week, wIdx) => (
                <div key={wIdx} className="flex flex-col gap-1">
                  {week.map((day, dIdx) => (
                    <button
                      key={dIdx}
                      type="button"
                      aria-label={`${day.dateStr}: ${day.durationMinutes} minutes`}
                      onClick={() => setSelectedDay(day)}
                      onMouseEnter={() => setSelectedDay(day)}
                      className={getCellClass(day.level, selectedDay?.dateStr === day.dateStr)}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Legend & Summary */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-800/80 text-xs text-slate-400">
        <div className="flex items-center gap-1.5">
          <Flame className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-[11px]">Consistency drives growth</span>
        </div>

        <div className="flex items-center gap-1 text-[10px]">
          <span className="mr-1">Less</span>
          <div className="w-2.5 h-2.5 rounded-sm bg-slate-800/80 border border-slate-700/40" />
          <div className="w-2.5 h-2.5 rounded-sm bg-emerald-900/80 border border-emerald-600/40" />
          <div className="w-2.5 h-2.5 rounded-sm bg-emerald-600 border border-emerald-400/50" />
          <div className="w-2.5 h-2.5 rounded-sm bg-emerald-500 border border-emerald-300/70" />
          <div className="w-2.5 h-2.5 rounded-sm bg-emerald-300 border border-white" />
          <span className="ml-1">More</span>
        </div>
      </div>
    </div>
  );
};
