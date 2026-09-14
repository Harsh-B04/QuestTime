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

/** Shape broadcast to all other devices when timer state changes */
export interface TimerBroadcastState {
  deviceId: string;           // random UUID per tab — prevents echoing back to sender
  status: 'running' | 'paused' | 'idle';
  categoryId: string | null;
  startTimestamp: number | null;  // Date.now() when current run started
  accumulatedSec: number;
  sessionStartTime: string | null;
  note: string;
}

export class SyncService {
  private static instance: SyncService | null = null;
  private storage: StorageService;
  private auth: AuthService;
  private isOnline: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private isSyncing: boolean = false;
  private syncPending: boolean = false;
  private lastSyncedAt: string | null = null;
  private lastError: string | null = null;
  private listeners: Set<(status: SyncStatus) => void> = new Set();

  private syncCompleteCallbacks: Set<() => void> = new Set();
  private realtimeChannel: any = null;

  // Live cross-device timer sync via Supabase Broadcast
  private timerChannel: any = null;
  private timerStateCallbacks: Set<(state: TimerBroadcastState) => void> = new Set();
  // Stable per-tab device ID prevents the sender from re-processing its own broadcasts
  private readonly deviceId: string = crypto.randomUUID();

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

    // Load lastSyncedAt from persistent storage
    this.storage.getSetting<string>('last_synced_at').then((val) => {
      if (val) this.lastSyncedAt = val;
    });

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
      // Channel 1: postgres_changes — syncs sessions/categories/targets across devices
      this.realtimeChannel = client
        .channel(`sync_${userId}`)
        .on('postgres_changes', { event: '*', schema: 'public' }, async (payload: any) => {
          if (payload?.eventType === 'DELETE' && payload?.table && payload?.old?.id) {
            const id = payload.old.id;
            if (payload.table === 'sessions') {
              await this.storage.recordDeletedId('sessions', id);
              await this.storage.deleteSession(id);
            } else if (payload.table === 'categories') {
              await this.storage.recordDeletedId('categories', id);
              await this.storage.deleteCategory(id);
            } else if (payload.table === 'weekly_targets') {
              await this.storage.recordDeletedId('weekly_targets', id);
              await this.storage.deleteTarget(id);
            }
            this.notifySyncComplete();
          } else if (!this.isSyncing) {
            await this.pullRemoteChanges(client, userId);
            this.notifySyncComplete();
          }
        })
        .subscribe();

