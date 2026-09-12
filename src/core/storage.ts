import { openDB, deleteDB, type IDBPDatabase } from 'idb';
import type {
  CategoryDTO,
  SessionDTO,
  WeeklyTargetDTO,
  GamificationStateDTO,
  SyncQueueItem,
} from '../types';

const DB_NAME = 'quest_time_db';
const DB_VERSION = 1;

export class StorageService {
  private static instance: StorageService | null = null;
  private dbPromise: Promise<IDBPDatabase> | null = null;

  public static getInstance(): StorageService {
    if (!StorageService.instance) {
      StorageService.instance = new StorageService();
    }
    return StorageService.instance;
  }

  private async getDB(): Promise<IDBPDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
          // Categories
          if (!db.objectStoreNames.contains('categories')) {
            db.createObjectStore('categories', { keyPath: 'id' });
          }

          // Sessions
          if (!db.objectStoreNames.contains('sessions')) {
            const sessionStore = db.createObjectStore('sessions', { keyPath: 'id' });
            sessionStore.createIndex('by_start_time', 'startTime');
            sessionStore.createIndex('by_category', 'categoryId');
          }

          // Weekly Targets
          if (!db.objectStoreNames.contains('weekly_targets')) {
            const targetStore = db.createObjectStore('weekly_targets', { keyPath: 'id' });
            targetStore.createIndex('by_category', 'categoryId');
          }

          // Gamification State
          if (!db.objectStoreNames.contains('gamification_state')) {
            db.createObjectStore('gamification_state', { keyPath: 'userId' });
          }

          // Sync Queue
          if (!db.objectStoreNames.contains('sync_queue')) {
            const syncStore = db.createObjectStore('sync_queue', { keyPath: 'id' });
            syncStore.createIndex('by_timestamp', 'timestamp');
          }

          // Key-Value App Settings (active timer state, config, etc.)
          if (!db.objectStoreNames.contains('key_val')) {
            db.createObjectStore('key_val', { keyPath: 'key' });
          }
        },
      });
    }
    return this.dbPromise;
  }

  // --- Categories ---
  public async getCategories(): Promise<CategoryDTO[]> {
    const db = await this.getDB();
    return db.getAll('categories');
  }

  public async saveCategory(cat: CategoryDTO): Promise<void> {
    const db = await this.getDB();
    await db.put('categories', cat);
  }

  public async saveCategories(cats: CategoryDTO[]): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction('categories', 'readwrite');
    for (const cat of cats) {
      await tx.store.put(cat);
    }
    await tx.done;
  }

  public async deleteCategory(id: string): Promise<void> {
    const db = await this.getDB();
    await db.delete('categories', id);
  }

  // --- Sessions ---
  public async getSessions(): Promise<SessionDTO[]> {
    const db = await this.getDB();
    return db.getAll('sessions');
  }

  public async saveSession(session: SessionDTO): Promise<void> {
    const db = await this.getDB();
    await db.put('sessions', session);
  }

  public async deleteSession(id: string): Promise<void> {
    const db = await this.getDB();
    await db.delete('sessions', id);
  }

  // --- Weekly Targets ---
  public async getTargets(): Promise<WeeklyTargetDTO[]> {
    const db = await this.getDB();
    return db.getAll('weekly_targets');
  }

  public async saveTarget(target: WeeklyTargetDTO): Promise<void> {
    const db = await this.getDB();
    await db.put('weekly_targets', target);
  }

  public async deleteTarget(id: string): Promise<void> {
    const db = await this.getDB();
    await db.delete('weekly_targets', id);
  }

  // --- Gamification State ---
  public async getGamificationState(userId: string = 'local-user'): Promise<GamificationStateDTO | null> {
    const db = await this.getDB();
    const result = await db.get('gamification_state', userId);
    if (result) return result;
    const all = await db.getAll('gamification_state');
    return all.length > 0 ? all[0] : null;
  }

  public async saveGamificationState(state: GamificationStateDTO): Promise<void> {
    const db = await this.getDB();
    await db.put('gamification_state', state);
  }

  // --- Sync Queue ---
  public async enqueueSync(item: SyncQueueItem): Promise<void> {
    const db = await this.getDB();
    await db.put('sync_queue', item);
  }

  public async getSyncQueue(): Promise<SyncQueueItem[]> {
    const db = await this.getDB();
    return db.getAllFromIndex('sync_queue', 'by_timestamp');
  }

  public async removeSyncQueueItem(id: string): Promise<void> {
    const db = await this.getDB();
    await db.delete('sync_queue', id);
  }

  public async clearSyncQueue(): Promise<void> {
    const db = await this.getDB();
    await db.clear('sync_queue');
  }

  // --- Key-Value metadata ---
  public async getSetting<T>(key: string): Promise<T | null> {
    const db = await this.getDB();
    const entry = await db.get('key_val', key);
    return entry ? entry.value : null;
  }

  public async setSetting<T>(key: string, value: T): Promise<void> {
    const db = await this.getDB();
    await db.put('key_val', { key, value });
  }

  public async removeSetting(key: string): Promise<void> {
    const db = await this.getDB();
    await db.delete('key_val', key);
  }

  // --- Deleted Item Tombstones ---
  public async getDeletedIds(table?: string): Promise<Set<string>> {
    const records = (await this.getSetting<Array<{ id: string; table: string; timestamp: number }>>('deleted_item_tombstones')) || [];
    if (table) {
      return new Set(records.filter((r) => r.table === table).map((r) => r.id));
    }
    return new Set(records.map((r) => r.id));
  }

  public async recordDeletedId(table: string, id: string): Promise<void> {
    const records = (await this.getSetting<Array<{ id: string; table: string; timestamp: number }>>('deleted_item_tombstones')) || [];
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000; // 30 days retention
    const filtered = records.filter((r) => r.timestamp > cutoff && r.id !== id);
    filtered.push({ id, table, timestamp: Date.now() });
    await this.setSetting('deleted_item_tombstones', filtered.slice(-1000));
  }

  // --- Complete Data Wipe / Reset ---
  public async clearAllData(): Promise<void> {
    try {
      if (this.dbPromise) {
        const db = await this.dbPromise;
        db.close();
      }
      this.dbPromise = null;
      await deleteDB(DB_NAME);
    } catch (e) {
      console.warn('deleteDB fallback to clearing stores:', e);
      const db = await this.getDB();
      await db.clear('sessions');
      await db.clear('categories');
      await db.clear('weekly_targets');
      await db.clear('gamification_state');
      await db.clear('sync_queue');
      await db.clear('key_val');
    }

    // Ensure dbPromise is null so next access opens a fresh DB
    this.dbPromise = null;

    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.clear();
    }
  }
}
