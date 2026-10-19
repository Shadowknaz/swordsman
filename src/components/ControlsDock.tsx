/**
 * Collapsible Bottom Control Dock
 * Conforms to Three.js UX directives: unobtrusive bottom pinned dock with collapse/expand toggle.
 */

import React, { useState } from 'react';
import { Volume2, VolumeX, RotateCcw, ChevronDown, ChevronUp, MousePointer, Info, X } from 'lucide-react';

interface ControlsDockProps {
  isMuted: boolean;
  onToggleMute: () => void;
  onResetDummy: () => void;
}

export const ControlsDock: React.FC<ControlsDockProps> = ({
  isMuted,
  onToggleMute,
  onResetDummy,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);

  return (
    <>
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center select-none max-w-[94vw] w-auto">
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
          <div className="bg-[#100e14]/92 border border-[#302c38] p-2.5 md:p-3 rounded-lg shadow-2xl flex flex-wrap items-center justify-center gap-2 md:gap-4 text-xs font-mono">
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
              <span><b className="text-[#d8cfba]">WASD:</b> Move</span>
              <span><b className="text-[#d8cfba]">Space:</b> Dodge</span>
              <span><b className="text-[#d8cfba]">LMB Drag:</b> Cleave / Slash</span>
              <span><b className="text-[#d8cfba]">RMB:</b> Thrust</span>
              <span><b className="text-[#d8cfba]">LMB+RMB:</b> Overhead</span>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs select-none">
          <div className="bg-[#121017] border border-[#35313d] max-w-lg w-full p-5 md:p-6 rounded-lg shadow-2xl text-stone-300 font-mono text-xs max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#2a2632] pb-3 mb-4">
              <h2 className="font-medieval text-base font-bold text-[#e8dfc8] flex items-center gap-2">
                <MousePointer className="w-4 h-4 text-[#c8b88a]" />
                EXANIMA COMBAT MECHANICS
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
                <h3 className="text-[#c8b88a] font-bold mb-1">1. RADIAL GUARD & CHAMBERING</h3>
                <p>
                  Sword stance is driven by the 3D cursor position relative to your knight:
                </p>
                <ul className="list-disc list-inside mt-1 space-y-0.5 text-stone-300">
                  <li><b>Near (R &lt; 1.3m):</b> High Guard (Chambered for Overhead Chop)</li>
                  <li><b>Mid (1.3m - 2.45m):</b> Classic Side Guard (Horizontal Cleave)</li>
                  <li><b>Far (R &gt; 2.45m):</b> Low / Point Guard (Undercut &amp; Thrust)</li>
                </ul>
              </div>

              <div>
                <h3 className="text-[#c8b88a] font-bold mb-1">2. TWO-PHASE GESTURE DRAG &amp; STRIKE</h3>
                <p>
                  Hold LMB and drag across the arena to build angular momentum. Fast flicks unleash dynamic cuts.
                  Release LMB to commit. Pulling toward hero unleashes an overhead smash; pushing diagonally unleashes an undercut.
                </p>
              </div>

              <div>
                <h3 className="text-[#c8b88a] font-bold mb-1">3. SWEPT BLADE COLLISION &amp; EDGE ALIGNMENT</h3>
                <p>
                  The sword blade is sampled continuously along its length. Striking with the edge deals sharp kinetic cut damage,
                  while misaligned strikes produce a dull &quot;flat slap&quot; that bounces off.
                </p>
              </div>

              <div>
                <h3 className="text-[#c8b88a] font-bold mb-1">4. POISE &amp; THE QUINTAIN COUNTERWEIGHT</h3>
                <p>
                  Striking the dummy spins its crossbar. Beware the heavy counterweight flail! If it spins fast,
                  parry it with your blade or dodge backward (Space / Alt) to prevent losing balance.
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
