/**
 * Active Ragdoll Simulation
 * Full Gang Beasts / Human: Fall Flat physics controller.
 * Implements:
 * 1. Articulated skeleton with physical colliders and joint constraints
 * 2. PD-controller torque motors with tunable stiffness (kp) and damping (kd)
 * 3. Honest active upright balance torque + hybrid hovercraft ground suspension
 * 4. Animated Target (Ghost Rig) tracking with real physical obstacle resistance
 * 5. Full Ragdoll collapse ("обмякает мешком") & recovery push-up transitions
 */

import * as THREE from 'three';
import { GhostRig } from './GhostRig.ts';
import {
  calculatePDTorque1D,
  calculatePDTorque3D,
  calculateUprightBalanceTorque,
  calculateHovercraftGroundSpring,
  clampConeTwist,
  clampHingeJoint,
  calculateRagdollStrain,
} from './ActiveRagdollMath.ts';
import { ARENA_CONFIG } from '../config/combatConfig.ts';

export type RagdollState = 'active' | 'limp_ragdoll' | 'getting_up' | 'stumbled';

export interface RagdollPreset {
  name: string;
  kp: number;
  kd: number;
  kBalance: number;
  description: string;
}

export const RAGDOLL_PRESETS: Record<string, RagdollPreset> = {
  gang_beasts: {
    name: 'Gang Beasts (Jelly)',
    kp: 95,
    kd: 7.5,
    kBalance: 150,
    description: 'Soft wobbly limbs with hilarious springy overshoot',
  },
  human_fall_flat: {
    name: 'Human: Fall Flat (Rubber)',
    kp: 165,
    kd: 14.0,
    kBalance: 230,
    description: 'Bouncy, elastic balance with responsive recovery',
  },
  iron_knight: {
    name: 'Iron Knight (Crisp)',
    kp: 380,
    kd: 28.0,
    kBalance: 340,
    description: 'Heavy plate armor with firm martial posture',
  },
};

export interface PhysicalBone {
  name: string;
  pos: THREE.Vector3;
  rot: THREE.Euler;
  vel: THREE.Vector3;
  angVel: THREE.Vector3;
  targetRot: THREE.Euler;
  mass: number;
}

export class ActiveRagdoll {
  // Current Ragdoll State
  public state: RagdollState = 'active';
  public getUpTimer = 0;
  public stumbleTimer = 0;

  // Active PD Controller & Balance Parameters
  public kp = RAGDOLL_PRESETS.human_fall_flat.kp;
  public kd = RAGDOLL_PRESETS.human_fall_flat.kd;
  public kBalance = RAGDOLL_PRESETS.human_fall_flat.kBalance;
  public cDamp = 18.0;

  // Physical Root (Pelvis) Dynamics
  public rootPos = new THREE.Vector3(0, 0.86, 2.3);
  public rootVel = new THREE.Vector3();
  public rootRot = new THREE.Euler(0, Math.PI, 0);
  public rootAngVel = new THREE.Vector3();

  // Physical Bones
  public pelvisBone: PhysicalBone;
  public torsoBone: PhysicalBone;
  public headBone: PhysicalBone;
  public leftShoulderBone: PhysicalBone;
  public leftElbowBone: PhysicalBone;
  public rightShoulderBone: PhysicalBone;
  public rightElbowBone: PhysicalBone;
  public swordBone: PhysicalBone;
  public leftLegBone: PhysicalBone;
  public rightLegBone: PhysicalBone;

  // Real physical contact / deflection on weapon or limbs
  public swordContactForce = new THREE.Vector3();
  public swordDeflection = new THREE.Vector3();
  public isWeaponBlocked = false;

  // Telemetry metrics
  public lastBalanceTorque = new THREE.Vector3();
  public currentStrain = 0;
  public balanceStability = 100;

  // Scratch vectors for zero GC
  private _upVec = new THREE.Vector3(0, 1, 0);
  private _torsoUp = new THREE.Vector3(0, 1, 0);
  private _rotMatrix = new THREE.Matrix4();
  private _contactScratch = new THREE.Vector3();

  constructor() {
    const makeBone = (name: string, mass: number): PhysicalBone => ({
      name,
      pos: new THREE.Vector3(),
      rot: new THREE.Euler(),
      vel: new THREE.Vector3(),
      angVel: new THREE.Vector3(),
      targetRot: new THREE.Euler(),
      mass,
    });

    this.pelvisBone = makeBone('pelvis', 15.0);
    this.torsoBone = makeBone('torso', 22.0);
    this.headBone = makeBone('head', 4.5);
    this.leftShoulderBone = makeBone('leftShoulder', 3.5);
    this.leftElbowBone = makeBone('leftElbow', 2.8);
    this.rightShoulderBone = makeBone('rightShoulder', 4.0);
    this.rightElbowBone = makeBone('rightElbow', 3.2);
    this.swordBone = makeBone('sword', 2.2);
    this.leftLegBone = makeBone('leftLeg', 8.0);
    this.rightLegBone = makeBone('rightLeg', 8.0);
  }

