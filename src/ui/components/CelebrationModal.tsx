import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { Trophy, Star, Sparkles, X, Flame } from 'lucide-react';
import type { SessionEvaluationResult } from '../../core/gamification';
import { CategoryIcon } from './CategoryIcon';

interface CelebrationModalProps {
  celebration: SessionEvaluationResult | null;
  onClose: () => void;
}

export const CelebrationModal: React.FC<CelebrationModalProps> = ({ celebration, onClose }) => {
  useEffect(() => {
    if (!celebration) return;

    // Trigger confetti fireworks
    const duration = 2.5 * 1000;
    const animationEnd = Date.now() + duration;

    const frame = () => {
      confetti({
        particleCount: 4,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.7 },
        colors: ['#6366f1', '#a855f7', '#ec4899', '#f59e0b'],
      });
      confetti({
        particleCount: 4,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.7 },
        colors: ['#06b6d4', '#10b981', '#3b82f6', '#f59e0b'],
      });

      if (Date.now() < animationEnd) {
        requestAnimationFrame(frame);
      }
    };
    frame();
  }, [celebration]);

  if (!celebration) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-700/70 rounded-3xl p-6 sm:p-8 shadow-2xl text-center overflow-hidden">
        {/* Glowing background blob */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-purple-500/20 rounded-full blur-3xl pointer-events-none" />

        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-2 rounded-full hover:bg-slate-800 transition"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Icon */}
        <div className="mx-auto w-20 h-20 rounded-2xl bg-gradient-to-tr from-amber-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/30 mb-5 animate-bounce">
          {celebration.leveledUp ? (
            <Trophy className="w-10 h-10 text-white" />
          ) : celebration.unlockedBadges.length > 0 ? (
            <Star className="w-10 h-10 text-white fill-current" />
          ) : (
            <Flame className="w-10 h-10 text-white" />
          )}
        </div>

        {/* Title */}
        {celebration.leveledUp ? (
          <>
            <div className="inline-block px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold uppercase tracking-wider mb-2">
              Level Up!
            </div>
            <h3 className="text-2xl sm:text-3xl font-bold text-white mb-2">
              Reached Level {celebration.newLevel}!
            </h3>
            <p className="text-slate-300 text-sm mb-6">
              Incredible focus! Your discipline is compounding into mastery.
            </p>
          </>
        ) : celebration.unlockedBadges.length > 0 ? (
          <>
            <div className="inline-block px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-400 text-xs font-semibold uppercase tracking-wider mb-2">
              Achievement Unlocked!
            </div>
            <h3 className="text-2xl sm:text-3xl font-bold text-white mb-2">
              New Badge Earned!
            </h3>
          </>
        ) : (
          <>
            <h3 className="text-2xl font-bold text-white mb-2">
              Session Logged!
            </h3>
          </>
        )}

        {/* Badges List if any */}
        {celebration.unlockedBadges.length > 0 && (
          <div className="space-y-3 mb-6 text-left">
            {celebration.unlockedBadges.map((badge) => (
              <div
                key={badge.id}
                className="flex items-center gap-3 p-3 rounded-2xl bg-slate-800/80 border border-purple-500/30"
              >
                <div className="w-12 h-12 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center shrink-0">
                  <CategoryIcon name={badge.icon} className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-white font-semibold text-sm">{badge.title}</h4>
                  <p className="text-xs text-slate-400">{badge.description}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* XP Gains Pill */}
        <div className="inline-flex flex-col sm:flex-row items-center gap-2 px-4 py-2.5 rounded-2xl bg-slate-800/90 border border-slate-700 text-slate-200 text-sm font-medium mb-6 shadow-inner">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span className="font-bold text-amber-300">+{celebration.xpGained} XP Earned</span>
          </div>
          {celebration.streakMultiplier > 1 && (
            <span className="text-amber-400 text-xs font-semibold bg-amber-500/15 px-2 py-0.5 rounded-full border border-amber-500/30">
              ⚡ {celebration.streakMultiplier}x Streak Boost (+{Math.round((celebration.streakMultiplier - 1) * 100)}%)
            </span>
          )}
          {celebration.bonusAwarded && (
            <span className="text-emerald-400 text-xs font-semibold bg-emerald-500/15 px-2 py-0.5 rounded-full border border-emerald-500/30">
              🎯 +50 Target Bonus!
            </span>
          )}
        </div>

        <div>
          <button
            onClick={onClose}
            className="w-full py-3 px-6 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-medium shadow-lg shadow-indigo-500/25 transition active:scale-[0.98]"
          >
            Claim & Continue
          </button>
        </div>
      </div>
    </div>
  );
};
