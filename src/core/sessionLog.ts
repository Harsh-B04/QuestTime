import { Session } from './session';
import { StorageService } from './storage';

export class SessionLog {
  private sessions: Map<string, Session> = new Map();
  private storage: StorageService;
  private listeners: Set<() => void> = new Set();
  private isLoaded: boolean = false;

  public get loaded(): boolean {
    return this.isLoaded;
  }

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
    const rawSessions = await this.storage.getSessions();
    this.sessions.clear();
    for (const dto of rawSessions) {
      this.sessions.set(dto.id, new Session(dto));
    }
    this.isLoaded = true;
    this.notify();
  }

  public getAll(): Session[] {
    return Array.from(this.sessions.values()).sort(
      (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
    );
  }

  public getById(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  public async add(session: Session): Promise<void> {
    this.sessions.set(session.id, session);
    await this.storage.saveSession(session.toDTO());
    this.notify();
  }

  public async update(session: Session): Promise<void> {
    session.updatedAt = new Date().toISOString();
    this.sessions.set(session.id, session);
    await this.storage.saveSession(session.toDTO());
    this.notify();
  }

  public async delete(id: string): Promise<void> {
    this.sessions.delete(id);
    await this.storage.deleteSession(id);
    this.notify();
  }

  public getByDateRange(startDate: Date, endDate: Date): Session[] {
    const startMs = startDate.getTime();
    const endMs = endDate.getTime();
    return this.getAll().filter((s) => {
      const sMs = new Date(s.startTime).getTime();
      return sMs >= startMs && sMs <= endMs;
    });
  }

  public getByCategory(categoryId: string): Session[] {
    return this.getAll().filter((s) => s.categoryId === categoryId);
  }

  public getTotalForDay(date: Date): number {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const sessions = this.getByDateRange(startOfDay, endOfDay);
    return sessions.reduce((acc, s) => acc + s.durationSec, 0);
  }

  public getTotalForDayAndCategory(date: Date, categoryId: string): number {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const sessions = this.getByDateRange(startOfDay, endOfDay).filter(
      (s) => s.categoryId === categoryId
    );
    return sessions.reduce((acc, s) => acc + s.durationSec, 0);
  }

  public getTotalForWeek(dateInWeek: Date): number {
    const { startOfWeek, endOfWeek } = this.getWeekBoundaries(dateInWeek);
    const sessions = this.getByDateRange(startOfWeek, endOfWeek);
    return sessions.reduce((acc, s) => acc + s.durationSec, 0);
  }

  public getTotalForWeekAndCategory(dateInWeek: Date, categoryId: string): number {
    const { startOfWeek, endOfWeek } = this.getWeekBoundaries(dateInWeek);
    const sessions = this.getByDateRange(startOfWeek, endOfWeek).filter(
      (s) => s.categoryId === categoryId
    );
    return sessions.reduce((acc, s) => acc + s.durationSec, 0);
  }

  public getUniqueDatesWithSessions(): Set<string> {
    const dates = new Set<string>();
    for (const session of this.sessions.values()) {
      const day = session.startTime.split('T')[0];
      dates.add(day);
    }
    return dates;
  }

  public getWeekBoundaries(d: Date): { startOfWeek: Date; endOfWeek: Date; weekStartDateStr: string } {
    const date = new Date(d);
    // Monday as first day of week
    const day = date.getDay();
    const diffToMonday = (day === 0 ? -6 : 1) - day;
    const monday = new Date(date);
    monday.setDate(date.getDate() + diffToMonday);
    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    const pad = (n: number) => String(n).padStart(2, '0');
    const weekStartDateStr = `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`;

    return {
      startOfWeek: monday,
      endOfWeek: sunday,
      weekStartDateStr,
    };
  }
}
