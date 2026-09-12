import type { SupabaseClient } from '@supabase/supabase-js';
import { StorageService } from './storage';
import { AuthService } from './auth';
import type { SyncQueueItem } from '../types';

export interface SyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncedAt: string | null;
  lastError: string | null;
}

export class SyncService {
  private static instance: SyncService | null = null;
  private storage: StorageService;
  private auth: AuthService;
  private isOnline: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private isSyncing: boolean = false;
  private lastSyncedAt: string | null = null;
  private lastError: string | null = null;
  private listeners: Set<(status: SyncStatus) => void> = new Set();

  private syncCompleteCallbacks: Set<() => void> = new Set();
  private realtimeChannel: any = null;

  public static getInstance(
    storage: StorageService = StorageService.getInstance(),
    auth: AuthService = AuthService.getInstance()
  ): SyncService {
    if (!SyncService.instance) {
      SyncService.instance = new SyncService(storage, auth);
    }
    return SyncService.instance;
  }

  constructor(
    storage: StorageService = StorageService.getInstance(),
    auth: AuthService = AuthService.getInstance()
  ) {
    this.storage = storage;
    this.auth = auth;

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.isOnline = true;
        this.notify();
        this.syncAll();
      });
      window.addEventListener('offline', () => {
        this.isOnline = false;
        this.notify();
      });
      window.addEventListener('focus', () => {
        if (this.isOnline && this.auth.isAuthenticated()) {
          this.syncAll();
        }
      });
      // Periodic background sync every 15 seconds
      setInterval(() => {
        if (this.isOnline && this.auth.isAuthenticated() && !this.isSyncing) {
          this.syncAll();
        }
      }, 15000);
    }

    // When user logs in or out, update realtime and sync
    this.auth.subscribe((user) => {
      if (user) {
        this.setupRealtime(user.id);
        this.syncAll();
      } else {
        this.teardownRealtime();
      }
    });
  }

  public onSyncComplete(callback: () => void): () => void {
    this.syncCompleteCallbacks.add(callback);
    return () => this.syncCompleteCallbacks.delete(callback);
  }

  private notifySyncComplete(): void {
    for (const cb of this.syncCompleteCallbacks) {
      try {
        cb();
      } catch (e) {
        console.error('Error in onSyncComplete callback:', e);
      }
    }
  }

  private setupRealtime(userId: string): void {
    const client = this.auth.getClient();
    if (!client) return;

    this.teardownRealtime();

    try {
      this.realtimeChannel = client
        .channel(`sync_${userId}`)
        .on('postgres_changes', { event: '*', schema: 'public' }, async () => {
          if (!this.isSyncing) {
            await this.pullRemoteChanges(client, userId);
            this.notifySyncComplete();
          }
        })
        .subscribe();
    } catch (e) {
      console.warn('Realtime channel setup failed:', e);
    }
  }

  private teardownRealtime(): void {
    if (this.realtimeChannel) {
      const client = this.auth.getClient();
      client?.removeChannel(this.realtimeChannel);
      this.realtimeChannel = null;
    }
  }

  public subscribe(callback: (status: SyncStatus) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private async notify(): Promise<void> {
    const queue = await this.storage.getSyncQueue();
    const status = this.getStatus(queue.length);
    for (const listener of this.listeners) {
      listener(status);
    }
  }

  public getStatus(pendingCount: number = 0): SyncStatus {
    return {
      isOnline: this.isOnline,
      isSyncing: this.isSyncing,
      pendingCount,
      lastSyncedAt: this.lastSyncedAt,
      lastError: this.lastError,
    };
  }

  public async queueChange(
    table: SyncQueueItem['table'],
    operation: SyncQueueItem['operation'],
    payload: any
  ): Promise<void> {
    const item: SyncQueueItem = {
      id: crypto.randomUUID(),
      table,
      operation,
      payload,
      timestamp: new Date().toISOString(),
    };

    await this.storage.enqueueSync(item);
    await this.notify();

    // If online and authenticated, trigger sync in background
    if (this.isOnline && this.auth.isAuthenticated()) {
      this.syncAll();
    }
  }

  public async syncAll(): Promise<{ success: boolean; pushed: number; error: string | null }> {
    const client = this.auth.getClient();
    const user = this.auth.getUser();

    if (!client || !user) {
      return { success: false, pushed: 0, error: 'Not authenticated with Supabase.' };
    }

    if (!this.isOnline) {
      return { success: false, pushed: 0, error: 'Device is offline.' };
    }

    if (this.isSyncing) {
      return { success: false, pushed: 0, error: 'Sync already in progress.' };
    }

    this.isSyncing = true;
    this.lastError = null;
    await this.notify();

    let pushedCount = 0;

    try {
      // 1. Drain offline queue first (Push)
      const queue = await this.storage.getSyncQueue();
      for (const item of queue) {
        const success = await this.processQueueItem(client, user.id, item);
        if (success) {
          await this.storage.removeSyncQueueItem(item.id);
          pushedCount++;
        } else {
          // Stop on first failure to maintain transaction sequence
          break;
        }
      }

      // 2. Also ensure all local sessions, targets, and categories are saved in Supabase
      const localCats = await this.storage.getCategories();
      for (const cat of localCats) {
        await client.from('categories').upsert(this.mapToDbColumns('categories', { ...cat, user_id: user.id }));
      }

      const localSessions = await this.storage.getSessions();
      for (const s of localSessions) {
        await client.from('sessions').upsert(this.mapToDbColumns('sessions', { ...s, user_id: user.id }));
      }

      const localTargets = await this.storage.getTargets();
      for (const t of localTargets) {
        await client.from('weekly_targets').upsert(
          this.mapToDbColumns('weekly_targets', { ...t, user_id: user.id }),
          { onConflict: 'user_id, category_id, week_start_date' }
        );
      }

      const localGame = await this.storage.getGamificationState(user.id);
      if (localGame) {
        await client.from('gamification_state').upsert(
          this.mapToDbColumns('gamification_state', { ...localGame, user_id: user.id })
        );
      }

      // 3. Pull remote changes
      await this.pullRemoteChanges(client, user.id);

      this.lastSyncedAt = new Date().toISOString();
      await this.storage.setSetting('last_synced_at', this.lastSyncedAt);
      this.isSyncing = false;
      await this.notify();
      this.notifySyncComplete();

      return { success: true, pushed: pushedCount, error: null };
    } catch (err: any) {
      this.lastError = err?.message || 'Unknown sync error';
      this.isSyncing = false;
      await this.notify();
      return { success: false, pushed: pushedCount, error: this.lastError };
    }
  }

  private async processQueueItem(client: SupabaseClient, userId: string, item: SyncQueueItem): Promise<boolean> {
    try {
      const payload = { ...item.payload, user_id: userId };

      if (item.operation === 'INSERT' || item.operation === 'UPDATE') {
        const options = item.table === 'weekly_targets'
          ? { onConflict: 'user_id, category_id, week_start_date' }
          : undefined;

        const { error } = await client
          .from(item.table)
          .upsert(this.mapToDbColumns(item.table, payload), options);
        if (error) {
          console.error(`Sync upsert failed on ${item.table}:`, error);
          return false;
        }
      } else if (item.operation === 'DELETE') {
        const { error } = await client
          .from(item.table)
          .delete()
          .eq('id', item.payload.id)
          .eq('user_id', userId);
        if (error) {
          console.error(`Sync delete failed on ${item.table}:`, error);
          return false;
        }
      }
      return true;
    } catch (e) {
      console.error('Error processing sync queue item:', e);
      return false;
    }
  }

  private async pullRemoteChanges(client: SupabaseClient, userId: string): Promise<void> {
    // Pull categories
    const { data: remoteCats, error: catErr } = await client
      .from('categories')
      .select('*')
      .eq('user_id', userId);

    if (!catErr && remoteCats && remoteCats.length > 0) {
      const localCats = await this.storage.getCategories();
      const localMap = new Map(localCats.map((c) => [c.id, c]));

      for (const rc of remoteCats) {
        const mapped = this.mapFromDbColumns('categories', rc);
        const local = localMap.get(mapped.id);
        if (!local || new Date(mapped.updatedAt || 0) > new Date(local.updatedAt || 0)) {
          await this.storage.saveCategory(mapped);
        }
      }
    }

    // Pull sessions
    const { data: remoteSessions, error: sessErr } = await client
      .from('sessions')
      .select('*')
      .eq('user_id', userId);

    if (!sessErr && remoteSessions && remoteSessions.length > 0) {
      const localSessions = await this.storage.getSessions();
      const localMap = new Map(localSessions.map((s) => [s.id, s]));

      for (const rs of remoteSessions) {
        const mapped = this.mapFromDbColumns('sessions', rs);
        const local = localMap.get(mapped.id);
        if (!local || new Date(mapped.updatedAt || 0) > new Date(local.updatedAt || 0)) {
          await this.storage.saveSession(mapped);
        }
      }
    }

    // Pull weekly targets
    const { data: remoteTargets, error: targetErr } = await client
      .from('weekly_targets')
      .select('*')
      .eq('user_id', userId);

    if (!targetErr && remoteTargets && remoteTargets.length > 0) {
      const localTargets = await this.storage.getTargets();
      const localMap = new Map(localTargets.map((t) => [t.id, t]));

      for (const rt of remoteTargets) {
        const mapped = this.mapFromDbColumns('weekly_targets', rt);
        const local = localMap.get(mapped.id);
        if (!local || new Date(mapped.updatedAt || 0) > new Date(local.updatedAt || 0)) {
          await this.storage.saveTarget(mapped);
        }
      }
    }

    // Pull gamification state
    const { data: remoteGamification, error: gameErr } = await client
      .from('gamification_state')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (!gameErr && remoteGamification) {
      const mapped = this.mapFromDbColumns('gamification_state', remoteGamification);
      const local = await this.storage.getGamificationState(userId);
      if (!local || new Date(mapped.updatedAt) > new Date(local.updatedAt)) {
        await this.storage.saveGamificationState(mapped);
      }
    }
  }

  private mapToDbColumns(table: string, obj: any): any {
    if (table === 'categories') {
      return {
        id: obj.id,
        user_id: obj.userId || obj.user_id,
        name: obj.name,
        color: obj.color,
        icon: obj.icon,
        updated_at: obj.updatedAt || new Date().toISOString(),
      };
    }
    if (table === 'sessions') {
      return {
        id: obj.id,
        user_id: obj.userId || obj.user_id,
        category_id: obj.categoryId,
        start_time: obj.startTime,
        end_time: obj.endTime,
        duration_sec: obj.durationSec,
        note: obj.note,
        created_at: obj.createdAt,
        updated_at: obj.updatedAt,
      };
    }
    if (table === 'weekly_targets') {
      return {
        id: obj.id,
        user_id: obj.userId || obj.user_id,
        category_id: obj.categoryId,
        target_hours: obj.targetHours,
        week_start_date: obj.weekStartDate,
      };
    }
    if (table === 'gamification_state') {
      return {
        user_id: obj.userId || obj.user_id,
        xp: obj.xp,
        level: obj.level,
        current_streak: obj.currentStreak,
        longest_streak: obj.longestStreak,
        last_active_date: obj.lastActiveDate,
        badges: obj.badges,
        updated_at: obj.updatedAt || new Date().toISOString(),
      };
    }
    return obj;
  }

  private mapFromDbColumns(table: string, row: any): any {
    if (table === 'categories') {
      return {
        id: row.id,
        userId: row.user_id,
        name: row.name,
        color: row.color,
        icon: row.icon,
        updatedAt: row.updated_at || new Date().toISOString(),
      };
    }
    if (table === 'sessions') {
      return {
        id: row.id,
        userId: row.user_id,
        categoryId: row.category_id,
        startTime: row.start_time,
        endTime: row.end_time,
        durationSec: row.duration_sec,
        note: row.note,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    }
    if (table === 'weekly_targets') {
      return {
        id: row.id,
        userId: row.user_id,
        categoryId: row.category_id,
        targetHours: row.target_hours,
        weekStartDate: row.week_start_date,
        updatedAt: row.updated_at || new Date().toISOString(),
      };
    }
    if (table === 'gamification_state') {
      return {
        userId: row.user_id,
        xp: row.xp,
        level: row.level,
        currentStreak: row.current_streak,
        longestStreak: row.longest_streak,
        lastActiveDate: row.last_active_date,
        streakFreezesAvailable: 1,
        lastFreezeWeek: null,
        badges: row.badges || [],
        updatedAt: row.updated_at || new Date().toISOString(),
      };
    }
    return row;
  }
}
