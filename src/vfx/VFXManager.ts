/**
 * VFX and Visual Feedback Manager
 * Handles zero-GC particle object pooling, sword cut decals, motion trail ribbon,
 * 3D floor cursor marker, screen shake, additive spark billboard, and dynamic point light flashes.
 */

import * as THREE from 'three';
import { VFX_CONFIG } from '../config/combatConfig.ts';
import { RENDERING_CONFIG } from '../config/renderingConfig.ts';
import { applyPS1MaterialShader } from '../rendering/ps1Shader.ts';
import { createPS1SparkHaloTexture } from '../rendering/proceduralTextures.ts';
import { GuardZone } from '../physics/combatMath.ts';

interface Particle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
}

interface TrailNode {
  tip: THREE.Vector3;
  base: THREE.Vector3;
  active: boolean;
}

export class VFXManager {
  private scene: THREE.Scene;
  private particlePool: Particle[] = [];
  private decalPool: THREE.Mesh[] = [];
  private decalIndex = 0;

  private woodMat: THREE.Material;
  private metalMat: THREE.Material;
  private flatHitMat: THREE.Material;

  // Dynamic metal spark flash point light and additive billboard sprite
  public sparkPointLight: THREE.PointLight;
  private sparkLightTimer = 0;
  private sparkSprite: THREE.Sprite;
  private sparkSpriteTimer = 0;

  // Sword motion ribbon trail
  private trailMesh: THREE.Mesh | null = null;
  private trailHistory: TrailNode[] = [];

  // Ground 3D Cursor Marker
  public cursorMarker: THREE.Group;
  private cursorRingMesh: THREE.Mesh;
  private cursorRingMat: THREE.MeshBasicMaterial;
  private cursorStanceTick: THREE.Mesh;

  // Screen shake
  public screenShake = 0;

  // Z-Targeting Lock-On Reticle
  public lockReticleGroup: THREE.Group;
  private lockRingMesh: THREE.Mesh;
  private lockChevron: THREE.Mesh;
  private lockBrackets: THREE.Mesh[] = [];

  private cancelMat: THREE.Material;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // Initialize materials with PS1 15-bit quantization and dither
    this.woodMat = applyPS1MaterialShader(new THREE.MeshBasicMaterial({ color: 0xc89d66 }));
    this.metalMat = applyPS1MaterialShader(new THREE.MeshBasicMaterial({ color: 0xffdd77 }));
    this.flatHitMat = applyPS1MaterialShader(new THREE.MeshBasicMaterial({ color: 0x99aabb }));
    this.cancelMat = applyPS1MaterialShader(new THREE.MeshBasicMaterial({ color: 0x38bdf8 }));

