import type { SessionDTO } from '../types';

export class Session {
  public readonly id: string;
  public categoryId: string;
  public startTime: string; // ISO 8601
  public endTime: string;   // ISO 8601
  public durationSec: number;
  public note?: string;
  public readonly createdAt: string;
  public updatedAt: string;
  public userId?: string;

  constructor(data: SessionDTO) {
    this.id = data.id || crypto.randomUUID();
    this.categoryId = data.categoryId;
    this.startTime = data.startTime;
    this.endTime = data.endTime;
    this.durationSec = Math.max(0, Math.floor(data.durationSec));
    this.note = data.note ? data.note.trim() : undefined;
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || this.createdAt;
    this.userId = data.userId;
  }

  public toDTO(): SessionDTO {
    return {
      id: this.id,
      categoryId: this.categoryId,
      startTime: this.startTime,
      endTime: this.endTime,
      durationSec: this.durationSec,
      note: this.note,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      userId: this.userId,
    };
  }

  public update(fields: {
    categoryId?: string;
    note?: string;
    durationSec?: number;
    startTime?: string;
    endTime?: string;
  }): void {
    if (fields.categoryId !== undefined) this.categoryId = fields.categoryId;
    if (fields.note !== undefined) this.note = fields.note.trim() || undefined;
    if (fields.durationSec !== undefined) this.durationSec = Math.max(0, Math.floor(fields.durationSec));
    if (fields.startTime !== undefined) this.startTime = fields.startTime;
    if (fields.endTime !== undefined) this.endTime = fields.endTime;
    this.updatedAt = new Date().toISOString();
  }

  public get durationMinutes(): number {
    return Math.floor(this.durationSec / 60);
  }

  public get durationHours(): number {
    return Number((this.durationSec / 3600).toFixed(2));
  }
}
