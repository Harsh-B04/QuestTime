export interface CategoryDTO {
  id: string;
  name: string;
  color: string; // Tailwind hex / color string
  icon: string; // Lucide icon name
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
