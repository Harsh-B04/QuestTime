import { Session } from './session';
import { StorageService, type TimerActiveData } from './storage';
import type { SyncService, TimerBroadcastState } from './sync';
import type { TimerStatus } from '../types';

export class Timer {
  private status: TimerStatus = 'idle';
  private categoryId: string | null = null;
  private note: string = '';
  private startTimestamp: number | null = null;
  private accumulatedSec: number = 0;
  private sessionStartTime: string | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private tickCount: number = 0;   // used for 10-tick heartbeat

  private tickListeners: Set<(elapsedSec: number) => void> = new Set();
  private stateListeners: Set<(status: TimerStatus) => void> = new Set();
  private storage: StorageService;
  private syncService: SyncService | null = null;  // set after construction via setSyncService()

  constructor(storage: StorageService = StorageService.getInstance()) {
    this.storage = storage;
  }

  /** Called by AppCore once SyncService is ready to avoid circular deps */
  public setSyncService(sync: SyncService): void {
    this.syncService = sync;
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
    if (this.status === 'running') return;

    this.categoryId = categoryId;
    this.note = note;
    this.status = 'running';
    this.startTimestamp = Date.now();
    this.accumulatedSec = 0;
    this.sessionStartTime = new Date().toISOString();

    this.startTicker();
    this.notifyStateChange();
    this.notifyTick();
    this.broadcast();
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
    this.broadcast();
  }

  public resume(): void {
    if (this.status !== 'paused') return;

    this.startTimestamp = Date.now();
    this.status = 'running';
    this.startTicker();

    this.notifyStateChange();
    this.notifyTick();
    this.broadcast();
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

    this.reset(); // reset() broadcasts 'idle'
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
    this.tickCount = 0;

    this.notifyStateChange();
    this.notifyTick();
    this.broadcast(); // tell other devices the timer stopped
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
    this.broadcast();
  }

  public getSessionStartTime(): string | null {
    return this.sessionStartTime;
  }

  public getStartTimestamp(): number | null {
    return this.startTimestamp;
  }

  public getContinuousRunningSec(): number {
    if (this.status !== 'running' || !this.startTimestamp) return 0;
    return Math.floor((Date.now() - this.startTimestamp) / 1000);
  }


  private startTicker(): void {
    this.stopTicker();
    this.tickCount = 0;
    this.intervalId = setInterval(() => {
      this.tickCount++;
      // Heartbeat every 5s: re-broadcast so devices that join mid-session catch up faster
      if (this.tickCount % 5 === 0) this.broadcast();
      this.notifyTick();
    }, 1000);
  }

  private stopTicker(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /** Serialize current state for broadcast */
  private toState(): Omit<TimerBroadcastState, 'deviceId'> {
    return {
      status: this.status as 'running' | 'paused' | 'idle',
      categoryId: this.categoryId,
      startTimestamp: this.startTimestamp,
      accumulatedSec: this.accumulatedSec,
      sessionStartTime: this.sessionStartTime,
      note: this.note,
    };
  }

  /** Best-effort broadcast — no-op if sync not wired or user not authenticated */
  private broadcast(): void {
    this.syncService?.broadcastTimerState(this.toState());
  }

  /**
   * Apply timer state received from another device via Supabase Broadcast.
   * Does NOT trigger another broadcast to avoid loops.
   * Corrects for elapsed wall-clock time so the secondary device shows the right seconds
   * immediately, not a stale value from when the primary device last broadcast.
   */
  public applyRemoteState(state: Omit<TimerBroadcastState, 'deviceId'>): void {
    this.stopTicker();

    this.status = state.status as TimerStatus;
    this.categoryId = state.categoryId;
    this.note = state.note;
    this.sessionStartTime = state.sessionStartTime;
    this.tickCount = 0;

    if (state.status === 'running' && state.startTimestamp !== null) {
      // Account for the wall-clock time that passed between the primary device broadcasting
      // and this device receiving + applying the state.  Without this the secondary device
      // shows a number of seconds that is behind by up to the broadcast interval.
      const elapsedSinceTimestamp = Math.floor((Date.now() - state.startTimestamp) / 1000);
      this.accumulatedSec = state.accumulatedSec + Math.max(0, elapsedSinceTimestamp);
      // We set startTimestamp to now so the local ticker stays in sync going forward.
      this.startTimestamp = Date.now();
    } else {
      this.accumulatedSec = state.accumulatedSec;
      this.startTimestamp = state.startTimestamp;
    }

    // Re-start local ticker if the remote timer is running
    // (local ticker drives the UI — no per-second network calls needed)
    if (this.status === 'running') this.startTicker();

    this.notifyStateChange();
    this.notifyTick();
    // Persist so a page refresh on this device also restores correctly
    this.persistActiveTimer();
  }
}
