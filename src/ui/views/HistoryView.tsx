import React, { useEffect, useState, useRef } from 'react';
import { Calendar, Clock, Edit2, Trash2, Search, Filter, Plus, Save, X, List, RotateCcw } from 'lucide-react';
import { appCore } from '../../core';
import { Session, type Category } from '../../core';
import { CategoryIcon } from '../components/CategoryIcon';
import { CalendarView } from '../components/CalendarView';

export const HistoryView: React.FC = () => {
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [categories, setCategories] = useState<Category[]>(appCore.categories);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [editingSession, setEditingSession] = useState<Session | null>(null);
  const [editNote, setEditNote] = useState<string>('');
  const [editDurationMin, setEditDurationMin] = useState<number>(0);
  const [editCategoryId, setEditCategoryId] = useState<string>('');
  const [showDeleteModalId, setShowDeleteModalId] = useState<string | null>(null);
  const [showManualAdd, setShowManualAdd] = useState<boolean>(false);
  const [manualDurationMin, setManualDurationMin] = useState<number>(30);
  const [manualCategoryId, setManualCategoryId] = useState<string>(appCore.categories[0]?.id || '');
  const [manualNote, setManualNote] = useState<string>('');

  // 5-second Undo Delete state
  const [undoSession, setUndoSession] = useState<Session | null>(null);
  const undoSessionRef = useRef<Session | null>(null);
  const [undoSecondsLeft, setUndoSecondsLeft] = useState<number>(5);
  const undoTimeoutRef = useRef<number | null>(null);
  const undoIntervalRef = useRef<number | null>(null);

  const loadData = () => {
    setSessions(appCore.sessionLog.getAll());
    setCategories([...appCore.categories]);
  };

  useEffect(() => {
    loadData();
    const unsubLog = appCore.sessionLog.subscribe(loadData);
    const unsubCats = appCore.onCategoriesChange(loadData);
    return () => {
      unsubLog();
      unsubCats();
      if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
      if (undoIntervalRef.current) clearInterval(undoIntervalRef.current);
      if (undoSessionRef.current) {
        const delId = undoSessionRef.current.id;
        undoSessionRef.current = null;
        appCore.sessionLog.delete(delId);
        appCore.sync.queueChange('sessions', 'DELETE', { id: delId });
      }
    };
  }, []);

  const formatDuration = (sec: number) => {
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    if (hrs > 0) {
      return `${hrs}h ${mins > 0 ? `${mins}m` : ''}`;
    }
    return `${mins}m ${sec % 60 > 0 ? `${sec % 60}s` : ''}`;
  };

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const getDayHeading = (dateStr: string) => {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    if (dateStr === today) return 'Today';
    if (dateStr === yesterday) return 'Yesterday';

    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
  };

  // Filter sessions (excluding the session currently staged for deletion)
  const filteredSessions = sessions.filter((s) => {
    if (undoSession && s.id === undoSession.id) {
      return false;
    }
    if (selectedCategoryFilter !== 'all' && s.categoryId !== selectedCategoryFilter) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const cat = categories.find((c) => c.id === s.categoryId);
      const matchNote = s.note?.toLowerCase().includes(q);
      const matchCat = cat?.name.toLowerCase().includes(q);
      if (!matchNote && !matchCat) return false;
    }
    return true;
  });

  // Group by day YYYY-MM-DD
  const groupedSessions = filteredSessions.reduce<Record<string, Session[]>>((acc, s) => {
    const day = s.startTime.split('T')[0];
    if (!acc[day]) acc[day] = [];
    acc[day].push(s);
    return acc;
  }, {});

  const totalFilteredSec = filteredSessions.reduce((acc, s) => acc + s.durationSec, 0);

  const startEdit = (session: Session) => {
    setEditingSession(session);
    setEditNote(session.note || '');
    setEditDurationMin(Math.round(session.durationSec / 60));
    setEditCategoryId(session.categoryId);
  };

  const saveEdit = async () => {
    if (!editingSession) return;
    editingSession.update({
      categoryId: editCategoryId,
      note: editNote,
      durationSec: Math.max(1, editDurationMin * 60),
    });
    await appCore.sessionLog.update(editingSession);
    await appCore.sync.queueChange('sessions', 'UPDATE', editingSession.toDTO());
    setEditingSession(null);
  };

  const commitPendingDelete = async () => {
    if (undoSessionRef.current) {
      const targetId = undoSessionRef.current.id;
      undoSessionRef.current = null;
      if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
      if (undoIntervalRef.current) clearInterval(undoIntervalRef.current);
      setUndoSession(null);
      await appCore.sessionLog.delete(targetId);
      await appCore.sync.queueChange('sessions', 'DELETE', { id: targetId });
    }
  };

  const handleDelete = async (id: string) => {
    if (undoSessionRef.current) {
      await commitPendingDelete();
    }
    const sessionToDelete = sessions.find((s) => s.id === id);
    setShowDeleteModalId(null);
    if (!sessionToDelete) return;

    setUndoSession(sessionToDelete);
    undoSessionRef.current = sessionToDelete;
    setUndoSecondsLeft(5);

    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    if (undoIntervalRef.current) clearInterval(undoIntervalRef.current);

    undoIntervalRef.current = window.setInterval(() => {
      setUndoSecondsLeft((prev) => {
        if (prev <= 1) {
          if (undoIntervalRef.current) clearInterval(undoIntervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    undoTimeoutRef.current = window.setTimeout(async () => {
      if (undoSessionRef.current) {
        const delId = undoSessionRef.current.id;
        undoSessionRef.current = null;
        setUndoSession(null);
        await appCore.sessionLog.delete(delId);
        await appCore.sync.queueChange('sessions', 'DELETE', { id: delId });
      }
    }, 5000);
  };

  const handleUndoDelete = () => {
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    if (undoIntervalRef.current) clearInterval(undoIntervalRef.current);
    undoSessionRef.current = null;
    setUndoSession(null);
  };

  const handleManualAdd = async () => {
    if (!manualCategoryId) return;
    const now = new Date();
    const startTime = new Date(now.getTime() - manualDurationMin * 60000).toISOString();
    const endTime = now.toISOString();

    const newSession = new Session({
      id: crypto.randomUUID(),
      categoryId: manualCategoryId,
      startTime,
      endTime,
      durationSec: manualDurationMin * 60,
      note: manualNote.trim() || undefined,
      createdAt: endTime,
      updatedAt: endTime,
    });

    await appCore.sessionLog.add(newSession);
    await appCore.sync.queueChange('sessions', 'INSERT', newSession.toDTO());
    await appCore.gamification.evaluateSession(newSession, appCore.sessionLog, appCore.targetTracker);

    setShowManualAdd(false);
    setManualNote('');
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 sm:py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Session History</h2>
          <p className="text-sm text-slate-400">
            {filteredSessions.length} sessions logged •{' '}
            <span className="text-indigo-400 font-semibold">
              {(totalFilteredSec / 3600).toFixed(1)} hrs total
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {/* View Mode Toggle: List vs Calendar */}
          <div className="flex items-center p-1 bg-slate-900 border border-slate-800 rounded-xl">
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                viewMode === 'list'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>List</span>
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                viewMode === 'calendar'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Calendar</span>
            </button>
          </div>

          <button
            onClick={() => setShowManualAdd(true)}
            className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md transition active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Past</span>
          </button>
        </div>
      </div>

      {viewMode === 'calendar' ? (
        <CalendarView
          sessions={sessions}
          categories={categories}
          onEditSession={startEdit}
          onDeleteSession={(id) => setShowDeleteModalId(id)}
        />
      ) : (
        <>
          {/* Filter & Search Bar */}
          <div className="flex flex-col sm:flex-row items-center gap-3 mb-6">
            {/* Search */}
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search notes or categories..."
                className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-800/80 border border-slate-700/80 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Category Filter */}
            <div className="relative w-full sm:w-auto flex-1 flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 sm:pb-0">
              <Filter className="w-4 h-4 text-slate-400 shrink-0 hidden sm:block" />
              <button
                onClick={() => setSelectedCategoryFilter('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition select-none ${
                  selectedCategoryFilter === 'all'
                    ? 'bg-indigo-500 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                All Categories
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategoryFilter(cat.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition select-none ${
                    selectedCategoryFilter === cat.id
                      ? 'bg-slate-700 text-white ring-1'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                  style={{
                    borderColor: selectedCategoryFilter === cat.id ? cat.color : 'transparent',
                  }}
                >
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
                  <span>{cat.name}</span>
                </button>
              ))}
            </div>
          </div>

      {/* Sessions List Grouped by Day */}
      {Object.keys(groupedSessions).length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center">
          <Clock className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-white mb-1">No sessions found</h3>
          <p className="text-sm text-slate-400">
            Start the timer or log an entry to begin your tracking journey!
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedSessions).map(([day, daySessions]) => {
            const dayTotalSec = daySessions.reduce((acc, s) => acc + s.durationSec, 0);
            return (
              <div key={day} className="space-y-2">
                {/* Day Header */}
                <div className="flex items-center justify-between px-1 py-1">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                    <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                    <span>{getDayHeading(day)}</span>
                  </div>
                  <div className="text-xs font-medium text-slate-400 font-mono">
                    {formatDuration(dayTotalSec)}
                  </div>
                </div>

                {/* Day Sessions */}
                <div className="space-y-2">
                  {daySessions.map((session) => {
                    const cat = categories.find((c) => c.id === session.categoryId);
                    return (
                      <div
                        key={session.id}
                        className="glass-panel rounded-2xl p-3 sm:p-3.5 flex items-center justify-between gap-2.5 sm:gap-3 hover:border-slate-600/80 transition"
                      >
                        {/* Category & Note */}
                        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                          <div
                            className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0"
                            style={{
                              backgroundColor: `${cat?.color || '#6366f1'}20`,
                              color: cat?.color || '#6366f1',
                            }}
                          >
                            <CategoryIcon name={cat?.icon || 'Clock'} className="w-4 h-4 sm:w-5 sm:h-5" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-white truncate">
                                {cat?.name || 'Category'}
                              </span>
                            </div>
                            {/* Time range - prominent & non-wrapping */}
                            <div className="flex items-center gap-1 mt-0.5">
                              <Clock className="w-3 h-3 text-indigo-400 shrink-0" />
                              <span className="text-[11px] sm:text-xs font-mono text-indigo-300 font-semibold whitespace-nowrap">
                                {formatTime(session.startTime)} → {formatTime(session.endTime)}
                              </span>
                            </div>
                            {session.note ? (
                              <p className="text-xs text-slate-300 truncate mt-0.5">
                                {session.note}
                              </p>
                            ) : null}
                          </div>
                        </div>

                        {/* Duration & Actions */}
                        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                          <span className="font-mono text-xs sm:text-sm font-bold text-white px-2 py-1 rounded-lg bg-slate-800 shrink-0">
                            {formatDuration(session.durationSec)}
                          </span>
                          <button
                            onClick={() => startEdit(session)}
                            className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition active:scale-95"
                            title="Edit entry"
                          >
                            <Edit2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                          </button>
                          <button
                            onClick={() => setShowDeleteModalId(session.id)}
                            className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition active:scale-95"
                            title="Delete entry"
                          >
                            <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
      </>
      )}

      {/* Edit Session Modal */}
      {editingSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">Edit Session</h3>
              <button
                onClick={() => setEditingSession(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">
                  Category
                </label>
                <select
                  value={editCategoryId}
                  onChange={(e) => setEditCategoryId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">
                  Duration (Minutes)
                </label>
                <input
                  type="number"
                  min="1"
                  value={editDurationMin}
                  onChange={(e) => setEditDurationMin(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">
                  Note
                </label>
                <input
                  type="text"
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  placeholder="Focus note..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setEditingSession(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold shadow-md"
              >
                <Save className="w-4 h-4" />
                <span>Save Changes</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Add Session Modal */}
      {showManualAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">Log Past Session</h3>
              <button
                onClick={() => setShowManualAdd(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">
                  Category
                </label>
                <select
                  value={manualCategoryId}
                  onChange={(e) => setManualCategoryId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">
                  Duration (Minutes)
                </label>
                <input
                  type="number"
                  min="1"
                  value={manualDurationMin}
                  onChange={(e) => setManualDurationMin(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">
                  Note
                </label>
                <input
                  type="text"
                  value={manualNote}
                  onChange={(e) => setManualNote(e.target.value)}
                  placeholder="What did you work on?"
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setShowManualAdd(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleManualAdd}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold shadow-md"
              >
                <Plus className="w-4 h-4" />
                <span>Log Session</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModalId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-2">Delete this session?</h3>
            <p className="text-sm text-slate-400 mb-6">
              This session will be removed permanently from your local storage and cloud sync.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setShowDeleteModalId(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(showDeleteModalId)}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold shadow-md"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5-second Undo Delete Snackbar */}
      {undoSession && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 w-11/12 max-w-md animate-fade-in">
          <div className="glass-panel bg-slate-900/95 border border-indigo-500/40 rounded-2xl p-3 sm:p-3.5 shadow-2xl flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-2.5 h-2.5 rounded-full bg-rose-400 animate-pulse shrink-0" />
              <div className="min-w-0">
                <span className="text-xs font-semibold text-white truncate block">
                  Session deleted
                </span>
                <span className="text-[11px] text-slate-400">
                  Undo available ({undoSecondsLeft}s)
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleUndoDelete}
                className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow transition active:scale-95 flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Undo</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
