/**
 * Combat & Collision Resolver
 * Manages swept-blade collision checks, edge alignment verification,
 * kinetic impulse distribution, and flail counter-strike/parry physics.
 */

import * as THREE from 'three';
import { Hero } from '../entities/Hero.ts';
import { TrainingDummy } from '../entities/TrainingDummy.ts';
import { VFXManager } from '../vfx/VFXManager.ts';
import { RetroSoundEngine } from '../audio/RetroSoundEngine.ts';
import { COMBAT_CONFIG, DUMMY_CONFIG } from '../config/combatConfig.ts';
import {
  calculateEdgeAlignment,
  determineHitZone,
  calculateEffectiveKineticEnergy,
  HitZone,
} from './combatMath.ts';

export interface CombatHitTelemetry {
  zone: HitZone;
  edgeAlignment: number;
  kineticEnergy: number;
  tipSpeed: number;
  isFlat: boolean;
  isMetal: boolean;
  timestamp: number;
}

export class CombatResolver {
  private hero: Hero;
  private dummy: TrainingDummy;
  private vfx: VFXManager;
  private audio: RetroSoundEngine;

  // Scratch vectors to prevent GC
  private _bladeAxis = new THREE.Vector3();
  private _rotMat = new THREE.Matrix4();
  private _edgeDir = new THREE.Vector3();
  private _sampleCurr = new THREE.Vector3();
  private _samplePrev = new THREE.Vector3();
  private _pointDisp = new THREE.Vector3();
  private _subSample = new THREE.Vector3();
  private _localSample = new THREE.Vector3();
  private _localVelVec = new THREE.Vector3();
  private _impactNormal = new THREE.Vector3();
  private _velDir = new THREE.Vector3();
  private _flailWorldPos = new THREE.Vector3();
  private _v1 = new THREE.Vector3();
  private _v2 = new THREE.Vector3();
  private _v3 = new THREE.Vector3();

  public onHitTelemetry?: (telemetry: CombatHitTelemetry) => void;

  constructor(hero: Hero, dummy: TrainingDummy, vfx: VFXManager, audio: RetroSoundEngine) {
    this.hero = hero;
    this.dummy = dummy;
    this.vfx = vfx;
    this.audio = audio;
  }

