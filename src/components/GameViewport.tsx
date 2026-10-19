/**
 * Game Viewport Component
 * Mounts the WebGL canvas in a dedicated ref container.
 * Renders pure, immersive full-screen 3D viewport without any 2D UI overlay.
 */

import React, { useEffect, useRef } from 'react';
import { GameEngine } from '../engine/GameEngine.ts';

export const GameViewport: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GameEngine | null>(null);

  useEffect(() => {
    if (!mountRef.current) return;

    const engine = new GameEngine(mountRef.current);
    engineRef.current = engine;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyM') {
        engine.audio.setMuted(!engine.audio.getMuted());
      }
      if (e.code === 'KeyR') {
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

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#22202a]">
      {/* Pure, immersive 3D WebGL canvas container */}
      <div
        ref={mountRef}
        className="w-full h-full cursor-none focus:outline-hidden"
        data-testid="threejs-canvas-viewport"
      />
    </div>
  );
};
