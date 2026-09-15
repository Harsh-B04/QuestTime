import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  Flame,
  Zap,
  Lock,
  ShoppingBag,
  Check,
  Eye,
  Shield,
  Clock,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import type { CosmeticShopItem } from '../../types';
import type { GamificationEngine } from '../../core/gamification';

interface ThemeShowcaseModalProps {
  item: CosmeticShopItem;
  gamification: GamificationEngine;
  onClose: () => void;
  onToast: (msg: string) => void;
}

export const ThemeShowcaseModal: React.FC<ThemeShowcaseModalProps> = ({
  item,
  gamification,
  onClose,
  onToast,
}) => {
  const [tickerSec, setTickerSec] = useState<number>(1425); // Simulated ticking elapsed time

  useEffect(() => {
    const interval = setInterval(() => {
      setTickerSec((s) => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const state = gamification.getState();
  const currentXP = state.xp;
  const unlocked = new Set(gamification.getUnlockedCosmetics());
  const isUnlocked = unlocked.has(item.id);
  const activeCosmetic = gamification.getActiveCosmetic();
  const isActive = activeCosmetic.id === item.id;
  const trialId = gamification.getTrialCosmeticId();
  const isTrialActive = trialId === item.id;
  const canAfford = currentXP >= item.costXP;

  const hours = String(Math.floor(tickerSec / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((tickerSec % 3600) / 60)).padStart(2, '0');
  const seconds = String(tickerSec % 60).padStart(2, '0');

  const handleActivateTrial = () => {
    gamification.startTrial(item.id);
    try {
      confetti({
        particleCount: 40,
        spread: 50,
        origin: { y: 0.8 },
      });
    } catch {
      // safe fallback
    }
    onToast(`⚡ Activated Live Trial for "${item.name}"! Explore the app.`);
    onClose();
  };

  const handleEndTrial = () => {
    gamification.stopTrial();
    onToast(`Ended trial for "${item.name}".`);
  };

  const handleEquip = async () => {
    const ok = await gamification.equipCosmetic(item.id);
    if (ok) {
      onToast(`✨ Equipped "${item.name}"!`);
      onClose();
    }
  };

  const handleUnlock = async () => {
    if (!canAfford) {
      onToast(`⚠️ You need ${item.costXP - currentXP} more XP to unlock "${item.name}". Keep focusing!`);
      return;
    }
    const ok = await gamification.purchaseCosmetic(item.id);
    if (ok) {
      try {
        confetti({
          particleCount: 80,
          spread: 80,
          origin: { y: 0.6 },
        });
      } catch {
        // safe fallback
      }
      onToast(`🎉 Unlocked & Equipped: "${item.name}"!`);
      onClose();
    }
  };

  const xpProgressPct = item.costXP > 0 ? Math.min(100, Math.round((currentXP / item.costXP) * 100)) : 100;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-xl animate-fade-in overflow-y-auto">
      {/* Ambient Radial Spotlight */}
      <div
        className="fixed inset-0 pointer-events-none opacity-30 transition-all duration-700"
        style={{
          background: `radial-gradient(circle at 50% 40%, ${item.glowColor} 0%, transparent 65%)`,
        }}
      />

      <div
        className="relative w-full max-w-xl rounded-3xl bg-slate-950/90 border border-slate-800 shadow-2xl p-5 sm:p-7 overflow-hidden space-y-5 my-auto"
        style={{
          borderColor: `${item.accentColor}50`,
          boxShadow: `0 0 50px ${item.glowColor}`,
        }}
      >
        {/* Subtle holographic diagonal pattern */}
        <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full blur-3xl opacity-25 pointer-events-none"
          style={{ backgroundColor: item.accentColor }}
        />

        {/* Modal Top Bar */}
        <div className="flex items-center justify-between relative z-10">
          <div className="flex items-center gap-2">
            <span
              className="text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full border shadow-sm flex items-center gap-1"
              style={{
                backgroundColor: `${item.accentColor}25`,
                color: item.accentColor,
                borderColor: `${item.accentColor}50`,
              }}
            >
              {item.tier === 'MYTHIC' ? (
                <>
                  <Flame className="w-3 h-3 fill-current animate-pulse" />
                  <span>MYTHIC APEX</span>
                </>
              ) : item.tier === 'LEGENDARY' ? (
                <>
                  <Zap className="w-3 h-3 fill-current" />
                  <span>LEGENDARY</span>
                </>
              ) : item.tier === 'EPIC' ? (
                <>
                  <Sparkles className="w-3 h-3" />
                  <span>EPIC TIER</span>
                </>
              ) : (
                <span>{item.tier || 'STANDARD'}</span>
              )}
            </span>

            {isTrialActive && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse flex items-center gap-1">
                <Eye className="w-3 h-3" /> LIVE TRIAL ACTIVE
              </span>
            )}
            {isActive && !isTrialActive && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                <Check className="w-3 h-3" /> CURRENTLY EQUIPPED
              </span>
            )}
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Cinematic Skin Name & Lore */}
        <div className="text-center space-y-1 relative z-10">
          <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center justify-center gap-2">
            <span>{item.name}</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 max-w-md mx-auto leading-relaxed">
            {item.lore || item.description}
          </p>
        </div>

        {/* 3D Holographic Interactive Dial Showcase */}
        <div className="relative py-3 flex items-center justify-center">
          {/* Pulsing Aura */}
          <div
            className="absolute w-52 h-52 sm:w-60 sm:h-60 rounded-full blur-2xl opacity-60 animate-pulse pointer-events-none"
            style={{ backgroundColor: item.accentColor }}
          />

          {/* Dial Face */}
          <div
            className="relative w-48 h-48 sm:w-56 sm:h-56 rounded-full flex flex-col items-center justify-center bg-slate-950/90 border-2 shadow-2xl transition-all"
            style={{
              borderColor: item.accentColor,
              boxShadow: `0 0 35px ${item.glowColor}, inset 0 0 20px ${item.glowColor}`,
            }}
          >
            {/* SVG Track */}
            <svg className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none" viewBox="0 0 200 200">
              <circle
                cx="100"
                cy="100"
                r="88"
                stroke="rgba(255, 255, 255, 0.06)"
                strokeWidth="5"
                fill="transparent"
              />
              <circle
                cx="100"
                cy="100"
                r="88"
                stroke={item.accentColor}
                strokeWidth="5"
                strokeDasharray={2 * Math.PI * 88}
                strokeDashoffset={2 * Math.PI * 88 * 0.35}
                strokeLinecap="round"
                fill="transparent"
                className="transition-all duration-1000"
              />
            </svg>

            {/* Category Pill preview */}
            <div
              className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold mb-1.5 shadow-sm"
              style={{
                backgroundColor: `${item.accentColor}25`,
                color: item.accentColor,
                border: `1px solid ${item.accentColor}50`,
              }}
            >
              <Clock className="w-3 h-3" />
              <span>Deep Work</span>
            </div>

            {/* Simulated Ticking Digits */}
            <div className="flex items-baseline font-mono text-2xl sm:text-3xl font-extrabold tracking-tight text-white mb-1 tabular-nums">
              <span>{hours}</span>
              <span className="text-slate-500 mx-0.5">:</span>
              <span>{minutes}</span>
              <span className="text-slate-500 mx-0.5">:</span>
              <span style={{ color: item.accentColor }}>{seconds}</span>
            </div>

            {/* Focus mode label */}
            <div className="text-[9px] font-bold uppercase tracking-widest text-emerald-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              Focus Live Preview
            </div>
          </div>
        </div>

        {/* Visual Perks List */}
        {item.perks && item.perks.length > 0 && (
          <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Shield className="w-3 h-3 text-indigo-400" />
              <span>Skin Visual Perks & FX:</span>
            </span>
            <div className="grid grid-cols-2 gap-2">
              {item.perks.map((perk, i) => (
                <div key={i} className="flex items-center gap-1.5 text-xs text-slate-200">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: item.accentColor }} />
                  <span>{perk}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* XP Grind Progress Bar (Temptation Engine) */}
        {!isUnlocked && item.costXP > 0 && (
          <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Unlock Progress</span>
              <span className="font-mono font-bold text-white">
                {currentXP} / {item.costXP} XP ({xpProgressPct}%)
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${xpProgressPct}%`,
                  background: item.gradient || item.accentColor,
                }}
              />
            </div>
            <div className="text-[11px] text-right">
              {canAfford ? (
                <span className="text-emerald-400 font-semibold">Ready to unlock!</span>
              ) : (
                <span className="text-amber-400 font-semibold">
                  Grind {item.costXP - currentXP} more XP through focus sessions to claim!
                </span>
              )}
            </div>
          </div>
        )}

        {/* Action Controls */}
        <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
          {/* 1. Try On / Trial Button */}
          {!isActive && (
            <button
              onClick={isTrialActive ? handleEndTrial : handleActivateTrial}
              className={`w-full sm:flex-1 py-3 px-4 rounded-2xl font-bold text-xs sm:text-sm transition flex items-center justify-center gap-2 border active:scale-95 shadow-lg ${
                isTrialActive
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                  : 'bg-slate-800 hover:bg-slate-750 text-white border-slate-700 hover:border-slate-600'
              }`}
            >
              <Eye className="w-4 h-4" />
              <span>{isTrialActive ? 'End Live Trial' : '⚡ Activate Live Trial'}</span>
            </button>
          )}

          {/* 2. Permanent Unlock / Equip Button */}
          {isUnlocked ? (
            <button
              onClick={handleEquip}
              disabled={isActive}
              className={`w-full sm:flex-1 py-3 px-4 rounded-2xl font-bold text-xs sm:text-sm transition flex items-center justify-center gap-2 active:scale-95 shadow-lg ${
                isActive
                  ? 'bg-slate-800 text-slate-400 border border-slate-700 cursor-default'
                  : 'text-white'
              }`}
              style={{
                backgroundColor: !isActive ? item.accentColor : undefined,
                boxShadow: !isActive ? `0 4px 20px ${item.glowColor}` : undefined,
              }}
            >
              <Check className="w-4 h-4" />
              <span>{isActive ? 'Theme Equipped' : 'Equip Permanently'}</span>
            </button>
          ) : (
            <button
              onClick={handleUnlock}
              disabled={!canAfford}
              className={`w-full sm:flex-1 py-3 px-4 rounded-2xl font-bold text-xs sm:text-sm transition flex items-center justify-center gap-2 active:scale-95 shadow-lg ${
                canAfford
                  ? 'text-white'
                  : 'bg-slate-800/60 text-slate-500 border border-slate-800 cursor-not-allowed'
              }`}
              style={{
                backgroundColor: canAfford ? item.accentColor : undefined,
                boxShadow: canAfford ? `0 4px 20px ${item.glowColor}` : undefined,
              }}
            >
              {canAfford ? (
                <>
                  <ShoppingBag className="w-4 h-4" />
                  <span>Claim Permanently ({item.costXP} XP)</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  <span>Locked ({item.costXP} XP)</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
