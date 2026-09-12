import React, { useEffect, useState } from 'react';
import {
  Settings,
  Cloud,
  RefreshCw,
  Plus,
  Trash2,
  Database,
  Download,
  Check,
  LogIn,
  LogOut,
  User,
  Sparkles,
} from 'lucide-react';
import { appCore } from '../../core';
import { Category } from '../../core/category';
import { Session } from '../../core/session';
import type { SyncStatus } from '../../core/sync';
import { CategoryIcon, AVAILABLE_ICONS } from '../components/CategoryIcon';

const PRESET_COLORS = [
  '#6366f1', // Indigo
  '#06b6d4', // Cyan
  '#f59e0b', // Amber
  '#10b981', // Emerald
  '#f43f5e', // Rose
  '#a855f7', // Purple
  '#3b82f6', // Blue
  '#ec4899', // Pink
  '#84cc16', // Lime
  '#14b8a6', // Teal
];

export const SettingsView: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>(appCore.categories);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(appCore.sync.getStatus());
  const [currentUser, setCurrentUser] = useState(appCore.auth.getUser());

  // Supabase config state
  const [supabaseUrl, setSupabaseUrl] = useState<string>('');
  const [supabaseAnonKey, setSupabaseAnonKey] = useState<string>('');
  const [configSuccess, setConfigSuccess] = useState<boolean>(false);

  // Auth form state
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [authLoading, setAuthLoading] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // New Category modal/form
  const [showAddCategory, setShowAddCategory] = useState<boolean>(false);
  const [newCatName, setNewCatName] = useState<string>('');
  const [newCatColor, setNewCatColor] = useState<string>(PRESET_COLORS[0]);
  const [newCatIcon, setNewCatIcon] = useState<string>('Briefcase');

  // Feedback states
  const [demoDataSeeded, setDemoDataSeeded] = useState<boolean>(false);
  const [showResetModal, setShowResetModal] = useState<boolean>(false);
  const [resetDone, setResetDone] = useState<boolean>(false);

  useEffect(() => {
    setCategories([...appCore.categories]);
    setCurrentUser(appCore.auth.getUser());

    // Load initial pending sync count from IndexedDB
    appCore.storage.getSyncQueue().then((queue) => {
      setSyncStatus((prev) => ({ ...prev, pendingCount: queue.length }));
    });

    const unsubSync = appCore.sync.subscribe((status) => {
      setSyncStatus(status);
    });

    const unsubAuth = appCore.auth.subscribe((user) => {
      setCurrentUser(user);
    });

    const unsubCats = appCore.onCategoriesChange(() => {
      setCategories([...appCore.categories]);
    });

    return () => {
      unsubSync();
      unsubAuth();
      unsubCats();
    };
  }, []);

  const handleSaveSupabaseConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabaseUrl.trim() || !supabaseAnonKey.trim()) return;

    const ok = await appCore.auth.configureSupabase(supabaseUrl.trim(), supabaseAnonKey.trim());
    if (ok) {
      setConfigSuccess(true);
      setTimeout(() => setConfigSuccess(false), 3000);
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);

    if (authMode === 'signup') {
      const res = await appCore.auth.signUp(email, password);
      if (res.error) setAuthError(res.error);
    } else {
      const res = await appCore.auth.signIn(email, password);
      if (res.error) setAuthError(res.error);
    }
    setAuthLoading(false);
  };

  const handleSignOut = async () => {
    await appCore.auth.signOut();
  };

  const handleSyncNow = async () => {
    await appCore.sync.syncAll();
  };

  const handleCreateCategory = async () => {
    if (!newCatName.trim()) return;
    const cat = new Category({
      id: `cat-${crypto.randomUUID().slice(0, 8)}`,
      name: newCatName.trim(),
      color: newCatColor,
      icon: newCatIcon,
    });
    await appCore.saveCategory(cat);
    setNewCatName('');
    setShowAddCategory(false);
  };

  const handleDeleteCategory = async (id: string) => {
    await appCore.deleteCategory(id);
  };

  // Seed realistic demo data
  const handleSeedDemoData = async () => {
    const today = new Date();
    const demoSessions = [
      { catId: 'cat-deepwork', mins: 90, note: 'System Architecture & Database Schema' },
      { catId: 'cat-coding', mins: 120, note: 'Implemented TypeScript Core & Gamification' },
      { catId: 'cat-learning', mins: 45, note: 'Vite PWA & Service Workers Guide' },
      { catId: 'cat-workout', mins: 60, note: 'Strength training' },
      { catId: 'cat-reading', mins: 30, note: 'Atomic Habits chapter 4' },
    ];

    for (let i = 0; i < demoSessions.length; i++) {
      const item = demoSessions[i];
      const sessionDate = new Date(today.getTime() - i * 3600000);
      const start = new Date(sessionDate.getTime() - item.mins * 60000).toISOString();
      const end = sessionDate.toISOString();

      const s = new Session({
        id: crypto.randomUUID(),
        categoryId: item.catId,
        startTime: start,
        endTime: end,
        durationSec: item.mins * 60,
        note: item.note,
        createdAt: end,
        updatedAt: end,
      });

      await appCore.sessionLog.add(s);
      await appCore.gamification.evaluateSession(s, appCore.sessionLog, appCore.targetTracker);
    }

    // Set sample weekly targets
    await appCore.targetTracker.setTarget('cat-deepwork', 15);
    await appCore.targetTracker.setTarget('cat-coding', 20);
    await appCore.targetTracker.setTarget('cat-workout', 5);

    setDemoDataSeeded(true);
    setTimeout(() => setDemoDataSeeded(false), 3000);
  };

  // Export data as JSON
  const handleExportJSON = async () => {
    const data = {
      sessions: appCore.sessionLog.getAll().map((s) => s.toDTO()),
      categories: appCore.categories.map((c) => c.toDTO()),
      gamification: appCore.gamification.getState(),
      exportedAt: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `questtime-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export data as CSV
  const handleExportCSV = () => {
    const sessions = appCore.sessionLog.getAll();
    let csv = 'ID,Category,Start Time,End Time,Duration (Minutes),Duration (Hours),Note\n';

    sessions.forEach((s) => {
      const cat = categories.find((c) => c.id === s.categoryId);
      const safeNote = s.note ? `"${s.note.replace(/"/g, '""')}"` : '';
      csv += `${s.id},"${cat?.name || s.categoryId}",${s.startTime},${s.endTime},${s.durationMinutes},${s.durationHours},${safeNote}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `questtime-sessions-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 sm:py-8 space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <Settings className="w-6 h-6 text-indigo-400" />
          <span>Settings & Account</span>
        </h2>
        <p className="text-sm text-slate-400">
          Manage categories, connect Supabase cloud sync, or export your data.
        </p>
      </div>

      {/* Cloud Sync & Supabase Section */}
      <div className="glass-panel rounded-3xl p-6 border-indigo-500/20">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <Cloud className="w-5 h-5 text-indigo-400" />
            <h3 className="text-base font-bold text-white">Supabase Cloud Sync</h3>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                syncStatus.isOnline ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
            />
            <span className="text-xs font-semibold text-slate-300">
              {syncStatus.isOnline ? 'Online' : 'Offline'}
            </span>
          </div>
        </div>

        {/* Sync Status Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800 mb-6 text-xs">
          <div>
            <div className="text-slate-300 font-medium">
              Offline Queue: <span className="font-mono text-indigo-400 font-bold">{syncStatus.pendingCount} pending items</span>
            </div>
            <div className="text-slate-500 mt-0.5">
              {syncStatus.lastSyncedAt
                ? `Last synced: ${new Date(syncStatus.lastSyncedAt).toLocaleTimeString()}`
                : 'Not synced yet'}
            </div>
            {syncStatus.lastError && (
              <div className="text-rose-400 mt-1">{syncStatus.lastError}</div>
            )}
          </div>
          <button
            onClick={handleSyncNow}
            disabled={syncStatus.isSyncing || !syncStatus.isOnline}
            className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium border border-slate-700 disabled:opacity-50 transition active:scale-95"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncStatus.isSyncing ? 'animate-spin' : ''}`} />
            <span>{syncStatus.isSyncing ? 'Syncing...' : 'Sync Now'}</span>
          </button>
        </div>

        {/* Supabase Connection Setup */}
        {!appCore.auth.isConfigured() ? (
          <form onSubmit={handleSaveSupabaseConfig} className="space-y-4 mb-6">
            <p className="text-xs text-slate-400">
              Enter your Supabase project credentials to enable multi-device synchronization across Android and Windows.
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">
                Supabase Project URL
              </label>
              <input
                type="text"
                placeholder="https://xyzcompany.supabase.co"
                value={supabaseUrl}
                onChange={(e) => setSupabaseUrl(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">
                Supabase Anon Public Key
              </label>
              <input
                type="password"
                placeholder="eyJhbGciOi..."
                value={supabaseAnonKey}
                onChange={(e) => setSupabaseAnonKey(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs font-mono"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md transition"
            >
              Connect Supabase
            </button>
            {configSuccess && (
              <span className="text-xs text-emerald-400 ml-2 font-medium">
                Connected successfully!
              </span>
            )}
          </form>
        ) : (
          <div className="mb-6">
            {currentUser ? (
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/30">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                    <User className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white">{currentUser.email}</div>
                    <div className="text-xs text-slate-400">Signed in & syncing</div>
                  </div>
                </div>
                <button
                  onClick={handleSignOut}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-slate-300">
                    {authMode === 'signin' ? 'Sign in to Supabase Account' : 'Create Supabase Account'}
                  </span>
                  <button
                    onClick={() => setAuthMode(authMode === 'signin' ? 'signup' : 'signin')}
                    className="text-xs text-indigo-400 hover:underline"
                  >
                    {authMode === 'signin' ? 'Need an account? Sign up' : 'Already have an account? Sign in'}
                  </button>
                </div>
                <form onSubmit={handleAuthSubmit} className="space-y-3">
                  <input
                    type="email"
                    required
                    placeholder="Email address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs"
                  />
                  <input
                    type="password"
                    required
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs"
                  />
                  {authError && (
                    <p className="text-xs text-rose-400">{authError}</p>
                  )}
                  <button
                    type="submit"
                    disabled={authLoading}
                    className="flex items-center justify-center gap-2 w-full py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow transition"
                  >
                    <LogIn className="w-4 h-4" />
                    <span>{authMode === 'signin' ? 'Sign In' : 'Create Account'}</span>
                  </button>
                </form>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Category Manager */}
      <div className="glass-panel rounded-3xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-white">Categories</h3>
          <button
            onClick={() => setShowAddCategory(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Category</span>
          </button>
        </div>

        <div className="space-y-2">
          {categories.map((cat) => (
            <div
              key={cat.id}
              className="flex items-center justify-between p-3 rounded-2xl bg-slate-900/60 border border-slate-800/80"
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-white"
                  style={{ backgroundColor: cat.color }}
                >
                  <CategoryIcon name={cat.icon} className="w-4 h-4" />
                </div>
                <span className="text-sm font-semibold text-white">{cat.name}</span>
              </div>
              {categories.length > 1 && (
                <button
                  onClick={() => handleDeleteCategory(cat.id)}
                  className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition"
                  title="Delete category"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Add Category Form Modal */}
        {showAddCategory && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
            <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4">
              <h4 className="text-base font-bold text-white">Create New Category</h4>
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">
                  Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Design, Meditation"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm"
                />
              </div>

              {/* Color picker */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase mb-1.5">
                  Color
                </label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewCatColor(c)}
                      className={`w-7 h-7 rounded-full transition-transform ${
                        newCatColor === c ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-slate-900' : ''
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              {/* Icon selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase mb-1.5">
                  Icon
                </label>
                <div className="grid grid-cols-6 gap-2 max-h-32 overflow-y-auto p-1 bg-slate-800/60 rounded-xl">
                  {AVAILABLE_ICONS.map((iconName) => (
                    <button
                      key={iconName}
                      type="button"
                      onClick={() => setNewCatIcon(iconName)}
                      className={`p-2 rounded-lg flex items-center justify-center transition ${
                        newCatIcon === iconName
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-400 hover:text-white hover:bg-slate-700'
                      }`}
                    >
                      <CategoryIcon name={iconName} className="w-4 h-4" />
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddCategory(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateCategory}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Data Tools */}
      <div className="glass-panel rounded-3xl p-6">
        <h3 className="text-base font-bold text-white mb-3 flex items-center gap-2">
          <Database className="w-4 h-4 text-indigo-400" />
          <span>Data Management & Tools</span>
        </h3>
        <p className="text-xs text-slate-400 mb-4">
          Export your sessions or seed demo data to immediately test all features.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            onClick={handleExportCSV}
            className="flex items-center justify-center gap-2 p-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition"
          >
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={handleExportJSON}
            className="flex items-center justify-center gap-2 p-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition"
          >
            <Download className="w-4 h-4" />
            <span>Export JSON</span>
          </button>
          <button
            onClick={handleSeedDemoData}
            className="flex items-center justify-center gap-2 p-3 rounded-2xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 text-xs font-semibold border border-indigo-500/30 transition"
          >
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <span>Seed Demo Data</span>
          </button>
        </div>

        {/* Danger Zone: Reset All Data */}
        <div className="mt-6 pt-5 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-rose-400">Reset to Clean Slate</h4>
            <p className="text-xs text-slate-500">
              Permanently wipe all logged sessions, targets, XP, and streaks to start fresh.
            </p>
          </div>
          <button
            onClick={() => setShowResetModal(true)}
            className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 text-xs font-semibold border border-rose-500/30 transition active:scale-95"
          >
            <Trash2 className="w-4 h-4" />
            <span>Wipe All Data</span>
          </button>
        </div>

        {demoDataSeeded && (
          <div className="mt-3 text-xs text-emerald-400 flex items-center gap-1.5">
            <Check className="w-4 h-4" />
            <span>Demo sessions and targets seeded successfully! Check Timer, History, Targets, and Progress tabs.</span>
          </div>
        )}

        {resetDone && (
          <div className="mt-3 text-xs text-emerald-400 flex items-center gap-1.5">
            <Check className="w-4 h-4" />
            <span>All data wiped! App is now at a completely clean slate ready for real tracking.</span>
          </div>
        )}

        {/* Reset Confirmation Modal */}
        {showResetModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4">
              <h3 className="text-lg font-bold text-white">Reset to Clean Slate?</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                This will delete all sessions, targets, streaks, and XP from your local storage and reset categories to defaults. This action cannot be undone.
              </p>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowResetModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    await appCore.resetToCleanSlate();
                    setShowResetModal(false);
                    setResetDone(true);
                    setTimeout(() => setResetDone(false), 4000);
                  }}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow"
                >
                  Yes, Wipe Everything
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
