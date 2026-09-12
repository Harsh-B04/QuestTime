import type { WeeklyTargetDTO } from '../types';
import type { SessionLog } from './sessionLog';

export class WeeklyTarget {
  public readonly id: string;
  public categoryId: string;
  public targetHours: number;
  public weekStartDate: string; // YYYY-MM-DD (Monday)
  public userId?: string;
  public updatedAt: string;

  constructor(data: WeeklyTargetDTO) {
    this.id = data.id || crypto.randomUUID();
    this.categoryId = data.categoryId;
    this.targetHours = Math.max(0, data.targetHours);
    this.weekStartDate = data.weekStartDate;
    this.userId = data.userId;
    this.updatedAt = data.updatedAt || new Date().toISOString();
  }

  public toDTO(): WeeklyTargetDTO {
    return {
      id: this.id,
      categoryId: this.categoryId,
      targetHours: this.targetHours,
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
}
