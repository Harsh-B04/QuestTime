import React, { useState } from 'react';
import { Sparkles, X, Lightbulb, Check } from 'lucide-react';
import { appCore } from '../../core';
import { Category } from '../../core/category';
import { CategoryIcon } from './CategoryIcon';

interface HabitCueModalProps {
  category: Category | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const CUE_PRESETS = [
  'When I sit down at my desk with morning coffee, I will open my workspace.',
  'When I finish my afternoon standup, I will start 45 minutes of focus.',
  'When I put on my noise-canceling headphones, I will begin uninterrupted.',
  'When the clock hits 8:00 PM, I will close distractions and review notes.',
];

export const HabitCueModal: React.FC<HabitCueModalProps> = ({
  category,
  isOpen,
  onClose,
  onSaved,
}) => {
  const [cue, setCue] = useState<string>(category?.ifThenCue || '');
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Sync state when category changes
  React.useEffect(() => {
    if (category) {
      setCue(category.ifThenCue || '');
    }
  }, [category]);

  if (!isOpen || !category) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      category.update({ ifThenCue: cue.trim() || undefined });
      await appCore.saveCategory(category);
      onSaved();
      onClose();
    } catch (err) {
      console.error('Failed to save category cue:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = async () => {
    try {
      setIsSaving(true);
      category.update({ ifThenCue: undefined });
      await appCore.saveCategory(category);
      setCue('');
      onSaved();
      onClose();
    } catch (err) {
      console.error('Failed to clear category cue:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-7 shadow-2xl space-y-5">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border"
            style={{
              backgroundColor: `${category.color}20`,
              borderColor: `${category.color}40`,
              color: category.color,
            }}
          >
            <CategoryIcon name={category.icon} className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              <span>Self-Note Habit Cue</span>
            </h3>
            <p className="text-xs text-slate-400">
              Trigger prompt for <span className="font-semibold text-white">{category.name}</span>
            </p>
          </div>
        </div>

        {/* Science Explainer */}
        <div className="p-3.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-200 text-xs leading-relaxed space-y-1">
          <div className="flex items-center gap-1.5 font-semibold text-indigo-300">
            <Lightbulb className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span>Implementation Intention ("If-Then")</span>
          </div>
          <p className="text-slate-300">
            Connecting a specific environmental cue (a time, place, or preceding ritual) removes starting friction. This cue will appear as a personal reminder on your Timer screen.
          </p>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Your "If-Then" Cue
            </label>
            <textarea
              rows={3}
              value={cue}
              onChange={(e) => setCue(e.target.value)}
              placeholder='e.g., "When I sit down with coffee, I will open VS Code."'
              className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-white text-xs resize-none placeholder:text-slate-600 outline-none transition"
              autoFocus
            />
          </div>

          {/* Quick Presets */}
          <div>
            <span className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-indigo-400" />
              <span>Quick Presets</span>
            </span>
            <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
              {CUE_PRESETS.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setCue(preset)}
                  className="w-full text-left p-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-[11px] text-slate-300 hover:text-white border border-slate-700/40 transition flex items-start gap-1.5"
                >
                  <span className="text-indigo-400 font-bold shrink-0">›</span>
                  <span className="truncate">{preset}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            {category.ifThenCue ? (
              <button
                type="button"
                onClick={handleClear}
                disabled={isSaving}
                className="text-xs text-rose-400 hover:text-rose-300 underline underline-offset-2 transition"
              >
                Remove Cue
              </button>
            ) : (
              <div />
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition shadow-lg shadow-indigo-500/25 active:scale-95"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{isSaving ? 'Saving...' : 'Save Self-Note'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
