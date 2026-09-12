import type { GamificationStateDTO, BadgeDTO, CosmeticShopItem } from '../types';
import { StorageService } from './storage';
import { Session } from './session';
import type { SessionLog } from './sessionLog';
import type { TargetTracker } from './targetTracker';

export const COSMETIC_SHOP_ITEMS: CosmeticShopItem[] = [
  {
    id: 'theme-cyber-slate',
    name: 'Cyber Slate',
    description: 'The standard issue dark cybernetic focus aesthetic.',
    costXP: 0,
    accentColor: '#6366f1', // Indigo
    glowColor: 'rgba(99, 102, 241, 0.4)',
  },
  {
    id: 'theme-emerald-matrix',
    name: 'Emerald Matrix',
    description: 'Vibrant digital rain and matrix neon green glow.',
    costXP: 100,
    accentColor: '#10b981', // Emerald
    glowColor: 'rgba(16, 185, 129, 0.4)',
  },
  {
    id: 'theme-solar-flare',
    name: 'Solar Flare',
    description: 'High-energy amber and cosmic sunburst radiance.',
    costXP: 250,
    accentColor: '#f59e0b', // Amber
    glowColor: 'rgba(245, 158, 11, 0.4)',
  },
  {
    id: 'theme-amethyst-mystic',
    name: 'Amethyst Mystic',
    description: 'Deep royal purple with celestial violet resonance.',
    costXP: 500,
    accentColor: '#a855f7', // Purple
    glowColor: 'rgba(168, 85, 247, 0.4)',
  },
  {
    id: 'theme-neon-synthwave',
    name: 'Neon Synthwave',
    description: 'Retrofuturistic hot pink and electric magenta pulses.',
    costXP: 800,
    accentColor: '#ec4899', // Pink
    glowColor: 'rgba(236, 72, 153, 0.4)',
  },
];

export const STATIC_BADGES: Omit<BadgeDTO, 'unlockedAt'>[] = [
  {
    id: 'badge-streak-7',
    title: '7-Day Streak',
    description: 'Log at least one session every day for 7 consecutive days.',
    icon: 'Flame',
  },
  {
    id: 'badge-streak-30',
    title: '30-Day Streak',
    description: 'Log at least one session every day for 30 consecutive days.',
    icon: 'Zap',
  },
  {
    id: 'badge-hours-100',
    title: 'First 100 Hours Logged',
    description: 'Accumulate 100 total hours of logged focus time.',
    icon: 'Clock',
  },
  {
    id: 'badge-target-crusher',
    title: 'Target Crusher',
    description: 'Hit 100% of your weekly targets for 4 weeks in a row.',
    icon: 'Trophy',
  },
  {
    id: 'badge-early-bird',
    title: 'Early Bird',
    description: 'Complete 5 sessions started before 8:00 AM.',
    icon: 'Sunrise',
  },
];

export interface SessionEvaluationResult {
  xpGained: number;
  baseXp: number;
  streakMultiplier: number;
  bonusAwarded: boolean;
  leveledUp: boolean;
  oldLevel: number;
  newLevel: number;
  unlockedBadges: BadgeDTO[];
}

export class GamificationEngine {
  private state: GamificationStateDTO;
  private storage: StorageService;
  private listeners: Set<() => void> = new Set();
  private celebrationListeners: Set<(result: SessionEvaluationResult) => void> = new Set();

  constructor(storage: StorageService = StorageService.getInstance(), userId: string = 'local-user') {
    this.storage = storage;
    this.state = this.createDefaultState(userId);
  }

  private createDefaultState(userId: string): GamificationStateDTO {
    return {
      userId,
      xp: 0,
      level: 0,
      currentStreak: 0,
      longestStreak: 0,
      lastActiveDate: null,
      streakFreezesAvailable: 1,
      lastFreezeWeek: null,
      badges: STATIC_BADGES.map((b) => ({ ...b, unlockedAt: null })),
      unlockedCosmetics: ['theme-cyber-slate'],
      activeCosmetic: 'theme-cyber-slate',
      updatedAt: new Date().toISOString(),
    };
  }

