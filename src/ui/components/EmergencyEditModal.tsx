import React, { useState } from 'react';
import { Lock, ShieldAlert, X, AlertTriangle } from 'lucide-react';
import { appCore } from '../../core';

interface EmergencyEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUnlocked: () => void;
}

export const EmergencyEditModal: React.FC<EmergencyEditModalProps> = ({
  isOpen,
  onClose,
  onUnlocked,
}) => {
  const [reasonNote, setReasonNote] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = reasonNote.trim();
    if (trimmed.length < 6) {
      setError('Please provide a brief justification (at least 6 characters).');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await appCore.targetLockPolicy.unlockEmergency(trimmed);
      onUnlocked();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to unlock emergency edit.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-md bg-slate-900 border border-amber-500/30 rounded-3xl p-6 sm:p-7 shadow-2xl space-y-5">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              <span>Target Locker</span>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                1 Use / Week
              </span>
            </h3>
            <p className="text-xs text-slate-400">Emergency Target Modification</p>
          </div>
        </div>

        {/* Psychological Guardrail Warning */}
        <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-200/90 text-xs leading-relaxed space-y-1.5">
          <div className="flex items-center gap-1.5 font-semibold text-amber-300">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Anti-Goal Erosion Gate</span>
          </div>
          <p>
            Targets are locked mid-week to protect against lowering the bar when you are tired. You have <strong>1 Emergency Edit</strong> allowed per week for genuine schedule disruptions (illness, urgent deadlines, unexpected travel).
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Why does this target need to change today? <span className="text-rose-400">*</span>
            </label>
            <textarea
              rows={3}
              value={reasonNote}
              onChange={(e) => {
                setReasonNote(e.target.value);
                if (error) setError(null);
              }}
              placeholder="e.g., Caught the flu, down for 2 days; client emergency project..."
              className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-950 border border-slate-800 focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/50 text-white text-xs resize-none placeholder:text-slate-600 outline-none transition"
              autoFocus
            />
            {error && (
              <div className="flex items-center gap-1.5 text-rose-400 text-xs mt-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
            >
              Keep Locked
            </button>
            <button
              type="submit"
              disabled={isSubmitting || reasonNote.trim().length < 6}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 text-xs font-bold transition shadow-lg shadow-amber-500/20 active:scale-95"
            >
              {isSubmitting ? 'Unlocking...' : 'Unlock Emergency Edit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
