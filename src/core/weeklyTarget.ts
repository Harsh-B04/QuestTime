import type { WeeklyTargetDTO } from '../types';
import type { SessionLog } from './sessionLog';

export class WeeklyTarget {
  public readonly id: string;
  public categoryId: string;
  public targetHours: number;
  public dailyTargetHours?: number;
  public weekStartDate: string; // YYYY-MM-DD (Monday)
  public userId?: string;
  public updatedAt: string;

  constructor(data: WeeklyTargetDTO) {
    this.id = data.id || crypto.randomUUID();
    this.categoryId = data.categoryId;
    this.targetHours = Math.max(0, data.targetHours);
    this.dailyTargetHours = data.dailyTargetHours !== undefined ? Math.max(0, data.dailyTargetHours) : undefined;
    this.weekStartDate = data.weekStartDate;
    this.userId = data.userId;
    this.updatedAt = data.updatedAt || new Date().toISOString();
  }

  public toDTO(): WeeklyTargetDTO {
    return {
      id: this.id,
      categoryId: this.categoryId,
      targetHours: this.targetHours,
      dailyTargetHours: this.dailyTargetHours,
      weekStartDate: this.weekStartDate,
      userId: this.userId,
      updatedAt: this.updatedAt,
    };
  }

  public get targetSeconds(): number {
    return this.targetHours * 3600;
  }

  public getLoggedSeconds(sessionLog: SessionLog): number {
    const targetDate = new Date(this.weekStartDate + 'T12:00:00');
    return sessionLog.getTotalForWeekAndCategory(targetDate, this.categoryId);
  }

  public getLoggedHours(sessionLog: SessionLog): number {
    const sec = this.getLoggedSeconds(sessionLog);
    return Number((sec / 3600).toFixed(1));
  }

  public getProgressPct(sessionLog: SessionLog): number {
    if (this.targetHours <= 0) return 100;
    const loggedSec = this.getLoggedSeconds(sessionLog);
    const pct = (loggedSec / this.targetSeconds) * 100;
    return Math.min(100, Number(pct.toFixed(1)));
  }

  public getRemainingHours(sessionLog: SessionLog): number {
    const logged = this.getLoggedHours(sessionLog);
    return Math.max(0, Number((this.targetHours - logged).toFixed(1)));
  }

  /**
   * Expected pro-rated target by today (day of week: Monday=1 ... Sunday=7)
   */
  public getProRatedTargetHoursToday(): number {
    const today = new Date();
    const dayOfWeek = today.getDay() === 0 ? 7 : today.getDay(); // 1=Mon, 7=Sun
    return Number(((this.targetHours / 7) * dayOfWeek).toFixed(1));
  }

  public isOnTrack(sessionLog: SessionLog): boolean {
    const logged = this.getLoggedHours(sessionLog);
    const expected = this.getProRatedTargetHoursToday();
    return logged >= expected;
  }

  // --- Daily Quest / Target Methods ---
  public getLoggedSecondsToday(sessionLog: SessionLog): number {
    return sessionLog.getTotalForDayAndCategory(new Date(), this.categoryId);
  }

  public getLoggedHoursToday(sessionLog: SessionLog): number {
    return Number((this.getLoggedSecondsToday(sessionLog) / 3600).toFixed(1));
  }

  public getDailyProgressPct(sessionLog: SessionLog): number {
    if (!this.dailyTargetHours || this.dailyTargetHours <= 0) return 0;
    const loggedSec = this.getLoggedSecondsToday(sessionLog);
    const pct = (loggedSec / (this.dailyTargetHours * 3600)) * 100;
    return Math.min(100, Number(pct.toFixed(1)));
  }

  public isDailyTargetMet(sessionLog: SessionLog): boolean {
    if (!this.dailyTargetHours || this.dailyTargetHours <= 0) return false;
    return this.getLoggedHoursToday(sessionLog) >= this.dailyTargetHours;
  }

  public getRemainingDailyHours(sessionLog: SessionLog): number {
    if (!this.dailyTargetHours || this.dailyTargetHours <= 0) return 0;
    const logged = this.getLoggedHoursToday(sessionLog);
    return Math.max(0, Number((this.dailyTargetHours - logged).toFixed(1)));
  }
}