  /**
   * Applies preset physics parameters
   */
  public applyPreset(presetKey: 'gang_beasts' | 'human_fall_flat' | 'iron_knight'): void {
    const preset = RAGDOLL_PRESETS[presetKey];
    if (preset) {
      this.kp = preset.kp;
      this.kd = preset.kd;
      this.kBalance = preset.kBalance;
    }
  }

  /**
   * Toggles between full limp ragdoll ("обмякает мешком") and active standing
   */
  public toggleRagdoll(): void {
    if (this.state === 'limp_ragdoll') {
      this.state = 'getting_up';
      this.getUpTimer = 0.75;
    } else {
      this.state = 'limp_ragdoll';
      this.getUpTimer = 0;
      // Drop downward with gravity
      this.rootVel.y -= 1.8;
      this.rootAngVel.x += (Math.random() - 0.5) * 3.5;
      this.rootAngVel.z += (Math.random() - 0.5) * 3.5;
    }
  }

  /**
   * Triggers temporary stumble from a combat hit or counter-flail impact
   */
  public triggerStumble(severity = 0.55): void {
    this.state = 'stumbled';
    this.stumbleTimer = Math.max(this.stumbleTimer, severity);
    this.rootAngVel.x += (Math.random() - 0.5) * 4.0 * severity;
    this.rootAngVel.z += (Math.random() - 0.5) * 4.0 * severity;
  }