  public checkBladeDummyCollision(dt: number, isThrusting: boolean): void {
    if (this.hero.hitCooldown > 0) {
      this.hero.hitCooldown -= dt;
      return;
    }

    // Startup phase is windup chamber: weapon is not yet dealing damage
    if (this.hero.attackPhase === 'startup') {
      return;
    }

    // Recovery phase: swing has finished its damage window, now recovering
    if (this.hero.attackPhase === 'recovery') {
      return;
    }

    const safeDt = Math.max(0.002, dt);
    this.dummy.group.updateMatrixWorld(true);

    this._bladeAxis.subVectors(this.hero.currTipWorld, this.hero.currBaseWorld).normalize();

    this._rotMat.extractRotation(this.hero.swordGroup.matrixWorld);
    this._edgeDir.set(1, 0, 0).applyMatrix4(this._rotMat).normalize();

    let hitRegistered = false;

    // Sweep along blade from Point (1.0) to Forte (0.16)
    for (let s = 1.0; s >= 0.16 && !hitRegistered; s -= 0.14) {
      this._sampleCurr.lerpVectors(this.hero.currBaseWorld, this.hero.currTipWorld, s);
      this._samplePrev.lerpVectors(this.hero.prevBaseWorld, this.hero.prevTipWorld, s);

      this._pointDisp.subVectors(this._sampleCurr, this._samplePrev);
      const dispLen = this._pointDisp.length();
      const subSteps = Math.max(1, Math.min(5, Math.ceil(dispLen / 0.14)));

      for (let step = 1; step <= subSteps; step++) {
        const alpha = step / subSteps;
        this._subSample.lerpVectors(this._samplePrev, this._sampleCurr, alpha);

        this._localSample.copy(this._subSample);
        this.dummy.pivotGroup.worldToLocal(this._localSample);

        // Local dummy height check
        if (this._localSample.y > 0.15 && this._localSample.y < 1.85) {
          const horizDist = Math.hypot(this._localSample.x, this._localSample.z);

          // Shield boundary check
          const hitLocalShield =
            this._localSample.x < -0.22 &&
            this._localSample.x > -0.74 &&
            this._localSample.y > 0.72 &&
            this._localSample.y < 1.48 &&
            Math.abs(this._localSample.z - 0.12) < 0.42;

          if (horizDist < this.dummy.radius || hitLocalShield) {
            this._localVelVec.copy(this._pointDisp).divideScalar(safeDt);
            const localSpeed = this._localVelVec.length();

            this._impactNormal
              .set(this._subSample.x - this.dummy.pos.x, 0, this._subSample.z - this.dummy.pos.z)
              .normalize();

            if (localSpeed > 0.01) {
              this._velDir.copy(this._localVelVec).normalize();
            } else {
              this._velDir.copy(this._bladeAxis);
            }

            const longitudinalAlignment = Math.max(0, this._velDir.dot(this._bladeAxis));
            const edgeAlignment = calculateEdgeAlignment(
              this._velDir.x,
              this._velDir.y,
              this._velDir.z,
              this._edgeDir.x,
              this._edgeDir.y,
              this._edgeDir.z
            );

            const zoneType = determineHitZone(s, isThrusting, longitudinalAlignment);

            const isFlatHit =
              zoneType !== 'point' &&
              zoneType !== 'forte' &&
              edgeAlignment < COMBAT_CONFIG.COLLISION.FLAT_HIT_EDGE_ALIGN_THRESHOLD;
            const alignmentMultiplier = isFlatHit
              ? COMBAT_CONFIG.COLLISION.FLAT_HIT_DAMAGE_MULTIPLIER
              : edgeAlignment;

            let effectiveMass: number = COMBAT_CONFIG.COLLISION.SWEETSPOT_MASS_KG;
            if (zoneType === 'point') effectiveMass = COMBAT_CONFIG.COLLISION.POINT_MASS_KG;
            else if (zoneType === 'forte') effectiveMass = COMBAT_CONFIG.COLLISION.FORTE_MASS_KG;

            const kineticEnergy = calculateEffectiveKineticEnergy(
              effectiveMass,
              localSpeed,
              alignmentMultiplier
            );

            const hitMetalOrShield =
              hitLocalShield ||
              Math.abs(this._localSample.y - 1.24) < 0.085 ||
              Math.abs(this._localSample.y - 0.68) < 0.085;

            const minVel =
              zoneType === 'forte'
                ? COMBAT_CONFIG.COLLISION.FORTE_MIN_VELOCITY
                : COMBAT_CONFIG.COLLISION.MIN_STRIKE_VELOCITY;

            if (localSpeed > minVel) {
              this.applyImpactPhysics(
                zoneType,
                isFlatHit,
                hitMetalOrShield,
                localSpeed,
                kineticEnergy,
                longitudinalAlignment,
                edgeAlignment
              );

              this.onHitTelemetry?.({
                zone: zoneType,
                edgeAlignment: Math.round(edgeAlignment * 100),
                kineticEnergy: Math.round(kineticEnergy * 10) / 10,
                tipSpeed: Math.round(localSpeed * 10) / 10,
                isFlat: isFlatHit,
                isMetal: hitMetalOrShield,
                timestamp: Date.now(),
              });
            } else {
              this.hero.swingYawVel *= 0.2;
              this.dummy.velX += (this._subSample.z - this.dummy.pos.z) * -1.4 * safeDt;
              this.dummy.velZ += (this._subSample.x - this.dummy.pos.x) * 1.4 * safeDt;
            }

            hitRegistered = true;
            break;
          }
        }
      }
    }
  }

