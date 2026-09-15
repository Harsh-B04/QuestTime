import { Session } from '../session';
import { GamificationEngine } from '../gamification';
import { TargetTracker } from '../targetTracker';
import { SessionLog } from '../sessionLog';
import { Timer } from '../timer';
import type { StorageService, TimerActiveData } from '../storage';
import type { CategoryDTO, SessionDTO, WeeklyTargetDTO, GamificationStateDTO, SyncQueueItem } from '../../types';

// In-memory mock storage for testing
class MockStorageService implements Partial<StorageService> {
  private categories: CategoryDTO[] = [];
  private sessions: SessionDTO[] = [];
  private targets: WeeklyTargetDTO[] = [];
  private gamificationState: Map<string, GamificationStateDTO> = new Map();
  private settings: Map<string, any> = new Map();
  private activeTimer: TimerActiveData | null = null;

  async getActiveTimer(): Promise<TimerActiveData | null> {
    return this.activeTimer ? { ...this.activeTimer } : null;
  }
  async saveActiveTimer(data: TimerActiveData): Promise<void> {
    this.activeTimer = { ...data };
  }
  async clearActiveTimer(): Promise<void> {
    this.activeTimer = null;
  }

  async getCategories() { return [...this.categories]; }
  async saveCategory(cat: CategoryDTO) {
    const idx = this.categories.findIndex(c => c.id === cat.id);
    if (idx >= 0) this.categories[idx] = cat; else this.categories.push(cat);
  }
  async saveCategories(cats: CategoryDTO[]) {
    for (const c of cats) await this.saveCategory(c);
  }
  async deleteCategory(id: string) {
    this.categories = this.categories.filter(c => c.id !== id);
  }

  async getSessions() { return [...this.sessions]; }
  async saveSession(s: SessionDTO) {
    const idx = this.sessions.findIndex(x => x.id === s.id);
    if (idx >= 0) this.sessions[idx] = s; else this.sessions.push(s);
  }
  async deleteSession(id: string) {
    this.sessions = this.sessions.filter(s => s.id !== id);
  }

  async getTargets() { return [...this.targets]; }
  async saveTarget(t: WeeklyTargetDTO) {
    const idx = this.targets.findIndex(x => x.id === t.id);
    if (idx >= 0) this.targets[idx] = t; else this.targets.push(t);
  }
  async deleteTarget(id: string) {
    this.targets = this.targets.filter(t => t.id !== id);
  }

  async getGamificationState(userId: string) {
    return this.gamificationState.get(userId) || null;
  }
  async saveGamificationState(state: GamificationStateDTO) {
    this.gamificationState.set(state.userId, { ...state });
  }

  async enqueueSync(_item: SyncQueueItem) {}
  async getSyncQueue() { return []; }
  async removeSyncQueueItem(_id: string) {}
  async clearSyncQueue() {}

  async getSetting<T>(key: string): Promise<T | null> {
    return this.settings.get(key) ?? null;
  }
  async setSetting<T>(key: string, value: T): Promise<void> {
    this.settings.set(key, value);
  }
  async removeSetting(key: string): Promise<void> {
    this.settings.delete(key);
  }
}

