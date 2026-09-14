import { WeeklyTarget } from './weeklyTarget';
import { StorageService } from './storage';
import type { SessionLog } from './sessionLog';

export class TargetTracker {
  private targets: Map<string, WeeklyTarget> = new Map(); // key: `${weekStartDate}_${categoryId}`
  private storage: StorageService;
  private listeners: Set<() => void> = new Set();

  constructor(storage: StorageService = StorageService.getInstance()) {
    this.storage = storage;
  }

  public subscribe(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  public async load(): Promise<void> {
    const rawTargets = await this.storage.getTargets();
    this.targets.clear();
    for (const dto of rawTargets) {
      const target = new WeeklyTarget(dto);
      const key = `${target.weekStartDate}_${target.categoryId}`;
      this.targets.set(key, target);
    }
    this.notify();
  }

  public getCurrentWeekStartDate(): string {
    const now = new Date();
    const day = now.getDay();
    const diffToMonday = (day === 0 ? -6 : 1) - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMonday);

    const pad = (n: number) => String(n).padStart(2, '0');
    return `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`;
  }

  public getTargetForCategory(categoryId: string, weekStartDate: string = this.getCurrentWeekStartDate()): WeeklyTarget | undefined {
    return this.targets.get(`${weekStartDate}_${categoryId}`);
  }

  public getTargetsForWeek(weekStartDate: string = this.getCurrentWeekStartDate()): WeeklyTarget[] {
    return Array.from(this.targets.values()).filter((t) => t.weekStartDate === weekStartDate);
  }

  public async setTarget(
    categoryId: string,
    targetHours: number,
    weekStartDate: string = this.getCurrentWeekStartDate(),
    dailyTargetHours?: number,
    isDaily?: boolean,
    targetDays?: number[]
  ): Promise<WeeklyTarget> {
    const key = `${weekStartDate}_${categoryId}`;
    let target = this.targets.get(key);

    if (target) {
      target.targetHours = Math.max(0, targetHours);
      if (dailyTargetHours !== undefined) {
        target.dailyTargetHours = Math.max(0, dailyTargetHours);
      }
      if (isDaily !== undefined) {
        target.isDaily = isDaily;
      }
      if (targetDays !== undefined) {
        target.targetDays = targetDays;
      }
      // If manually adjusting weekly target and it diverges from schedule sum, disengage auto-sync
      if (target.autoSyncWeekly && Math.abs(target.targetHours - target.getScheduledWeeklyHours()) > 0.05) {
        target.autoSyncWeekly = false;
      }
      target.updatedAt = new Date().toISOString();
    } else {
      target = new WeeklyTarget({
        id: crypto.randomUUID(),
        categoryId,
        targetHours: Math.max(0, targetHours),
        dailyTargetHours: dailyTargetHours !== undefined ? Math.max(0, dailyTargetHours) : undefined,
        isDaily: isDaily !== undefined ? isDaily : true,
        targetDays,
        weekStartDate,
        updatedAt: new Date().toISOString(),
      });
      this.targets.set(key, target);
    }

    await this.storage.saveTarget(target.toDTO());
    this.notify();
    return target;
  }

  public async setDailyTarget(
    categoryId: string,
    dailyHours: number,
    weekStartDate: string = this.getCurrentWeekStartDate()
  ): Promise<WeeklyTarget> {
    const key = `${weekStartDate}_${categoryId}`;
    let target = this.targets.get(key);

    if (target) {
      target.dailyTargetHours = Math.max(0, dailyHours);
      target.isDaily = true;
      if (target.autoSyncWeekly) {
        target.targetHours = target.getScheduledWeeklyHours();
      }
      target.updatedAt = new Date().toISOString();
    } else {
      target = new WeeklyTarget({
        id: crypto.randomUUID(),
        categoryId,
        targetHours: 0,
        dailyTargetHours: Math.max(0, dailyHours),
        isDaily: true,
        weekStartDate,
        updatedAt: new Date().toISOString(),
      });
      if (target.autoSyncWeekly) {
        target.targetHours = target.getScheduledWeeklyHours();
      }
      this.targets.set(key, target);
    }

    await this.storage.saveTarget(target.toDTO());
    this.notify();
    return target;
  }

  public async setIsDaily(
    categoryId: string,
    isDaily: boolean,
    weekStartDate: string = this.getCurrentWeekStartDate()
  ): Promise<WeeklyTarget> {
    const key = `${weekStartDate}_${categoryId}`;
    let target = this.targets.get(key);

    if (target) {
      target.isDaily = isDaily;
      target.updatedAt = new Date().toISOString();
    } else {
      target = new WeeklyTarget({
        id: crypto.randomUUID(),
        categoryId,
        targetHours: 0,
        isDaily,
        weekStartDate,
        updatedAt: new Date().toISOString(),
      });
      this.targets.set(key, target);
    }

    await this.storage.saveTarget(target.toDTO());
    this.notify();
    return target;
  }

