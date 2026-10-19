/**
 * Game Engine Coordinator
 * Manages the Three.js render loop, entity lifecycle, input handling,
 * and decouples game state from React HUD presentation.
 */

import * as THREE from 'three';
import { RENDERING_CONFIG } from '../config/renderingConfig.ts';
import { COMBAT_CONFIG, AttackPhase, STRIKE_PHASES, TARGET_LOCK_CONFIG } from '../config/combatConfig.ts';
import { Arena } from '../entities/Arena.ts';
import { Hero } from '../entities/Hero.ts';
import { TrainingDummy } from '../entities/TrainingDummy.ts';
import { VFXManager } from '../vfx/VFXManager.ts';
import { RetroSoundEngine } from '../audio/RetroSoundEngine.ts';
import { InputManager } from '../input/InputManager.ts';
import { CombatResolver, CombatHitTelemetry } from '../physics/CombatResolver.ts';
import {
  normalizeAngle,
  classifyGuardZone,
  recognizeGestureType,
  StrikeMode,
  GuardZone,
} from '../physics/combatMath.ts';

export interface EngineUIState {
  guardZone: GuardZone;
  stanceSide: number;
  balanceStability: number;
  isStumbled: boolean;
  isDashing: boolean;
  strikeMode: StrikeMode;
  lastHit: CombatHitTelemetry | null;
  flailSpinSpeed: number;
  isTargetLocked: boolean;
  attackPhase: AttackPhase;
  isCancelable: boolean;
  bufferedAction: string | null;
}

export class GameEngine {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;

  public arena: Arena;
  public hero: Hero;
  public dummy: TrainingDummy;
  public vfx: VFXManager;
  public audio: RetroSoundEngine;
  public input: InputManager;
  public combat: CombatResolver;

  private isRunning = false;
  private animationFrameId: number | null = null;
  private lastTime = performance.now();
  private container: HTMLElement;

  private desiredCamPos = new THREE.Vector3();
  private gestureDelta = new THREE.Vector3();

  // Telemetry callback to React HUD
  public onStateUpdate?: (state: EngineUIState) => void;
  private lastTelemetry: CombatHitTelemetry | null = null;
  private stateUpdateThrottle = 0;

  public isTargetLocked = false;

  constructor(container: HTMLElement) {
    this.container = container;

    // Scene & Fog
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(RENDERING_CONFIG.CLEAR_COLOR);
    this.scene.fog = new THREE.FogExp2(
      RENDERING_CONFIG.LIGHTING.FOG_COLOR,
      RENDERING_CONFIG.LIGHTING.FOG_DENSITY
    );

    // Camera
    const aspect = container.clientWidth / (container.clientHeight || 1);
    this.camera = new THREE.PerspectiveCamera(
      42,
      aspect,
      0.1,
      45
    );
    this.camera.position.set(0, 6.6, 6.2);
    this.camera.lookAt(0, 0.7, 0);

    // Renderer (No AA for authentic PS1 polygonal edges)
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = RENDERING_CONFIG.TONE_MAPPING_EXPOSURE;
    this.renderer.domElement.classList.add('ps1-canvas');
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.display = 'block';
    this.container.appendChild(this.renderer.domElement);

    // Systems
    this.audio = new RetroSoundEngine();
    this.vfx = new VFXManager(this.scene);
    this.arena = new Arena(this.scene);
    this.dummy = new TrainingDummy(this.scene);
    this.hero = new Hero(this.scene);
    this.input = new InputManager();

    // Register dummy with decal system
    this.vfx.registerDecalTarget(this.dummy.pivotGroup);

    // Resolver
    this.combat = new CombatResolver(this.hero, this.dummy, this.vfx, this.audio);
    this.combat.onHitTelemetry = (telemetry) => {
      this.lastTelemetry = telemetry;
    };

    // Link input & animation cancel callbacks
    this.input.onUserInteraction = () => this.audio.init();
    this.input.onLockToggle = () => this.toggleTargetLock();
    this.input.onFootworkDodge = () => this.tryDodge();
    this.hero.onFootstep = (isDash) => this.audio.playStep(isDash);
    this.hero.onAnimationCanceled = () => {
      this.vfx.triggerCancelFlash(this.hero.pos);
      this.audio.playCancelWhoosh();
    };

    // Resize listener
    window.addEventListener('resize', this.onResize);
    this.onResize();

    this.start();
  }

