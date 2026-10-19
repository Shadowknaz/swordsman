/**
 * Arena Environment Entity
 * Encapsulates the medieval stone training diorama with:
 * 1. Subdivided floor grid (8 concentric rings + 28 radial segments) for authentic Gouraud vertex lighting.
 * 2. Baked Vertex Color Ambient Occlusion on pillars, pedestals, and perimeter walls.
 * 3. 7 Richly illuminated medieval torches encircling the arena (eliminating dark blind spots).
 * 4. Additive PS1 billboard light halos (THREE.AdditiveBlending) pulsing around torch braziers.
 */

import * as THREE from 'three';
import { ARENA_CONFIG } from '../config/combatConfig.ts';
import { RENDERING_CONFIG } from '../config/renderingConfig.ts';
import { applyPS1MaterialShader, applyVertexAO } from '../rendering/ps1Shader.ts';
import {
  createStoneFloorTexture,
  createPS1HaloTexture,
} from '../rendering/proceduralTextures.ts';

interface HaloItem {
  sprite: THREE.Sprite;
  baseScale: number;
}

export class Arena {
  public group = new THREE.Group();
  public torchLights: THREE.PointLight[] = [];
  public flameMeshes: THREE.Mesh[] = [];
  public haloSprites: HaloItem[] = [];

  constructor(scene: THREE.Scene) {
    const stoneFloorTex = createStoneFloorTexture();

    // 1. Base platform with Vertex AO
    const baseGeo = new THREE.CylinderGeometry(
      ARENA_CONFIG.RADIUS + 0.35,
      ARENA_CONFIG.RADIUS + 0.75,
      1.8,
      16,
      4
    );
    applyVertexAO(baseGeo, -0.9, 0.9, 0.28, true);

    const baseMat = applyPS1MaterialShader(
      new THREE.MeshLambertMaterial({
        map: stoneFloorTex,
        color: 0x96929e,
        flatShading: true,
        vertexColors: true,
      })
    );
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.position.y = ARENA_CONFIG.BASE_HEIGHT_OFFSET;
    this.group.add(baseMesh);

    // 2. Subdivided Stone Floor Top (8 rings x 28 sectors) for pure Gouraud vertex lighting
    const floorTopGeo = new THREE.RingGeometry(0.001, ARENA_CONFIG.RADIUS, 28, 8);
    floorTopGeo.rotateX(-Math.PI * 0.5);

    // Planar UV projection so stone floor tiles seamlessly across radial rings
    const posAttr = floorTopGeo.attributes.position;
    const uvs = new Float32Array(posAttr.count * 2);
    const floorColors = new Float32Array(posAttr.count * 3);

    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const z = posAttr.getZ(i);
      uvs[i * 2] = (x / (ARENA_CONFIG.RADIUS * 2) + 0.5) * 6.0;
      uvs[i * 2 + 1] = (z / (ARENA_CONFIG.RADIUS * 2) + 0.5) * 6.0;

      // Gentle perimeter ambient falloff towards arena rim
      const dist = Math.hypot(x, z);
      const rimFactor = Math.max(0, (dist - 3.8) / (ARENA_CONFIG.RADIUS - 3.8));
      const shade = 1.0 - rimFactor * 0.16;
      floorColors[i * 3] = shade;
      floorColors[i * 3 + 1] = shade * 0.98;
      floorColors[i * 3 + 2] = Math.min(1.0, shade * 1.02);
    }
    floorTopGeo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    floorTopGeo.setAttribute('color', new THREE.BufferAttribute(floorColors, 3));
    floorTopGeo.computeVertexNormals();

    const floorMat = applyPS1MaterialShader(
      new THREE.MeshLambertMaterial({
        map: stoneFloorTex,
        color: 0xdedae2, // Crisp, brightened stone slab to catch radiant torch light
        flatShading: true,
        vertexColors: true,
      })
    );
    const floorTopMesh = new THREE.Mesh(floorTopGeo, floorMat);
    floorTopMesh.position.y = 0.0;
    this.group.add(floorTopMesh);

