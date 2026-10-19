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

  private handleMouseMove(e: MouseEvent): void {
    this.mouseNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
    this.mouseNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
  }

  private handleMouseDown(e: MouseEvent): void {
    this.onUserInteraction?.();
    if (e.button === 0) {
      this.lmbDown = true;
    }
    if (e.button === 2) {
      this.rmbDown = true;
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

    if (code === 'Space' || code === 'AltLeft' || code === 'AltRight') {
      e.preventDefault();
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
