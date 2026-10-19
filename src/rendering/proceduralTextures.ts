/**
 * Procedural PS1 Textures with Bayer 4x4 Dithering & 15-bit Color Quantization
 * Implements DRY texture pipeline with zero 404 image dependencies.
 */

import * as THREE from 'three';
import { BAYER_MATRIX_4X4, RENDERING_CONFIG } from '../config/renderingConfig.ts';

type PixelShaderFn = (
  x: number,
  y: number,
  width: number,
  height: number,
  ditherValue: number
) => [number, number, number];

/**
 * DRY helper that renders a procedural texture, applies 4x4 Bayer dithering,
 * and quantizes RGB to 5-bit (32 discrete shades per channel like the PS1).
 */
export function generateQuantizedDitherTexture(
  width: number,
  height: number,
  drawPixel: PixelShaderFn
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return new THREE.CanvasTexture(canvas);
  }

  const imgData = ctx.createImageData(width, height);
  const data = imgData.data;
  const step = 256 / RENDERING_CONFIG.COLOR_QUANTIZE_LEVELS;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const dither = (BAYER_MATRIX_4X4[y % 4][x % 4] / 16.0 - 0.5) * 18.0;
      const [r, g, b] = drawPixel(x, y, width, height, dither);

      // Quantize to 5-bit color channels
      data[idx] = Math.min(255, Math.max(0, Math.floor((r + dither) / step) * step));
      data[idx + 1] = Math.min(255, Math.max(0, Math.floor((g + dither) / step) * step));
      data[idx + 2] = Math.min(255, Math.max(0, Math.floor((b + dither) / step) * step));
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createStoneFloorTexture(): THREE.CanvasTexture {
  const tex = generateQuantizedDitherTexture(64, 64, (x, y) => {
    const tileY = y % 16;
    const brickOffset = (Math.floor(y / 16) % 2) * 8;
    const bx = (x + brickOffset) % 16;
    const isMortar = bx === 0 || tileY === 0;
    const cellSeed = ((Math.floor((x + brickOffset) / 16) * 37 + Math.floor(y / 16) * 73) % 19) - 9;
    const noise = ((x * 13 ^ y * 29) % 11) - 5;
    if (isMortar) return [24, 22, 27];
    const base = 62 + cellSeed + noise;
    return [base, base - 2, base + 4];
  });
  tex.repeat.set(6, 6);
  return tex;
}

export function createWoodTexture(): THREE.CanvasTexture {
  return generateQuantizedDitherTexture(32, 32, (x, y) => {
    const grain = Math.sin(x * 0.7 + Math.sin(y * 0.25) * 2.0) * 14;
    const dark = ((x * 7 + y * 3) % 9) - 4;
    return [108 + grain + dark, 72 + grain * 0.7 + dark, 42 + grain * 0.4];
  });
}

export function createArmorMetalTexture(): THREE.CanvasTexture {
  return generateQuantizedDitherTexture(32, 32, (x, y) => {
    const rivets = x % 15 === 2 && y % 15 === 2 ? 35 : 0;
    const scratch = ((x * 19 ^ y * 7) % 15) - 7;
    const v = 96 + scratch + rivets;
    return [v, v + 3, v + 8];
  });
}

export function createBurlapTexture(): THREE.CanvasTexture {
  return generateQuantizedDitherTexture(32, 32, (x, y) => {
    const weave = (x + y) % 2 === 0 ? 10 : -10;
    return [138 + weave, 112 + weave, 74 + weave];
  });
}

