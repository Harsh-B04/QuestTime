import { StorageService } from './storage';

export type MoodTier = 'gloomy' | 'calm' | 'warm' | 'bright' | 'vivid' | 'radiant';

export interface MoodConfig {
  tier: MoodTier;
  title: string;
  subtitle: string;
  badgeLabel: string;
  bgGradient: string;
  accentColor: string;
  glowColor: string;
  ringHue: number; // Base HSL hue
  isFreshStartMonday: boolean;
}

export class MoodEngine {
  private static instance: MoodEngine | null = null;
  private storage: StorageService;
  private listeners: Array<() => void> = [];
  private moodEnabled: boolean = true;

  private constructor(storage = StorageService.getInstance()) {
    this.storage = storage;
  }

  public static getInstance(storage = StorageService.getInstance()): MoodEngine {
    if (!MoodEngine.instance) {
      MoodEngine.instance = new MoodEngine(storage);
    }
    return MoodEngine.instance;
  }

  public async load(): Promise<void> {
    const setting = await this.storage.getSetting<boolean>('mood_enabled');
    if (setting !== null && setting !== undefined) {
      this.moodEnabled = setting;
    }
  }

  public isEnabled(): boolean {
    return this.moodEnabled;
  }

  public async setEnabled(enabled: boolean): Promise<void> {
    this.moodEnabled = enabled;
    await this.storage.setSetting('mood_enabled', enabled);
    this.notify();
  }

  /**
   * Pure utility: Lightness scales +8% per completed hour of focus, capped at 85%
   */
  public getRingColor(elapsedSec: number, baseHue = 210): string {
    const hoursCompleted = Math.floor(elapsedSec / 3600);
    const lightness = Math.min(85, 45 + hoursCompleted * 8);
    return `hsl(${baseHue}, 75%, ${lightness}%)`;
  }

  /**
   * Evaluates current mood tier from streak and timer state
   */
  public getMood(
    streak: number,
    isTimerRunning: boolean,
    now = new Date()
  ): MoodConfig {
    const dayOfWeek = now.getDay(); // 1 = Monday
    const isMonday = dayOfWeek === 1;

    // Fresh Start trigger: If streak is 0 but user just started a timer, instantly flip out of gloomy!
    if (streak === 0 && isTimerRunning) {
      return {
        tier: 'calm',
        title: isMonday ? 'New Week, Clean Slate' : 'Momentum Revived',
        subtitle: isMonday
          ? 'Monday fresh start active. Building a brand new streak.'
          : 'First session in progress. Day 1 streak in reach.',
        badgeLabel: '🌱 Fresh Start',
        bgGradient: 'radial-gradient(ellipse at 50% -20%, rgba(14, 165, 233, 0.15), rgba(11, 15, 25, 0.95))',
        accentColor: '#38bdf8',
        glowColor: 'rgba(56, 189, 248, 0.3)',
        ringHue: 199,
        isFreshStartMonday: isMonday,
      };
    }

    if (streak === 0) {
      return {
        tier: 'gloomy',
        title: isMonday ? 'New Week, Clean Slate' : 'Streak Broken',
        subtitle: isMonday
          ? 'Monday fresh start. Start a timer now to ignite your new streak.'
          : 'Atmosphere is cold. Log a focus session to revive your heat.',
        badgeLabel: '☁️ Gloomy (Cold)',
        bgGradient: 'radial-gradient(ellipse at 50% -20%, rgba(71, 85, 105, 0.18), rgba(9, 13, 22, 0.98))',
        accentColor: '#64748b',
        glowColor: 'rgba(100, 116, 139, 0.18)',
        ringHue: 215,
        isFreshStartMonday: isMonday,
      };
    }

    if (streak <= 2) {
      return {
        tier: 'calm',
        title: 'Calm & Centered',
        subtitle: `${streak} Day Streak. Finding your rhythm.`,
        badgeLabel: '🌊 Calm (1-2d)',
        bgGradient: 'radial-gradient(ellipse at 50% -20%, rgba(56, 189, 248, 0.16), rgba(11, 19, 41, 0.96))',
        accentColor: '#38bdf8',
        glowColor: 'rgba(56, 189, 248, 0.25)',
        ringHue: 199,
        isFreshStartMonday: isMonday,
      };
    }

    if (streak <= 6) {
      return {
        tier: 'warm',
        title: 'Steady Ember',
        subtitle: `${streak} Day Streak. Consistency catching fire.`,
        badgeLabel: '🔥 Warm (3-6d)',
        bgGradient: 'radial-gradient(ellipse at 50% -20%, rgba(245, 158, 11, 0.18), rgba(22, 17, 9, 0.96))',
        accentColor: '#f59e0b',
        glowColor: 'rgba(245, 158, 11, 0.3)',
        ringHue: 38,
        isFreshStartMonday: isMonday,
      };
    }

    if (streak <= 13) {
      return {
        tier: 'bright',
        title: 'High Voltage Focus',
        subtitle: `${streak} Day Streak. Over a full week of unbroken discipline!`,
        badgeLabel: '⚡ Bright (1-2w)',
        bgGradient: 'radial-gradient(ellipse at 50% -20%, rgba(99, 102, 241, 0.22), rgba(13, 16, 43, 0.96))',
        accentColor: '#6366f1',
        glowColor: 'rgba(99, 102, 241, 0.35)',
        ringHue: 239,
        isFreshStartMonday: isMonday,
      };
    }

    if (streak <= 29) {
      return {
        tier: 'vivid',
        title: 'Unstoppable Momentum',
        subtitle: `${streak} Day Streak. Rare flow state mastery.`,
        badgeLabel: '✨ Vivid (2-4w)',
        bgGradient: 'radial-gradient(ellipse at 50% -20%, rgba(192, 132, 252, 0.25), rgba(24, 11, 38, 0.96))',
        accentColor: '#c084fc',
        glowColor: 'rgba(192, 132, 252, 0.4)',
        ringHue: 275,
        isFreshStartMonday: isMonday,
      };
    }

    // 30+ Days Apex Radiant
    return {
      tier: 'radiant',
      title: 'Apex Radiant Sun',
      subtitle: `${streak} Day Streak. Legendary consistency.`,
      badgeLabel: '☀️ Radiant (30d+)',
      bgGradient: 'radial-gradient(ellipse at 50% -20%, rgba(251, 191, 36, 0.3), rgba(31, 20, 6, 0.96))',
      accentColor: '#fbbf24',
      glowColor: 'rgba(251, 191, 36, 0.45)',
      ringHue: 45,
      isFreshStartMonday: isMonday,
    };
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify(): void {
    this.listeners.forEach((l) => l());
  }
}
