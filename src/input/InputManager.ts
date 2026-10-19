/**
 * Input Manager
 * Decouples DOM keyboard and mouse events, raycasts onto ground plane,
 * and tracks combat gesture strokes.
 */

import * as THREE from 'three';
import { ARENA_CONFIG } from '../config/combatConfig.ts';
import { GuardZone, StrikeMode } from '../physics/combatMath.ts';

export interface GestureState {
  active: boolean;
  startTime: number;
  startWorld: THREE.Vector3;
  startNDC: THREE.Vector2;
  startRadius: number;
  startLocalAngle: number;
  chamberType: GuardZone;
  discharged: boolean;
  strikeMode: StrikeMode;
  strikeTimer: number;
  strikeTargetYaw: number;
  strikeTargetPitch: number;
  strikeTargetThrust: number;
}

export type BufferedActionType = 'strike' | 'dodge' | 'thrust' | 'guard' | 'lock_toggle';

export interface BufferedInput {
  id: number;
  type: BufferedActionType;
  timestamp: number;
  ttlMs: number;
  data?: Record<string, any>;
}

export class InputManager {
  public keys = { w: false, a: false, s: false, d: false };
  public mouseNDC = new THREE.Vector2(0, 0);
  public prevMouseNDC = new THREE.Vector2(0, 0);
  public mouseScreenVel = new THREE.Vector2(0, 0);

  public mouseWorld = new THREE.Vector3(0, 0, 2);
  public prevMouseWorld = new THREE.Vector3(0, 0, 2);

  public lmbDown = false;
  public rmbDown = false;

  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private hitPoint = new THREE.Vector3();

  // 100-150ms Input Buffering Queue
  private actionBuffer: BufferedInput[] = [];
  private actionIdCounter = 0;
  public readonly bufferTtlMs = 150;

  public gesture: GestureState = {
    active: false,
    startTime: 0,
    startWorld: new THREE.Vector3(),
    startNDC: new THREE.Vector2(),
    startRadius: 1.8,
    startLocalAngle: 0,
    chamberType: 'mid',
    discharged: false,
    strikeMode: 'none',
    strikeTimer: 0,
    strikeTargetYaw: 0,
    strikeTargetPitch: 0,
    strikeTargetThrust: 0,
  };

  public onFootworkDodge?: () => void;
  public onLockToggle?: () => void;
  public onRagdollToggle?: () => void;
  public onGhostToggle?: () => void;
  public onUserInteraction?: () => void;

  private boundMouseMove: (e: MouseEvent) => void;
  private boundMouseDown: (e: MouseEvent) => void;
  private boundMouseUp: (e: MouseEvent) => void;
  private boundKeyDown: (e: KeyboardEvent) => void;
  private boundKeyUp: (e: KeyboardEvent) => void;
  private boundContextMenu: (e: MouseEvent) => void;

  constructor() {
    this.boundMouseMove = this.handleMouseMove.bind(this);
    this.boundMouseDown = this.handleMouseDown.bind(this);
    this.boundMouseUp = this.handleMouseUp.bind(this);
    this.boundKeyDown = this.handleKeyDown.bind(this);
    this.boundKeyUp = this.handleKeyUp.bind(this);
    this.boundContextMenu = (e) => e.preventDefault();

    window.addEventListener('mousemove', this.boundMouseMove);
    window.addEventListener('mousedown', this.boundMouseDown);
    window.addEventListener('mouseup', this.boundMouseUp);
    window.addEventListener('keydown', this.boundKeyDown);
    window.addEventListener('keyup', this.boundKeyUp);
    window.addEventListener('contextmenu', this.boundContextMenu);
  }

  /**
   * Pushes an intent into the input queue with a 150ms window.
   */
  public bufferAction(type: BufferedActionType, data?: Record<string, any>, ttlMs = this.bufferTtlMs): void {
    const now = performance.now();
    // Keep buffer lean by removing expired actions
    this.actionBuffer = this.actionBuffer.filter((act) => now - act.timestamp < act.ttlMs);

    // Replace previous unconsumed identical action with fresh timestamp
    const existingIdx = this.actionBuffer.findIndex((act) => act.type === type);
    if (existingIdx !== -1) {
      this.actionBuffer[existingIdx].timestamp = now;
      this.actionBuffer[existingIdx].ttlMs = ttlMs;
      if (data) this.actionBuffer[existingIdx].data = data;
      return;
    }

    this.actionBuffer.push({
      id: ++this.actionIdCounter,
      type,
      timestamp: now,
      ttlMs,
      data,
    });
  }

  /**
   * Peeks the most relevant buffered action without consuming.
   */
  public peekAction(types?: BufferedActionType[]): BufferedInput | null {
    this.updateBuffer();
    if (this.actionBuffer.length === 0) return null;
    if (!types) return this.actionBuffer[0];
    return this.actionBuffer.find((act) => types.includes(act.type)) || null;
  }

