export interface CategoryDTO {
  id: string;
  name: string;
  color: string; // Tailwind hex / color string
  icon: string; // Lucide icon name
  ifThenCue?: string; // e.g. "When I sit at my desk with coffee, I will start Coding"
  userId?: string;
  updatedAt?: string;
}

export interface SessionDTO {
  id: string;
  categoryId: string;
  startTime: string; // ISO 8601
  endTime: string; // ISO 8601
  durationSec: number;
  note?: string;
  createdAt: string;
  updatedAt: string;
  userId?: string;
}

export interface WeeklyTargetDTO {
  id: string;
  categoryId: string;
  targetHours: number;
  dailyTargetHours?: number;
  isDaily?: boolean; // false if target/event is not daily (defaults to true)
  targetDays?: number[]; // optional active days: 1=Mon ... 7=Sun
  dailySchedule?: Record<number, number>; // 1=Mon: 1.5, ..., 7=Sun: 4.0
  autoSyncWeekly?: boolean; // automatically keep weekly target equal to sum of schedule
  weekStartDate: string; // YYYY-MM-DD representing Monday of that week
  userId?: string;
  updatedAt?: string;
}

export interface BadgeDTO {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlockedAt: string | null;
}

export interface CosmeticShopItem {
  id: string;
  name: string;
  description: string;
  costXP: number;
  accentColor: string;
  glowColor: string;
  tier?: 'MYTHIC' | 'LEGENDARY' | 'EPIC' | 'RARE' | 'DEFAULT';
  perks?: string[];
  lore?: string;
  gradient?: string;
}

export interface GamificationStateDTO {
  userId: string;
  xp: number;
  level: number;
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string | null; // YYYY-MM-DD
  streakFreezesAvailable: number;
  lastFreezeWeek: string | null; // YYYY-WW
  badges: BadgeDTO[];
  unlockedCosmetics?: string[];
  activeCosmetic?: string;
  updatedAt: string;
}

export type TimerStatus = 'idle' | 'running' | 'paused';

export interface SyncQueueItem {
  id: string;
  table: 'categories' | 'sessions' | 'weekly_targets' | 'gamification_state';
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  payload: any;
  timestamp: string;
}