  public onResize = (): void => {
    if (!this.container || !this.renderer || !this.camera) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === 0 || height === 0) return;

    const aspect = width / height;
    const renderHeight = 256; // PS1 internal resolution height
    const renderWidth = Math.max(160, Math.round(renderHeight * aspect));

    this.renderer.setSize(renderWidth, renderHeight, false);
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  };

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTime = performance.now();
    this.tick(this.lastTime);
  }

  public stop(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  public toggleTargetLock(): void {
    this.isTargetLocked = !this.isTargetLocked;
    this.audio.playLockTone(this.isTargetLocked);
    this.vfx.triggerScreenShake(0.02);
  }

  public tryDodge(): boolean {
    const isAttacking = this.input.lmbDown || this.input.rmbDown;
    const dodged = this.hero.triggerFootworkDodge(
      this.input.keys,
      isAttacking,
      this.isTargetLocked,
      this.dummy.pos
    );
    if (dodged) {
      this.input.consumeAction(['dodge']);
      return true;
    }
    return false;
  }

  private tick = (now: number): void => {
    if (!this.isRunning) return;
    this.animationFrameId = requestAnimationFrame(this.tick);

    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastTime) * 0.001));
    this.lastTime = now;
    const elapsed = now * 0.001;

    // 1. Inputs & Buffer
    this.input.updateRaycast(this.camera);
    this.input.updateVelocities(dt);
    this.input.updateBuffer();

    // Check buffered lock-on toggle
    if (this.input.consumeAction(['lock_toggle'])) {
      this.toggleTargetLock();
    }

    if (this.vfx.cursorMarker) {
      this.vfx.cursorMarker.position.set(
        this.input.mouseWorld.x,
        0,
        this.input.mouseWorld.z
      );
    }

    // 2. Advance Attack Phase (Startup -> Active -> Recovery -> Idle)
    this.hero.updateAttackPhase(dt);

    // 3. Process Input Buffering & Animation Canceling
    // A. Buffered Dodge (triggers immediately if idle or recovery cancelable)
    if (this.input.peekAction(['dodge']) && (this.hero.attackPhase === 'idle' || this.hero.isCancelable())) {
      this.tryDodge();
    }

    // B. Recovery cancellation into Guard/Block (RMB or buffered guard)
    if (this.hero.isCancelable() && (this.input.rmbDown || this.input.consumeAction(['guard']))) {
      this.hero.cancelAttack('guard');
    }

    // C. Buffered Strike combo chaining (fires immediately when hero enters idle)
    if (this.hero.attackPhase === 'idle' && this.hero.stumbleTimer <= 0) {
      const bufferedStrike = this.input.consumeAction(['strike']);
      if (bufferedStrike && bufferedStrike.data?.mode) {
        this.fireSwordStrike(
          bufferedStrike.data.mode,
          bufferedStrike.data.power || 1.1,
          bufferedStrike.data.dirSign ?? 1
        );
      }
    }

    // Gesture State updates
    this.updateGestureLogic(dt);

    // 4. Hero Movement & Rotation (with Z-Targeting strafing)
    this.hero.updateMovement(
      dt,
      this.input.keys,
      this.input.mouseWorld,
      this.dummy.pos,
      this.input.lmbDown,
      this.isTargetLocked
    );

    // 5. Sword Kinematics
    this.updateSwordKinematics(dt);

    // 6. Dummy Physics & Flail
    this.dummy.update(dt);
    this.combat.checkFlailCounterStrike();

    // 7. VFX & Audio
    this.vfx.updateParticles(dt);
    this.vfx.updateTargetLockReticle(this.dummy.pos, this.isTargetLocked, elapsed);
    const tipSpeed = this.hero.getTipSpeed(dt);
    this.vfx.updateSwordTrail(this.hero.currTipWorld, this.hero.currMidWorld, tipSpeed);
    this.audio.updateSwordWhoosh(tipSpeed);

    this.vfx.updateCursorFeedback(
      this.hero.balancePitch,
      this.hero.balanceRoll,
      this.hero.stumbleTimer,
      this.input.lmbDown || this.input.rmbDown,
      this.hero.guardZone,
      this.hero.angle,
      this.hero.stanceSide
    );

    // 8. Arena Environment & Camera (PS1 Z-Targeting / Free-Roam)
    this.arena.update(dt, elapsed);
    this.updateCamera(dt);

    // 9. Render
    this.input.lateUpdate();
    this.renderer.render(this.scene, this.camera);

    // 10. Throttled UI State Emission (every ~50ms to keep React 100% lightweight)
    this.stateUpdateThrottle += dt;
    if (this.stateUpdateThrottle > 0.05) {
      this.stateUpdateThrottle = 0;
      this.emitUIState();
    }
  };

  private updateGestureLogic(dt: number): void {
    const { gesture } = this.input;
    const dx = this.input.mouseWorld.x - this.hero.pos.x;
    const dz = this.input.mouseWorld.z - this.hero.pos.z;
    const dist = Math.hypot(dx, dz);
    const worldAngle = Math.atan2(-dx, -dz);
    const localAngle = normalizeAngle(worldAngle - this.hero.angle);

    if (this.input.lmbDown && !gesture.active) {
      // Begin gesture
      gesture.startWorld.copy(this.input.mouseWorld);
      gesture.startNDC.copy(this.input.mouseNDC);
      gesture.active = true;
      gesture.startTime = performance.now();
      gesture.startRadius = dist;
      gesture.startLocalAngle = localAngle;
      gesture.discharged = false;
      gesture.chamberType = classifyGuardZone(dist, localAngle);

      if (gesture.chamberType === 'mid') {
        if (localAngle > 0.15) this.hero.stanceSide = -1;
        else if (localAngle < -0.15) this.hero.stanceSide = 1;
      }
    } else if (!this.input.lmbDown && gesture.active) {
      // Release gesture
      gesture.active = false;
      if (!gesture.discharged && this.hero.stumbleTimer <= 0) {
        this.gestureDelta.subVectors(this.input.mouseWorld, gesture.startWorld);

        const fX = -Math.sin(this.hero.angle);
        const fZ = -Math.cos(this.hero.angle);
        const rX = Math.cos(this.hero.angle);
        const rZ = -Math.sin(this.hero.angle);

        const dragForward = this.gestureDelta.x * fX + this.gestureDelta.z * fZ;
        const dragRight = this.gestureDelta.x * rX + this.gestureDelta.z * rZ;

        const recognized = recognizeGestureType(
          dragForward,
          dragRight,
          gesture.chamberType
        );

        if (recognized) {
          const power = 1.1 + Math.hypot(dragForward, dragRight) * 0.4;
          const dir = dragRight !== 0 ? -Math.sign(dragRight) : -this.hero.stanceSide;
          if (this.hero.attackPhase === 'startup' || this.hero.attackPhase === 'active') {
            this.input.bufferAction('strike', { mode: recognized, power, dirSign: dir });
          } else {
            this.fireSwordStrike(recognized, power, dir);
          }
        } else if (performance.now() - gesture.startTime < COMBAT_CONFIG.GESTURES.QUICK_CLICK_TIME_MS) {
          // Quick click
          let quickMode: StrikeMode = 'cleave';
          let quickPower = 1.08;
          let quickDir = -this.hero.stanceSide;
          if (gesture.chamberType === 'high') {
            quickMode = 'overhead';
            quickPower = 1.12;
            quickDir = 1;
          } else if (gesture.chamberType === 'low') {
            if (Math.abs(gesture.startLocalAngle) < 0.42) {
              quickMode = 'thrust';
              quickPower = 1.18;
              quickDir = 1;
            } else {
              quickMode = 'undercut';
              quickPower = 1.12;
              quickDir = -this.hero.stanceSide;
            }
          }

          if (this.hero.attackPhase === 'startup' || this.hero.attackPhase === 'active') {
            this.input.bufferAction('strike', { mode: quickMode, power: quickPower, dirSign: quickDir });
          } else {
            this.fireSwordStrike(quickMode, quickPower, quickDir);
          }
        }
      }
    }

    if (gesture.strikeTimer > 0) {
      gesture.strikeTimer = Math.max(0, gesture.strikeTimer - dt);
    }
  }

  private fireSwordStrike(mode: StrikeMode, power: number, dirSign = 1): void {
    if (this.hero.stumbleTimer > 0) return;

    // Animation Canceling / Combo Chaining: If hero is in recovery, cancel recovery into new strike!
    if (this.hero.isCancelable()) {
      this.hero.cancelAttack('dodge'); // resets phase cleanly
    }

    const clampedPower = Math.min(1.65, Math.max(0.65, power));
    const { gesture } = this.input;
    gesture.discharged = true;
    gesture.strikeMode = mode;
    const phaseTiming = STRIKE_PHASES[mode] || STRIKE_PHASES.cleave;
    gesture.strikeTimer = phaseTiming.total;

    this.hero.startStrike(mode, clampedPower, dirSign);

    if (mode === 'overhead') {
      this.hero.swingPitch = Math.max(this.hero.swingPitch, 0.95);
      this.hero.swingPitchVel = -14.5 * clampedPower;
      this.hero.swingYawVel *= 0.35;
      gesture.strikeTargetPitch = -0.52;
      gesture.strikeTargetYaw = this.hero.swingYaw * 0.22;
      gesture.strikeTargetThrust = 0.22;
      this.hero.balancePitchVel += 1.35 * clampedPower;
    } else if (mode === 'undercut') {
      this.hero.swingPitch = Math.min(this.hero.swingPitch, -0.35);
      this.hero.swingPitchVel = 13.8 * clampedPower;
      this.hero.swingYawVel = dirSign * 9.5 * clampedPower;
      this.hero.stanceSide = dirSign > 0 ? -1 : 1;
      gesture.strikeTargetPitch = 1.05;
      gesture.strikeTargetYaw = dirSign * 0.95;
      gesture.strikeTargetThrust = 0.26;
      this.hero.balancePitchVel += 0.95 * clampedPower;
    } else if (mode === 'thrust') {
      this.hero.thrustVel = 7.8 * clampedPower;
      gesture.strikeTargetPitch = -0.12;
      gesture.strikeTargetYaw = Math.max(
        -0.45,
        Math.min(0.45, gesture.startLocalAngle * 0.9)
      );
      gesture.strikeTargetThrust = 0.7;
      this.hero.balancePitchVel += 1.45 * clampedPower;
    } else {
      // Cleave
      this.hero.swingYawVel = dirSign * 16.5 * clampedPower;
      this.hero.stanceSide = dirSign > 0 ? -1 : 1;
      gesture.strikeTargetYaw = dirSign * 1.45;
      gesture.strikeTargetPitch = 0.16;
      gesture.strikeTargetThrust = 0.14;
      this.hero.balanceRollVel -= dirSign * 1.15 * clampedPower;
    }
  }

  private updateSwordKinematics(dt: number): void {
    const dx = this.input.mouseWorld.x - this.hero.pos.x;
    const dz = this.input.mouseWorld.z - this.hero.pos.z;
    const cursorDist = Math.hypot(dx, dz);
    const cursorWorldAngle = Math.atan2(-dx, -dz);
    const localCursorAngle = normalizeAngle(cursorWorldAngle - this.hero.angle);

    this.hero.guardZone = classifyGuardZone(cursorDist, localCursorAngle);

    const fX = -Math.sin(this.hero.angle);
    const fZ = -Math.cos(this.hero.angle);
    const rX = Math.cos(this.hero.angle);
    const rZ = -Math.sin(this.hero.angle);

    const safeDt = Math.max(0.001, dt);
    const mouseVelX = (this.input.mouseWorld.x - this.input.prevMouseWorld.x) / safeDt;
    const mouseVelZ = (this.input.mouseWorld.z - this.input.prevMouseWorld.z) / safeDt;
    const localMouseVelForward = mouseVelX * fX + mouseVelZ * fZ;
    const localMouseVelRight = mouseVelX * rX + mouseVelZ * rZ;

    let targetYaw = 0.55 * this.hero.stanceSide;
    let targetPitch = 0.35;
    let targetThrust = 0.0;
    let targetBladeRoll = 0.0;
    let springStiffness: number = COMBAT_CONFIG.SWORD_SPRINGS.IDLE.stiffness;
    let damping: number = COMBAT_CONFIG.SWORD_SPRINGS.IDLE.damping;

    const { gesture } = this.input;

    if (this.input.lmbDown && this.input.rmbDown) {
      springStiffness = COMBAT_CONFIG.SWORD_SPRINGS.DUAL_MOUSE_VERTICAL.stiffness;
      damping = COMBAT_CONFIG.SWORD_SPRINGS.DUAL_MOUSE_VERTICAL.damping;
      targetYaw = Math.max(-0.35, Math.min(0.35, localCursorAngle * 0.6));
      targetBladeRoll = Math.PI * 0.46;

      if (localMouseVelForward > 2.0 || this.input.mouseScreenVel.y < -1.6) {
        this.hero.swingPitchVel -=
          (Math.max(0, localMouseVelForward) * 2.2 +
            Math.max(0, -this.input.mouseScreenVel.y) * 3.0) *
          dt *
          10.0;
        targetPitch = -0.52;
        targetThrust = 0.22;
      } else if (this.input.mouseScreenVel.y > 1.8) {
        this.hero.swingPitchVel += this.input.mouseScreenVel.y * 2.6 * dt * 10.0;
        targetPitch = 1.15;
      } else {
        targetPitch = 1.28;
      }
    } else if (gesture.strikeTimer > 0) {
      springStiffness = COMBAT_CONFIG.SWORD_SPRINGS.ACTIVE_STRIKE_COMMIT.stiffness;
      damping = COMBAT_CONFIG.SWORD_SPRINGS.ACTIVE_STRIKE_COMMIT.damping;
      targetYaw = gesture.strikeTargetYaw;
      targetPitch = gesture.strikeTargetPitch;
      targetThrust = gesture.strikeTargetThrust;

      if (gesture.strikeMode === 'overhead') {
        targetBladeRoll = Math.PI * 0.48;
      } else if (gesture.strikeMode === 'undercut') {
        targetBladeRoll = -Math.PI * 0.38 * this.hero.stanceSide;
      }
    } else if (this.input.lmbDown) {
      springStiffness = COMBAT_CONFIG.SWORD_SPRINGS.ACTIVE_SWING.stiffness;
      damping = COMBAT_CONFIG.SWORD_SPRINGS.ACTIVE_SWING.damping;

      const lateralImpulse =
        -localMouseVelRight * 0.24 - this.hero.angVel * 0.45;
      this.hero.swingYawVel += lateralImpulse * dt * 16.0;

      if (localCursorAngle > 0.18 || localMouseVelRight < -1.8) {
        this.hero.stanceSide = -1;
      } else if (localCursorAngle < -0.18 || localMouseVelRight > 1.8) {
        this.hero.stanceSide = 1;
      }

      targetYaw = Math.max(
        -1.65,
        Math.min(1.65, localCursorAngle * 1.9 + -this.hero.stanceSide * 0.35)
      );

      if (cursorDist < 1.32 || this.input.mouseScreenVel.y > 1.2) {
        targetPitch = 1.35;
        targetBladeRoll = Math.PI * 0.42;
      } else if (cursorDist > 2.45) {
        targetPitch = -0.42;
        targetBladeRoll = -0.35 * this.hero.stanceSide;
      } else {
        targetPitch = Math.max(
          -0.45,
          Math.min(
            1.25,
            (2.15 - cursorDist) * 0.52 + this.input.mouseScreenVel.y * 0.12
          )
        );
      }
    } else if (this.input.rmbDown) {
      springStiffness = COMBAT_CONFIG.SWORD_SPRINGS.RMB_THRUST.stiffness;
      damping = COMBAT_CONFIG.SWORD_SPRINGS.RMB_THRUST.damping;
      targetYaw = Math.max(-0.6, Math.min(0.6, localCursorAngle * 1.2));
      targetPitch = cursorDist < 1.3 ? 0.55 : -0.15;
      const forwardPush = Math.max(
        0,
        (cursorDist - 1.45) * 0.4 + localMouseVelForward * 0.09
      );
      targetThrust = Math.min(0.68, forwardPush);
    } else {
      if (localCursorAngle > 0.32) this.hero.stanceSide = -1;
      else if (localCursorAngle < -0.32) this.hero.stanceSide = 1;

      const idleBreath = Math.sin(performance.now() * 0.003) * 0.035;

      if (this.hero.guardZone === 'high') {
        targetYaw = this.hero.stanceSide * 0.28 + localCursorAngle * 0.25;
        targetPitch = 1.18 + idleBreath;
        targetBladeRoll = Math.PI * 0.38;
      } else if (this.hero.guardZone === 'low') {
        if (Math.abs(localCursorAngle) < 0.42) {
          targetYaw = localCursorAngle * 0.8;
          targetPitch = -0.22 + idleBreath;
          targetThrust = 0.16;
        } else {
          targetYaw = this.hero.stanceSide * 0.78 + localCursorAngle * 0.3;
          targetPitch = -0.38 + idleBreath;
          targetThrust = 0.06;
          targetBladeRoll = -0.32 * this.hero.stanceSide;
        }
      } else {
        targetYaw = this.hero.stanceSide * 0.68 + localCursorAngle * 0.35;
        targetPitch = 0.28 + idleBreath;
      }
    }

    this.hero.applyArmKinematics(
      dt,
      targetYaw,
      targetPitch,
      targetThrust,
      targetBladeRoll,
      springStiffness,
      damping,
      this.input.rmbDown && !this.input.lmbDown
    );

    // Swept collision
    const isThrusting =
      this.input.rmbDown ||
      gesture.strikeMode === 'thrust' ||
      this.hero.thrustVel > 2.0;
    this.combat.checkBladeDummyCollision(dt, isThrusting);
  }

  private updateCamera(dt: number): void {
    const shake = this.vfx.updateScreenShake(dt);

    if (this.isTargetLocked) {
      // Retro Z-Targeting Lock-On Camera:
      // Position camera behind hero along the target vector, keeping both combatants framed
      const toHeroX = this.hero.pos.x - this.dummy.pos.x;
      const toHeroZ = this.hero.pos.z - this.dummy.pos.z;
      const dist = Math.hypot(toHeroX, toHeroZ) || 1.0;
      const dirX = toHeroX / dist;
      const dirZ = toHeroZ / dist;

      const camDist = dist + TARGET_LOCK_CONFIG.CAM_DISTANCE_OFFSET;
      const camHeight = TARGET_LOCK_CONFIG.CAM_HEIGHT;

      this.desiredCamPos.set(
        this.dummy.pos.x + dirX * camDist + shake.x,
        camHeight + shake.y,
        this.dummy.pos.z + dirZ * camDist
      );

      this.camera.position.lerp(this.desiredCamPos, Math.min(1.0, dt * TARGET_LOCK_CONFIG.CAM_LERP_SPEED));

      // Look slightly above the centroid between knight and training dummy
      const lookFocusX = this.hero.pos.x * 0.42 + this.dummy.pos.x * 0.58;
      const lookFocusZ = this.hero.pos.z * 0.42 + this.dummy.pos.z * 0.58;
      this.camera.lookAt(lookFocusX, 1.05, lookFocusZ);
    } else {
      // Standard Free-Roam Isometric Camera
      const focusX = this.hero.pos.x * 0.55 + this.dummy.pos.x * 0.45;
      const focusZ = this.hero.pos.z * 0.55 + this.dummy.pos.z * 0.45;

      this.desiredCamPos.set(
        focusX + shake.x,
        6.6 + shake.y,
        focusZ + 5.6
      );
      this.camera.position.lerp(this.desiredCamPos, Math.min(1.0, dt * 6.0));
      this.camera.lookAt(focusX, 0.75, focusZ - 0.2);
    }
  }

  private emitUIState(): void {
    if (!this.onStateUpdate) return;
    const stability = Math.max(
      0,
      100 -
        Math.round(
          (Math.abs(this.hero.balancePitch) + Math.abs(this.hero.balanceRoll)) *
            90 +
            (this.hero.stumbleTimer > 0 ? 30 : 0)
        )
    );

    this.onStateUpdate({
      guardZone: this.hero.guardZone,
      stanceSide: this.hero.stanceSide,
      balanceStability: stability,
      isStumbled: this.hero.stumbleTimer > 0,
      isDashing: this.hero.dashTimer > 0,
      strikeMode: this.input.gesture.strikeMode,
      lastHit: this.lastTelemetry,
      flailSpinSpeed: Math.round(Math.abs(this.dummy.velTwistY) * 10) / 10,
      isTargetLocked: this.isTargetLocked,
      attackPhase: this.hero.attackPhase,
      isCancelable: this.hero.isCancelable(),
      bufferedAction: this.input.getBufferedActionSummary(),
    });
  }

  public resetDummy(): void {
    this.dummy.resetPosition();
  }

  public dispose(): void {
    this.stop();
    window.removeEventListener('resize', this.onResize);
    this.input.dispose();
    this.audio.dispose();
    this.vfx.dispose();
    this.arena.dispose();
    this.dummy.dispose();
    this.hero.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
  }
}
