import type { CategoryDTO } from '../types';

export class Category {
  public readonly id: string;
  public name: string;
  public color: string;
  public icon: string;
  public ifThenCue?: string;
  public userId?: string;
  public updatedAt: string;

  constructor(data: CategoryDTO) {
    this.id = data.id || crypto.randomUUID();
    this.name = data.name.trim();
    this.color = data.color || '#6366f1';
    this.icon = data.icon || 'Clock';
    this.ifThenCue = data.ifThenCue?.trim() || undefined;
    this.userId = data.userId;
    this.updatedAt = data.updatedAt || new Date().toISOString();
  }

  public toDTO(): CategoryDTO {
    return {
      id: this.id,
      name: this.name,
      color: this.color,
      icon: this.icon,
      ifThenCue: this.ifThenCue,
      userId: this.userId,
      updatedAt: this.updatedAt,
    };
  }

  public update(fields: Partial<Pick<CategoryDTO, 'name' | 'color' | 'icon' | 'ifThenCue'>>): void {
    if (fields.name !== undefined) this.name = fields.name.trim();
    if (fields.color !== undefined) this.color = fields.color;
    if (fields.icon !== undefined) this.icon = fields.icon;
    if (fields.ifThenCue !== undefined) this.ifThenCue = fields.ifThenCue?.trim() || undefined;
    this.updatedAt = new Date().toISOString();
  }

  public static createDefaultCategories(): Category[] {
    const now = new Date().toISOString();
    return [
      new Category({
        id: 'cat-deepwork',
        name: 'Deep Work',
        color: '#6366f1', // Indigo
        icon: 'Brain',
        updatedAt: now,
      }),
      new Category({
        id: 'cat-coding',
        name: 'Coding',
        color: '#06b6d4', // Cyan
        icon: 'Code2',
        updatedAt: now,
      }),
      new Category({
        id: 'cat-learning',
        name: 'Learning',
        color: '#f59e0b', // Amber
        icon: 'BookOpen',
        updatedAt: now,
      }),
      new Category({
        id: 'cat-workout',
        name: 'Health & Workout',
        color: '#10b981', // Emerald
        icon: 'Dumbbell',
        updatedAt: now,
      }),
      new Category({
        id: 'cat-reading',
        name: 'Reading',
        color: '#f43f5e', // Rose
        icon: 'Sparkles',
        updatedAt: now,
      }),
    ];
  }
}
