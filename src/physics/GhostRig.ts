/**
 * Ghost Rig (Animated Kinematic Target Skeleton)
 * Represents the invisible reference skeleton from Gang Beasts / Human Fall Flat design.
 * Computes procedural stride animations, weapon chambering, strike trajectories,
 * and balance postures without physical constraints. The Active Ragdoll motors
 * pull their physical rigidbodies toward these Ghost Rig orientations via PD controllers.
 */

import * as THREE from 'three';
import type { StrikeMode, GuardZone } from './combatMath.ts';
import type { AttackPhase } from '../config/combatConfig.ts';
import { clamp, clampConeTwist, clampHingeJoint } from './ActiveRagdollMath.ts';

export interface BoneTransform {
  pos: THREE.Vector3;
  rot: THREE.Euler;
}

export class GhostRig {
  // Target transforms for all anatomical body segments
  public pelvis = { pos: new THREE.Vector3(0, 0.86, 0), rot: new THREE.Euler() };
  public torso = { pos: new THREE.Vector3(0, 0.12, 0), rot: new THREE.Euler() };
  public head = { pos: new THREE.Vector3(0, 0.74, 0), rot: new THREE.Euler() };
  public leftShoulder = { pos: new THREE.Vector3(0.34, 0.54, 0), rot: new THREE.Euler() };
  public leftElbow = { pos: new THREE.Vector3(0.39, 0.28, -0.1), rot: new THREE.Euler() };
  public rightShoulder = { pos: new THREE.Vector3(-0.34, 0.54, 0), rot: new THREE.Euler() };
  public rightElbow = { pos: new THREE.Vector3(-0.34, 0.22, -0.14), rot: new THREE.Euler() };
  public sword = { pos: new THREE.Vector3(-0.34, 0.22, -0.5), rot: new THREE.Euler() };
  public leftHip = { pos: new THREE.Vector3(0.14, 0.84, 0), rot: new THREE.Euler() };
  public leftKnee = { pos: new THREE.Vector3(0.14, 0.42, 0), rot: new THREE.Euler() };
  public rightHip = { pos: new THREE.Vector3(-0.14, 0.84, 0), rot: new THREE.Euler() };
  public rightKnee = { pos: new THREE.Vector3(-0.14, 0.42, 0), rot: new THREE.Euler() };

  // Internal kinematic states
  public walkCycle = 0;
  public swingProgress = 0;
  public swingYaw = 0.6;
  public swingPitch = 0.25;
  public thrustOffset = 0;
  public bladeRoll = 0;

  // Visual helper group for debugging or toggling ghost representation
  public helperGroup: THREE.Group;
  private ghostMaterials: THREE.LineBasicMaterial[] = [];

  constructor() {
    this.helperGroup = new THREE.Group();
    this.helperGroup.name = 'GhostRigVisualHelper';
    this.helperGroup.visible = false; // Hidden by default, toggled via UI
    this.buildGhostWireframe();
  }