  public subscribe(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  public onCelebration(callback: (result: SessionEvaluationResult) => void): () => void {
    this.celebrationListeners.add(callback);
    return () => this.celebrationListeners.delete(callback);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  public async load(): Promise<void> {
    const saved = await this.storage.getGamificationState(this.state.userId);
    if (saved) {
      // Merge in any new static badges that might not be in saved state
      const existingBadgeIds = new Set(saved.badges.map((b) => b.id));
      const mergedBadges = [...saved.badges];
      for (const sb of STATIC_BADGES) {
        if (!existingBadgeIds.has(sb.id)) {
          mergedBadges.push({ ...sb, unlockedAt: null });
        }
      }
      const unlockedCosmetics = Array.isArray(saved.unlockedCosmetics) && saved.unlockedCosmetics.length > 0
        ? saved.unlockedCosmetics
        : ['theme-cyber-slate'];
      const activeCosmetic = saved.activeCosmetic || 'theme-cyber-slate';

      this.state = {
        ...saved,
        badges: mergedBadges,
        unlockedCosmetics,
        activeCosmetic,
      };
    } else {
      await this.storage.saveGamificationState(this.state);
    }

    this.checkFreezeReplenishment();
    this.notify();
  }

  public async reset(): Promise<void> {
    this.state = this.createDefaultState(this.state.userId);
    await this.storage.saveGamificationState(this.state);
    this.notify();
  }

  public getState(): GamificationStateDTO {
    return {
      ...this.state,
      badges: [...this.state.badges],
      unlockedCosmetics: [...(this.state.unlockedCosmetics || ['theme-cyber-slate'])],
    };
  }

  public getStreakMultiplier(): number {
    return Number((1 + Math.min(1.0, this.state.currentStreak * 0.05)).toFixed(2));
  }

  public getUnlockedCosmetics(): string[] {
    return this.state.unlockedCosmetics || ['theme-cyber-slate'];
  }

  public getActiveCosmetic(): CosmeticShopItem {
    const activeId = this.state.activeCosmetic || 'theme-cyber-slate';
    return COSMETIC_SHOP_ITEMS.find((c) => c.id === activeId) || COSMETIC_SHOP_ITEMS[0];
  }

  public async purchaseCosmetic(itemId: string): Promise<boolean> {
    const item = COSMETIC_SHOP_ITEMS.find((c) => c.id === itemId);
    if (!item) return false;

    const unlocked = new Set(this.state.unlockedCosmetics || ['theme-cyber-slate']);
    if (unlocked.has(itemId)) {
      this.state.activeCosmetic = itemId;
      this.state.updatedAt = new Date().toISOString();
      await this.storage.saveGamificationState(this.state);
      this.notify();
      return true;
    }

    if (this.state.xp < item.costXP) {
      return false;
    }

    this.state.xp -= item.costXP;
    this.state.level = this.calculateLevel(this.state.xp);
    unlocked.add(itemId);
    this.state.unlockedCosmetics = Array.from(unlocked);
    this.state.activeCosmetic = itemId;
    this.state.updatedAt = new Date().toISOString();

    await this.storage.saveGamificationState(this.state);
    this.notify();
    return true;
  }

  public async equipCosmetic(itemId: string): Promise<boolean> {
    const item = COSMETIC_SHOP_ITEMS.find((c) => c.id === itemId);
    if (!item) return false;

    const unlocked = new Set(this.state.unlockedCosmetics || ['theme-cyber-slate']);
    if (!unlocked.has(itemId)) {
      return false;
    }

    this.state.activeCosmetic = itemId;
    this.state.updatedAt = new Date().toISOString();
    await this.storage.saveGamificationState(this.state);
    this.notify();
    return true;
  }

  public calculateLevel(xp: number): number {
    return Math.floor(Math.sqrt(xp / 50));
  }

  public getXPForLevel(lvl: number): number {
    return lvl * lvl * 50;
  }

  public getXPToNextLevel(): { currentLevel: number; currentLevelBaseXP: number; nextLevelXP: number; progressPct: number } {
    const currentLevel = this.calculateLevel(this.state.xp);
    const currentLevelBaseXP = this.getXPForLevel(currentLevel);
    const nextLevelXP = this.getXPForLevel(currentLevel + 1);
    const span = nextLevelXP - currentLevelBaseXP;
    const progress = span > 0 ? ((this.state.xp - currentLevelBaseXP) / span) * 100 : 0;

    return {
      currentLevel,
      currentLevelBaseXP,
      nextLevelXP,
      progressPct: Math.min(100, Math.max(0, Number(progress.toFixed(1)))),
    };
  }

  private getISOWeekString(date: Date = new Date()): string {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return `${d.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
  }

  private checkFreezeReplenishment(): void {
    const currentWeek = this.getISOWeekString();
    if (this.state.lastFreezeWeek !== currentWeek) {
      // New week: ensure 1 streak freeze is available
      this.state.streakFreezesAvailable = 1;
    }
  }

  /**
   * Evaluates gamification rules upon a session save:
   * 1. XP: 1 XP per minute logged * streak multiplier (+5% per streak day up to +100%) + 50 XP bonus when daily category total meets pro-rated weekly target.
   * 2. Streak: +1 if >=1 session on calendar day; resets if skipped unless streak freeze used.
   * 3. Level: floor(sqrt(totalXP / 50)).
   * 4. Badges check.
   */
  public async evaluateSession(
    session: Session,
    sessionLog: SessionLog,
    targetTracker: TargetTracker
  ): Promise<SessionEvaluationResult> {
    const oldLevel = this.state.level;
    let bonusAwarded = false;

    // Rule 1: 1 XP per minute logged, boosted by current streak multiplier
    const minutes = Math.floor(session.durationSec / 60);
    const baseXp = Math.max(0, minutes);
    const streakMultiplier = this.getStreakMultiplier();
    let xpGained = Math.round(baseXp * streakMultiplier);

    // Rule 1 Bonus: +50 XP bonus when daily category total meets pro-rated weekly target
    const target = targetTracker.getTargetForCategory(session.categoryId);
    if (target && target.targetHours > 0) {
      const proRatedDailySeconds = (target.targetHours * 3600) / 7;
      const sessionDate = new Date(session.startTime);
      const totalDailySec = sessionLog.getTotalForDayAndCategory(sessionDate, session.categoryId);
      const prevDailySec = totalDailySec - session.durationSec;

      if (prevDailySec < proRatedDailySeconds && totalDailySec >= proRatedDailySeconds) {
        xpGained += 50;
        bonusAwarded = true;
      }
    }

    this.state.xp += xpGained;
    this.state.level = this.calculateLevel(this.state.xp);
    const leveledUp = this.state.level > oldLevel;

    // Rule 2: Streak calculation
    const sessionDayStr = session.startTime.split('T')[0];
    this.updateStreak(sessionDayStr);

    // Rule 4: Badges check
    const newlyUnlockedBadges = this.checkBadges(sessionLog, targetTracker);

    this.state.updatedAt = new Date().toISOString();
    await this.storage.saveGamificationState(this.state);

    const result: SessionEvaluationResult = {
      xpGained,
      baseXp,
      streakMultiplier,
      bonusAwarded,
      leveledUp,
      oldLevel,
      newLevel: this.state.level,
      unlockedBadges: newlyUnlockedBadges,
    };

    this.notify();
    if (result.leveledUp || result.unlockedBadges.length > 0 || result.bonusAwarded) {
      for (const cb of this.celebrationListeners) {
        cb(result);
      }
    }

    return result;
  }

  private updateStreak(sessionDayStr: string): void {
    this.checkFreezeReplenishment();

    if (!this.state.lastActiveDate) {
      this.state.currentStreak = 1;
      this.state.longestStreak = Math.max(this.state.longestStreak, 1);
      this.state.lastActiveDate = sessionDayStr;
      return;
    }

    if (this.state.lastActiveDate === sessionDayStr) {
      // Already logged today; streak maintains
      return;
    }

    const lastActive = new Date(this.state.lastActiveDate + 'T00:00:00');
    const currentSessionDay = new Date(sessionDayStr + 'T00:00:00');
    const diffDays = Math.round((currentSessionDay.getTime() - lastActive.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      // Consecutive day!
      this.state.currentStreak += 1;
    } else if (diffDays === 2 && this.state.streakFreezesAvailable > 0) {
      // Skipped exactly 1 day and streak freeze available!
      this.state.streakFreezesAvailable -= 1;
      this.state.lastFreezeWeek = this.getISOWeekString();
      this.state.currentStreak += 1; // Preserve streak
    } else if (diffDays > 1) {
      // Streak broken
      this.state.currentStreak = 1;
    }

    this.state.longestStreak = Math.max(this.state.longestStreak, this.state.currentStreak);
    this.state.lastActiveDate = sessionDayStr;
  }

  private checkBadges(sessionLog: SessionLog, targetTracker: TargetTracker): BadgeDTO[] {
    const newlyUnlocked: BadgeDTO[] = [];
    const allSessions = sessionLog.getAll();
    const now = new Date().toISOString();

    for (const badge of this.state.badges) {
      if (badge.unlockedAt) continue;

      let isUnlocked = false;

      switch (badge.id) {
        case 'badge-streak-7':
          if (this.state.currentStreak >= 7 || this.state.longestStreak >= 7) {
            isUnlocked = true;
          }
          break;

        case 'badge-streak-30':
          if (this.state.currentStreak >= 30 || this.state.longestStreak >= 30) {
            isUnlocked = true;
          }
          break;

        case 'badge-hours-100': {
          const totalSec = allSessions.reduce((acc, s) => acc + s.durationSec, 0);
          if (totalSec >= 100 * 3600) {
            isUnlocked = true;
          }
          break;
        }

        case 'badge-early-bird': {
          let earlyCount = 0;
          for (const s of allSessions) {
            const hour = new Date(s.startTime).getHours();
            if (hour < 8) {
              earlyCount += 1;
            }
          }
          if (earlyCount >= 5) {
            isUnlocked = true;
          }
          break;
        }

        case 'badge-target-crusher': {
          // Hit weekly target 4 weeks running
          isUnlocked = this.checkTargetCrusher(sessionLog, targetTracker);
          break;
        }
      }

      if (isUnlocked) {
        badge.unlockedAt = now;
        newlyUnlocked.push({ ...badge });
      }
    }

    return newlyUnlocked;
  }

  private checkTargetCrusher(sessionLog: SessionLog, targetTracker: TargetTracker): boolean {
    const today = new Date();
    // Check 4 consecutive weeks ending last week (or current week)
    let consecutiveWeeksHit = 0;

    for (let i = 0; i < 4; i++) {
      const pastDate = new Date(today);
      pastDate.setDate(today.getDate() - (i * 7));
      const { weekStartDateStr } = sessionLog.getWeekBoundaries(pastDate);
      const progress = targetTracker.getAggregatedProgress(sessionLog, weekStartDateStr);

      if (progress.totalTargetHours > 0 && progress.overallProgressPct >= 100) {
        consecutiveWeeksHit++;
      } else {
        break;
      }
    }

    return consecutiveWeeksHit >= 4;
  }
}