    // Floor slab outer rim skirt
    const floorRimGeo = new THREE.CylinderGeometry(
      ARENA_CONFIG.RADIUS,
      ARENA_CONFIG.RADIUS + 0.15,
      0.24,
      28,
      2,
      true
    );
    applyVertexAO(floorRimGeo, -0.12, 0.12, 0.38, true);
    const floorRimMesh = new THREE.Mesh(floorRimGeo, floorMat);
    floorRimMesh.position.y = ARENA_CONFIG.FLOOR_HEIGHT_OFFSET;
    this.group.add(floorRimMesh);

    // 3. Curbstones around rim with baked vertex AO
    for (let i = 0; i < ARENA_CONFIG.CURB_COUNT; i++) {
      const curbGeo = new THREE.BoxGeometry(
        ARENA_CONFIG.CURB_SIZE.width,
        ARENA_CONFIG.CURB_SIZE.height,
        ARENA_CONFIG.CURB_SIZE.depth
      );
      applyVertexAO(curbGeo, -ARENA_CONFIG.CURB_SIZE.height * 0.5, ARENA_CONFIG.CURB_SIZE.height * 0.5, 0.32, true);

      const theta = (i / ARENA_CONFIG.CURB_COUNT) * Math.PI * 2;
      const curb = new THREE.Mesh(curbGeo, baseMat);
      curb.position.set(
        Math.sin(theta) * (ARENA_CONFIG.RADIUS - 0.12),
        0.08,
        Math.cos(theta) * (ARENA_CONFIG.RADIUS - 0.12)
      );
      curb.rotation.y = theta + ((i % 2) * 0.03 - 0.015);
      this.group.add(curb);
    }

    // 4. Pillars, Standing Braziers & Additive Halos
    const ironMat = applyPS1MaterialShader(
      new THREE.MeshLambertMaterial({
        color: 0x2e2c34,
        flatShading: true,
        vertexColors: true,
      })
    );
    const flameMat = applyPS1MaterialShader(
      new THREE.MeshBasicMaterial({ color: 0xffcc44 })
    );

    ARENA_CONFIG.PILLAR_POSITIONS.forEach((p) => {
      // Column with contact grounding AO
      const pGeo = new THREE.CylinderGeometry(0.42, 0.48, p.height, 8, 4);
      applyVertexAO(pGeo, -p.height * 0.5, p.height * 0.5, 0.25, true);
      const pMesh = new THREE.Mesh(pGeo, baseMat);
      pMesh.position.set(p.x, p.height * 0.5, p.z);
      this.group.add(pMesh);

      // Plinth
      const plinthGeo = new THREE.BoxGeometry(1.1, 0.35, 1.1);
      applyVertexAO(plinthGeo, -0.175, 0.175, 0.3, true);
      const plinth = new THREE.Mesh(plinthGeo, floorMat);
      plinth.position.set(p.x, 0.17, p.z);
      this.group.add(plinth);

      if (p.hasTorch) {
        // Torch Stand / Iron Brazier pedestal
        const tx = p.x * 0.86;
        const tz = p.z * 0.86;
        const standHeight = 1.35;

        const standGeo = new THREE.CylinderGeometry(0.08, 0.24, standHeight, 6, 3);
        applyVertexAO(standGeo, -standHeight * 0.5, standHeight * 0.5, 0.2, true);
        const stand = new THREE.Mesh(standGeo, ironMat);
        stand.position.set(tx, standHeight * 0.5, tz);
        this.group.add(stand);

        // Iron Brazier Bowl
        const bowlGeo = new THREE.CylinderGeometry(0.34, 0.16, 0.24, 6, 1);
        applyVertexAO(bowlGeo, -0.12, 0.12, 0.25, true);
        const bowl = new THREE.Mesh(bowlGeo, ironMat);
        bowl.position.set(tx, standHeight + 0.1, tz);
        this.group.add(bowl);

        // Polygonal Flame
        const flameGeo = new THREE.OctahedronGeometry(0.24, 0);
        const flame = new THREE.Mesh(flameGeo, flameMat);
        flame.position.set(tx, standHeight + 0.36, tz);
        this.group.add(flame);
        this.flameMeshes.push(flame);

        // Torch PointLight: high-intensity, gentle decay, elevated for full arena floor coverage
        const torchColor = p.torchColor || ARENA_CONFIG.TORCH.LIGHT_COLOR;
        const tLight = new THREE.PointLight(
          torchColor,
          ARENA_CONFIG.TORCH.LIGHT_INTENSITY,
          ARENA_CONFIG.TORCH.LIGHT_DISTANCE,
          ARENA_CONFIG.TORCH.LIGHT_DECAY
        );
        tLight.position.set(tx, standHeight + 0.65, tz);
        this.group.add(tLight);
        this.torchLights.push(tLight);

        // Additive PS1 Light Halo Billboard (THREE.AdditiveBlending, depthWrite: false)
        const isCrimson = torchColor === 0xff6622;
        const haloTex = createPS1HaloTexture(
          255,
          isCrimson ? 145 : 205,
          isCrimson ? 50 : 85,
          isCrimson ? 200 : 225,
          isCrimson ? 45 : 75,
          10
        );
        const haloMat = new THREE.SpriteMaterial({
          map: haloTex,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          transparent: true,
          opacity: 0.9,
        });
        const haloSprite = new THREE.Sprite(haloMat);
        haloSprite.position.set(tx, standHeight + 0.38, tz);
        const baseScale = p.haloSize || 1.6;
        haloSprite.scale.set(baseScale, baseScale, baseScale);
        this.group.add(haloSprite);
        this.haloSprites.push({ sprite: haloSprite, baseScale });
      }
    });