  private applyImpactPhysics(
    zoneType: HitZone,
    isFlatHit: boolean,
    hitMetalOrShield: boolean,
    localSpeed: number,
    kineticEnergy: number,
    longitudinalAlignment: number,
    _edgeAlignment: number
  ): void {
    const heightLeverage = Math.max(0.5, this._localSample.y);
    let intensity = 0.25;
    const worldDx = this._subSample.x - this.dummy.pos.x;
    const worldDz = this._subSample.z - this.dummy.pos.z;

    if (isFlatHit) {
      const flatImpulse = Math.min(6.5, localSpeed * 0.55);
      intensity = Math.min(0.55, localSpeed / 12.0);

      this.dummy.velX += this._velDir.z * flatImpulse * heightLeverage;
      this.dummy.velZ -= this._velDir.x * flatImpulse * heightLeverage;
      this.dummy.velTwistY +=
        (worldDx * this._velDir.z - worldDz * this._velDir.x) * flatImpulse * 1.4;

      this.hero.swingYawVel *= -0.72;
      this.hero.swingPitchVel *= -0.6;
    } else if (zoneType === 'point') {
      const alignBonus = 0.6 + longitudinalAlignment * 0.95;
      const thrustImpulse = Math.min(
        18.0,
        (localSpeed * 1.45 + Math.sqrt(kineticEnergy) * 0.9) * alignBonus
      );
      intensity = Math.min(1.0, thrustImpulse / 12.0);

      this.dummy.velX += this._bladeAxis.z * thrustImpulse * heightLeverage;
      this.dummy.velZ -= this._bladeAxis.x * thrustImpulse * heightLeverage;
      this.dummy.velTwistY +=
        (worldDx * this._bladeAxis.z - worldDz * this._bladeAxis.x) * thrustImpulse * 2.8;

      this.hero.swingYawVel *= 0.35;
      this.hero.thrustVel = hitMetalOrShield ? -1.65 : -0.55;

      if (!hitMetalOrShield && this._localSample.y > 0.52 && this._localSample.y < 1.38) {
        this.vfx.spawnCutDecal(this._localSample, this._velDir);
      }
    } else if (zoneType === 'sweetspot') {
      const ekImpulse = Math.min(22.0, Math.sqrt(kineticEnergy) * 1.85);
      intensity = Math.min(1.0, kineticEnergy / 65.0);

      this.dummy.velX += this._velDir.z * ekImpulse * heightLeverage;
      this.dummy.velZ -= this._velDir.x * ekImpulse * heightLeverage;
      this.dummy.velTwistY +=
        (worldDx * this._velDir.z - worldDz * this._velDir.x) * ekImpulse * 4.2;

      this.hero.swingYawVel *= hitMetalOrShield ? -0.58 : -0.32;
      this.hero.swingPitchVel *= hitMetalOrShield ? -0.48 : -0.25;

      if (!hitMetalOrShield && this._localSample.y > 0.52 && this._localSample.y < 1.38) {
        this.vfx.spawnCutDecal(this._localSample, this._velDir);
      }
    } else {
      // Forte block / shove
      const shoveForce = Math.min(9.5, 3.2 + localSpeed * 0.85);
      intensity = Math.min(0.45, localSpeed / 9.0);

      this.dummy.velX += -this._impactNormal.z * shoveForce * heightLeverage;
      this.dummy.velZ += -this._impactNormal.x * shoveForce * heightLeverage;
      this.dummy.velTwistY += (worldDx * this._velDir.z - worldDz * this._velDir.x) * 6.0;

      this.hero.swingYawVel *= -0.15;
      this.hero.swingPitchVel *= -0.15;
    }

    // Ricochet & recoil on metal / shield
    if (hitMetalOrShield && zoneType !== 'forte') {
      const recoilForce = Math.min(3.4, 1.15 + Math.sqrt(kineticEnergy) * 0.24);
      this.hero.vel.addScaledVector(this._impactNormal, recoilForce);

      const forwardVecX = -Math.sin(this.hero.angle);
      const forwardVecZ = -Math.cos(this.hero.angle);
      const rightVecX = Math.cos(this.hero.angle);
      const rightVecZ = -Math.sin(this.hero.angle);

      const localRecoilBack = -(
        this._impactNormal.x * forwardVecX +
        this._impactNormal.z * forwardVecZ
      );
      const localRecoilSide =
        this._impactNormal.x * rightVecX + this._impactNormal.z * rightVecZ;

      this.hero.balancePitchVel -= Math.max(1.8, localRecoilBack * recoilForce * 2.6);
      this.hero.balanceRollVel += localRecoilSide * recoilForce * 2.2;
      this.hero.stumbleTimer = Math.min(0.38, 0.14 + intensity * 0.24);
    } else if (zoneType === 'sweetspot' && !isFlatHit && intensity > 0.45) {
      this.hero.balancePitchVel += 0.85 * intensity;
    }

    this.hero.hitCooldown = COMBAT_CONFIG.COLLISION.HIT_COOLDOWN_SEC;

    const shakeMult =
      zoneType === 'sweetspot' ? 0.13 : zoneType === 'point' ? 0.1 : 0.05;
    this.vfx.triggerScreenShake(Math.min(0.16, intensity * shakeMult));

    const particleCount =
      zoneType === 'forte' ? 3 : Math.floor(5 + intensity * 12);
    this.vfx.spawnImpactParticles(
      this._subSample,
      particleCount,
      hitMetalOrShield,
      isFlatHit
    );
    if (hitMetalOrShield) {
      this.vfx.triggerMetalSparkFlash(this._subSample, intensity);
    }
    this.audio.playHit(intensity, hitMetalOrShield, zoneType, isFlatHit);
  }