async function runTests() {
  console.log('--- Running Core Business Logic Tests ---');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`  ✓ ${msg}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${msg}`);
      failed++;
    }
  }

  const mockStorage = new MockStorageService() as unknown as StorageService;

  // 1. Test Session
  const session1 = new Session({
    id: 's1',
    categoryId: 'cat-coding',
    startTime: '2026-09-10T09:00:00.000Z',
    endTime: '2026-09-10T10:00:00.000Z',
    durationSec: 3600,
    note: 'Building core',
    createdAt: '2026-09-10T10:00:00.000Z',
    updatedAt: '2026-09-10T10:00:00.000Z',
  });
  assert(session1.durationMinutes === 60, 'Session calculates 60 minutes');
  assert(session1.durationHours === 1, 'Session calculates 1 hour');

  // 2. Test SessionLog
  const sessionLog = new SessionLog(mockStorage);
  await sessionLog.add(session1);
  assert(sessionLog.getAll().length === 1, 'SessionLog holds 1 session');
  assert(sessionLog.getTotalForDay(new Date('2026-09-10T12:00:00.000Z')) === 3600, 'SessionLog getTotalForDay is 3600s');

  // 3. Test WeeklyTarget & TargetTracker
  const targetTracker = new TargetTracker(mockStorage);
  const target = await targetTracker.setTarget('cat-coding', 10, '2026-09-07');
  assert(target.targetHours === 10, 'Target hours set to 10');
  assert(target.getLoggedHours(sessionLog) === 1, 'Logged hours is 1');
  assert(target.getProgressPct(sessionLog) === 10, 'Progress percentage is 10%');

  // 4. Test GamificationEngine Rules
  const gameEngine = new GamificationEngine(mockStorage, 'test-user');
  await gameEngine.load();

  // Test XP: 1 XP per minute logged
  // 60 minutes = 60 XP.
  const evalResult1 = await gameEngine.evaluateSession(session1, sessionLog, targetTracker);
  assert(evalResult1.xpGained === 60, 'Awarded 60 XP for 60 minutes');
  assert(gameEngine.getState().xp === 60, 'Total XP is 60');

  // Test Level: floor(sqrt(totalXP / 50))
  // sqrt(60 / 50) = sqrt(1.2) = 1.09 -> floor = 1
  assert(gameEngine.getState().level === 1, 'User is Level 1 at 60 XP');

  // Test Streak logic
  assert(gameEngine.getState().currentStreak === 1, 'Current streak is 1 on first session');

  // Test Streak increment on consecutive day
  const session2 = new Session({
    id: 's2',
    categoryId: 'cat-coding',
    startTime: '2026-09-11T10:00:00.000Z',
    endTime: '2026-09-11T10:30:00.000Z',
    durationSec: 1800,
    createdAt: '2026-09-11T10:30:00.000Z',
    updatedAt: '2026-09-11T10:30:00.000Z',
  });
  await sessionLog.add(session2);
  await gameEngine.evaluateSession(session2, sessionLog, targetTracker);
  assert(gameEngine.getState().currentStreak === 2, 'Current streak incremented to 2 on consecutive day');

  // Test Streak Freeze: skip 1 day (from Sept 11 to Sept 13)
  const session3 = new Session({
    id: 's3',
    categoryId: 'cat-coding',
    startTime: '2026-09-13T10:00:00.000Z',
    endTime: '2026-09-13T10:30:00.000Z',
    durationSec: 1800,
    createdAt: '2026-09-13T10:30:00.000Z',
    updatedAt: '2026-09-13T10:30:00.000Z',
  });
  await sessionLog.add(session3);
  await gameEngine.evaluateSession(session3, sessionLog, targetTracker);
  assert(gameEngine.getState().currentStreak === 3, 'Streak freeze preserved streak to 3 after 1 skipped day');
  assert(gameEngine.getState().streakFreezesAvailable === 0, 'Streak freeze consumed');

  // Test Early Bird badge (5 sessions started before 8am local time)
  for (let i = 1; i <= 5; i++) {
    const d = new Date(2026, 8, 14 + i, 6, 30, 0);
    const earlySession = new Session({
      id: `early-${i}`,
      categoryId: 'cat-coding',
      startTime: d.toISOString(),
      endTime: new Date(d.getTime() + 1800000).toISOString(),
      durationSec: 1800,
      createdAt: d.toISOString(),
      updatedAt: d.toISOString(),
    });
    await sessionLog.add(earlySession);
    await gameEngine.evaluateSession(earlySession, sessionLog, targetTracker);
  }

  const earlyBirdBadge = gameEngine.getState().badges.find(b => b.id === 'badge-early-bird');
  assert(earlyBirdBadge?.unlockedAt !== null, 'Early Bird badge unlocked after 5 morning sessions');

  // 5. Test Timer Persistence
  const timer1 = new Timer(mockStorage);
  timer1.start('cat-coding', 'Deep focus');
  assert(timer1.getStatus() === 'running', 'Timer 1 started and running');
  assert(timer1.getCategoryId() === 'cat-coding', 'Timer 1 category is cat-coding');

  // Verify that active timer was persisted to storage
  const persistedActive = await mockStorage.getActiveTimer();
  assert(persistedActive !== null, 'Timer persisted active state to storage');
  assert(persistedActive?.categoryId === 'cat-coding', 'Persisted timer category matches');
  assert(persistedActive?.status === 'running', 'Persisted timer status is running');
  assert(typeof persistedActive?.startTimestamp === 'number', 'Persisted timer has startTimestamp');
  timer1.discard();
  // Restore the persisted timer in mockStorage that timer1.discard() cleared
  await mockStorage.saveActiveTimer(persistedActive!);

  // Create a brand new Timer instance (simulating page reload) and restore
  const timer2 = new Timer(mockStorage);
  const restored = await timer2.restoreFromStorage();
  assert(restored === true, 'Timer 2 successfully restored from storage');
  assert(timer2.getStatus() === 'running', 'Restored Timer 2 has status running');
  assert(timer2.getCategoryId() === 'cat-coding', 'Restored Timer 2 category is cat-coding');
  assert(timer2.getNote() === 'Deep focus', 'Restored Timer 2 note is preserved');

  // Stop restored timer and verify session is properly returned
  const savedSession = timer2.stop();
  assert(savedSession !== null, 'Restored Timer 2 produced valid Session on stop');
  assert(savedSession?.categoryId === 'cat-coding', 'Produced session categoryId matches');
  assert(timer2.getStatus() === 'idle', 'Timer 2 reset to idle after stop');
  const clearedActive = await mockStorage.getActiveTimer();
  assert(clearedActive === null, 'Active timer cleared from storage upon stop');

  // 6. Test Daily Quest Targets (Phase 6)
  const dailyTarget = await targetTracker.setDailyTarget('cat-daily-quest', 2, '2026-09-07');
  assert(dailyTarget.dailyTargetHours === 2, 'Daily target set to 2 hours');

  // Add session for today
  const today = new Date();
  const todaySession = new Session({
    id: 's-today',
    categoryId: 'cat-daily-quest',
    startTime: new Date(today.getTime() - 3600000).toISOString(),
    endTime: today.toISOString(),
    durationSec: 3600, // 1 hour
    createdAt: today.toISOString(),
    updatedAt: today.toISOString(),
  });
  await sessionLog.add(todaySession);

  assert(dailyTarget.getLoggedHoursToday(sessionLog) === 1, 'Logged 1 hour today against daily target');
  assert(dailyTarget.getDailyProgressPct(sessionLog) === 50, 'Daily target progress is 50% (1h / 2h)');
  assert(dailyTarget.isDailyTargetMet(sessionLog) === false, 'Daily target is not yet met at 50%');
  assert(dailyTarget.getRemainingDailyHours(sessionLog) === 1, '1 hour remaining for daily target');

  // Add another 1 hour session today to complete daily quest
  const todaySession2 = new Session({
    id: 's-today-2',
    categoryId: 'cat-daily-quest',
    startTime: new Date(today.getTime() - 7200000).toISOString(),
    endTime: new Date(today.getTime() - 3600000).toISOString(),
    durationSec: 3600, // 1 hour
    createdAt: today.toISOString(),
    updatedAt: today.toISOString(),
  });
  await sessionLog.add(todaySession2);

  assert(dailyTarget.getLoggedHoursToday(sessionLog) === 2, 'Logged 2 hours today against daily target');
  assert(dailyTarget.getDailyProgressPct(sessionLog) === 100, 'Daily target progress is 100%');
  assert(dailyTarget.isDailyTargetMet(sessionLog) === true, 'Daily target is now met');
  assert(dailyTarget.getRemainingDailyHours(sessionLog) === 0, '0 hours remaining for daily target');

  // Test Non-Daily Target Feature
  const nonDailyTarget = await targetTracker.setIsDaily('cat-workout', false, '2026-09-07');
  await targetTracker.setTarget('cat-workout', 5, '2026-09-07', 1, false);
  assert(nonDailyTarget.isDaily === false, 'Target correctly marked as non-daily');
  assert(nonDailyTarget.isOnTrack(sessionLog) === true, 'Non-daily target has flexible on-track pacing');
  assert(nonDailyTarget.getDailyProgressPct(sessionLog) === 0, 'Non-daily target does not calculate daily quest pct');
  assert(nonDailyTarget.isDailyTargetMet(sessionLog) === false, 'Non-daily target isDailyTargetMet returns false');

  // Switch back to daily
  await targetTracker.setIsDaily('cat-workout', true, '2026-09-07');
  const switchedDaily = targetTracker.getTargetForCategory('cat-workout', '2026-09-07');
  assert(switchedDaily?.isDaily === true, 'Target successfully toggled back to daily');

  // Test Day-Specific Target Schedule Feature (e.g. Sunday 4h, Weekdays 1.5h, Saturday 0h)
  const scheduledTarget = await targetTracker.setDaySchedule('cat-deepwork', {
    1: 1.5, // Mon
    2: 1.5, // Tue
    3: 1.5, // Wed
    4: 1.5, // Thu
    5: 1.5, // Fri
    6: 0,   // Sat (Rest day)
    7: 4.0, // Sun (Deep work day)
  }, '2026-09-07');

  assert(scheduledTarget.dailySchedule !== undefined, 'Target has custom dailySchedule');
  assert(scheduledTarget.getScheduledWeeklyHours() === 11.5, 'Scheduled weekly hours sum to 11.5h');

  // Mock Sunday: 2026-09-13 (Sunday)
  const mockSunday = new Date('2026-09-13T10:00:00');
  assert(scheduledTarget.getTargetHoursForDate(mockSunday) === 4.0, 'Sunday target resolves to 4.0 hours');

  // Mock Monday: 2026-09-07 (Monday)
  const mockMonday = new Date('2026-09-07T10:00:00');
  assert(scheduledTarget.getTargetHoursForDate(mockMonday) === 1.5, 'Monday target resolves to 1.5 hours');

  // Mock Saturday: 2026-09-12 (Saturday rest day)
  const mockSaturday = new Date('2026-09-12T10:00:00');
  assert(scheduledTarget.getTargetHoursForDate(mockSaturday) === 0, 'Saturday rest day target resolves to 0 hours');

  // Test updating a single day target
  await targetTracker.setDayTarget('cat-deepwork', 7, 5.0, '2026-09-07');
  assert(scheduledTarget.getTargetHoursForDate(mockSunday) === 5.0, 'Sunday target updated to 5.0 hours');
  assert(scheduledTarget.getScheduledWeeklyHours() === 12.5, 'Scheduled weekly hours updated to 12.5h');

  // 7. Test Phase 7: Streak Multiplier
  const currentStreak = gameEngine.getState().currentStreak;
  const expectedMult = Number((1 + Math.min(1.0, currentStreak * 0.05)).toFixed(2));
  const mult = gameEngine.getStreakMultiplier();
  assert(mult === expectedMult, `Streak multiplier is ${expectedMult}x for ${currentStreak}-day streak (got ${mult})`);

  // 8. Test Phase 7: Cosmetic Badge Shop
  const initialUnlocked = gameEngine.getUnlockedCosmetics();
  assert(initialUnlocked.includes('theme-cyber-slate'), 'Default theme-cyber-slate unlocked');
  assert(gameEngine.getActiveCosmetic().id === 'theme-cyber-slate', 'Active theme is cyber-slate');

  // Attempt to buy high-cost theme when XP is insufficient (theme-neon-synthwave costs 800 XP)
  const currentXP = gameEngine.getState().xp;
  const cannotAfford = await gameEngine.purchaseCosmetic('theme-neon-synthwave');
  if (currentXP < 800) {
    assert(cannotAfford === false, 'Cannot purchase expensive theme without enough XP');
  }

  // Buy affordable theme (Emerald Matrix costs 100 XP) if user has enough XP
  // Give test state enough XP to test purchasing
  const preBuyXP = gameEngine.getState().xp;
  if (preBuyXP >= 100) {
    const bought = await gameEngine.purchaseCosmetic('theme-emerald-matrix');
    assert(bought === true, 'Successfully bought theme-emerald-matrix');
    assert(gameEngine.getUnlockedCosmetics().includes('theme-emerald-matrix'), 'Emerald matrix is in unlocked list');
    assert(gameEngine.getActiveCosmetic().id === 'theme-emerald-matrix', 'Emerald matrix is now active');
    assert(gameEngine.getState().xp === preBuyXP - 100, '100 XP deducted for purchase');

    // Equip default theme back
    const equippedDefault = await gameEngine.equipCosmetic('theme-cyber-slate');
    assert(equippedDefault === true, 'Equipped default theme back');
    assert(gameEngine.getActiveCosmetic().id === 'theme-cyber-slate', 'Default theme is active again');
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

runTests().catch((e) => {
  console.error(e);
  process.exit(1);
});
