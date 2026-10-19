import React, { useEffect, useRef, useState } from 'react';
import { GameEngine, EngineUIState } from '../engine/GameEngine.ts';
import { CombatHUD } from './CombatHUD.tsx';
import { ControlsDock } from './ControlsDock.tsx';

export const GameViewport: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [uiState, setUiState] = useState<EngineUIState | null>(null);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    if (!mountRef.current) return;

    const engine = new GameEngine(mountRef.current);
    engineRef.current = engine;
    engine.onStateUpdate = (state) => {
      setUiState(state);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyM') {
        const next = !engine.audio.getMuted();
        engine.audio.setMuted(next);
        setIsMuted(next);
      }
      if (e.code === 'KeyR') {
        engine.toggleRagdoll();
      }
      if (e.code === 'KeyG') {
        engine.toggleGhostRig();
      }
      if (e.code === 'KeyT') {
        engine.resetDummy();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const handleToggleMute = () => {
    if (!engineRef.current) return;
    const next = !engineRef.current.audio.getMuted();
    engineRef.current.audio.setMuted(next);
    setIsMuted(next);
  };

  const handleResetDummy = () => {
    engineRef.current?.resetDummy();
  };

  const handleToggleTargetLock = () => {
    engineRef.current?.toggleTargetLock();
  };

  const handleToggleRagdoll = () => {
    engineRef.current?.toggleRagdoll();
  };

  const handleToggleGhostRig = () => {
    engineRef.current?.toggleGhostRig();
  };

  const handleSetRagdollPreset = (preset: 'gang_beasts' | 'human_fall_flat' | 'iron_knight') => {
    engineRef.current?.setRagdollPreset(preset);
  };

  const handleSetRagdollTuning = (kp: number, kd: number, kBalance: number) => {
    engineRef.current?.setRagdollTuning(kp, kd, kBalance);
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#22202a]">
      {/* 3D WebGL canvas container */}
      <div
        ref={mountRef}
        className="w-full h-full focus:outline-hidden"
        data-testid="threejs-canvas-viewport"
      />

      {/* Combat HUD telemetry and stance display */}
      <CombatHUD state={uiState} />

      {/* Collapsible bottom controls dock */}
      <ControlsDock
        isMuted={isMuted}
        onToggleMute={handleToggleMute}
        onResetDummy={handleResetDummy}
        isTargetLocked={uiState?.isTargetLocked ?? false}
        onToggleTargetLock={handleToggleTargetLock}
        ragdollState={uiState?.ragdollState}
        isGhostVisible={uiState?.isGhostVisible}
        kp={uiState?.kp}
        kd={uiState?.kd}
        kBalance={uiState?.kBalance}
        onToggleRagdoll={handleToggleRagdoll}
        onToggleGhostRig={handleToggleGhostRig}
        onSetRagdollPreset={handleSetRagdollPreset}
        onSetRagdollTuning={handleSetRagdollTuning}
      />
    </div>
  );
};