  public checkFlailCounterStrike(): void {
    const spinSpeed = Math.abs(this.dummy.velTwistY);
    if (
      spinSpeed <= DUMMY_CONFIG.FLAIL_TRIGGER_SPIN_VELOCITY ||
      this.dummy.counterHitCooldown > 0 ||
      !this.dummy.flailWeight
    ) {
      return;
    }

    this.dummy.group.updateMatrixWorld(true);
    this._flailWorldPos.set(0, 0, 0);
    this.dummy.flailWeight.localToWorld(this._flailWorldPos);

    // 1. Parry with blade check
    this._v1.subVectors(this._flailWorldPos, this.hero.currBaseWorld);
    this._v2.subVectors(this.hero.currMidWorld, this.hero.currBaseWorld);
    const segLenSq = this._v2.lengthSq();
    const proj = Math.max(
      0,
      Math.min(1, this._v1.dot(this._v2) / Math.max(0.0001, segLenSq))
    );
    this._v3.copy(this.hero.currBaseWorld).addScaledVector(this._v2, proj);

    const distToBlade = this._v3.distanceTo(this._flailWorldPos);
    if (distToBlade < DUMMY_CONFIG.FLAIL_BLADE_PARRY_RADIUS) {
      this.dummy.velTwistY *= -0.55;
      this.dummy.counterHitCooldown = 0.28;
      this.hero.swingYawVel += Math.sign(this.dummy.velTwistY) * 3.5;
      this.hero.balancePitchVel -= 1.1;
      this.vfx.triggerScreenShake(0.08);
      this.vfx.spawnImpactParticles(this._v3, 8, true, false);
      this.vfx.triggerMetalSparkFlash(this._v3, 0.95);
      this.audio.playHit(0.65, true, 'forte', false);
      return;
    }

    // 2. Strike hero body
    const dx = this.hero.pos.x - this._flailWorldPos.x;
    const dz = this.hero.pos.z - this._flailWorldPos.z;
    const distToHero = Math.hypot(dx, dz);

    if (distToHero < DUMMY_CONFIG.FLAIL_HERO_HIT_RADIUS) {
      const impactForce = Math.min(4.5, 1.6 + spinSpeed * 0.32);
      this._impactNormal.set(dx, 0, dz).normalize();

      this.hero.vel.addScaledVector(this._impactNormal, impactForce);

      const forwardVecX = -Math.sin(this.hero.angle);
      const forwardVecZ = -Math.cos(this.hero.angle);
      const rightVecX = Math.cos(this.hero.angle);
      const rightVecZ = -Math.sin(this.hero.angle);

      const localHitBack = -(
        this._impactNormal.x * forwardVecX +
        this._impactNormal.z * forwardVecZ
      );
      const localHitSide =
        this._impactNormal.x * rightVecX + this._impactNormal.z * rightVecZ;

      this.hero.balancePitchVel -= localHitBack * impactForce * 2.8;
      this.hero.balanceRollVel += localHitSide * impactForce * 2.8;
      this.hero.stumbleTimer = 0.36;

      this.dummy.velTwistY *= 0.45;
      this.dummy.counterHitCooldown = 0.42;
      this.vfx.triggerScreenShake(0.15);

      this.vfx.spawnImpactParticles(this._flailWorldPos, 10, true, false);
      this.vfx.triggerMetalSparkFlash(this._flailWorldPos, 0.85);
      this.audio.playHit(0.85, false, 'sweetspot', false);
    }
  }
}
