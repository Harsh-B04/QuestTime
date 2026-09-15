import { StorageService } from './storage';

export interface NotificationSettings {
  enabled: boolean;
  dailyReminderEnabled: boolean;
  reminderTime: string; // e.g. "20:00"
  streakAlertEnabled: boolean;
  timerAlertEnabled: boolean;
  lastReminderDate?: string; // "YYYY-MM-DD"
}

const DEFAULT_SETTINGS: NotificationSettings = {
  enabled: false,
  dailyReminderEnabled: true,
  reminderTime: '20:00',
  streakAlertEnabled: true,
  timerAlertEnabled: true,
};

const SETTINGS_KEY = 'notification_settings';

export class NotificationService {
  private static instance: NotificationService | null = null;
  private storage: StorageService;
  private settings: NotificationSettings = { ...DEFAULT_SETTINGS };
  private isLoaded = false;
  private listeners: Set<(settings: NotificationSettings) => void> = new Set();

  public static getInstance(storage: StorageService): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService(storage);
    }
    return NotificationService.instance;
  }

  constructor(storage: StorageService) {
    this.storage = storage;
  }

  public subscribe(callback: (settings: NotificationSettings) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notifyListeners(): void {
    for (const cb of this.listeners) {
      cb({ ...this.settings });
    }
  }

  public async load(): Promise<void> {
    if (this.isLoaded) return;
    const saved = await this.storage.getSetting<NotificationSettings>(SETTINGS_KEY);
    if (saved) {
      this.settings = { ...DEFAULT_SETTINGS, ...saved };
    }
    this.isLoaded = true;
    this.notifyListeners();
  }

  public getSettings(): NotificationSettings {
    return { ...this.settings };
  }

  public isSupported(): boolean {
    return typeof window !== 'undefined' && 'Notification' in window;
  }

  public getPermission(): NotificationPermission {
    if (!this.isSupported()) return 'denied';
    return Notification.permission;
  }

  public async requestPermission(): Promise<NotificationPermission> {
    if (!this.isSupported()) return 'denied';
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        await this.updateSettings({ enabled: true });
        await this.tryRegisterPeriodicSync();
      } else {
        await this.updateSettings({ enabled: false });
      }
      return permission;
    } catch {
      return 'denied';
    }
  }

  public async updateSettings(updates: Partial<NotificationSettings>): Promise<void> {
    this.settings = { ...this.settings, ...updates };
    await this.storage.setSetting(SETTINGS_KEY, this.settings);
    this.notifyListeners();

    if (this.settings.enabled && this.settings.dailyReminderEnabled) {
      await this.tryRegisterPeriodicSync();
    }
  }

  /**
   * Display a notification via ServiceWorker registration if possible,
   * falling back to the standard web Notification constructor.
   */
  public async showNotification(title: string, options: NotificationOptions = {}): Promise<boolean> {
    if (!this.isSupported() || this.getPermission() !== 'granted') {
      return false;
    }

    const fullOptions: NotificationOptions & { renotify?: boolean; data?: unknown } = {
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      tag: 'questtime-alert',
      renotify: true,
      data: { url: '/' },
      ...options,
    };

    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        if (reg && 'showNotification' in reg) {
          await reg.showNotification(title, fullOptions as NotificationOptions);
          return true;
        }
      }

      new Notification(title, fullOptions as NotificationOptions);
      return true;
    } catch (err) {
      console.warn('Failed to display notification:', err);
      return false;
    }
  }

  /**
   * Sends an immediate test notification so the user can verify their phone/browser is receiving alerts.
   */
  public async sendTestNotification(): Promise<boolean> {
    return this.showNotification('🔔 QuestTime Notification Active', {
      body: 'Your streak reminders and focus alerts are now connected to your device! Keep up the great work.',
      tag: 'test-notification',
    });
  }

  /**
   * Alert user when a timer completes (especially helpful when user switched tabs or locked phone).
   */
  public async notifyTimerComplete(categoryName: string, durationMinutes: number): Promise<boolean> {
    if (!this.settings.enabled || !this.settings.timerAlertEnabled) {
      return false;
    }

    return this.showNotification(`🎉 Focus Session Complete! (${categoryName})`, {
      body: `Awesome job! You finished ${durationMinutes} minute${durationMinutes === 1 ? '' : 's'} of focus time. Tap to save notes & claim XP!`,
      tag: 'timer-complete',
    });
  }

  /**
   * Evaluates streak status and triggers daily reminder if time matches and hasn't notified today.
   */
  public async checkDailyStreakReminder(streakDays: number, sessionsTodayCount: number): Promise<boolean> {
    if (!this.settings.enabled || !this.settings.dailyReminderEnabled) {
      return false;
    }

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    // Avoid multiple daily notifications on the same day
    if (this.settings.lastReminderDate === todayStr) {
      return false;
    }

    // Check if the current time is at or past user's reminderTime (e.g., "20:00")
    const [targetHour, targetMin] = (this.settings.reminderTime || '20:00').split(':').map(Number);
    const currentHour = now.getHours();
    const currentMin = now.getMinutes();
    const isPastTarget = currentHour > targetHour || (currentHour === targetHour && currentMin >= targetMin);

    if (!isPastTarget) {
      return false;
    }

    let title = 'QuestTime Daily Focus';
    let body = 'Take a moment today to focus and keep making progress on your weekly targets!';

    if (this.settings.streakAlertEnabled && streakDays > 0 && sessionsTodayCount === 0) {
      title = `🔥 ${streakDays}-Day Streak At Risk!`;
      body = `You haven't logged any focus sessions today. Log at least one session before midnight to keep your streak alive!`;
    } else if (sessionsTodayCount === 0) {
      title = '⏳ Daily Focus Reminder';
      body = `Ready to log some focused time? Jump in for 15 minutes and earn XP toward your next level.`;
    } else {
      // User has already focused today! No need to nag.
      await this.updateSettings({ lastReminderDate: todayStr });
      return false;
    }

    const sent = await this.showNotification(title, {
      body,
      tag: 'daily-streak-reminder',
    });

    if (sent) {
      await this.updateSettings({ lastReminderDate: todayStr });
    }

    return sent;
  }

  /**
   * Periodic Background Sync registration for Chrome Android installed PWAs.
   */
  public async tryRegisterPeriodicSync(): Promise<void> {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    try {
      const reg = await navigator.serviceWorker.ready;
      if ('periodicSync' in reg) {
        // @ts-expect-error PeriodicSyncManager is not yet in standard TS dom types
        await reg.periodicSync.register('daily-streak-reminder', {
          minInterval: 12 * 60 * 60 * 1000, // 12 hours minimum interval
        });
      }
    } catch {
      // Periodic sync may require specific permissions or user engagement score in Chrome Android
    }
  }
}
