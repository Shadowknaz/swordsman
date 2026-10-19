/**
 * Combat HUD Component
 * Displays real-time stance guard, Center-of-Mass poise, and strike telemetry.
 */

import React from 'react';
import { EngineUIState } from '../engine/GameEngine.ts';
import { Shield, Zap, Activity, Compass, Target, Crosshair, FastForward } from 'lucide-react';

interface CombatHUDProps {
  state: EngineUIState | null;
}

export const CombatHUD: React.FC<CombatHUDProps> = ({ state }) => {
  if (!state) return null;

  const guardLabels: Record<string, string> = {
    high: 'HIGH GUARD (OVERHEAD)',
    mid: 'MID GUARD (HORIZONTAL)',
    low: 'LOW GUARD (UNDERCUT / THRUST)',
  };

  const chamberLabel = state.stanceSide > 0 ? 'RIGHT CHAMBER' : 'LEFT CHAMBER';

  const stabilityColor =
    state.balanceStability > 70
      ? 'bg-emerald-500'
      : state.balanceStability > 40
      ? 'bg-amber-500'
      : 'bg-rose-600 animate-pulse';

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 p-4 md:p-6 flex flex-col md:flex-row justify-between items-start gap-4 select-none">
      {/* Top Left: Title, Guard & Poise Indicator */}
      <div className="bg-[#100e14]/85 border border-[#302c38] p-3 md:p-4 rounded shadow-2xl backdrop-blur-xs min-w-[290px]">
        <div className="flex items-center justify-between border-b border-[#25222c] pb-2 mb-2 gap-2">
          <div className="flex items-center gap-2">
            <h1 className="font-medieval text-sm md:text-base font-bold tracking-widest text-[#e8dfc8]">
              EXANIMA PS1
            </h1>
            <span className="text-[9px] tracking-wider px-1.5 py-0.5 rounded bg-[#1f1c24] text-[#a49ba8] border border-[#35313d]">
              PHYSICS V2.5
            </span>
          </div>

          {/* Target Lock Badge */}
          {state.isTargetLocked ? (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-600/70 flex items-center gap-1 animate-pulse">
              <Target className="w-3 h-3 text-amber-400" />
              LOCK-ON [QUINTAIN]
            </span>
          ) : (
            <span className="text-[10px] px-2 py-0.5 rounded bg-[#1a1722] text-[#8e8597] border border-[#302a3a] flex items-center gap-1">
              <Crosshair className="w-3 h-3 text-[#797083]" />
              FREE-AIM [F/Q]
            </span>
          )}
        </div>

        {/* Guard & Chamber */}
        <div className="space-y-1.5 text-xs">
          <div className="flex items-center justify-between text-[#8a8292]">
            <span className="flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-[#c8b88a]" />
              STANCE:
            </span>
            <span className="font-semibold text-[#d8cfba]">
              {guardLabels[state.guardZone] || 'MID GUARD'}
            </span>
          </div>

          <div className="flex items-center justify-between text-[#8a8292]">
            <span className="flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-[#9ab0d4]" />
              CHAMBER:
            </span>
            <span className="font-semibold text-[#c8d4e6]">{chamberLabel}</span>
          </div>

          {/* Animation Phase & Cancel Window */}
          <div className="flex items-center justify-between text-[#8a8292] pt-0.5">
            <span className="flex items-center gap-1.5">
              <FastForward className="w-3.5 h-3.5 text-[#60a5fa]" />
              ANIM PHASE:
            </span>
            <div>
              {state.attackPhase === 'startup' && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-950/70 text-yellow-400 border border-yellow-600">
                  STARTUP (WIND-UP)
                </span>
              )}
              {state.attackPhase === 'active' && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-950/80 text-rose-300 border border-rose-600 animate-pulse">
                  ACTIVE (STRIKE!)
                </span>
              )}
              {state.attackPhase === 'recovery' && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-500 animate-pulse">
                  RECOVERY (DODGE/GUARD CANCEL)
                </span>
              )}
              {state.attackPhase === 'idle' && (
                <span className="text-[10px] font-semibold text-[#a49ba8]">
                  READY
                </span>
              )}
            </div>
          </div>

          {/* Input Buffering Indicator */}
          {state.bufferedAction && (
            <div className="flex items-center justify-between text-[11px] bg-[#1a1728] px-2 py-0.5 rounded border border-indigo-700/60 text-indigo-300">
              <span>INPUT QUEUE (150ms):</span>
              <span className="font-mono font-bold animate-pulse text-indigo-200">
                {state.bufferedAction} QUEUED
              </span>
            </div>
          )}

          {/* Poise / Balance Stability Bar */}
          <div className="pt-1.5">
            <div className="flex justify-between items-center text-[11px] mb-1 text-[#8a8292]">
              <span className="flex items-center gap-1">
                <Activity className="w-3 h-3 text-emerald-400" />
                POISE / BALANCE:
              </span>
              <span className="font-mono text-[#dcd6c8]">
                {state.isStumbled ? 'STUMBLED!' : `${state.balanceStability}%`}
              </span>
            </div>
            <div className="w-full bg-[#1c1922] h-2 rounded-xs overflow-hidden border border-[#2b2734]">
              <div
                className={`h-full transition-all duration-100 ${stabilityColor}`}
                style={{ width: `${state.balanceStability}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Top Right: Strike Telemetry & Quintain Feedback */}
      <div className="bg-[#100e14]/85 border border-[#302c38] p-3 md:p-4 rounded shadow-2xl backdrop-blur-xs min-w-[260px] text-xs">
        <div className="flex items-center gap-1.5 text-[#c8b88a] font-semibold border-b border-[#25222c] pb-1.5 mb-2">
          <Zap className="w-3.5 h-3.5" />
          <span>IMPACT TELEMETRY</span>
        </div>

        {state.lastHit ? (
          <div className="space-y-1 font-mono text-[11px]">
            <div className="flex justify-between">
              <span className="text-[#8a8292]">BLADE ZONE:</span>
              <span
                className={`font-bold uppercase ${
                  state.lastHit.zone === 'sweetspot'
                    ? 'text-amber-400'
                    : state.lastHit.zone === 'point'
                    ? 'text-cyan-400'
                    : 'text-stone-400'
                }`}
              >
                {state.lastHit.zone}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#8a8292]">EDGE ALIGNMENT:</span>
              <span
                className={
                  state.lastHit.isFlat
                    ? 'text-rose-400 font-bold'
                    : 'text-emerald-400 font-bold'
                }
              >
                {state.lastHit.edgeAlignment}% {state.lastHit.isFlat ? '(FLAT SLAP)' : ''}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#8a8292]">KINETIC ENERGY:</span>
              <span className="text-[#dcd6c8]">{state.lastHit.kineticEnergy} J</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#8a8292]">IMPACT VELOCITY:</span>
              <span className="text-[#dcd6c8]">{state.lastHit.tipSpeed} m/s</span>
            </div>
          </div>
        ) : (
          <div className="text-[#655e6e] text-[11px] italic py-2">
            Swing or drag to strike the Quintain dummy...
          </div>
        )}

        {/* Quintain Swivel Speed */}
        <div className="mt-2 pt-2 border-t border-[#25222c] flex justify-between items-center text-[11px]">
          <span className="text-[#8a8292]">QUINTAIN SPIN:</span>
          <span
            className={`font-mono font-semibold ${
              state.flailSpinSpeed > 3.0 ? 'text-amber-400 animate-pulse' : 'text-[#a49ba8]'
            }`}
          >
            {state.flailSpinSpeed} rad/s
          </span>
        </div>
      </div>
    </div>
  );
};
