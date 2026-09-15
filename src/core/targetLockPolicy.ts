import { StorageService } from './storage';

export interface TargetLockState {
  weekStartDate: string;
  mondayEditUsed: boolean;
  emergencyEditUsed: boolean;
  emergencyUnlockedForSession: boolean;
  simulatedLocked?: boolean; // For demonstration & testing on Mondays
}

export interface TargetEditLogEntry {
  id: string;
  editedAt: string;
  reason: 'monday' | 'emergency';
  note?: string;
}

export class TargetLockPolicy {
  private static instance: TargetLockPolicy | null = null;
  private storage: StorageService;
  private state: TargetLockState;
  private listeners: Array<() => void> = [];

  private constructor(storage = StorageService.getInstance()) {
    this.storage = storage;
    this.state = {
      weekStartDate: this.getCurrentWeekMonday(new Date()),
      mondayEditUsed: false,
      emergencyEditUsed: false,
      emergencyUnlockedForSession: false,
      simulatedLocked: false,
    };
  }

  public static getInstance(storage = StorageService.getInstance()): TargetLockPolicy {
    if (!TargetLockPolicy.instance) {
      TargetLockPolicy.instance = new TargetLockPolicy(storage);
    }
    return TargetLockPolicy.instance;
  }

  public getCurrentWeekMonday(d: Date): string {
    const date = new Date(d);
    const day = date.getDay(); // 0 is Sunday, 1 is Monday...
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(date.setDate(diff));
    return monday.toISOString().split('T')[0];
  }

  public async load(): Promise<void> {
    const currentMonday = this.getCurrentWeekMonday(new Date());
    const saved = await this.storage.getSetting<TargetLockState>('target_lock_state');
    if (saved && saved.weekStartDate === currentMonday) {
      this.state = {
        ...saved,
        emergencyUnlockedForSession: false, // Reset session-only unlock on reload
      };
    } else {
      // New week roll-over
      this.state = {
        weekStartDate: currentMonday,
        mondayEditUsed: false,
        emergencyEditUsed: false,
        emergencyUnlockedForSession: false,
        simulatedLocked: false,
      };
      await this.save();
    }
    this.notify();
  }

  private async save(): Promise<void> {
    await this.storage.setSetting('target_lock_state', this.state);
    this.notify();
  }

  public getState(): TargetLockState {
    return { ...this.state };
  }

  public getNextWindowLabel(now = new Date()): string {
    const day = now.getDay(); // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
    if (day === 1 && !this.state.simulatedLocked) {
      return 'Monday Planning Window Open';
    }
    const daysUntilMonday = day === 0 ? 1 : 8 - day;
    return `Next full edit window: Monday (in ${daysUntilMonday} day${daysUntilMonday > 1 ? 's' : ''})`;
  }

  public canEdit(now = new Date()): {
    allowed: boolean;
    reason: 'monday' | 'emergency' | 'locked';
    nextWindowLabel: string;
    emergencyUsed: boolean;
  } {
    const day = now.getDay();
    const isMonday = day === 1 && !this.state.simulatedLocked;

    if (this.state.emergencyUnlockedForSession) {
      return {
        allowed: true,
        reason: 'emergency',
        nextWindowLabel: 'Emergency Edit Active (Session)',
        emergencyUsed: true,
      };
    }

    if (isMonday) {
      return {
        allowed: true,
        reason: 'monday',
        nextWindowLabel: 'Monday Planning Window Open',
        emergencyUsed: this.state.emergencyEditUsed,
      };
    }

    // Tue–Sun (or simulated locked)
    return {
      allowed: false,
      reason: 'locked',
      nextWindowLabel: this.getNextWindowLabel(now),
      emergencyUsed: this.state.emergencyEditUsed,
    };
  }

  public async unlockEmergency(note: string): Promise<void> {
    if (this.state.emergencyEditUsed && !this.state.simulatedLocked) {
      throw new Error('Emergency edit already used for this week.');
    }

    this.state.emergencyEditUsed = true;
    this.state.emergencyUnlockedForSession = true;

    // Log the edit
    const entry: TargetEditLogEntry = {
      id: crypto.randomUUID(),
      editedAt: new Date().toISOString(),
      reason: 'emergency',
      note: note.trim(),
    };

    const logs = (await this.storage.getSetting<TargetEditLogEntry[]>('target_edit_log')) || [];
    logs.push(entry);
    await this.storage.setSetting('target_edit_log', logs);

    await this.save();
  }

  public async setSimulatedLocked(locked: boolean): Promise<void> {
    this.state.simulatedLocked = locked;
    if (locked) {
      this.state.emergencyUnlockedForSession = false;
    }
    await this.save();
  }

  public async getEditLogs(): Promise<TargetEditLogEntry[]> {
    return (await this.storage.getSetting<TargetEditLogEntry[]>('target_edit_log')) || [];
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