  /**
   * Physics Step
   * Runs PD controllers, upright balance torque, obstacle collision resistance, and joint constraints
   */
  public step(
    dt: number,
    ghost: GhostRig,
    dummyPos: THREE.Vector3,
    dummyRadius = 0.45
  ): void {
    // 1. Advance state transitions
    if (this.state === 'getting_up') {
      this.getUpTimer = Math.max(0, this.getUpTimer - dt);
      if (this.getUpTimer <= 0) {
        this.state = 'active';
      }
    } else if (this.state === 'stumbled') {
      this.stumbleTimer = Math.max(0, this.stumbleTimer - dt);
      if (this.stumbleTimer <= 0) {
        this.state = 'active';
      }
    }

    // Determine current effective muscle strength (kp) and balance (kBalance)
    let effectiveKp = this.kp;
    let effectiveKd = this.kd;
    let effectiveKBalance = this.kBalance;

    if (this.state === 'limp_ragdoll') {
      // "Обмякает мешком": complete zeroing of muscle stiffness and balance torque
      effectiveKp = 4.0;
      effectiveKd = 2.5;
      effectiveKBalance = 0.0;
    } else if (this.state === 'getting_up') {
      // Smooth push-up scramble back to feet
      const factor = 1.0 - this.getUpTimer / 0.75;
      effectiveKp = this.kp * Math.max(0.2, factor);
      effectiveKd = this.kd;
      effectiveKBalance = this.kBalance * factor;
    } else if (this.state === 'stumbled') {
      const recovery = 1.0 - Math.min(1.0, this.stumbleTimer / 0.6);
      effectiveKp = this.kp * (0.35 + 0.65 * recovery);
      effectiveKd = this.kd * 0.8;
      effectiveKBalance = this.kBalance * (0.25 + 0.75 * recovery);
    }

    // 2. Upright Balance Torque (Variant A - Honest Active Balance)
    // Directly applies restoring balance torque toward world up
    const tauX = -effectiveKBalance * this.rootRot.x - this.cDamp * this.rootAngVel.x;
    const tauZ = -effectiveKBalance * this.rootRot.z - this.cDamp * this.rootAngVel.z;
    this.lastBalanceTorque.set(tauX, 0, tauZ);

    // Apply balance torque to root angular velocity
    this.rootAngVel.x += (tauX / this.pelvisBone.mass) * dt;
    this.rootAngVel.z += (tauZ / this.pelvisBone.mass) * dt;

    // Dampen angular velocity
    const angularDamping = this.state === 'limp_ragdoll' ? 0.95 : 0.91;
    this.rootAngVel.multiplyScalar(Math.pow(angularDamping, dt * 60));

    this.rootRot.x += this.rootAngVel.x * dt;
    this.rootRot.z += this.rootAngVel.z * dt;

    // Clamp tilt angle when standing
    if (this.state !== 'limp_ragdoll') {
      this.rootRot.x = Math.max(-0.65, Math.min(0.65, this.rootRot.x));
      this.rootRot.z = Math.max(-0.65, Math.min(0.65, this.rootRot.z));
    }

    // 3. Ground Hovercraft / Suspension or Floor Collapse
    const groundY = 0;
    const targetStandingHeight = 0.86;
    const gravityForce = 9.81 * this.pelvisBone.mass;

    if (this.state === 'limp_ragdoll') {
      // Gravity pulls body to floor in limp ragdoll
      this.rootVel.y -= 9.81 * dt;
      this.rootPos.y += this.rootVel.y * dt;

      // Floor collision
      const floorCollapseY = 0.24;
      if (this.rootPos.y < floorCollapseY) {
        this.rootPos.y = floorCollapseY;
        this.rootVel.y = -this.rootVel.y * 0.15; // soft thud bounce
        this.rootVel.x *= 0.85; // floor friction
        this.rootVel.z *= 0.85;
      }
    } else {
      // Active Standing / Recovering: Hybrid Ground Spring
      const groundForce = calculateHovercraftGroundSpring(
        this.rootPos.y,
        groundY,
        targetStandingHeight,
        this.rootVel.y,
        650,
        48,
        gravityForce
      );
      this.rootVel.y += ((groundForce - gravityForce) / this.pelvisBone.mass) * dt;
      this.rootPos.y += this.rootVel.y * dt;

      if (this.rootPos.y < 0.35) {
        this.rootPos.y = 0.35;
        this.rootVel.y = 0;
      }
    }

    // Arena perimeter containment
    const distCenter = Math.hypot(this.rootPos.x, this.rootPos.z);
    if (distCenter > ARENA_CONFIG.MAX_PLAYER_RADIUS) {
      const push = (this.rootPos.x / distCenter) * ARENA_CONFIG.MAX_PLAYER_RADIUS;
      this.rootPos.x = push;
      this.rootPos.z = (this.rootPos.z / distCenter) * ARENA_CONFIG.MAX_PLAYER_RADIUS;
    }

    // 4. Physical Joint PD Controllers towards Ghost Rig Targets
    // Torso Joint (Ball / Cone-Twist constraint from Pelvis)
    this.applyJointPD(
      this.torsoBone,
      ghost.torso.rot,
      effectiveKp * 1.15,
      effectiveKd * 1.1,
      dt
    );
    const clampedTorso = clampConeTwist(
      this.torsoBone.rot.y,
      this.torsoBone.rot.x,
      this.torsoBone.rot.z,
      { maxYaw: 0.95, maxPitch: 0.8, maxRoll: 0.6 }
    );
    this.torsoBone.rot.set(clampedTorso.pitch, clampedTorso.yaw, clampedTorso.roll);

    // Head Joint (Cone-Twist constraint on neck)
    this.applyJointPD(
      this.headBone,
      ghost.head.rot,
      effectiveKp * 0.7,
      effectiveKd * 0.8,
      dt
    );
    const clampedHead = clampConeTwist(
      this.headBone.rot.y,
      this.headBone.rot.x,
      this.headBone.rot.z,
      { maxYaw: 0.65, maxPitch: 0.5, maxRoll: 0.35 }
    );
    this.headBone.rot.set(clampedHead.pitch, clampedHead.yaw, clampedHead.roll);

    // Left Arm (Counterbalance off-hand)
    this.applyJointPD(
      this.leftShoulderBone,
      ghost.leftShoulder.rot,
      effectiveKp * 0.65,
      effectiveKd * 0.75,
      dt
    );
    this.applyJointPD(
      this.leftElbowBone,
      ghost.leftElbow.rot,
      effectiveKp * 0.65,
      effectiveKd * 0.75,
      dt
    );
    // Elbow hinge limit (cannot bend backwards)
    this.leftElbowBone.rot.x = clampHingeJoint(this.leftElbowBone.rot.x, { min: 0.05, max: 2.3 });

    // Right Arm (Weapon Shoulder + Elbow)
    this.applyJointPD(
      this.rightShoulderBone,
      ghost.rightShoulder.rot,
      effectiveKp * 1.1,
      effectiveKd * 1.05,
      dt
    );
    this.applyJointPD(
      this.rightElbowBone,
      ghost.rightElbow.rot,
      effectiveKp * 1.25,
      effectiveKd * 1.15,
      dt
    );
    this.rightElbowBone.rot.x = clampHingeJoint(this.rightElbowBone.rot.x, { min: -1.8, max: 1.6 });

    // Legs (Hips + Knees)
    this.applyJointPD(
      this.leftLegBone,
      ghost.leftHip.rot,
      effectiveKp * 0.95,
      effectiveKd * 0.9,
      dt
    );
    this.applyJointPD(
      this.rightLegBone,
      ghost.rightHip.rot,
      effectiveKp * 0.95,
      effectiveKd * 0.9,
      dt
    );
    // Knee hinge constraints
    this.leftLegBone.rot.x = clampHingeJoint(this.leftLegBone.rot.x, { min: -2.1, max: 0.05 });
    this.rightLegBone.rot.x = clampHingeJoint(this.rightLegBone.rot.x, { min: -2.1, max: 0.05 });

    // 5. Sword Kinematic Attachment & Obstacle Resistance / Deflection
    this.updateSwordResistance(dt, ghost, dummyPos, dummyRadius, effectiveKp, effectiveKd);

    // 6. Calculate Strain Metric for Telemetry
    const jointErrors = [
      {
        x: ghost.torso.rot.x - this.torsoBone.rot.x,
        y: ghost.torso.rot.y - this.torsoBone.rot.y,
        z: ghost.torso.rot.z - this.torsoBone.rot.z,
      },
      {
        x: ghost.rightShoulder.rot.x - this.rightShoulderBone.rot.x,
        y: ghost.rightShoulder.rot.y - this.rightShoulderBone.rot.y,
        z: ghost.rightShoulder.rot.z - this.rightShoulderBone.rot.z,
      },
      {
        x: ghost.sword.rot.x - this.swordBone.rot.x,
        y: ghost.sword.rot.y - this.swordBone.rot.y,
        z: ghost.sword.rot.z - this.swordBone.rot.z,
      },
    ];
    this.currentStrain = calculateRagdollStrain(jointErrors);

    // Stability score (100% = upright stable, 0% = flat on floor)
    const tiltAmount = Math.abs(this.rootRot.x) + Math.abs(this.rootRot.z);
    this.balanceStability = Math.max(
      0,
      Math.min(100, Math.round((1.0 - Math.min(1.0, tiltAmount / 1.1)) * 100))
    );
  }

