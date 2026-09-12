import { Session } from './session';
import { StorageService, type TimerActiveData } from './storage';
import type { TimerStatus } from '../types';

export class Timer {
  private status: TimerStatus = 'idle';
  private categoryId: string | null = null;
  private note: string = '';
  private startTimestamp: number | null = null;
  private accumulatedSec: number = 0;
  private sessionStartTime: string | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  private tickListeners: Set<(elapsedSec: number) => void> = new Set();
  private stateListeners: Set<(status: TimerStatus) => void> = new Set();
  private storage: StorageService;

  constructor(storage: StorageService = StorageService.getInstance()) {
    this.storage = storage;
  }

  public onTick(callback: (elapsedSec: number) => void): () => void {
    this.tickListeners.add(callback);
    return () => this.tickListeners.delete(callback);
  }

  public onStateChange(callback: (status: TimerStatus) => void): () => void {
    this.stateListeners.add(callback);
    return () => this.stateListeners.delete(callback);
  }

  private notifyTick(): void {
    const elapsed = this.getElapsedSec();
    for (const cb of this.tickListeners) {
      cb(elapsed);
    }
  }

  private notifyStateChange(): void {
    for (const cb of this.stateListeners) {
      cb(this.status);
    }
    this.persistActiveTimer();
  }

  private async persistActiveTimer(): Promise<void> {
    if (this.status === 'idle') {
      await this.storage.clearActiveTimer();
    } else if (this.categoryId && this.sessionStartTime) {
      const data: TimerActiveData = {
        status: this.status,
        categoryId: this.categoryId,
        note: this.note,
        startTimestamp: this.startTimestamp ?? Date.now(),
        accumulatedSec: this.accumulatedSec,
        sessionStartTime: this.sessionStartTime,
      };
      await this.storage.saveActiveTimer(data);
    }
  }

  public async restoreFromStorage(): Promise<boolean> {
    const active = await this.storage.getActiveTimer();
    if (!active) return false;

    this.categoryId = active.categoryId;
    this.note = active.note || '';
    this.sessionStartTime = active.sessionStartTime;
    this.accumulatedSec = active.accumulatedSec;

    if (active.status === 'running') {
      this.status = 'running';
      this.startTimestamp = active.startTimestamp;
      this.startTicker();
    } else if (active.status === 'paused') {
      this.status = 'paused';
      this.startTimestamp = null;
    }

    this.notifyStateChange();
    this.notifyTick();
    return true;
  }


  public start(categoryId: string, note: string = ''): void {
    if (this.status === 'running') {
      return;
    }

    this.categoryId = categoryId;
    this.note = note;
    this.status = 'running';
    this.startTimestamp = Date.now();
    this.accumulatedSec = 0;
    this.sessionStartTime = new Date().toISOString();

    this.startTicker();
    this.notifyStateChange();
    this.notifyTick();
  }

  public pause(): void {
    if (this.status !== 'running') return;

    if (this.startTimestamp) {
      const runSec = Math.floor((Date.now() - this.startTimestamp) / 1000);
      this.accumulatedSec += runSec;
    }
    this.startTimestamp = null;
    this.status = 'paused';
    this.stopTicker();

    this.notifyStateChange();
    this.notifyTick();
  }

  public resume(): void {
    if (this.status !== 'paused') return;

    this.startTimestamp = Date.now();
    this.status = 'running';
    this.startTicker();

    this.notifyStateChange();
    this.notifyTick();
  }

  public stop(): Session | null {
    if (this.status === 'idle' || !this.categoryId || !this.sessionStartTime) {
      return null;
    }

    const totalSec = this.getElapsedSec();
    const endTime = new Date().toISOString();

    const session = new Session({
      id: crypto.randomUUID(),
      categoryId: this.categoryId,
      startTime: this.sessionStartTime,
      endTime,
      durationSec: totalSec,
      note: this.note.trim() || undefined,
      createdAt: endTime,
      updatedAt: endTime,
    });

    this.reset();
    return session;
  }

  public discard(): void {
    this.reset();
  }

  private reset(): void {
    this.stopTicker();
    this.status = 'idle';
    this.categoryId = null;
    this.note = '';
    this.startTimestamp = null;
    this.accumulatedSec = 0;
    this.sessionStartTime = null;

    this.notifyStateChange();
    this.notifyTick();
  }

  public getElapsedSec(): number {
    if (this.status === 'idle') return 0;
    let currentPeriod = 0;
    if (this.status === 'running' && this.startTimestamp) {
      currentPeriod = Math.floor((Date.now() - this.startTimestamp) / 1000);
    }
    return this.accumulatedSec + currentPeriod;
  }

  public getState(): TimerStatus {
    return this.status;
  }

  public getStatus(): TimerStatus {
    return this.status;
  }

  public getCategoryId(): string | null {
    return this.categoryId;
  }

  public getNote(): string {
    return this.note;
  }

  public setNote(note: string): void {
    this.note = note;
    this.persistActiveTimer();
  }

  public getSessionStartTime(): string | null {
    return this.sessionStartTime;
  }

  public getContinuousRunningSec(): number {
    if (this.status !== 'running' || !this.startTimestamp) return 0;
    return Math.floor((Date.now() - this.startTimestamp) / 1000);
  }


  private startTicker(): void {
    this.stopTicker();
    this.intervalId = setInterval(() => {
      this.notifyTick();
    }, 1000);
  }

  private stopTicker(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
