import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { StorageService } from './storage';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

export class AuthService {
  private static instance: AuthService | null = null;
  private client: SupabaseClient | null = null;
  private currentUser: User | null = null;
  private storage: StorageService;
  private listeners: Set<(user: User | null) => void> = new Set();

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  constructor(storage: StorageService = StorageService.getInstance()) {
    this.storage = storage;
  }

  public subscribe(callback: (user: User | null) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.currentUser);
    }
  }

  public async initialize(): Promise<void> {
    // 1. Try env vars first
    let url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    let anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

    // 2. Fall back to IndexedDB saved settings if not in env
    if (!url || !anonKey) {
      const savedConfig = await this.storage.getSetting<SupabaseConfig>('supabase_config');
      if (savedConfig?.url && savedConfig?.anonKey) {
        url = savedConfig.url;
        anonKey = savedConfig.anonKey;
      }
    }

    if (url && anonKey) {
      this.initClient(url, anonKey);
    }
  }

  public initClient(url: string, anonKey: string): void {
    try {
      this.client = createClient(url, anonKey);
      this.client.auth.getSession().then(({ data: { session } }) => {
        this.currentUser = session?.user ?? null;
        this.notify();
      });

      this.client.auth.onAuthStateChange((_event, session) => {
        this.currentUser = session?.user ?? null;
        this.notify();
      });
    } catch (e) {
      console.error('Failed to initialize Supabase client:', e);
      this.client = null;
    }
  }

  public async configureSupabase(url: string, anonKey: string): Promise<boolean> {
    try {
      this.initClient(url, anonKey);
      await this.storage.setSetting<SupabaseConfig>('supabase_config', { url, anonKey });
      return true;
    } catch (e) {
      console.error('Error configuring Supabase:', e);
      return false;
    }
  }

  public getClient(): SupabaseClient | null {
    return this.client;
  }

  public getUser(): User | null {
    return this.currentUser;
  }

  public isAuthenticated(): boolean {
    return this.currentUser !== null;
  }

  public isConfigured(): boolean {
    return this.client !== null;
  }

  public async signUp(email: string, password: string): Promise<{ user: User | null; error: string | null }> {
    if (!this.client) {
      return { user: null, error: 'Supabase is not configured yet. Configure URL and Anon Key in Settings.' };
    }

    const { data, error } = await this.client.auth.signUp({ email, password });
    if (error) return { user: null, error: error.message };

    this.currentUser = data.user;
    this.notify();
    return { user: data.user, error: null };
  }

  public async signIn(email: string, password: string): Promise<{ user: User | null; error: string | null }> {
    if (!this.client) {
      return { user: null, error: 'Supabase is not configured yet. Configure URL and Anon Key in Settings.' };
    }

    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) return { user: null, error: error.message };

    this.currentUser = data.user;
    this.notify();
    return { user: data.user, error: null };
  }

  public async signOut(): Promise<{ error: string | null }> {
    if (!this.client) {
      this.currentUser = null;
      this.notify();
      return { error: null };
    }

    const { error } = await this.client.auth.signOut();
    this.currentUser = null;
    this.notify();
    return { error: error ? error.message : null };
  }
}