      // Channel 2: Broadcast — live timer state across devices (no DB writes)
      this.timerChannel = client
        .channel(`timer_${userId}`)
        .on('broadcast', { event: 'timer_state' }, ({ payload }: { payload: TimerBroadcastState }) => {
          // Ignore messages sent by this same tab
          if (!payload || payload.deviceId === this.deviceId) return;
          for (const cb of this.timerStateCallbacks) {
            try { cb(payload); } catch (e) { console.warn('timer broadcast cb error', e); }
          }
        })
        .subscribe();
    } catch (e) {
      console.warn('Realtime channel setup failed:', e);
    }
  }

  private teardownRealtime(): void {
    const client = this.auth.getClient();
    if (this.realtimeChannel) {
      client?.removeChannel(this.realtimeChannel);
      this.realtimeChannel = null;
    }
    if (this.timerChannel) {
      client?.removeChannel(this.timerChannel);
      this.timerChannel = null;
    }
  }

  /**
   * Broadcast current timer state to all other logged-in devices.
   * No-op if not authenticated or offline.
   */
  public broadcastTimerState(state: Omit<TimerBroadcastState, 'deviceId'>): void {
    if (!this.timerChannel || !this.auth.isAuthenticated()) return;
    try {
      this.timerChannel.send({
        type: 'broadcast',
        event: 'timer_state',
        payload: { ...state, deviceId: this.deviceId } satisfies TimerBroadcastState,
      });
    } catch (e) {
      // Non-fatal — broadcast is best-effort
      console.warn('Timer broadcast failed:', e);
    }
  }

  /** Subscribe to remote timer state changes (from other devices). Returns unsub fn. */
  public onRemoteTimerState(cb: (state: TimerBroadcastState) => void): () => void {
    this.timerStateCallbacks.add(cb);
    return () => this.timerStateCallbacks.delete(cb);
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
    if (operation === 'DELETE' && payload?.id) {
      await this.storage.recordDeletedId(table, payload.id);
      // Clean up any pending INSERT or UPDATE for this same item from the queue
      const existingQueue = await this.storage.getSyncQueue();
      for (const item of existingQueue) {
        if (item.table === table && item.payload?.id === payload.id) {
          await this.storage.removeSyncQueueItem(item.id);
        }
      }
    }

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
      this.syncPending = true;
      return { success: false, pushed: 0, error: 'Sync already in progress.' };
    }

    this.isSyncing = true;
    this.lastError = null;
    await this.notify();

    let pushedCount = 0;

    try {
      // 1. Drain offline queue first (Push all pending INSERTs, UPDATEs, and DELETEs)
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

      // 2. One-time initial push for existing offline data (ONLY on very first login if remote is empty)
      const initialMigrationDone = await this.storage.getSetting<boolean>(`cloud_initial_migration_done_${user.id}`);
      if (!initialMigrationDone) {
        const { count: remoteCatCount } = await client
          .from('categories')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id);

        // Only upload local data if this account has no categories yet in Supabase
        if (!remoteCatCount || remoteCatCount === 0) {
          await this.initialPushLocal(client, user.id);
        }
        await this.storage.setSetting(`cloud_initial_migration_done_${user.id}`, true);
      }

      // 3. Pull remote changes AND reconcile deletions
      await this.pullRemoteChanges(client, user.id);

      this.lastSyncedAt = new Date().toISOString();
      await this.storage.setSetting('last_synced_at', this.lastSyncedAt);
      this.isSyncing = false;
      await this.notify();
      this.notifySyncComplete();

      if (this.syncPending) {
        this.syncPending = false;
        return this.syncAll();
      }

      return { success: true, pushed: pushedCount, error: null };
    } catch (err: any) {
      this.lastError = err?.message || 'Unknown sync error';
      this.isSyncing = false;
      await this.notify();

      if (this.syncPending) {
        this.syncPending = false;
        setTimeout(() => this.syncAll(), 1500);
      }

      return { success: false, pushed: pushedCount, error: this.lastError };
    }
  }

  /**
   * Only called ONCE EVER when a user first signs in, to migrate any offline data
   * created before an account existed. Only pushes items that are NOT marked deleted.
   */
  private async initialPushLocal(client: SupabaseClient, userId: string): Promise<void> {
    const deletedSessionIds = await this.storage.getDeletedIds('sessions');
    const localSessions = await this.storage.getSessions();
    for (const s of localSessions) {
      if (!deletedSessionIds.has(s.id)) {
        await client.from('sessions').upsert(this.mapToDbColumns('sessions', { ...s, user_id: userId }));
      }
    }

    const deletedCatIds = await this.storage.getDeletedIds('categories');
    const localCats = await this.storage.getCategories();
    for (const cat of localCats) {
      if (!deletedCatIds.has(cat.id)) {
        await client.from('categories').upsert(this.mapToDbColumns('categories', { ...cat, user_id: userId }));
      }
    }

    const deletedTargetIds = await this.storage.getDeletedIds('weekly_targets');
    const localTargets = await this.storage.getTargets();
    for (const t of localTargets) {
      if (!deletedTargetIds.has(t.id)) {
        await client.from('weekly_targets').upsert(
          this.mapToDbColumns('weekly_targets', { ...t, user_id: userId }),
          { onConflict: 'user_id, category_id, week_start_date' }
        );
      }
    }

    const localGame = await this.storage.getGamificationState(userId);
    if (localGame) {
      await client.from('gamification_state').upsert(
        this.mapToDbColumns('gamification_state', { ...localGame, user_id: userId })
      );
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
    const queue = await this.storage.getSyncQueue();
    const deletedSessionIds = await this.storage.getDeletedIds('sessions');
    const deletedCatIds = await this.storage.getDeletedIds('categories');
    const deletedTargetIds = await this.storage.getDeletedIds('weekly_targets');

    // ── Categories ──
    const { data: remoteCats, error: catErr } = await client
      .from('categories')
      .select('*')
      .eq('user_id', userId);

    if (!catErr && remoteCats) {
      const remoteIdSet = new Set(remoteCats.map((r: any) => r.id));
      const localCats = await this.storage.getCategories();
      const pendingCatInserts = new Set(
        queue.filter((q) => q.table === 'categories' && q.operation === 'INSERT').map((q) => q.payload.id)
      );
      const pendingCatDeletes = new Set(
        queue.filter((q) => q.table === 'categories' && q.operation === 'DELETE').map((q) => q.payload.id)
      );

      // Upsert remote → local (skipping anything marked deleted)
      for (const rc of remoteCats) {
        if (deletedCatIds.has(rc.id) || pendingCatDeletes.has(rc.id)) {
          // If remote still has an item deleted locally, ensure remote delete
          await client.from('categories').delete().eq('id', rc.id).eq('user_id', userId);
          continue;
        }
        const mapped = this.mapFromDbColumns('categories', rc);
        const local = localCats.find((c) => c.id === mapped.id);
        if (!local || new Date(mapped.updatedAt || 0) > new Date(local.updatedAt || 0)) {
          await this.storage.saveCategory(mapped);
        }
      }

      // Reconcile: delete local items that were deleted remotely
      if (remoteCats.length > 0) {
        for (const lc of localCats) {
          if (!remoteIdSet.has(lc.id) && !pendingCatInserts.has(lc.id)) {
            await this.storage.recordDeletedId('categories', lc.id);
            await this.storage.deleteCategory(lc.id);
          }
        }
      }
    }

    // ── Sessions ──
    const { data: remoteSessions, error: sessErr } = await client
      .from('sessions')
      .select('*')
      .eq('user_id', userId);

    if (!sessErr && remoteSessions) {
      const remoteIdSet = new Set(remoteSessions.map((r: any) => r.id));
      const localSessions = await this.storage.getSessions();
      const pendingSessionInserts = new Set(
        queue.filter((q) => q.table === 'sessions' && q.operation === 'INSERT').map((q) => q.payload.id)
      );
      const pendingSessionDeletes = new Set(
        queue.filter((q) => q.table === 'sessions' && q.operation === 'DELETE').map((q) => q.payload.id)
      );

      // Upsert remote → local (strictly skipping deleted sessions!)
      for (const rs of remoteSessions) {
        if (deletedSessionIds.has(rs.id) || pendingSessionDeletes.has(rs.id)) {
          // Deleted locally: purge from remote and never restore locally!
          await client.from('sessions').delete().eq('id', rs.id).eq('user_id', userId);
          continue;
        }
        const mapped = this.mapFromDbColumns('sessions', rs);
        const local = localSessions.find((s) => s.id === mapped.id);
        if (!local || new Date(mapped.updatedAt || 0) > new Date(local.updatedAt || 0)) {
          await this.storage.saveSession(mapped);
        }
      }

      // Reconcile deletions: remove local sessions that were deleted remotely
      for (const ls of localSessions) {
        if (!remoteIdSet.has(ls.id) && !pendingSessionInserts.has(ls.id)) {
          await this.storage.recordDeletedId('sessions', ls.id);
          await this.storage.deleteSession(ls.id);
        }
      }
    }

    // ── Weekly targets ──
    const { data: remoteTargets, error: targetErr } = await client
      .from('weekly_targets')
      .select('*')
      .eq('user_id', userId);

    if (!targetErr && remoteTargets) {
      const remoteIdSet = new Set(remoteTargets.map((r: any) => r.id));
      const localTargets = await this.storage.getTargets();
      const pendingTargetInserts = new Set(
        queue.filter((q) => q.table === 'weekly_targets' && q.operation === 'INSERT').map((q) => q.payload.id)
      );
      const pendingTargetDeletes = new Set(
        queue.filter((q) => q.table === 'weekly_targets' && q.operation === 'DELETE').map((q) => q.payload.id)
      );

      for (const rt of remoteTargets) {
        if (deletedTargetIds.has(rt.id) || pendingTargetDeletes.has(rt.id)) {
          await client.from('weekly_targets').delete().eq('id', rt.id).eq('user_id', userId);
          continue;
        }
        const mapped = this.mapFromDbColumns('weekly_targets', rt);
        const local = localTargets.find((t) => t.id === mapped.id);
        if (!local || new Date(mapped.updatedAt || 0) > new Date(local.updatedAt || 0)) {
          const mergedTarget = {
            ...mapped,
            dailyTargetHours: local?.dailyTargetHours ?? mapped.dailyTargetHours,
            isDaily: local?.isDaily ?? mapped.isDaily,
            targetDays: local?.targetDays ?? mapped.targetDays,
            dailySchedule: local?.dailySchedule ?? mapped.dailySchedule,
            autoSyncWeekly: local?.autoSyncWeekly ?? mapped.autoSyncWeekly,
          };
          await this.storage.saveTarget(mergedTarget);
        }
      }

      for (const lt of localTargets) {
        if (!remoteIdSet.has(lt.id) && !pendingTargetInserts.has(lt.id)) {
          await this.storage.recordDeletedId('weekly_targets', lt.id);
          await this.storage.deleteTarget(lt.id);
        }
      }
    }

    // ── Gamification state ──
    const localGame = await this.storage.getGamificationState(userId);
    const { data: remoteGamification, error: gameErr } = await client
      .from('gamification_state')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (!gameErr && remoteGamification) {
      const mapped = this.mapFromDbColumns('gamification_state', remoteGamification);
      if (!localGame) {
        await this.storage.saveGamificationState(mapped);
      } else {
        const remoteUpdated = new Date(mapped.updatedAt || 0).getTime();
        const localUpdated = new Date(localGame.updatedAt || 0).getTime();
        if (mapped.xp > localGame.xp || (mapped.xp === localGame.xp && remoteUpdated > localUpdated)) {
          // Preserve local cosmetics and streak freeze data when pulling remote XP/badges
          const mergedGame = {
            ...mapped,
            unlockedCosmetics: localGame.unlockedCosmetics || ['theme-cyber-slate'],
            activeCosmetic: localGame.activeCosmetic || 'theme-cyber-slate',
            streakFreezesAvailable: localGame.streakFreezesAvailable ?? mapped.streakFreezesAvailable,
            lastFreezeWeek: localGame.lastFreezeWeek ?? mapped.lastFreezeWeek,
          };
          await this.storage.saveGamificationState(mergedGame);
        } else if (localGame.xp > mapped.xp || localUpdated > remoteUpdated) {
          await client.from('gamification_state').upsert(
            this.mapToDbColumns('gamification_state', { ...localGame, user_id: userId })
          );
        }
      }
    } else if (localGame) {
      await client.from('gamification_state').upsert(
        this.mapToDbColumns('gamification_state', { ...localGame, user_id: userId })
      );
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
        updated_at: obj.updatedAt || new Date().toISOString(),
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