  /**
   * Applies 3D PD-motor torque to a physical bone toward its target orientation
   */
  private applyJointPD(
    bone: PhysicalBone,
    target: THREE.Euler,
    kp: number,
    kd: number,
    dt: number
  ): void {
    const torque = calculatePDTorque3D(
      { x: bone.rot.x, y: bone.rot.y, z: bone.rot.z },
      { x: target.x, y: target.y, z: target.z },
      { x: bone.angVel.x, y: bone.angVel.y, z: bone.angVel.z },
      kp,
      kd
    );

    bone.angVel.x += (torque.x / bone.mass) * dt;
    bone.angVel.y += (torque.y / bone.mass) * dt;
    bone.angVel.z += (torque.z / bone.mass) * dt;

    bone.rot.x += bone.angVel.x * dt;
    bone.rot.y += bone.angVel.y * dt;
    bone.rot.z += bone.angVel.z * dt;
  }

  /**
   * Sword Physics Resistance
   * If blade collides with an obstacle (like the wooden dummy), the physical arm & sword
   * get blocked and spring elastically backwards while the Ghost Rig continues,
   * providing the exact tactile resistance requested in section 4!
   */
  private updateSwordResistance(
    dt: number,
    ghost: GhostRig,
    dummyPos: THREE.Vector3,
    dummyRadius: number,
    kp: number,
    kd: number
  ): void {
    // Basic target sword orientation
    let targetRot = ghost.sword.rot;

    // Check distance between dummy and character
    const toDummy = this._contactScratch.subVectors(dummyPos, this.rootPos);
    toDummy.y = 0;
    const distToDummy = toDummy.length();

    // If close enough that the blade penetrates dummy collider
    if (distToDummy < dummyRadius + 1.25 && distToDummy > 0.05) {
      // Contact normal pushing away from dummy center
      const normal = toDummy.clone().normalize();
      const penetration = dummyRadius + 1.25 - distToDummy;

      // Spring resistance pushing sword back
      this.swordContactForce.copy(normal).multiplyScalar(-penetration * 48.0);
      this.swordDeflection.lerp(this.swordContactForce, Math.min(1.0, dt * 16.0));
      this.isWeaponBlocked = true;

      // Apply deflection counter-torque to sword bone
      this.swordBone.angVel.y += this.swordDeflection.x * 2.2 * dt;
      this.swordBone.angVel.x += this.swordDeflection.z * 1.8 * dt;
    } else {
      this.swordContactForce.set(0, 0, 0);
      this.swordDeflection.multiplyScalar(Math.pow(0.85, dt * 60));
      this.isWeaponBlocked = false;
    }

    // Apply sword PD motor
    this.applyJointPD(this.swordBone, targetRot, kp * 1.4, kd * 1.3, dt);
  }
}
