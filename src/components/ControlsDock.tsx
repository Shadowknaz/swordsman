/**
 * Collapsible Bottom Control Dock
 * Provides Active Ragdoll physics toggles, Jelly presets, PD-tuning sliders,
 * target-locking, and comprehensive mechanics guide.
 */

import React, { useState } from 'react';
import {
  Volume2,
  VolumeX,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  MousePointer,
  Info,
  X,
  Target,
  Sliders,
  Ghost,
  UserX,
  Activity,
  Sparkles,
} from 'lucide-react';

interface ControlsDockProps {
  isMuted: boolean;
  onToggleMute: () => void;
  onResetDummy: () => void;
  isTargetLocked?: boolean;
  onToggleTargetLock?: () => void;

  // Active Ragdoll additions
  ragdollState?: string;
  isGhostVisible?: boolean;
  kp?: number;
  kd?: number;
  kBalance?: number;
  onToggleRagdoll?: () => void;
  onToggleGhostRig?: () => void;
  onSetRagdollPreset?: (preset: 'gang_beasts' | 'human_fall_flat' | 'iron_knight') => void;
  onSetRagdollTuning?: (kp: number, kd: number, kBalance: number) => void;
}

export const ControlsDock: React.FC<ControlsDockProps> = ({
  isMuted,
  onToggleMute,
  onResetDummy,
  isTargetLocked = false,
  onToggleTargetLock,
  ragdollState = 'active',
  isGhostVisible = false,
  kp = 165,
  kd = 14,
  kBalance = 230,
  onToggleRagdoll,
  onToggleGhostRig,
  onSetRagdollPreset,
  onSetRagdollTuning,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showTuningDrawer, setShowTuningDrawer] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);

  const [localKp, setLocalKp] = useState(kp);
  const [localKd, setLocalKd] = useState(kd);
  const [localKBalance, setLocalKBalance] = useState(kBalance);

  const handlePresetSelect = (preset: 'gang_beasts' | 'human_fall_flat' | 'iron_knight') => {
    onSetRagdollPreset?.(preset);
    if (preset === 'gang_beasts') {
      setLocalKp(95);
      setLocalKd(7.5);
      setLocalKBalance(150);
    } else if (preset === 'human_fall_flat') {
      setLocalKp(165);
      setLocalKd(14);
      setLocalKBalance(230);
    } else if (preset === 'iron_knight') {
      setLocalKp(380);
      setLocalKd(28);
      setLocalKBalance(340);
    }
  };

  const handleSliderChange = (newKp: number, newKd: number, newKBal: number) => {
    setLocalKp(newKp);
    setLocalKd(newKd);
    setLocalKBalance(newKBal);
    onSetRagdollTuning?.(newKp, newKd, newKBal);
  };

  return (
    <>
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center select-none max-w-[96vw] w-auto pointer-events-auto">
        {/* Tuning Drawer Overlay if open */}
        {showTuningDrawer && !isCollapsed && (
          <div className="mb-2 bg-[#100e14]/95 border border-[#383344] p-3.5 rounded-lg shadow-2xl backdrop-blur-xs w-full max-w-md text-xs font-mono text-[#d8cfba] space-y-3">
            <div className="flex items-center justify-between border-b border-[#2a2632] pb-1.5">
              <span className="flex items-center gap-1.5 font-bold text-[#e8dfc8]">
                <Sliders className="w-3.5 h-3.5 text-amber-400" />
                ACTIVE RAGDOLL PD-TUNING
              </span>
              <button
                onClick={() => setShowTuningDrawer(false)}
                className="text-stone-400 hover:text-white p-0.5 rounded cursor-pointer"
                aria-label="Close Tuning Drawer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Presets */}
            <div>
              <span className="text-[10px] text-[#8a8292] block mb-1">PHYSICS PRESETS:</span>
              <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                <button
                  onClick={() => handlePresetSelect('gang_beasts')}
                  className="px-2 py-1 bg-[#1a1724] hover:bg-[#282236] text-rose-300 border border-rose-800/60 rounded cursor-pointer transition-colors active:scale-95"
                >
                  Gang Beasts (Jelly)
                </button>
                <button
                  onClick={() => handlePresetSelect('human_fall_flat')}
                  className="px-2 py-1 bg-[#1a1724] hover:bg-[#282236] text-amber-300 border border-amber-800/60 rounded cursor-pointer transition-colors active:scale-95"
                >
                  Human Fall Flat
                </button>
                <button
                  onClick={() => handlePresetSelect('iron_knight')}
                  className="px-2 py-1 bg-[#1a1724] hover:bg-[#282236] text-cyan-300 border border-cyan-800/60 rounded cursor-pointer transition-colors active:scale-95"
                >
                  Iron Knight (Crisp)
                </button>
              </div>
            </div>

            {/* Kp Slider */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-[#8a8292]">Kp (Stiffness / Жесткость):</span>
                <span className="font-bold text-amber-400">{localKp}</span>
              </div>
              <input
                type="range"
                min="20"
                max="500"
                step="5"
                value={localKp}
                onChange={(e) =>
                  handleSliderChange(Number(e.target.value), localKd, localKBalance)
                }
                className="w-full accent-amber-500 cursor-pointer h-1.5 bg-[#25212e] rounded"
              />
            </div>

            {/* Kd Slider */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-[#8a8292]">Kd (Damping / Демпфирование):</span>
                <span className="font-bold text-cyan-400">{localKd}</span>
              </div>
              <input
                type="range"
                min="2"
                max="40"
                step="0.5"
                value={localKd}
                onChange={(e) =>
                  handleSliderChange(localKp, Number(e.target.value), localKBalance)
                }
                className="w-full accent-cyan-500 cursor-pointer h-1.5 bg-[#25212e] rounded"
              />
            </div>

            {/* kBalance Slider */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-[#8a8292]">Upright Balance Force (k_balance):</span>
                <span className="font-bold text-emerald-400">{localKBalance}</span>
              </div>
              <input
                type="range"
                min="0"
                max="500"
                step="10"
                value={localKBalance}
                onChange={(e) =>
                  handleSliderChange(localKp, localKd, Number(e.target.value))
                }
                className="w-full accent-emerald-500 cursor-pointer h-1.5 bg-[#25212e] rounded"
              />
            </div>
          </div>
        )}

        {/* Collapse / Expand Tab */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="bg-[#121017]/90 hover:bg-[#1a1722] text-[#c8b88a] border border-[#35313d] border-b-0 px-3 py-1 rounded-t text-xs font-mono flex items-center gap-1.5 transition-colors cursor-pointer shadow-lg"
          aria-label={isCollapsed ? 'Expand combat controls dock' : 'Collapse combat controls dock'}
        >
          {isCollapsed ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" />
              <span>SHOW DOCK</span>
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" />
              <span>HIDE DOCK</span>
            </>
          )}
        </button>

        {/* Main Dock Container */}
        {!isCollapsed && (
          <div className="bg-[#100e14]/92 border border-[#302c38] p-2 md:p-2.5 rounded-lg shadow-2xl flex flex-wrap items-center justify-center gap-1.5 md:gap-2 text-xs font-mono">
            {/* Ragdoll Collapse / Stand Up Button */}
            {onToggleRagdoll && (
              <button
                onClick={onToggleRagdoll}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded border transition-colors cursor-pointer active:scale-95 ${
                  ragdollState === 'limp_ragdoll'
                    ? 'bg-rose-950/90 text-rose-300 border-rose-600 animate-pulse hover:bg-rose-900 shadow-[0_0_12px_rgba(244,63,94,0.3)]'
                    : 'bg-[#1b1822] hover:bg-[#25212e] text-[#d8cfba] border-[#332e3d]'
                }`}
                aria-label="Toggle Active Ragdoll Collapse or Stand Up (R)"
              >
                <UserX className={`w-3.5 h-3.5 ${ragdollState === 'limp_ragdoll' ? 'text-rose-400' : 'text-[#c8b88a]'}`} />
                <span>{ragdollState === 'limp_ragdoll' ? 'STAND UP [R]' : 'RAGDOLL [R]'}</span>
              </button>
            )}

            {/* Ghost Rig Wireframe Toggle */}
            {onToggleGhostRig && (
              <button
                onClick={onToggleGhostRig}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded border transition-colors cursor-pointer active:scale-95 ${
                  isGhostVisible
                    ? 'bg-cyan-950/90 text-cyan-300 border-cyan-500 hover:bg-cyan-900 shadow-[0_0_12px_rgba(6,182,212,0.3)]'
                    : 'bg-[#1b1822] hover:bg-[#25212e] text-[#d8cfba] border-[#332e3d]'
                }`}
                aria-label="Toggle Ghost Rig Kinematic Skeleton (G)"
              >
                <Ghost className={`w-3.5 h-3.5 ${isGhostVisible ? 'text-cyan-400' : 'text-[#9ab0d4]'}`} />
                <span>{isGhostVisible ? 'GHOST: VISIBLE' : 'GHOST RIG [G]'}</span>
              </button>
            )}

            {/* Physics Tuning Drawer Toggle */}
            <button
              onClick={() => setShowTuningDrawer(!showTuningDrawer)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded border transition-colors cursor-pointer active:scale-95 ${
                showTuningDrawer
                  ? 'bg-amber-950/90 text-amber-300 border-amber-600/70 hover:bg-amber-900'
                  : 'bg-[#1b1822] hover:bg-[#25212e] text-[#d8cfba] border-[#332e3d]'
              }`}
              aria-label="Open Jelly Physics and PD Tuning Sliders"
            >
              <Sliders className="w-3.5 h-3.5 text-amber-400" />
              <span>TUNING</span>
            </button>

            {/* Target Lock Toggle Button */}
            {onToggleTargetLock && (
              <button
                onClick={onToggleTargetLock}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded border transition-colors cursor-pointer active:scale-95 ${
                  isTargetLocked
                    ? 'bg-amber-950/85 text-amber-300 border-amber-600/70 hover:bg-amber-900/80 shadow-[0_0_12px_rgba(245,158,11,0.25)]'
                    : 'bg-[#1b1822] hover:bg-[#25212e] text-[#d8cfba] border-[#332e3d]'
                }`}
                aria-label="Toggle Z-Targeting Lock-On (F/Q/Z or Middle Click)"
              >
                <Target className={`w-3.5 h-3.5 ${isTargetLocked ? 'text-amber-400' : 'text-[#c8b88a]'}`} />
                <span>{isTargetLocked ? 'LOCKED' : 'LOCK-ON [F/Q]'}</span>
              </button>
            )}

            {/* Audio Toggle */}
            <button
              onClick={onToggleMute}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#1b1822] hover:bg-[#25212e] text-[#d8cfba] border border-[#332e3d] rounded transition-colors cursor-pointer active:scale-95"
              aria-label={isMuted ? 'Unmute procedural sound engine' : 'Mute procedural sound engine'}
            >
              {isMuted ? (
                <>
                  <VolumeX className="w-4 h-4 text-rose-400" />
                  <span className="hidden sm:inline">UNMUTE</span>
                </>
              ) : (
                <>
                  <Volume2 className="w-4 h-4 text-emerald-400" />
                  <span className="hidden sm:inline">MUTE</span>
                </>
              )}
            </button>

            {/* Reset Dummy */}
            <button
              onClick={onResetDummy}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#1b1822] hover:bg-[#25212e] text-[#d8cfba] border border-[#332e3d] rounded transition-colors cursor-pointer active:scale-95"
              aria-label="Reset Quintain Dummy Position"
            >
              <RotateCcw className="w-3.5 h-3.5 text-[#9ab0d4]" />
              <span className="hidden sm:inline">RESET</span>
            </button>

            {/* Quick Controls Cheat-Pill */}
            <div className="hidden xl:flex items-center gap-2.5 px-2.5 py-1 bg-[#0c0a0f] border border-[#232029] rounded text-[11px] text-[#8a8292]">
              <span><b className="text-[#d8cfba]">WASD:</b> Move</span>
              <span><b className="text-[#d8cfba]">R:</b> Ragdoll</span>
              <span><b className="text-[#d8cfba]">G:</b> Ghost</span>
              <span><b className="text-[#d8cfba]">Space:</b> Dodge</span>
              <span><b className="text-[#d8cfba]">F/Q:</b> Lock</span>
              <span><b className="text-[#d8cfba]">LMB/RMB:</b> Strike</span>
            </div>

            {/* Help / Mechanics Modal Trigger */}
            <button
              onClick={() => setShowHelpModal(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#1b1822] hover:bg-[#25212e] text-[#c8b88a] border border-[#332e3d] rounded transition-colors cursor-pointer active:scale-95"
              aria-label="Open Combat & Active Ragdoll Mechanics Guide"
            >
              <Info className="w-3.5 h-3.5" />
              <span>GUIDE</span>
            </button>
          </div>
        )}
      </div>

      {/* Mechanics & Controls Help Dialog */}
      {showHelpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xs select-none">
          <div className="bg-[#121017] border border-[#35313d] max-w-xl w-full p-5 md:p-6 rounded-lg shadow-2xl text-stone-300 font-mono text-xs max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#2a2632] pb-3 mb-4">
              <h2 className="font-medieval text-base font-bold text-[#e8dfc8] flex items-center gap-2">
                <MousePointer className="w-4 h-4 text-[#c8b88a]" />
                ACTIVE RAGDOLL & KINEMATICS GUIDE
              </h2>
              <button
                onClick={() => setShowHelpModal(false)}
                className="text-stone-400 hover:text-white p-1 border border-[#35313d] rounded hover:bg-[#201d27] cursor-pointer flex items-center justify-center transition-colors"
                aria-label="Close Guide"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-4 text-[11px] leading-relaxed text-[#a49ba8]">
              {/* 1. Anatomy */}
              <div>
                <h3 className="text-[#c8b88a] font-bold mb-1 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-amber-400" />
                  1. АНАТОМИЯ ФИЗИЧЕСКОГО СКЕЛЕТА (ACTIVE RAGDOLL)
                </h3>
                <p>
                  Тело персонажа полностью живет в физическом мире и состоит из набора связанных твердых тел (RigidBodies):
                </p>
                <ul className="list-disc list-inside mt-1 space-y-0.5 text-stone-300">
                  <li><b>Таз (Pelvis/Root):</b> Главное ядро массы, к которому крепятся ноги и позвоночник.</li>
                  <li><b>Торс и Голова:</b> Соединены с ограничениями углов (Cone Twist Constraints), предотвращающими неестественное скручивание.</li>
                  <li><b>Конечности:</b> Плечи и бедра — шаровые шарниры (3 DOF), колени и локти — анатомические револьверные шарниры (1 DOF).</li>
                </ul>
              </div>

              {/* 2. PD Controller */}
              <div>
                <h3 className="text-[#c8b88a] font-bold mb-1 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                  2. СЕКРЕТ «ЖЕЛЕЙНОСТИ»: PD-РЕГУЛЯТОР И ПРУЖИНЫ
                </h3>
                <p>
                  Крутящий момент мотора в суставах вычисляется по формуле PD-контроллера (Proportional-Derivative):
                </p>
                <div className="bg-[#181520] p-2 rounded border border-[#2b2738] my-1 text-stone-200 font-mono text-[10px]">
                  τ = k_p · (θ_target - θ) - k_d · ω
                </div>
                <ul className="list-disc list-inside space-y-0.5 text-stone-300">
                  <li><b>k_p (Жесткость):</b> Сила, с которой сустав стремится к целевой позе. Занизив k_p, получаем вареное «желейное» тело Gang Beasts.</li>
                  <li><b>k_d (Гашение):</b> Предотвращает бесконечные колебания. Небольшой недотяг создает комичную пружинящую отдачу.</li>
                </ul>
              </div>

              {/* 3. Upright Balance */}
              <div>
                <h3 className="text-[#c8b88a] font-bold mb-1 flex items-center gap-1.5">
                  <UserX className="w-3.5 h-3.5 text-rose-400" />
                  3. БАЛАНС И УДЕРЖАНИЕ ВЕРТИКАЛИ (HONEST BALANCE)
                </h3>
                <p>
                  На каждом физическом тике прикладывается активный восстанавливающий момент:
                </p>
                <div className="bg-[#181520] p-2 rounded border border-[#2b2738] my-1 text-stone-200 font-mono text-[10px]">
                  τ_balance = k_balance · (n_current × n_up) - c_damp · ω
                </div>
                <p>
                  Персонаж буквально «напрягает мышцы кора», чтобы держать равновесие. При нажатии <b className="text-white">[R]</b> или сильном ударе k_balance обнуляется — герой <b>мгновенно обмякает мешком</b> на полу, а при повторном нажатии отжимается и встает на ноги!
                </p>
              </div>

              {/* 4. Ghost Rig */}
              <div>
                <h3 className="text-[#c8b88a] font-bold mb-1 flex items-center gap-1.5">
                  <Ghost className="w-3.5 h-3.5 text-cyan-400" />
                  4. МЕТОД «ПРИЗРАЧНОГО РИГА» (GHOST RIG) [G]
                </h3>
                <p>
                  Игрок управляет кинематическим «призраком» (Ghost Rig), который крутит целевые анимации ударов и ходьбы. Физический рэгдолл стремится за ним.
                  Если меч натыкается на манекен, рука <b>застревает и пружинит</b>, создавая реальное ощущение веса и сопротивления предметов!
                  Нажмите <b className="text-cyan-300">[G]</b>, чтобы включить неоновый каркас Призрачного рига.
                </p>
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-[#2a2632] flex justify-end">
              <button
                onClick={() => setShowHelpModal(false)}
                className="px-4 py-1.5 bg-[#25212e] hover:bg-[#322c3e] text-[#d8cfba] border border-[#423c4e] rounded transition-colors cursor-pointer"
              >
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
