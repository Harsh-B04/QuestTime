import React, { useState } from 'react';
import { Palette, Check, Sparkles, Lock, ShoppingBag, Eye } from 'lucide-react';
import confetti from 'canvas-confetti';
import type { GamificationEngine } from '../../core/gamification';
import { COSMETIC_SHOP_ITEMS } from '../../core/gamification';
import type { CosmeticShopItem } from '../../types';
import { ThemeShowcaseModal } from './ThemeShowcaseModal';

interface BadgeShopProps {
  gamification: GamificationEngine;
}

export const BadgeShop: React.FC<BadgeShopProps> = ({ gamification }) => {
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showcaseItem, setShowcaseItem] = useState<CosmeticShopItem | null>(null);
  const state = gamification.getState();
  const currentXP = state.xp;
  const unlocked = new Set(gamification.getUnlockedCosmetics());
  const activeCosmetic = gamification.getActiveCosmetic();
  const trialId = gamification.getTrialCosmeticId();

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  const handleEquip = async (itemId: string, itemName: string) => {
    const ok = await gamification.equipCosmetic(itemId);
    if (ok) {
      showToast(`✨ Equipped theme: "${itemName}"`);
    }
  };

  const handlePurchase = async (itemId: string, itemName: string, costXP: number) => {
    if (currentXP < costXP) {
      showToast(`⚠️ Need ${costXP - currentXP} more XP to unlock "${itemName}"`);
      return;
    }

    const success = await gamification.purchaseCosmetic(itemId);
    if (success) {
      try {
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.7 },
        });
      } catch {
        // ignore if not supported
      }
      showToast(`🎉 Unlocked & Equipped: "${itemName}"!`);
    }
  };

  return (
    <div className="glass-panel rounded-3xl p-5 sm:p-7 border border-slate-800/80 relative overflow-hidden">
      {/* Background glow */}
      <div 
        className="absolute -top-20 -right-20 w-64 h-64 rounded-full blur-3xl opacity-20 pointer-events-none transition-colors duration-500"
        style={{ backgroundColor: activeCosmetic.accentColor }}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 relative z-10">
        <div className="flex items-center gap-3">
          <div 
            className="w-10 h-10 rounded-2xl flex items-center justify-center transition-all duration-300"
            style={{ 
              backgroundColor: `${activeCosmetic.accentColor}20`,
              color: activeCosmetic.accentColor,
              border: `1px solid ${activeCosmetic.accentColor}40`
            }}
          >
            <Palette className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              Cosmetic Theme Shop
              <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Customise UI
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              Spend focus XP to unlock cybernetic visual themes and color accents. Tap any theme to inspect & try!
            </p>
          </div>
        </div>

        {/* XP Balance Badge */}
        <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300 self-start sm:self-auto shadow-sm">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <div className="text-xs">
            <span className="font-semibold font-mono text-sm">{currentXP}</span>
            <span className="text-amber-400/80 ml-1">XP available</span>
          </div>
        </div>
      </div>

      {/* Toast feedback */}
      {toastMessage && (
        <div className="mb-4 px-4 py-2.5 rounded-xl bg-indigo-600/90 text-white text-xs font-medium border border-indigo-400/40 shadow-lg shadow-indigo-600/20 animate-fade-in flex items-center gap-2">
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Cosmetics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 relative z-10">
        {COSMETIC_SHOP_ITEMS.map((item) => {
          const isUnlocked = unlocked.has(item.id);
          const isActive = activeCosmetic.id === item.id;
          const isTrial = trialId === item.id;
          const canAfford = currentXP >= item.costXP;

          return (
            <div
              key={item.id}
              className={`rounded-2xl p-4 transition-all duration-200 border flex flex-col justify-between ${
                isTrial
                  ? 'bg-slate-900/90 shadow-lg ring-2 ring-amber-400/50'
                  : isActive
                  ? 'bg-slate-800/80 shadow-md ring-1'
                  : 'bg-slate-900/50 hover:bg-slate-800/50 border-slate-800'
              }`}
              style={{
                borderColor: isTrial ? '#f59e0b' : isActive ? item.accentColor : undefined,
                boxShadow: isTrial ? '0 0 25px rgba(245, 158, 11, 0.4)' : isActive ? `0 0 20px ${item.glowColor}` : undefined,
              }}
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2.5">
                    {/* Color Swatch Orb */}
                    <div
                      className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center shadow-inner cursor-pointer hover:scale-110 transition"
                      onClick={() => setShowcaseItem(item)}
                      title="Inspect Theme"
                      style={{
                        backgroundColor: item.accentColor,
                        boxShadow: `0 0 10px ${item.glowColor}`,
                      }}
                    >
                      {isActive && <Check className="w-4 h-4 text-slate-950 stroke-[3]" />}
                      {isTrial && <Eye className="w-3.5 h-3.5 text-slate-950 stroke-[2.5]" />}
                    </div>
                    <div>
                      <h4
                        onClick={() => setShowcaseItem(item)}
                        className="text-sm font-semibold text-white flex items-center gap-1.5 cursor-pointer hover:text-indigo-300 transition"
                      >
                        {item.name}
                        {isTrial ? (
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse">
                            TRIAL
                          </span>
                        ) : isActive ? (
                          <span 
                            className="text-[10px] font-bold px-1.5 py-0.2 rounded"
                            style={{ 
                              backgroundColor: `${item.accentColor}30`, 
                              color: item.accentColor 
                            }}
                          >
                            ACTIVE
                          </span>
                        ) : null}
                      </h4>
                    </div>
                  </div>

                  {/* Cost tag */}
                  <div className="text-right">
                    {item.costXP === 0 ? (
                      <span className="text-[11px] font-mono font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                        Default
                      </span>
                    ) : isUnlocked ? (
                      <span className="text-[11px] font-medium text-slate-400 bg-slate-800 px-2 py-0.5 rounded-md border border-slate-700">
                        Unlocked
                      </span>
                    ) : (
                      <span className="text-[11px] font-mono font-semibold text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20 flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-amber-400" />
                        {item.costXP} XP
                      </span>
                    )}
                  </div>
                </div>

                <p className="text-xs text-slate-400 mb-3.5 leading-relaxed">
                  {item.description}
                </p>
              </div>

              {/* Action Buttons Row */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  {/* Inspect & Try Showcase Button */}
                  <button
                    onClick={() => setShowcaseItem(item)}
                    className="flex-1 py-1.5 px-3 rounded-xl text-xs font-semibold text-slate-300 hover:text-white bg-slate-800/90 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 transition flex items-center justify-center gap-1.5 active:scale-98"
                    title="Inspect 3D Preview & Live Trial"
                  >
                    <Eye className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Inspect & Try</span>
                  </button>

                  {/* Equip / Unlock Quick Button */}
                  {isActive ? (
                    <button
                      disabled
                      className="py-1.5 px-3 rounded-xl text-xs font-semibold text-slate-300 bg-slate-800/80 border border-slate-700/60 cursor-default flex items-center justify-center gap-1"
                    >
                      <Check className="w-3.5 h-3.5" style={{ color: item.accentColor }} />
                      <span>Active</span>
                    </button>
                  ) : isUnlocked ? (
                    <button
                      onClick={() => handleEquip(item.id, item.name)}
                      className="py-1.5 px-3.5 rounded-xl text-xs font-semibold text-white transition-all bg-slate-800 hover:bg-slate-750 border border-slate-700 hover:border-slate-600 active:scale-98 flex items-center justify-center gap-1"
                    >
                      Equip
                    </button>
                  ) : (
                    <button
                      onClick={() => handlePurchase(item.id, item.name, item.costXP)}
                      disabled={!canAfford}
                      className={`py-1.5 px-3.5 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1 active:scale-98 ${
                        canAfford
                          ? 'text-white shadow-md'
                          : 'text-slate-500 bg-slate-800/50 border border-slate-800 cursor-not-allowed'
                      }`}
                      style={{
                        backgroundColor: canAfford ? item.accentColor : undefined,
                        boxShadow: canAfford ? `0 2px 10px ${item.glowColor}` : undefined,
                      }}
                    >
                      {canAfford ? (
                        <>
                          <ShoppingBag className="w-3.5 h-3.5" />
                          <span>Unlock</span>
                        </>
                      ) : (
                        <>
                          <Lock className="w-3.5 h-3.5" />
                          <span>{item.costXP} XP</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Cinematic Showcase Modal */}
      {showcaseItem && (
        <ThemeShowcaseModal
          item={showcaseItem}
          gamification={gamification}
          onClose={() => setShowcaseItem(null)}
          onToast={showToast}
        />
      )}
    </div>
  );
};
