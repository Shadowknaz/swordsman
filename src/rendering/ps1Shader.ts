/**
 * PS1 Material & Vertex Shader Extension
 * Implements:
 * 1. Affine vertex wobble and screen-space coordinate grid snapping (GTE emulation).
 * 2. 15-bit color banding and screen-space 4x4 Bayer dithering on lighting and fog falloff.
 * 3. Procedural Vertex Color Ambient Occlusion (Vertex AO) utility.
 */

import * as THREE from 'three';
import { RENDERING_CONFIG } from '../config/renderingConfig.ts';

/**
 * Extends any Three.js material to use PS1 vertex snapping and 15-bit dithered lighting.
 */
export function applyPS1MaterialShader<T extends THREE.Material>(
  material: T,
  snapResX = RENDERING_CONFIG.PS1_SNAP_RESOLUTION.X,
  snapResY = RENDERING_CONFIG.PS1_SNAP_RESOLUTION.Y
): T {
  material.onBeforeCompile = (shader) => {
    // 1. Vertex Snapping (GTE integer truncation simulation)
    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      `
      vec4 mvPosition = modelViewMatrix * vec4( transformed, 1.0 );
      gl_Position = projectionMatrix * mvPosition;
      vec2 ps1Grid = vec2(${snapResX.toFixed(1)}, ${snapResY.toFixed(1)});
      gl_Position.xy = floor(gl_Position.xy / gl_Position.w * ps1Grid + 0.5) / ps1Grid * gl_Position.w;
      `
    );

    // 2. Fragment Dithering & 15-bit quantization (5-bit per RGB channel = 32 levels)
    // Applied to lit surface and fog in screen space
    const bayerHeader = `
      float bayer4x4(vec2 pos) {
        int x = int(mod(pos.x, 4.0));
        int y = int(mod(pos.y, 4.0));
        int index = x + y * 4;
        if (index == 0) return 0.0/16.0; if (index == 1) return 8.0/16.0; if (index == 2) return 2.0/16.0; if (index == 3) return 10.0/16.0;
        if (index == 4) return 12.0/16.0; if (index == 5) return 4.0/16.0; if (index == 6) return 14.0/16.0; if (index == 7) return 6.0/16.0;
        if (index == 8) return 3.0/16.0; if (index == 9) return 11.0/16.0; if (index == 10) return 1.0/16.0; if (index == 11) return 9.0/16.0;
        if (index == 12) return 15.0/16.0; if (index == 13) return 7.0/16.0; if (index == 14) return 13.0/16.0; return 5.0/16.0;
      }
    `;

    shader.fragmentShader = `${bayerHeader}\n${shader.fragmentShader}`;

    if (shader.fragmentShader.includes('#include <dithering_fragment>')) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `
        #include <dithering_fragment>
        // Apply PS1 15-bit quantization and dither to lit pixel & fog
        float ps1Dither = (bayer4x4(gl_FragCoord.xy) - 0.5) / 32.0;
        gl_FragColor.rgb = max(vec3(0.0), floor((gl_FragColor.rgb + ps1Dither) * 31.0 + 0.5) / 31.0);
        `
      );
    } else {
      // Fallback for materials without dithering_fragment chunk
      shader.fragmentShader = shader.fragmentShader.replace(
        /}\s*$/,
        `
        float ps1Dither = (bayer4x4(gl_FragCoord.xy) - 0.5) / 32.0;
        gl_FragColor.rgb = max(vec3(0.0), floor((gl_FragColor.rgb + ps1Dither) * 31.0 + 0.5) / 31.0);
        }
        `
      );
    }
  };

  return material;
}

/**
 * Backward compatibility alias for applyPS1MaterialShader
 */
export const applyPS1VertexShader = applyPS1MaterialShader;

/**
 * Bakes dirty contact ambient occlusion into vertex colors.
 * Gives grounds, column bases, and joints authentic PS1 depth without dynamic shadow maps.
 */
export function applyVertexAO(
  geometry: THREE.BufferGeometry,
  minY: number,
  maxY: number,
  minLight = 0.25,
  coldTint = true
): THREE.BufferGeometry {
  const pos = geometry.attributes.position;
  if (!pos) return geometry;

  const count = pos.count;
  const colors = new Float32Array(count * 3);
  const range = Math.max(0.0001, maxY - minY);

  for (let i = 0; i < count; i++) {
    const y = pos.getY(i);
    const t = Math.max(0, Math.min(1, (y - minY) / range));
    const shade = minLight + t * (1.0 - minLight);

    colors[i * 3] = shade;
    colors[i * 3 + 1] = coldTint ? shade * 0.95 : shade; // Subtle cold shadow tint
    colors[i * 3 + 2] = coldTint ? Math.min(1.0, shade * 1.05) : shade;
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

/**
 * Ensures geometry has a neutral white color attribute when using vertexColors: true
 */
export function ensureDefaultVertexColors(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = geometry.attributes.position;
  if (!pos) return geometry;

  if (!geometry.attributes.color) {
    const colors = new Float32Array(pos.count * 3);
    colors.fill(1.0);
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }
  return geometry;
}