  public async setDaySchedule(
    categoryId: string,
    dailySchedule: Record<number, number>,
    weekStartDate: string = this.getCurrentWeekStartDate()
  ): Promise<WeeklyTarget> {
    const key = `${weekStartDate}_${categoryId}`;
    let target = this.targets.get(key);

    if (target) {
      target.dailySchedule = { ...dailySchedule };
      target.isDaily = true;
      if (target.autoSyncWeekly) {
        target.targetHours = target.getScheduledWeeklyHours();
      }
      target.updatedAt = new Date().toISOString();
    } else {
      target = new WeeklyTarget({
        id: crypto.randomUUID(),
        categoryId,
        targetHours: 0,
        isDaily: true,
        dailySchedule: { ...dailySchedule },
        weekStartDate,
        updatedAt: new Date().toISOString(),
      });
      if (target.autoSyncWeekly) {
        target.targetHours = target.getScheduledWeeklyHours();
      }
      this.targets.set(key, target);
    }

    await this.storage.saveTarget(target.toDTO());
    this.notify();
    return target;
  }

  public async setDayTarget(
    categoryId: string,
    dayOfWeek: number, // 1=Mon .. 7=Sun
    hours: number,
    weekStartDate: string = this.getCurrentWeekStartDate()
  ): Promise<WeeklyTarget> {
    const key = `${weekStartDate}_${categoryId}`;
    let target = this.targets.get(key);

    const baseSchedule: Record<number, number> = target?.dailySchedule
      ? { ...target.dailySchedule }
      : {
          1: target?.dailyTargetHours ?? 0,
          2: target?.dailyTargetHours ?? 0,
          3: target?.dailyTargetHours ?? 0,
          4: target?.dailyTargetHours ?? 0,
          5: target?.dailyTargetHours ?? 0,
          6: target?.dailyTargetHours ?? 0,
          7: target?.dailyTargetHours ?? 0,
        };

    baseSchedule[dayOfWeek] = Math.max(0, hours);

    if (target) {
      target.dailySchedule = baseSchedule;
      target.isDaily = true;
      if (target.autoSyncWeekly) {
        target.targetHours = target.getScheduledWeeklyHours();
      }
      target.updatedAt = new Date().toISOString();
    } else {
      target = new WeeklyTarget({
        id: crypto.randomUUID(),
        categoryId,
        targetHours: 0,
        isDaily: true,
        dailySchedule: baseSchedule,
        weekStartDate,
        updatedAt: new Date().toISOString(),
      });
      if (target.autoSyncWeekly) {
        target.targetHours = target.getScheduledWeeklyHours();
      }
      this.targets.set(key, target);
    }

    await this.storage.saveTarget(target.toDTO());
    this.notify();
    return target;
  }

  public async setAutoSyncWeekly(
    categoryId: string,
    autoSync: boolean,
    weekStartDate: string = this.getCurrentWeekStartDate()
  ): Promise<WeeklyTarget> {
    const key = `${weekStartDate}_${categoryId}`;
    let target = this.targets.get(key);

    if (target) {
      target.autoSyncWeekly = autoSync;
      if (autoSync) {
        target.targetHours = target.getScheduledWeeklyHours();
      }
      target.updatedAt = new Date().toISOString();
    } else {
      target = new WeeklyTarget({
        id: crypto.randomUUID(),
        categoryId,
        targetHours: 0,
        isDaily: true,
        autoSyncWeekly: autoSync,
        weekStartDate,
        updatedAt: new Date().toISOString(),
      });
      if (autoSync) {
        target.targetHours = target.getScheduledWeeklyHours();
      }
      this.targets.set(key, target);
    }

    await this.storage.saveTarget(target.toDTO());
    this.notify();
    return target;
  }

  public async syncWeeklyToSchedule(
    categoryId: string,
    weekStartDate: string = this.getCurrentWeekStartDate(),
    enableAutoSync: boolean = true
  ): Promise<WeeklyTarget> {
    const key = `${weekStartDate}_${categoryId}`;
    let target = this.targets.get(key);

    if (target) {
      target.isDaily = true;
      target.autoSyncWeekly = enableAutoSync;
      target.targetHours = target.getScheduledWeeklyHours();
      target.updatedAt = new Date().toISOString();
    } else {
      target = new WeeklyTarget({
        id: crypto.randomUUID(),
        categoryId,
        targetHours: 0,
        isDaily: true,
        autoSyncWeekly: enableAutoSync,
        weekStartDate,
        updatedAt: new Date().toISOString(),
      });
      target.targetHours = target.getScheduledWeeklyHours();
      this.targets.set(key, target);
    }

    await this.storage.saveTarget(target.toDTO());
    this.notify();
    return target;
  }


  public async deleteTarget(id: string): Promise<void> {
    for (const [key, target] of this.targets.entries()) {
      if (target.id === id) {
        this.targets.delete(key);
        await this.storage.deleteTarget(id);
        await this.storage.recordDeletedId('weekly_targets', id);
        this.notify();
        break;
      }
    }
  }

  public getAggregatedProgress(sessionLog: SessionLog, weekStartDate: string = this.getCurrentWeekStartDate()): {
    totalTargetHours: number;
    totalLoggedHours: number;
    overallProgressPct: number;
  } {
    const targets = this.getTargetsForWeek(weekStartDate);
    const totalTargetHours = targets.reduce((sum, t) => sum + t.targetHours, 0);
    const totalLoggedSeconds = targets.reduce((sum, t) => sum + t.getLoggedSeconds(sessionLog), 0);
    const totalLoggedHours = Number((totalLoggedSeconds / 3600).toFixed(1));

    const overallProgressPct = totalTargetHours > 0
      ? Math.min(100, Number(((totalLoggedHours / totalTargetHours) * 100).toFixed(1)))
      : 0;

    return {
      totalTargetHours,
      totalLoggedHours,
      overallProgressPct,
    };
  }
}
