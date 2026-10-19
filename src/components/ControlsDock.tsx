/**
 * Collapsible Bottom Control Dock
 * Conforms to Three.js UX directives: unobtrusive bottom pinned dock with collapse/expand toggle.
 */

import React, { useState } from 'react';
import { Volume2, VolumeX, RotateCcw, ChevronDown, ChevronUp, MousePointer, Info, X, Target } from 'lucide-react';

interface ControlsDockProps {
  isMuted: boolean;
  onToggleMute: () => void;
  onResetDummy: () => void;
  isTargetLocked?: boolean;
  onToggleTargetLock?: () => void;
}

export const ControlsDock: React.FC<ControlsDockProps> = ({
  isMuted,
  onToggleMute,
  onResetDummy,
  isTargetLocked = false,
  onToggleTargetLock,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);

  return (
    <>
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center select-none max-w-[94vw] w-auto pointer-events-auto">
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
          <div className="bg-[#100e14]/92 border border-[#302c38] p-2.5 md:p-3 rounded-lg shadow-2xl flex flex-wrap items-center justify-center gap-2 md:gap-3 text-xs font-mono">
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
                <span>{isTargetLocked ? 'TARGET: LOCKED' : 'LOCK-ON [F/Q]'}</span>
              </button>
            )}

            {/* Audio Toggle */}
            <button
              onClick={onToggleMute}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1b1822] hover:bg-[#25212e] text-[#d8cfba] border border-[#332e3d] rounded transition-colors cursor-pointer active:scale-95"
              aria-label={isMuted ? 'Unmute procedural sound engine' : 'Mute procedural sound engine'}
            >
              {isMuted ? (
                <>
                  <VolumeX className="w-4 h-4 text-rose-400" />
                  <span>UNMUTE AUDIO</span>
                </>
              ) : (
                <>
                  <Volume2 className="w-4 h-4 text-emerald-400" />
                  <span>MUTE AUDIO</span>
                </>
              )}
            </button>

            {/* Reset Dummy */}
            <button
              onClick={onResetDummy}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1b1822] hover:bg-[#25212e] text-[#d8cfba] border border-[#332e3d] rounded transition-colors cursor-pointer active:scale-95"
              aria-label="Reset Quintain Dummy Position"
            >
              <RotateCcw className="w-3.5 h-3.5 text-[#9ab0d4]" />
              <span>RESET QUINTAIN</span>
            </button>

            {/* Quick Controls Cheat-Pill */}
            <div className="hidden lg:flex items-center gap-3 px-3 py-1 bg-[#0c0a0f] border border-[#232029] rounded text-[11px] text-[#8a8292]">
              <span><b className="text-[#d8cfba]">WASD:</b> Move / Strafe</span>
              <span><b className="text-[#d8cfba]">Space:</b> Dodge (Cancels Recovery)</span>
              <span><b className="text-[#d8cfba]">F/Q/Z:</b> Lock-On</span>
              <span><b className="text-[#d8cfba]">LMB/RMB:</b> Strike / Thrust (Buffered)</span>
            </div>

            {/* Help / Mechanics Modal Trigger */}
            <button
              onClick={() => setShowHelpModal(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#1b1822] hover:bg-[#25212e] text-[#c8b88a] border border-[#332e3d] rounded transition-colors cursor-pointer active:scale-95"
              aria-label="Open Combat Mechanics Guide"
            >
              <Info className="w-3.5 h-3.5" />
              <span>GUIDE</span>
            </button>
          </div>
        )}
      </div>

      {/* Mechanics & Controls Help Dialog */}
      {showHelpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs select-none">
          <div className="bg-[#121017] border border-[#35313d] max-w-lg w-full p-5 md:p-6 rounded-lg shadow-2xl text-stone-300 font-mono text-xs max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#2a2632] pb-3 mb-4">
              <h2 className="font-medieval text-base font-bold text-[#e8dfc8] flex items-center gap-2">
                <MousePointer className="w-4 h-4 text-[#c8b88a]" />
                EXANIMA COMBAT & KINEMATICS GUIDE
              </h2>
              <button
                onClick={() => setShowHelpModal(false)}
                className="text-stone-400 hover:text-white p-1 border border-[#35313d] rounded hover:bg-[#201d27] cursor-pointer flex items-center justify-center transition-colors"
                aria-label="Close Guide"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-3.5 text-[11px] leading-relaxed text-[#a49ba8]">
              <div>
                <h3 className="text-[#c8b88a] font-bold mb-1">1. 100-150ms INPUT BUFFERING (QUEUE)</h3>
                <p>
                  Pressing strike, thrust, or dodge during an active attack or right before recovery ends is automatically queued
                  in a 150ms buffer. You no longer need frame-perfect timing: the action triggers on the next available frame,
                  producing fluid combo chains and responsive evasions.
                </p>
              </div>

              <div>
                <h3 className="text-[#c8b88a] font-bold mb-1">2. THREE-PHASE ATTACKS & ANIMATION CANCELING</h3>
                <p>
                  All strikes are split into three deterministic phases:
                </p>
                <ul className="list-disc list-inside mt-1 space-y-0.5 text-stone-300">
                  <li><b className="text-yellow-400">Startup (Замах):</b> Wind-up and chambering. Weapon does not inflict collision damage yet.</li>
                  <li><b className="text-rose-400">Active (Удар):</b> Full kinetic damage window. Swept blade collision samples blade velocity and edge alignment.</li>
                  <li><b className="text-cyan-400">Recovery (Возврат):</b> Follow-through return to stance. <b>Can be immediately canceled into a Dodge (Space) or Guard (RMB)</b> to escape counter-attacks!</li>
                </ul>
              </div>

              <div>
                <h3 className="text-[#c8b88a] font-bold mb-1">3. Z-TARGETING LOCK-ON & STRAFING (F / Q / Z)</h3>
                <p>
                  Press <b className="text-[#d8cfba]">F, Q, Z</b> or <b className="text-[#d8cfba]">Middle Click</b> to engage retro Z-Targeting:
                </p>
                <ul className="list-disc list-inside mt-1 space-y-0.5 text-stone-300">
                  <li>The camera orbits behind the knight facing the target in classic retro PS1 / Souls perspective.</li>
                  <li>Facing direction locks firmly to the Quintain dummy.</li>
                  <li><b>W / S:</b> Advance directly towards or retreat away from the target.</li>
                  <li><b>A / D:</b> Circling strafe around the target along its perimeter.</li>
                  <li><b>Space + A / D:</b> Circling dodge roll around the target.</li>
                </ul>
              </div>

              <div>
                <h3 className="text-[#c8b88a] font-bold mb-1">4. RADIAL GUARD, CHAMBERING & SWEPT COLLISIONS</h3>
                <p>
                  Move your 3D cursor close to knight for high guard (overhead), medium distance for side guard (cleave),
                  or far distance for low guard (undercut/thrust). Striking with proper edge alignment inflicts high kinetic energy cut decals;
                  misaligned hits flat-slap and ricochet.
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