  /**
   * Consumes and removes the earliest action matching requested types.
   */
  public consumeAction(types?: BufferedActionType[]): BufferedInput | null {
    this.updateBuffer();
    if (this.actionBuffer.length === 0) return null;

    if (!types) {
      return this.actionBuffer.shift() || null;
    }

    const idx = this.actionBuffer.findIndex((act) => types.includes(act.type));
    if (idx === -1) return null;
    const [action] = this.actionBuffer.splice(idx, 1);
    return action;
  }

  public hasAction(type: BufferedActionType): boolean {
    this.updateBuffer();
    return this.actionBuffer.some((act) => act.type === type);
  }

  public clearBuffer(): void {
    this.actionBuffer = [];
  }

  public updateBuffer(): void {
    const now = performance.now();
    this.actionBuffer = this.actionBuffer.filter((act) => now - act.timestamp < act.ttlMs);
  }

  public getBufferedActionSummary(): string | null {
    this.updateBuffer();
    if (this.actionBuffer.length === 0) return null;
    return this.actionBuffer[this.actionBuffer.length - 1].type.toUpperCase();
  }

  private handleMouseMove(e: MouseEvent): void {
    this.mouseNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
    this.mouseNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
  }

  private handleMouseDown(e: MouseEvent): void {
    this.onUserInteraction?.();
    if (e.button === 0) {
      this.lmbDown = true;
    }
    if (e.button === 1) {
      // Middle mouse click toggles Z-Targeting
      e.preventDefault();
      this.onLockToggle?.();
    }
    if (e.button === 2) {
      this.rmbDown = true;
      this.bufferAction('guard', undefined, 120);
    }
  }

  private handleMouseUp(e: MouseEvent): void {
    if (e.button === 0) {
      this.lmbDown = false;
    }
    if (e.button === 2) {
      this.rmbDown = false;
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    this.onUserInteraction?.();
    const code = e.code;
    if (code === 'KeyW' || code === 'ArrowUp') this.keys.w = true;
    if (code === 'KeyS' || code === 'ArrowDown') this.keys.s = true;
    if (code === 'KeyA' || code === 'ArrowLeft') this.keys.a = true;
    if (code === 'KeyD' || code === 'ArrowRight') this.keys.d = true;

    // Z-Targeting / Lock-on toggle keys: F, Q, or Z
    if (code === 'KeyF' || code === 'KeyQ' || code === 'KeyZ') {
      e.preventDefault();
      this.bufferAction('lock_toggle', undefined, 150);
      this.onLockToggle?.();
      return;
    }

    // Active Ragdoll Toggle: R key
    if (code === 'KeyR') {
      e.preventDefault();
      this.onRagdollToggle?.();
      return;
    }

    // Ghost Rig Wireframe Visibility Toggle: G key
    if (code === 'KeyG') {
      e.preventDefault();
      this.onGhostToggle?.();
      return;
    }

    if (code === 'Space' || code === 'AltLeft' || code === 'AltRight') {
      e.preventDefault();
      // Buffer dodge intent so it triggers immediately or as soon as animation enters recovery phase
      this.bufferAction('dodge', { keys: { ...this.keys } }, 150);
      this.onFootworkDodge?.();
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    const code = e.code;
    if (code === 'KeyW' || code === 'ArrowUp') this.keys.w = false;
    if (code === 'KeyS' || code === 'ArrowDown') this.keys.s = false;
    if (code === 'KeyA' || code === 'ArrowLeft') this.keys.a = false;
    if (code === 'KeyD' || code === 'ArrowRight') this.keys.d = false;
  }

  public updateRaycast(camera: THREE.Camera): void {
    this.raycaster.setFromCamera(this.mouseNDC, camera);
    if (this.raycaster.ray.intersectPlane(this.groundPlane, this.hitPoint)) {
      const dist = Math.hypot(this.hitPoint.x, this.hitPoint.z);
      const maxLimit = ARENA_CONFIG.RADIUS + 2.0;
      if (dist > maxLimit) {
        this.hitPoint.x = (this.hitPoint.x / dist) * maxLimit;
        this.hitPoint.z = (this.hitPoint.z / dist) * maxLimit;
      }
      this.mouseWorld.copy(this.hitPoint);
    }
  }

  public updateVelocities(dt: number): void {
    const safeDt = Math.max(0.001, dt);
    const screenUpVel = (this.mouseNDC.y - this.prevMouseNDC.y) / safeDt;
    const screenRightVel = (this.mouseNDC.x - this.prevMouseNDC.x) / safeDt;
    this.mouseScreenVel.set(screenRightVel, screenUpVel);
  }

  public lateUpdate(): void {
    this.prevMouseWorld.copy(this.mouseWorld);
    this.prevMouseNDC.copy(this.mouseNDC);
  }

  public dispose(): void {
    window.removeEventListener('mousemove', this.boundMouseMove);
    window.removeEventListener('mousedown', this.boundMouseDown);
    window.removeEventListener('mouseup', this.boundMouseUp);
    window.removeEventListener('keydown', this.boundKeyDown);
    window.removeEventListener('keyup', this.boundKeyUp);
    window.removeEventListener('contextmenu', this.boundContextMenu);
  }
}