export function createBlobShadowTexture(): THREE.CanvasTexture {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  const imgData = ctx.createImageData(size, size);
  const data = imgData.data;
  const half = size * 0.5;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const dx = (x + 0.5 - half) / half;
      const dy = (y + 0.5 - half) / half;
      const distSq = dx * dx + dy * dy;
      const falloff = Math.max(0, 1.0 - distSq);
      const threshold = BAYER_MATRIX_4X4[y % 4][x % 4] / 16.0;
      const alpha = falloff * 0.85 > threshold ? Math.floor(falloff * 175) : 0;
      data[idx] = 6;
      data[idx + 1] = 5;
      data[idx + 2] = 10;
      data[idx + 3] = alpha;
    }
  }
  ctx.putImageData(imgData, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

/**
 * PS1 Additive Light Halo Texture (32x32)
 * Radial torch glow with 4x4 Bayer dithering for PS1 style billboard halos.
 */
export function createPS1HaloTexture(
  innerR = 255,
  innerG = 175,
  innerB = 60,
  outerR = 220,
  outerG = 65,
  outerB = 10
): THREE.CanvasTexture {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  const imgData = ctx.createImageData(size, size);
  const data = imgData.data;
  const half = size * 0.5;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const dx = (x + 0.5 - half) / half;
      const dy = (y + 0.5 - half) / half;
      const dist = Math.hypot(dx, dy);

      if (dist >= 1.0) {
        data[idx] = 0;
        data[idx + 1] = 0;
        data[idx + 2] = 0;
        data[idx + 3] = 0;
        continue;
      }

      // Smoothstep falloff with PS1 Bayer dithering
      const falloff = Math.pow(Math.max(0, 1.0 - dist), 1.5);
      const bayer = (BAYER_MATRIX_4X4[y % 4][x % 4] / 16.0 - 0.5) * 0.14;
      const t = Math.max(0, Math.min(1, falloff + bayer));

      // Color lerp from outer to inner
      const r = Math.round(outerR + (innerR - outerR) * t);
      const g = Math.round(outerG + (innerG - outerG) * t);
      const b = Math.round(outerB + (innerB - outerB) * t);
      const alpha = Math.round(t * 220);

      // Quantize to 5-bit color steps (PS1 15-bit palette)
      const step = 8;
      data[idx] = Math.min(255, Math.floor(r / step) * step);
      data[idx + 1] = Math.min(255, Math.floor(g / step) * step);
      data[idx + 2] = Math.min(255, Math.floor(b / step) * step);
      data[idx + 3] = alpha;
    }
  }

  ctx.putImageData(imgData, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * PS1 Additive Metal Spark Flash Texture (32x32)
 * High-intensity star/radial flash for metal parries and blade impacts.
 */
export function createPS1SparkHaloTexture(): THREE.CanvasTexture {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  const imgData = ctx.createImageData(size, size);
  const data = imgData.data;
  const half = size * 0.5;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const dx = Math.abs(x + 0.5 - half) / half;
      const dy = Math.abs(y + 0.5 - half) / half;
      const dist = Math.hypot(dx, dy);

      // Diamond / cross flare + radial core
      const cross = Math.max(0, 1.0 - (dx * 3.5 + dy * 0.6)) + Math.max(0, 1.0 - (dy * 3.5 + dx * 0.6));
      const radial = Math.pow(Math.max(0, 1.0 - dist * 1.2), 2.0);
      const intensity = Math.min(1.0, radial * 0.75 + cross * 0.45);

      if (intensity <= 0.05) {
        data[idx] = 0;
        data[idx + 1] = 0;
        data[idx + 2] = 0;
        data[idx + 3] = 0;
        continue;
      }

      const bayer = (BAYER_MATRIX_4X4[y % 4][x % 4] / 16.0 - 0.5) * 0.12;
      const t = Math.max(0, Math.min(1, intensity + bayer));

      // Crisp gold-white flash
      const r = 255;
      const g = Math.round(210 + t * 45);
      const b = Math.round(110 + t * 145);
      const alpha = Math.round(t * 255);

      const step = 8;
      data[idx] = Math.min(255, Math.floor(r / step) * step);
      data[idx + 1] = Math.min(255, Math.floor(g / step) * step);
      data[idx + 2] = Math.min(255, Math.floor(b / step) * step);
      data[idx + 3] = alpha;
    }
  }

  ctx.putImageData(imgData, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