    // Particle pool
    const sharedParticleGeo = new THREE.BoxGeometry(0.06, 0.06, 0.06);
    for (let i = 0; i < VFX_CONFIG.PARTICLE_POOL_SIZE; i++) {
      const mesh = new THREE.Mesh(sharedParticleGeo, this.woodMat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.particlePool.push({
        mesh,
        vel: new THREE.Vector3(),
        life: 0,
      });
    }

    // Dynamic metal hit/clash spark point light
    this.sparkPointLight = new THREE.PointLight(
      RENDERING_CONFIG.SPARK_LIGHT.COLOR,
      0,
      RENDERING_CONFIG.SPARK_LIGHT.DISTANCE,
      1.8
    );
    this.sparkPointLight.visible = false;
    this.scene.add(this.sparkPointLight);

    // Additive metal spark billboard sprite (THREE.AdditiveBlending, depthWrite: false)
    const sparkTex = createPS1SparkHaloTexture();
    const sparkMat = new THREE.SpriteMaterial({
      map: sparkTex,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0,
    });
    this.sparkSprite = new THREE.Sprite(sparkMat);
    this.sparkSprite.visible = false;
    this.scene.add(this.sparkSprite);

    // Cursor marker
    this.cursorMarker = new THREE.Group();
    const ringGeo = new THREE.RingGeometry(0.14, 0.2, 8);
    ringGeo.rotateX(-Math.PI * 0.5);
    this.cursorRingMat = new THREE.MeshBasicMaterial({
      color: 0xc8b88a,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.6,
    });
    this.cursorRingMesh = new THREE.Mesh(ringGeo, this.cursorRingMat);
    this.cursorRingMesh.position.y = 0.02;
    this.cursorMarker.add(this.cursorRingMesh);

    const tickGeo = new THREE.BoxGeometry(0.12, 0.015, 0.035);
    this.cursorStanceTick = new THREE.Mesh(tickGeo, this.cursorRingMat);
    this.cursorStanceTick.position.set(0, 0.026, 0);
    this.cursorMarker.add(this.cursorStanceTick);
    this.scene.add(this.cursorMarker);

    // Z-Targeting Lock Reticle Assembly (Retro Zelda / Souls style)
    this.lockReticleGroup = new THREE.Group();
    this.lockReticleGroup.visible = false;

    // Outer rotating diamond / ring
    const lockRingGeo = new THREE.RingGeometry(0.32, 0.38, 4); // 4-gon = diamond
    const lockMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
    });
    this.lockRingMesh = new THREE.Mesh(lockRingGeo, lockMat);
    this.lockRingMesh.rotation.x = -Math.PI * 0.5;
    this.lockReticleGroup.add(this.lockRingMesh);

    // 4 Corner Brackets
    const bracketGeo = new THREE.BoxGeometry(0.12, 0.02, 0.03);
    const bracketMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const offsets = [
      { x: 0.38, z: 0 },
      { x: -0.38, z: 0 },
      { x: 0, z: 0.38 },
      { x: 0, z: -0.38 },
    ];
    offsets.forEach((off) => {
      const b = new THREE.Mesh(bracketGeo, bracketMat);
      b.position.set(off.x, 0, off.z);
      if (off.z !== 0) b.rotation.y = Math.PI * 0.5;
      this.lockReticleGroup.add(b);
      this.lockBrackets.push(b);
    });

    // Floating downward chevron arrow
    const chevronGeo = new THREE.ConeGeometry(0.14, 0.28, 4);
    chevronGeo.rotateX(Math.PI);
    const chevronMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24 });
    this.lockChevron = new THREE.Mesh(chevronGeo, chevronMat);
    this.lockChevron.position.set(0, 0.32, 0);
    this.lockReticleGroup.add(this.lockChevron);

    this.scene.add(this.lockReticleGroup);

    this.initTrail();
  }

  public registerDecalTarget(targetGroup: THREE.Group): void {
    const decalGeo = new THREE.BoxGeometry(0.22, 0.028, 0.025);
    const decalMat = applyPS1MaterialShader(new THREE.MeshBasicMaterial({ color: 0x26170c }));
    for (let i = 0; i < VFX_CONFIG.DECAL_POOL_SIZE; i++) {
      const decal = new THREE.Mesh(decalGeo, decalMat);
      decal.visible = false;
      targetGroup.add(decal);
      this.decalPool.push(decal);
    }
  }

  private initTrail(): void {
    for (let i = 0; i < VFX_CONFIG.TRAIL_SEGMENTS; i++) {
      this.trailHistory.push({
        tip: new THREE.Vector3(),
        base: new THREE.Vector3(),
        active: false,
      });
    }

    const trailGeo = new THREE.BufferGeometry();
    const positions = new Float32Array((VFX_CONFIG.TRAIL_SEGMENTS - 1) * 6 * 3);
    trailGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const trailMat = new THREE.MeshBasicMaterial({
      color: 0xdceeff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
    });
    this.trailMesh = new THREE.Mesh(trailGeo, trailMat);
    this.trailMesh.frustumCulled = false;
    this.scene.add(this.trailMesh);
  }

  /**
   * Triggers a brief (0.08s) dynamic point light flash & additive sprite flare at the impact point,
   * catching the knight's helmet and dummy shield in a burst of light.
   */
  public triggerMetalSparkFlash(worldPos: THREE.Vector3, intensity = 1.0): void {
    this.sparkPointLight.position.copy(worldPos);
    this.sparkPointLight.intensity =
      RENDERING_CONFIG.SPARK_LIGHT.INTENSITY * Math.max(0.65, Math.min(2.2, intensity));
    this.sparkPointLight.visible = true;
    this.sparkLightTimer = RENDERING_CONFIG.SPARK_LIGHT.DURATION;

    this.sparkSprite.position.copy(worldPos);
    const s = 0.55 + intensity * 0.45;
    this.sparkSprite.scale.set(s, s, s);
    (this.sparkSprite.material as THREE.SpriteMaterial).opacity = 1.0;
    this.sparkSprite.visible = true;
    this.sparkSpriteTimer = RENDERING_CONFIG.SPARK_LIGHT.DURATION;
  }

  public spawnImpactParticles(
    worldPos: THREE.Vector3,
    count: number,
    isMetal: boolean,
    isFlat = false
  ): void {
    let spawned = 0;
    const targetMat = isFlat ? this.flatHitMat : isMetal ? this.metalMat : this.woodMat;

    for (let i = 0; i < VFX_CONFIG.PARTICLE_POOL_SIZE && spawned < count; i++) {
      const p = this.particlePool[i];
      if (p.life <= 0) {
        p.mesh.material = targetMat;
        p.mesh.position.copy(worldPos);
        p.mesh.visible = true;
        const angle = Math.random() * Math.PI * 2;
        const speed = 1.5 + Math.random() * 4.2;
        p.vel.set(Math.cos(angle) * speed, 1.8 + Math.random() * 3.0, Math.sin(angle) * speed);
        p.life = 0.35 + Math.random() * 0.25;
        spawned++;
      }
    }
  }

  public spawnCutDecal(localHitPos: THREE.Vector3, localVelDir: THREE.Vector3): void {
    if (this.decalPool.length === 0) return;
    const decal = this.decalPool[this.decalIndex];
    this.decalIndex = (this.decalIndex + 1) % this.decalPool.length;

    const radialLen = Math.hypot(localHitPos.x, localHitPos.z);
    if (radialLen < 0.001) return;

    const barrelRadius = 0.315;
    const nx = localHitPos.x / radialLen;
    const nz = localHitPos.z / radialLen;

    decal.position.set(
      nx * barrelRadius,
      Math.max(0.56, Math.min(1.36, localHitPos.y)),
      nz * barrelRadius
    );
    decal.rotation.set(0, Math.atan2(nx, nz), (Math.random() - 0.5) * 0.7 + localVelDir.y * 0.6);
    decal.visible = true;
  }

  public updateParticles(dt: number): void {
    // 1. Dynamic Spark Point Light & Billboard Fade
    if (this.sparkLightTimer > 0) {
      this.sparkLightTimer -= dt;
      if (this.sparkLightTimer <= 0) {
        this.sparkPointLight.visible = false;
      }
    }

    if (this.sparkSpriteTimer > 0) {
      this.sparkSpriteTimer -= dt;
      if (this.sparkSpriteTimer <= 0) {
        this.sparkSprite.visible = false;
      } else {
        (this.sparkSprite.material as THREE.SpriteMaterial).opacity = Math.max(
          0,
          this.sparkSpriteTimer / RENDERING_CONFIG.SPARK_LIGHT.DURATION
        );
      }
    }

    // 2. Physical impact particles
    for (let i = 0; i < VFX_CONFIG.PARTICLE_POOL_SIZE; i++) {
      const p = this.particlePool[i];
      if (p.life <= 0) continue;

      p.life -= dt;
      if (p.life <= 0) {
        p.mesh.visible = false;
        continue;
      }
      p.vel.y -= 12.0 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += 8.0 * dt;
      p.mesh.rotation.y += 11.0 * dt;
      if (p.mesh.position.y < 0.03) {
        p.mesh.position.y = 0.03;
        p.vel.x *= 0.6;
        p.vel.z *= 0.6;
        p.vel.y *= -0.3;
      }
    }
  }

  public updateSwordTrail(currTipWorld: THREE.Vector3, currMidWorld: THREE.Vector3, tipSpeed: number): void {
    if (!this.trailMesh) return;

    for (let i = VFX_CONFIG.TRAIL_SEGMENTS - 1; i > 0; i--) {
      this.trailHistory[i].tip.copy(this.trailHistory[i - 1].tip);
      this.trailHistory[i].base.copy(this.trailHistory[i - 1].base);
      this.trailHistory[i].active = this.trailHistory[i - 1].active;
    }
    this.trailHistory[0].tip.copy(currTipWorld);
    this.trailHistory[0].base.copy(currMidWorld);
    this.trailHistory[0].active = tipSpeed > VFX_CONFIG.MIN_TRAIL_SPEED;

    const posAttr = this.trailMesh.geometry.attributes.position as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;

    const anyActive = this.trailHistory[0].active || this.trailHistory[1].active;
    this.trailMesh.visible = anyActive;
    if (!anyActive) return;

    let ptr = 0;
    for (let i = 0; i < VFX_CONFIG.TRAIL_SEGMENTS - 1; i++) {
      const a = this.trailHistory[i];
      const b = this.trailHistory[i + 1];

      // Triangle 1
      arr[ptr++] = a.base.x; arr[ptr++] = a.base.y; arr[ptr++] = a.base.z;
      arr[ptr++] = a.tip.x;  arr[ptr++] = a.tip.y;  arr[ptr++] = a.tip.z;
      arr[ptr++] = b.tip.x;  arr[ptr++] = b.tip.y;  arr[ptr++] = b.tip.z;

      // Triangle 2
      arr[ptr++] = a.base.x; arr[ptr++] = a.base.y; arr[ptr++] = a.base.z;
      arr[ptr++] = b.tip.x;  arr[ptr++] = b.tip.y;  arr[ptr++] = b.tip.z;
      arr[ptr++] = b.base.x; arr[ptr++] = b.base.y; arr[ptr++] = b.base.z;
    }
    posAttr.needsUpdate = true;
  }

  public updateCursorFeedback(
    balancePitch: number,
    balanceRoll: number,
    stumbleTimer: number,
    isMouseDown: boolean,
    guardZone: GuardZone,
    heroAngle: number,
    stanceSide: number
  ): void {
    const instability = Math.min(1.0, (Math.abs(balancePitch) + Math.abs(balanceRoll)) * 1.2 + (stumbleTimer > 0 ? 0.65 : 0));
    const baseScale = isMouseDown ? 0.78 : 1.0;
    this.cursorRingMesh.scale.setScalar(baseScale + instability * 0.65);

    // Poised gold (200, 184, 138) to off-balance crimson (220, 50, 35)
    const r = Math.floor(200 + instability * 20);
    const g = Math.floor(184 * (1.0 - instability * 0.72));
    const b = Math.floor(138 * (1.0 - instability * 0.75));
    this.cursorRingMat.color.setRGB(r / 255, g / 255, b / 255);
    this.cursorRingMat.opacity = 0.62 - instability * 0.22;

    if (guardZone === 'high') {
      this.cursorStanceTick.rotation.y = heroAngle;
      this.cursorStanceTick.scale.set(0.45, 1, 2.8);
    } else if (guardZone === 'low') {
      this.cursorStanceTick.rotation.y = heroAngle;
      this.cursorStanceTick.scale.set(0.35, 1, 3.4);
    } else {
      this.cursorStanceTick.rotation.y = heroAngle + stanceSide * 0.35;
      this.cursorStanceTick.scale.set(1.35, 1, 0.9);
    }
  }

  public updateTargetLockReticle(dummyPos: THREE.Vector3, isLocked: boolean, elapsed: number): void {
    if (!this.lockReticleGroup) return;
    this.lockReticleGroup.visible = isLocked;
    if (!isLocked) return;

    // Position above the dummy
    this.lockReticleGroup.position.set(dummyPos.x, dummyPos.y + 2.2, dummyPos.z);

    // Dynamic retro pulse & rotation
    const pulse = 1.0 + Math.sin(elapsed * 7.0) * 0.12;
    this.lockRingMesh.rotation.z = elapsed * 2.5;
    this.lockRingMesh.scale.set(pulse, pulse, pulse);

    // Chevron bobbing
    if (this.lockChevron) {
      this.lockChevron.position.y = 0.38 + Math.sin(elapsed * 9.0) * 0.08;
      this.lockChevron.rotation.y = elapsed * 3.0;
    }

    // Bracket inward snap pulse
    const bracketDist = 0.34 + Math.cos(elapsed * 7.0) * 0.05;
    if (this.lockBrackets.length === 4) {
      this.lockBrackets[0].position.set(bracketDist, 0, 0);
      this.lockBrackets[1].position.set(-bracketDist, 0, 0);
      this.lockBrackets[2].position.set(0, 0, bracketDist);
      this.lockBrackets[3].position.set(0, 0, -bracketDist);
    }
  }

  /**
   * Spawns a sharp burst of cyan cancel particles and a brief flash when animation cancel occurs
   */
  public triggerCancelFlash(worldPos: THREE.Vector3): void {
    this.triggerScreenShake(0.04);
    let spawned = 0;
    for (let i = 0; i < VFX_CONFIG.PARTICLE_POOL_SIZE && spawned < 6; i++) {
      const p = this.particlePool[i];
      if (p.life <= 0) {
        p.mesh.material = this.cancelMat;
        p.mesh.position.set(
          worldPos.x + (Math.random() - 0.5) * 0.3,
          worldPos.y + 0.8 + (Math.random() - 0.5) * 0.3,
          worldPos.z + (Math.random() - 0.5) * 0.3
        );
        p.mesh.visible = true;
        const angle = Math.random() * Math.PI * 2;
        const speed = 2.4 + Math.random() * 2.0;
        p.vel.set(Math.cos(angle) * speed, 1.2 + Math.random() * 2.0, Math.sin(angle) * speed);
        p.life = 0.22 + Math.random() * 0.12;
        spawned++;
      }
    }
  }

  public triggerScreenShake(amount: number): void {
    this.screenShake = Math.max(this.screenShake, amount);
  }

  public updateScreenShake(dt: number): { x: number; y: number } {
    if (this.screenShake <= 0) return { x: 0, y: 0 };
    const x = (Math.random() - 0.5) * this.screenShake;
    const y = (Math.random() - 0.5) * this.screenShake;
    this.screenShake = Math.max(0, this.screenShake - dt * 0.65);
    return { x, y };
  }

  public dispose(): void {
    this.particlePool.forEach((p) => {
      this.scene.remove(p.mesh);
      p.mesh.geometry.dispose();
    });
    this.particlePool = [];
    if (this.trailMesh) {
      this.scene.remove(this.trailMesh);
      this.trailMesh.geometry.dispose();
      this.trailMesh = null;
    }
    this.scene.remove(this.sparkPointLight);
    this.sparkPointLight.dispose();
    this.scene.remove(this.sparkSprite);
    this.sparkSprite.geometry.dispose();
    (this.sparkSprite.material as THREE.Material).dispose();
  }
}