    // 5. Scene Lighting (Balanced Atmospheric Fill + Moonlit Overhead Key)
    const ambientLight = new THREE.AmbientLight(
      RENDERING_CONFIG.LIGHTING.AMBIENT_COLOR,
      RENDERING_CONFIG.LIGHTING.AMBIENT_INTENSITY
    );
    this.group.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(
      RENDERING_CONFIG.LIGHTING.HEMI_SKY_COLOR,
      RENDERING_CONFIG.LIGHTING.HEMI_GROUND_COLOR,
      RENDERING_CONFIG.LIGHTING.HEMI_INTENSITY
    );
    this.group.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(
      RENDERING_CONFIG.LIGHTING.DIR_LIGHT_COLOR,
      RENDERING_CONFIG.LIGHTING.DIR_LIGHT_INTENSITY
    );
    dirLight.position.set(
      RENDERING_CONFIG.LIGHTING.DIR_LIGHT_POS.x,
      RENDERING_CONFIG.LIGHTING.DIR_LIGHT_POS.y,
      RENDERING_CONFIG.LIGHTING.DIR_LIGHT_POS.z
    );
    this.group.add(dirLight);

    scene.add(this.group);
  }

  public update(dt: number, elapsed: number): void {
    for (let i = 0; i < this.torchLights.length; i++) {
      const flicker =
        Math.sin(elapsed * 12.0 + i * 2.7) * 0.14 +
        Math.cos(elapsed * 19.0 + i * 1.9) * 0.09;

      // Radiant torch flicker that keeps chamber vividly illuminated
      this.torchLights[i].intensity = Math.max(
        2.5,
        ARENA_CONFIG.TORCH.LIGHT_INTENSITY + flicker * 2.8
      );

      const flame = this.flameMeshes[i];
      if (flame) {
        flame.scale.set(
          1.0 + flicker * 0.7,
          1.0 + Math.sin(elapsed * 16.0 + i) * 0.22,
          1.0 + flicker * 0.7
        );
        flame.rotation.y += dt * 3.5;
      }

      // Additive halo breathing with torch intensity
      const halo = this.haloSprites[i];
      if (halo) {
        const scaleFlicker = halo.baseScale * (1.0 + flicker * 0.25);
        halo.sprite.scale.set(scaleFlicker, scaleFlicker, scaleFlicker);
        (halo.sprite.material as THREE.SpriteMaterial).opacity = Math.max(
          0.5,
          Math.min(1.0, 0.85 + flicker * 0.35)
        );
      }
    }
  }

  public dispose(): void {
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Sprite) {
        if ('geometry' in obj && obj.geometry) {
          obj.geometry.dispose();
        }
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else if (obj.material) {
          obj.material.dispose();
        }
      }
    });
  }
}
