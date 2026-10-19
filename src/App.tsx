/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { GameViewport } from './components/GameViewport.tsx';

export default function App() {
  return (
    <main className="w-full h-full relative overflow-hidden bg-[#08070a]">
      <GameViewport />
    </main>
  );
}