  private buildGhostWireframe(): void {
    const mat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.65,
      depthTest: false,
    });
    this.ghostMaterials.push(mat);

    // Spine & Pelvis box
    const spineGeo = new THREE.BoxGeometry(0.36, 0.6, 0.26);
    const spineEdges = new THREE.EdgesGeometry(spineGeo);
    const spineLine = new THREE.LineSegments(spineEdges, mat);
    spineLine.position.y = 1.05;
    this.helperGroup.add(spineLine);

    // Head sphere wireframe
    const headGeo = new THREE.SphereGeometry(0.18, 8, 6);
    const headEdges = new THREE.EdgesGeometry(headGeo);
    const headLine = new THREE.LineSegments(headEdges, mat);
    headLine.position.y = 1.62;
    this.helperGroup.add(headLine);

    // Sword line indicator
    const swordGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 1.2, 0),
    ]);
    const swordLine = new THREE.Line(
      swordGeo,
      new THREE.LineBasicMaterial({ color: 0x34d399, transparent: true, opacity: 0.85 })
    );
    swordLine.position.set(-0.35, 1.0, -0.3);
    this.helperGroup.add(swordLine);
  }

  /**
   * Updates Ghost Rig target poses based on player inputs and attack states
   */
  public update(
    dt: number,
    pos: THREE.Vector3,
    angle: number,
    vel: THREE.Vector3,
    guardZone: GuardZone,
    stanceSide: number,
    attackPhase: AttackPhase,
    activeStrikeMode: StrikeMode,
    activeStrikePower: number,
    activeStrikeDir: number,
    isRMBThrust: boolean,
    headTargetYaw: number,
    isDashing: boolean
  ): void {
    // 1. Root Position
    this.pelvis.pos.set(pos.x, 0.86, pos.z);
    this.pelvis.rot.set(0, angle, 0);

    // 2. Procedural Walking Stride
    const speed = THREE.MathUtils.clamp(vel.length(), 0, 4.0);
    if (speed > 0.15) {
      this.walkCycle += dt * speed * 5.0;
      const sinCycle = Math.sin(this.walkCycle);
      const cosCycle = Math.cos(this.walkCycle);
      const stride = Math.min(1.0, speed / 2.2);

      // Pelvis vertical bobbing
      this.pelvis.pos.y = 0.86 + Math.abs(cosCycle) * 0.04 * stride;

      // Legs swing
      this.leftHip.rot.x = sinCycle * 0.55 * stride;
      this.rightHip.rot.x = -sinCycle * 0.55 * stride;

      // Knees bend on backswing (cannot invert forward)
      this.leftKnee.rot.x = clampHingeJoint(-Math.max(0, -sinCycle) * 0.9 * stride, { min: -2.0, max: 0 });
      this.rightKnee.rot.x = clampHingeJoint(-Math.max(0, sinCycle) * 0.9 * stride, { min: -2.0, max: 0 });
    } else {
      this.walkCycle = 0;
      this.pelvis.pos.y = 0.86;
      this.leftHip.rot.x *= 0.8;
      this.rightHip.rot.x *= 0.8;
      this.leftKnee.rot.x *= 0.8;
      this.rightKnee.rot.x *= 0.8;
    }

    // 3. Head Tracking (with neck cone-twist limits)
    const clampedHead = clampConeTwist(headTargetYaw, 0, 0, {
      maxYaw: 0.55,
      maxPitch: 0.45,
      maxRoll: 0.3,
    });
    this.head.rot.set(clampedHead.pitch, clampedHead.yaw, clampedHead.roll);

    // 4. Stance & Combat Strike Kinematics
    let targetYaw = 0.6 * stanceSide;
    let targetPitch = 0.25;
    let targetThrust = 0;
    let targetBladeRoll = 0;

    if (guardZone === 'high') {
      targetPitch = 0.95;
      targetYaw = 0.35 * stanceSide;
      targetBladeRoll = 0.35 * stanceSide;
    } else if (guardZone === 'low') {
      targetPitch = -0.35;
      targetYaw = 0.75 * stanceSide;
      targetBladeRoll = -0.4 * stanceSide;
    }

    if (isRMBThrust) {
      targetThrust = 0.55;
      targetPitch = 0.05;
      targetYaw = 0.15 * stanceSide;
    }

    // Process Strike Animation Window
    if (attackPhase === 'startup') {
      // Chambering wind-up in reverse direction
      targetYaw = -1.15 * activeStrikeDir;
      if (activeStrikeMode === 'overhead') targetPitch = 1.25;
      else if (activeStrikeMode === 'undercut') targetPitch = -0.45;
    } else if (attackPhase === 'active') {
      // Dynamic sweep through
      targetYaw = 1.45 * activeStrikeDir * activeStrikePower;
      if (activeStrikeMode === 'overhead') targetPitch = -0.35;
      else if (activeStrikeMode === 'undercut') targetPitch = 0.85;
      else if (activeStrikeMode === 'thrust') targetThrust = 0.72;
    } else if (attackPhase === 'recovery') {
      // Follow-through decay back toward stance
      targetYaw = 0.85 * activeStrikeDir;
      if (activeStrikeMode === 'overhead') targetPitch = -0.15;
    }

    // Smooth ghost rig transitions
    this.swingYaw += (targetYaw - this.swingYaw) * Math.min(1.0, dt * 18.0);
    this.swingPitch += (targetPitch - this.swingPitch) * Math.min(1.0, dt * 18.0);
    this.thrustOffset += (targetThrust - this.thrustOffset) * Math.min(1.0, dt * 22.0);
    this.bladeRoll += (targetBladeRoll - this.bladeRoll) * Math.min(1.0, dt * 14.0);

    // Torso Counter-twist and kinetic chain
    this.torso.rot.y = this.swingYaw * 0.46;
    this.torso.rot.x = -this.swingPitch * 0.22 + this.thrustOffset * 0.35;
    this.torso.rot.z = -this.swingYaw * 0.1;

    // Off-hand (left arm) counterbalance
    this.leftShoulder.rot.x = -0.35 - this.torso.rot.x * 0.8;
    this.leftShoulder.rot.z = 0.25 + Math.abs(this.swingYaw) * 0.2;
    this.leftElbow.rot.x = 0.45;

    // Weapon Arm (right shoulder + elbow)
    this.rightShoulder.rot.y = this.swingYaw * 0.62;
    this.rightShoulder.rot.x = this.swingPitch * 0.75 + 0.35 + this.thrustOffset * 0.4;
    this.rightShoulder.rot.z = -0.22 - this.swingYaw * 0.25;

    this.rightElbow.rot.y = this.swingYaw * 0.35;
    this.rightElbow.rot.x = -0.25 + this.swingPitch * 0.4 - this.thrustOffset * 0.55;
    this.rightElbow.pos.z = -0.14 - this.thrustOffset * 0.42;

    // Sword
    if (isRMBThrust) {
      this.sword.rot.set(-Math.PI * 0.42, 0, 0);
    } else {
      this.sword.rot.set(
        -0.55 + this.swingPitch * 0.48,
        this.bladeRoll,
        this.swingYaw * 0.58
      );
    }

    // Sync visual helper if enabled
    if (this.helperGroup.visible) {
      this.helperGroup.position.copy(pos);
      this.helperGroup.rotation.y = angle;
    }
  }

  public setVisible(visible: boolean): void {
    this.helperGroup.visible = visible;
  }

  public dispose(): void {
    this.ghostMaterials.forEach((m) => m.dispose());
  }
}
