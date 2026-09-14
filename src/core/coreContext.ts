import { StorageService } from './storage';
import { Category } from './category';
import { SessionLog } from './sessionLog';
import { Timer } from './timer';
import { TargetTracker } from './targetTracker';
import { GamificationEngine } from './gamification';
import { AuthService } from './auth';
import { SyncService } from './sync';

export class AppCore {
  private static instance: AppCore | null = null;

  public readonly storage: StorageService;
  public readonly sessionLog: SessionLog;
  public readonly timer: Timer;
  public readonly targetTracker: TargetTracker;
  public readonly gamification: GamificationEngine;
  public readonly auth: AuthService;
  public readonly sync: SyncService;

  public categories: Category[] = [];
  private isInitialized: boolean = false;
  private categoryListeners: Set<() => void> = new Set();

  public static getInstance(): AppCore {
    if (!AppCore.instance) {
      AppCore.instance = new AppCore();
    }
    return AppCore.instance;
  }

  constructor() {
    this.storage = StorageService.getInstance();
    this.sessionLog = new SessionLog(this.storage);
    this.timer = new Timer(this.storage);
    this.targetTracker = new TargetTracker(this.storage);
    this.gamification = new GamificationEngine(this.storage);
    this.auth = AuthService.getInstance();
    this.sync = SyncService.getInstance(this.storage, this.auth);
  }

  public onCategoriesChange(callback: () => void): () => void {
    this.categoryListeners.add(callback);
    return () => this.categoryListeners.delete(callback);
  }

  private notifyCategories(): void {
    for (const cb of this.categoryListeners) {
      cb();
    }
  }

  public async reloadFromStorage(): Promise<void> {
    const savedCats = await this.storage.getCategories();
    if (savedCats.length > 0) {
      this.categories = savedCats.map((dto) => new Category(dto));
    }
    await this.sessionLog.load();
    await this.targetTracker.load();
    await this.gamification.load();
    this.notifyCategories();
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // 1. Initialize Auth
    await this.auth.initialize();

    // 2. Load or seed default categories
    let savedCats = await this.storage.getCategories();
    if (savedCats.length === 0) {
      const defaults = Category.createDefaultCategories();
      await this.storage.saveCategories(defaults.map((c) => c.toDTO()));
      this.categories = defaults;
    } else {
      this.categories = savedCats.map((dto) => new Category(dto));
    }

    // 3. Load SessionLog & TargetTracker & Gamification
    await this.sessionLog.load();
    await this.targetTracker.load();
    await this.gamification.load();

    // 4. Restore any active running/paused timer from storage
    await this.timer.restoreFromStorage();

    // 5. Wire SyncService into Timer for cross-device broadcast
    //    (done after timer.restoreFromStorage so we don't broadcast the restored state)
    this.timer.setSyncService(this.sync);

    // 6. Route incoming remote timer states to the local timer
    this.sync.onRemoteTimerState((state) => {
      // Only apply remote state if this device doesn't have a locally-started session
      // (local session wins to prevent accidental overwrites)
      const localStatus = this.timer.getStatus();
      const localStart = this.timer.getSessionStartTime();
      const remoteStart = state.sessionStartTime;

      // If local is idle, always apply remote
      // If both are running the same session (same sessionStartTime), apply for sync
      // If local has a DIFFERENT session running, ignore remote (conflict: local wins)
      const sameSession = localStart && remoteStart && localStart === remoteStart;
      const localIdle = localStatus === 'idle';

      if (localIdle || sameSession) {
        this.timer.applyRemoteState(state);
      }
    });

    // 7. Connect sync updates to auto-refresh in-memory state
    this.sync.onSyncComplete(async () => {
      await this.reloadFromStorage();
    });

    this.isInitialized = true;
    this.notifyCategories();
  }

  public getCategory(id: string): Category | undefined {
    return this.categories.find((c) => c.id === id);
  }

  public async saveCategory(category: Category): Promise<void> {
    const idx = this.categories.findIndex((c) => c.id === category.id);
    if (idx >= 0) {
      this.categories[idx] = category;
    } else {
      this.categories.push(category);
    }
    await this.storage.saveCategory(category.toDTO());
    await this.sync.queueChange('categories', 'UPDATE', category.toDTO());
    this.notifyCategories();
  }

  public async deleteCategory(id: string): Promise<void> {
    this.categories = this.categories.filter((c) => c.id !== id);
    await this.storage.deleteCategory(id);
    await this.storage.recordDeletedId('categories', id);
    await this.sync.queueChange('categories', 'DELETE', { id });
    this.notifyCategories();
  }

  public async resetToCleanSlate(): Promise<void> {
    // 1. Stop any active timer session
    this.timer.discard();

    // 2. Wipe IndexedDB + localStorage/sessionStorage
    await this.storage.clearAllData();

    // 3. Reset initialized flag so initialize() runs fresh next time
    this.isInitialized = false;

    // 4. Seed fresh default categories
    const defaults = Category.createDefaultCategories();
    await this.storage.saveCategories(defaults.map((c) => c.toDTO()));
    this.categories = defaults;

    // 5. Reload all sub-services from empty storage
    await this.sessionLog.load();
    await this.targetTracker.load();
    await this.gamification.reset();

    // 6. Mark as initialized again
    this.isInitialized = true;

    this.notifyCategories();
  }
}

export const appCore = AppCore.getInstance();
