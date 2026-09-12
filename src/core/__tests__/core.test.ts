import { Session } from '../session';
import { WeeklyTarget } from '../weeklyTarget';
import { GamificationEngine } from '../gamification';
import { TargetTracker } from '../targetTracker';
import { SessionLog } from '../sessionLog';
import { Category } from '../category';
import type { StorageService } from '../storage';
import type { CategoryDTO, SessionDTO, WeeklyTargetDTO, GamificationStateDTO, SyncQueueItem } from '../../types';

// In-memory mock storage for testing
class MockStorageService implements Partial<StorageService> {
  private categories: CategoryDTO[] = [];
  private sessions: SessionDTO[] = [];
  private targets: WeeklyTargetDTO[] = [];
  private gamificationState: Map<string, GamificationStateDTO> = new Map();
  private settings: Map<string, any> = new Map();

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

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

runTests().catch((e) => {
  console.error(e);
  process.exit(1);
});
