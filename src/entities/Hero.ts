/**
 * Hero Entity
 * Articulated Knight model, balance and center-of-mass kinematics,
 * walk cycle, sword arm kinematics, and blade coordinate tracking.
 */

import * as THREE from 'three';
import { HERO_CONFIG, ARENA_CONFIG, AttackPhase, STRIKE_PHASES } from '../config/combatConfig.ts';
import {
  applyPS1MaterialShader,
  applyVertexAO,
  ensureDefaultVertexColors,
} from '../rendering/ps1Shader.ts';
import {
  createArmorMetalTexture,
  createWoodTexture,
  createBurlapTexture,
  createBlobShadowTexture,
} from '../rendering/proceduralTextures.ts';
import { normalizeAngle, GuardZone, StrikeMode } from '../physics/combatMath.ts';

export class Hero {
  public group = new THREE.Group();
  public pelvis: THREE.Group;
  public torso: THREE.Group;
  public head: THREE.Group;
  public leftArm: THREE.Group;
  public rightShoulder: THREE.Group;
  public rightElbow: THREE.Group;
  public swordGroup: THREE.Group;
  public leftLeg: THREE.Group;
  public rightLeg: THREE.Group;
  public blobShadow: THREE.Mesh;

  public pos = new THREE.Vector3(
    HERO_CONFIG.INITIAL_POSITION.x,
    HERO_CONFIG.INITIAL_POSITION.y,
    HERO_CONFIG.INITIAL_POSITION.z
  );
  public vel = new THREE.Vector3();
  public angle = HERO_CONFIG.INITIAL_ANGLE;
  public angVel = 0;
  public walkCycle = 0;
  public stepTriggered = false;

  // Center of Mass & Balance
  public balancePitch = 0;
  public balanceRoll = 0;
  public balancePitchVel = 0;
  public balanceRollVel = 0;
  public stumbleTimer = 0;
  public dashCooldown = 0;
  public dashTimer = 0;

  // Weapon kinematics state
  public stanceSide = 1; // 1 = right, -1 = left
  public guardZone: GuardZone = 'mid';
  public bladeRoll = 0;
  public swingYaw = 0.6;
  public swingYawVel = 0;
  public swingPitch = 0.25;
  public swingPitchVel = 0;
  public thrustOffset = 0;
  public thrustVel = 0;
  public torsoTwist = 0;
  public torsoLean = 0;
  public hitCooldown = 0;

  // Strike Phases & Animation Canceling (Startup -> Active -> Recovery)
  public attackPhase: AttackPhase = 'idle';
  public phaseTimer = 0;
  public activeStrikeMode: StrikeMode = 'none';
  public activeStrikePower = 1.0;
  public activeStrikeDir = 1;
  public cancelFlashTimer = 0;
  public onAnimationCanceled?: (reason: 'dodge' | 'guard') => void;

  // Blade positions in local space
  public readonly swordBaseLocal = new THREE.Vector3(
    HERO_CONFIG.SWORD_GEOMETRY.BASE_LOCAL.x,
    HERO_CONFIG.SWORD_GEOMETRY.BASE_LOCAL.y,
    HERO_CONFIG.SWORD_GEOMETRY.BASE_LOCAL.z
  );
  public readonly swordMidLocal = new THREE.Vector3(
    HERO_CONFIG.SWORD_GEOMETRY.MID_LOCAL.x,
    HERO_CONFIG.SWORD_GEOMETRY.MID_LOCAL.y,
    HERO_CONFIG.SWORD_GEOMETRY.MID_LOCAL.z
  );
  public readonly swordTipLocal = new THREE.Vector3(
    HERO_CONFIG.SWORD_GEOMETRY.TIP_LOCAL.x,
    HERO_CONFIG.SWORD_GEOMETRY.TIP_LOCAL.y,
    HERO_CONFIG.SWORD_GEOMETRY.TIP_LOCAL.z
  );

  // Blade positions in world space (current & previous frame)
  public prevBaseWorld = new THREE.Vector3();
  public currBaseWorld = new THREE.Vector3();
  public prevMidWorld = new THREE.Vector3();
  public currMidWorld = new THREE.Vector3();
  public prevTipWorld = new THREE.Vector3();
  public currTipWorld = new THREE.Vector3();

  // Scratch vectors to ensure zero GC in hot loops
  private _forwardVec = new THREE.Vector3();
  private _rightVec = new THREE.Vector3();
  private _targetVel = new THREE.Vector3();
  private _tempVec = new THREE.Vector3();

  public onFootstep?: (isDash: boolean) => void;

  constructor(scene: THREE.Scene) {
    this.group.position.copy(this.pos);

    const armorTex = createArmorMetalTexture();
    const woodTex = createWoodTexture();
    const burlapTex = createBurlapTexture();
    const shadowTex = createBlobShadowTexture();

    const armorMat = applyPS1MaterialShader(
      new THREE.MeshLambertMaterial({
        map: armorTex,
        color: 0x9aa0a8,
        flatShading: true,
        vertexColors: true,
      })
    );
    const darkArmorMat = applyPS1MaterialShader(
      new THREE.MeshLambertMaterial({
        map: armorTex,
        color: 0x52565e,
        flatShading: true,
        vertexColors: true,
      })
    );
    const tunicMat = applyPS1MaterialShader(
      new THREE.MeshLambertMaterial({
        map: burlapTex,
        color: 0x6b2824,
        flatShading: true,
        vertexColors: true,
      })
    );
    const leatherMat = applyPS1MaterialShader(
      new THREE.MeshLambertMaterial({
        map: woodTex,
        color: 0x4a3221,
        flatShading: true,
        vertexColors: true,
      })
    );
    const bladeMat = applyPS1MaterialShader(
      new THREE.MeshLambertMaterial({
        color: 0xd8e2eb,
        flatShading: true,
        vertexColors: true,
      })
    );

    // Dynamic Blob shadow
    const shadowGeo = new THREE.CircleGeometry(0.52, 10);
    shadowGeo.rotateX(-Math.PI * 0.5);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
    });
    this.blobShadow = new THREE.Mesh(shadowGeo, shadowMat);
    this.blobShadow.position.set(this.pos.x, 0.015, this.pos.z);
    scene.add(this.blobShadow);

    // Pelvis with bottom AO
    this.pelvis = new THREE.Group();
    this.pelvis.position.y = 0.86;
    this.group.add(this.pelvis);

    const hipGeo = new THREE.BoxGeometry(0.42, 0.22, 0.28);
    applyVertexAO(hipGeo, -0.11, 0.11, 0.32, true);
    const hipMesh = new THREE.Mesh(hipGeo, tunicMat);
    this.pelvis.add(hipMesh);

    // Legs with vertex AO
    const createLeg = (xOffset: number) => {
      const legGroup = new THREE.Group();
      legGroup.position.set(xOffset, 0.84, 0);

      const thighGeo = new THREE.CylinderGeometry(0.11, 0.09, 0.44, 5, 2);
      applyVertexAO(thighGeo, -0.22, 0.22, 0.35, true);
      const thigh = new THREE.Mesh(thighGeo, darkArmorMat);
      thigh.position.y = -0.22;
      legGroup.add(thigh);

      const shinGeo = new THREE.CylinderGeometry(0.09, 0.07, 0.42, 5, 2);
      applyVertexAO(shinGeo, -0.21, 0.21, 0.28, true);
      const shin = new THREE.Mesh(shinGeo, armorMat);
      shin.position.y = -0.6;
      legGroup.add(shin);

      const bootGeo = new THREE.BoxGeometry(0.14, 0.12, 0.26);
      applyVertexAO(bootGeo, -0.06, 0.06, 0.2, true);
      const boot = new THREE.Mesh(bootGeo, leatherMat);
      boot.position.set(0, -0.8, -0.04);
      legGroup.add(boot);

      this.group.add(legGroup);
      return legGroup;
    };

    this.leftLeg = createLeg(0.14);
    this.rightLeg = createLeg(-0.14);

    // Torso with armpit/contact AO
    this.torso = new THREE.Group();
    this.torso.position.y = 0.12;
    this.pelvis.add(this.torso);

    const chestGeo = new THREE.CylinderGeometry(0.28, 0.21, 0.62, 6, 2);
    applyVertexAO(chestGeo, -0.31, 0.31, 0.38, true);
    const chestMesh = new THREE.Mesh(chestGeo, armorMat);
    chestMesh.position.y = 0.31;
    this.torso.add(chestMesh);

    const tabardGeo = new THREE.BoxGeometry(0.36, 0.58, 0.3);
    applyVertexAO(tabardGeo, -0.29, 0.29, 0.32, true);
    const tabard = new THREE.Mesh(tabardGeo, tunicMat);
    tabard.position.y = 0.28;
    this.torso.add(tabard);

    // Head & Helm with neck shadow AO
    this.head = new THREE.Group();
    this.head.position.y = 0.74;
    this.torso.add(this.head);

    const helmGeo = new THREE.CylinderGeometry(0.16, 0.19, 0.32, 6, 2);
    applyVertexAO(helmGeo, -0.16, 0.16, 0.4, true);
    const helmMesh = new THREE.Mesh(helmGeo, armorMat);
    helmMesh.position.y = 0.08;
    this.head.add(helmMesh);

    const visorGeo = new THREE.BoxGeometry(0.24, 0.05, 0.18);
    ensureDefaultVertexColors(visorGeo);
    const visor = new THREE.Mesh(
      visorGeo,
      applyPS1MaterialShader(new THREE.MeshBasicMaterial({ color: 0x111115 }))
    );
    visor.position.set(0, 0.1, -0.11);
    this.head.add(visor);

    // Left Arm (counterbalance)
    this.leftArm = new THREE.Group();
    this.leftArm.position.set(0.34, 0.54, 0);
    this.torso.add(this.leftArm);

    const lPauldronGeo = new THREE.DodecahedronGeometry(0.14, 0);
    ensureDefaultVertexColors(lPauldronGeo);
    const lPauldron = new THREE.Mesh(lPauldronGeo, armorMat);
    this.leftArm.add(lPauldron);

    const lLimbGeo = new THREE.CylinderGeometry(0.08, 0.06, 0.56, 5);
    applyVertexAO(lLimbGeo, -0.28, 0.28, 0.35, true);
    const lLimb = new THREE.Mesh(lLimbGeo, darkArmorMat);
    lLimb.position.set(0.05, -0.26, -0.1);
    lLimb.rotation.x = 0.45;
    this.leftArm.add(lLimb);

    // Right Arm (weapon arm)
    this.rightShoulder = new THREE.Group();
    this.rightShoulder.position.set(-0.34, 0.54, 0);
    this.torso.add(this.rightShoulder);

    const rPauldronGeo = new THREE.DodecahedronGeometry(0.15, 0);
    ensureDefaultVertexColors(rPauldronGeo);
    const rPauldron = new THREE.Mesh(rPauldronGeo, armorMat);
    this.rightShoulder.add(rPauldron);

    const upperArmGeo = new THREE.CylinderGeometry(0.08, 0.07, 0.36, 5);
    applyVertexAO(upperArmGeo, -0.18, 0.18, 0.35, true);
    const upperArm = new THREE.Mesh(upperArmGeo, darkArmorMat);
    upperArm.position.set(0, -0.16, -0.06);
    upperArm.rotation.x = 0.3;
    this.rightShoulder.add(upperArm);

    this.rightElbow = new THREE.Group();
    this.rightElbow.position.set(0, -0.32, -0.14);
    this.rightShoulder.add(this.rightElbow);

    const forearmGeo = new THREE.CylinderGeometry(0.07, 0.06, 0.36, 5);
    applyVertexAO(forearmGeo, -0.18, 0.18, 0.4, true);
    const forearm = new THREE.Mesh(forearmGeo, armorMat);
    forearm.position.set(0, 0, -0.18);
    forearm.rotation.x = Math.PI * 0.5;
    this.rightElbow.add(forearm);

    this.swordGroup = new THREE.Group();
    this.swordGroup.position.set(0, 0, -0.36);
    this.rightElbow.add(this.swordGroup);

    // Longsword parts
    const pommelGeo = new THREE.OctahedronGeometry(0.06, 0);
    ensureDefaultVertexColors(pommelGeo);
    const pommel = new THREE.Mesh(pommelGeo, darkArmorMat);
    pommel.position.y = -0.22;
    this.swordGroup.add(pommel);

    const gripGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.24, 5);
    ensureDefaultVertexColors(gripGeo);
    const grip = new THREE.Mesh(gripGeo, leatherMat);
    grip.position.y = -0.08;
    this.swordGroup.add(grip);

    const guardGeo = new THREE.BoxGeometry(0.38, 0.04, 0.06);
    ensureDefaultVertexColors(guardGeo);
    const guard = new THREE.Mesh(guardGeo, darkArmorMat);
    guard.position.y = 0.04;
    this.swordGroup.add(guard);

    const bladeGeo = new THREE.ConeGeometry(0.065, HERO_CONFIG.SWORD_GEOMETRY.BLADE_LENGTH, 4);
    bladeGeo.scale(1.0, 1.0, 0.28);
    ensureDefaultVertexColors(bladeGeo);
    const blade = new THREE.Mesh(bladeGeo, bladeMat);
    blade.position.y = 0.78;
    this.swordGroup.add(blade);

    scene.add(this.group);
    this.initWorldBladeCoords();
  }

  private initWorldBladeCoords(): void {
    this.group.updateMatrixWorld(true);

    this.currBaseWorld.copy(this.swordBaseLocal);
    this.swordGroup.localToWorld(this.currBaseWorld);
    this.prevBaseWorld.copy(this.currBaseWorld);

    this.currMidWorld.copy(this.swordMidLocal);
    this.swordGroup.localToWorld(this.currMidWorld);
    this.prevMidWorld.copy(this.currMidWorld);

    this.currTipWorld.copy(this.swordTipLocal);
    this.swordGroup.localToWorld(this.currTipWorld);
    this.prevTipWorld.copy(this.currTipWorld);
  }

  public isCancelable(): boolean {
    return this.attackPhase === 'recovery';
  }

  public startStrike(mode: StrikeMode, power: number, dirSign = 1): void {
    this.attackPhase = 'startup';
    this.phaseTimer = 0;
    this.activeStrikeMode = mode;
    this.activeStrikePower = power;
    this.activeStrikeDir = dirSign;
  }

  public cancelAttack(reason: 'dodge' | 'guard'): boolean {
    if (!this.isCancelable()) return false;
    this.attackPhase = 'idle';
    this.phaseTimer = 0;
    this.activeStrikeMode = 'none';
    this.cancelFlashTimer = 0.22;
    // Dampen swing velocities on cancel for crisp responsive recovery
    this.swingYawVel *= 0.18;
    this.swingPitchVel *= 0.18;
    this.thrustVel *= 0.12;
    this.onAnimationCanceled?.(reason);
    return true;
  }

  public updateAttackPhase(dt: number): AttackPhase {
    if (this.cancelFlashTimer > 0) {
      this.cancelFlashTimer = Math.max(0, this.cancelFlashTimer - dt);
    }

    if (this.attackPhase === 'idle' || this.activeStrikeMode === 'none') {
      return 'idle';
    }

    this.phaseTimer += dt;
    const timing = STRIKE_PHASES[this.activeStrikeMode] || STRIKE_PHASES.cleave;

    if (this.attackPhase === 'startup') {
      if (this.phaseTimer >= timing.startup) {
        this.attackPhase = 'active';
      }
    } else if (this.attackPhase === 'active') {
      if (this.phaseTimer >= timing.startup + timing.active) {
        this.attackPhase = 'recovery';
      }
    } else if (this.attackPhase === 'recovery') {
      if (this.phaseTimer >= timing.total) {
        this.attackPhase = 'idle';
        this.activeStrikeMode = 'none';
        this.phaseTimer = 0;
      }
    }

    return this.attackPhase;
  }

  public triggerFootworkDodge(
    keys: { w: boolean; a: boolean; s: boolean; d: boolean },
    isAttacking: boolean,
    isTargetLocked = false,
    dummyPos?: THREE.Vector3
  ): boolean {
    // Animation Canceling: Recovery phase can be canceled into a dodge!
    if (this.isCancelable()) {
      this.cancelAttack('dodge');
    } else if (this.attackPhase === 'startup' || this.attackPhase === 'active') {
      // Locked in startup windup or active swing
      return false;
    }

    if (this.dashCooldown > 0 || this.stumbleTimer > 0.12) return false;

    let fX: number, fZ: number, rX: number, rZ: number;

    if (isTargetLocked && dummyPos) {
      // In Z-Targeting mode: forward is towards dummy, right is tangent around dummy
      const toDummyX = dummyPos.x - this.pos.x;
      const toDummyZ = dummyPos.z - this.pos.z;
      const dist = Math.hypot(toDummyX, toDummyZ) || 1.0;
      fX = toDummyX / dist;
      fZ = toDummyZ / dist;
      rX = fZ;
      rZ = -fX;
    } else {
      fX = -Math.sin(this.angle);
      fZ = -Math.cos(this.angle);
      rX = Math.cos(this.angle);
      rZ = -Math.sin(this.angle);
    }

    this._forwardVec.set(fX, 0, fZ);
    this._rightVec.set(rX, 0, rZ);

    let moveF = 0;
    let moveS = 0;
    if (keys.w) moveF += 1;
    if (keys.s) moveF -= 1;
    if (keys.d) moveS += 1;
    if (keys.a) moveS -= 1;

    if (moveF === 0 && moveS === 0) {
      moveF = isAttacking ? 1 : -1;
    }

    this._tempVec
      .set(0, 0, 0)
      .addScaledVector(this._forwardVec, moveF)
      .addScaledVector(this._rightVec, moveS)
      .normalize();

    const dashSpeed = moveF > 0 ? HERO_CONFIG.SPEED.DASH_FORWARD : HERO_CONFIG.SPEED.DASH_BACKWARD;
    this.vel.addScaledVector(this._tempVec, dashSpeed);

    this.balancePitchVel += moveF * 2.4;
    this.balanceRollVel += moveS * 2.4;

    this.dashCooldown = HERO_CONFIG.TIMERS.DASH_COOLDOWN;
    this.dashTimer = HERO_CONFIG.TIMERS.DASH_DURATION;
    this.onFootstep?.(true);
    return true;
  }

  public updateMovement(
    dt: number,
    keys: { w: boolean; a: boolean; s: boolean; d: boolean },
    mouseWorld: THREE.Vector3,
    dummyPos: THREE.Vector3,
    isMouseDown: boolean,
    isTargetLocked = false
  ): void {
    if (this.stumbleTimer > 0) this.stumbleTimer = Math.max(0, this.stumbleTimer - dt);
    if (this.dashCooldown > 0) this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    if (this.dashTimer > 0) this.dashTimer = Math.max(0, this.dashTimer - dt);

    const swingIntensity = Math.min(
      1.0,
      Math.abs(this.swingYawVel) * 0.08 +
        Math.abs(this.swingPitchVel) * 0.08 +
        Math.abs(this.thrustVel) * 0.25
    );
    const stumblePenalty = this.stumbleTimer > 0 ? 0.38 : 1.0;

    // 1. Rotation towards target (Lock-On) or mouse (Free-Roam)
    let angleDiff = 0;
    if (isTargetLocked) {
      const toDummyX = dummyPos.x - this.pos.x;
      const toDummyZ = dummyPos.z - this.pos.z;
      const targetAngle = Math.atan2(-toDummyX, -toDummyZ);
      angleDiff = normalizeAngle(targetAngle - this.angle);

      const maxTurnSpeed = 8.5 * (1.0 - swingIntensity * 0.25) * stumblePenalty;
      const desiredAngVel = Math.max(-maxTurnSpeed, Math.min(maxTurnSpeed, angleDiff * 7.5));
      this.angVel += (desiredAngVel - this.angVel) * Math.min(1.0, dt * 14.0);
    } else {
      const dx = mouseWorld.x - this.pos.x;
      const dz = mouseWorld.z - this.pos.z;
      const targetAngle = Math.atan2(-dx, -dz);
      angleDiff = normalizeAngle(targetAngle - this.angle);

      const maxTurnSpeed =
        (isMouseDown
          ? HERO_CONFIG.ROTATION.MAX_TURN_SPEED_ATTACK
          : HERO_CONFIG.ROTATION.MAX_TURN_SPEED_IDLE) *
        (1.0 - swingIntensity * 0.35) *
        stumblePenalty;

      const desiredAngVel = Math.max(
        -maxTurnSpeed,
        Math.min(maxTurnSpeed, angleDiff * 5.2)
      );
      this.angVel +=
        (desiredAngVel - this.angVel) *
        Math.min(1.0, dt * HERO_CONFIG.ROTATION.TURN_RESPONSE_LERP);
    }

    const swingBodyTorque =
      -this.swingYawVel * HERO_CONFIG.ROTATION.SWING_BODY_TORQUE_FACTOR * dt;
    this.angle = normalizeAngle(this.angle + this.angVel * dt + swingBodyTorque);

    const headYaw = Math.max(
      -HERO_CONFIG.ROTATION.MAX_HEAD_YAW,
      Math.min(
        HERO_CONFIG.ROTATION.MAX_HEAD_YAW,
        angleDiff * HERO_CONFIG.ROTATION.HEAD_TRACKING_RATIO
      )
    );
    this.head.rotation.y = headYaw;

    // 2. Velocity & Strafing
    if (isTargetLocked) {
      // In Z-Targeting lock-on mode, movement is oriented around target:
      // Forward/Back = radial towards/away from dummy
      // Strafe A/D = tangential orbit around dummy
      const toDummyX = dummyPos.x - this.pos.x;
      const toDummyZ = dummyPos.z - this.pos.z;
      const dDist = Math.hypot(toDummyX, toDummyZ) || 1.0;
      const fX = toDummyX / dDist;
      const fZ = toDummyZ / dDist;
      const rX = fZ;
      const rZ = -fX;

      this._forwardVec.set(fX, 0, fZ);
      this._rightVec.set(rX, 0, rZ);
    } else {
      this._forwardVec.set(-Math.sin(this.angle), 0, -Math.cos(this.angle));
      this._rightVec.set(Math.cos(this.angle), 0, -Math.sin(this.angle));
    }

    let moveForward = 0;
    let moveStrafe = 0;
    if (keys.w) moveForward += 1.0;
    if (keys.s) moveForward -= 1.0;
    if (keys.d) moveStrafe += 1.0;
    if (keys.a) moveStrafe -= 1.0;

    const walkControlFactor = (1.0 - swingIntensity * 0.48) * stumblePenalty;
    const forwardSpeed = HERO_CONFIG.SPEED.FORWARD * walkControlFactor;
    const backpedalSpeed = HERO_CONFIG.SPEED.BACKPEDAL * walkControlFactor;
    const strafeSpeed = HERO_CONFIG.SPEED.STRAFE * walkControlFactor;

    this._targetVel.set(0, 0, 0);
    if (moveForward > 0) {
      this._targetVel.addScaledVector(this._forwardVec, forwardSpeed);
    } else if (moveForward < 0) {
      this._targetVel.addScaledVector(this._forwardVec, -backpedalSpeed);
    }

    if (moveStrafe !== 0) {
      this._targetVel.addScaledVector(this._rightVec, moveStrafe * strafeSpeed);
    }

    if (moveForward !== 0 && moveStrafe !== 0) {
      this._targetVel.multiplyScalar(HERO_CONFIG.SPEED.DIAGONAL_PENALTY);
    }

    // Blade inertia pulls
    const forwardPull =
      Math.max(0, -this.swingPitchVel) * 0.11 +
      Math.max(0, this.thrustVel) * 0.42 +
      Math.abs(this.swingYawVel) * 0.045;
    const lateralPull = -this.swingYawVel * 0.085;

    this._targetVel.addScaledVector(this._forwardVec, Math.min(1.35, forwardPull));
    this._targetVel.addScaledVector(
      this._rightVec,
      Math.max(-0.95, Math.min(0.95, lateralPull))
    );

    const traction =
      this.stumbleTimer > 0 || this.dashTimer > 0
        ? HERO_CONFIG.BALANCE.GROUND_TRACTION_STUMBLED
        : HERO_CONFIG.BALANCE.GROUND_TRACTION_NORMAL;
    this.vel.lerp(this._targetVel, Math.min(1.0, dt * traction));
    this.pos.addScaledVector(this.vel, dt);

    // Center of Mass (Balance) Spring
    const balSpring = HERO_CONFIG.BALANCE.SPRING_K;
    const balDamp = HERO_CONFIG.BALANCE.DAMPING;
    const maxTilt = HERO_CONFIG.BALANCE.MAX_TILT_RAD;

    const pitchAcc =
      (forwardPull * 0.18 - this.balancePitch) * balSpring - this.balancePitchVel * balDamp;
    const rollAcc =
      (lateralPull * 0.22 - this.balanceRoll) * balSpring - this.balanceRollVel * balDamp;

    this.balancePitchVel += pitchAcc * dt;
    this.balanceRollVel += rollAcc * dt;
    this.balancePitch = Math.max(
      -maxTilt,
      Math.min(maxTilt, this.balancePitch + this.balancePitchVel * dt)
    );
    this.balanceRoll = Math.max(
      -maxTilt,
      Math.min(maxTilt, this.balanceRoll + this.balanceRollVel * dt)
    );

    this.pelvis.rotation.x = this.balancePitch;
    this.pelvis.rotation.z = -this.balanceRoll;

    // Boundary constraints: Separation from dummy
    const toHeroX = this.pos.x - dummyPos.x;
    const toHeroZ = this.pos.z - dummyPos.z;
    const distToDummy = Math.hypot(toHeroX, toHeroZ);
    if (distToDummy < HERO_CONFIG.MIN_SEPARATION_FROM_DUMMY && distToDummy > 0.0001) {
      const push = HERO_CONFIG.MIN_SEPARATION_FROM_DUMMY - distToDummy;
      this.pos.x += (toHeroX / distToDummy) * push;
      this.pos.z += (toHeroZ / distToDummy) * push;
    }

    // Platform boundary
    const distFromCenter = Math.hypot(this.pos.x, this.pos.z);
    if (distFromCenter > ARENA_CONFIG.MAX_PLAYER_RADIUS) {
      this.pos.x = (this.pos.x / distFromCenter) * ARENA_CONFIG.MAX_PLAYER_RADIUS;
      this.pos.z = (this.pos.z / distFromCenter) * ARENA_CONFIG.MAX_PLAYER_RADIUS;
    }

    this.group.position.copy(this.pos);
    this.group.rotation.y = this.angle;

    // Update blob shadow
    if (this.blobShadow) {
      const leanWorldX =
        this._forwardVec.x * this.balancePitch * 0.35 +
        this._rightVec.x * this.balanceRoll * 0.35;
      const leanWorldZ =
        this._forwardVec.z * this.balancePitch * 0.35 +
        this._rightVec.z * this.balanceRoll * 0.35;
      this.blobShadow.position.set(
        this.pos.x + leanWorldX,
        0.015,
        this.pos.z + leanWorldZ
      );
    }

    this.updateLegs(dt, moveStrafe);
  }

  private updateLegs(dt: number, moveStrafe: number): void {
    const speedMag = this.vel.length();
    const rotFootWork = Math.abs(this.angVel) * 0.35;
    const balanceStepWork =
      (Math.abs(this.balancePitch) + Math.abs(this.balanceRoll)) * 1.4;
    const totalStepSpeed = speedMag + rotFootWork + balanceStepWork;

    if (totalStepSpeed > 0.15) {
      const localVelForward = this.vel.dot(this._forwardVec);
      const cycleDir = localVelForward < -0.1 ? -1 : 1;
      this.walkCycle += cycleDir * totalStepSpeed * dt * 4.4;

      const stride = Math.min(1.15, totalStepSpeed / 2.0);
      const sinPhase = Math.sin(this.walkCycle);
      const cosPhase = Math.cos(this.walkCycle);

      this.leftLeg.rotation.x = sinPhase * 0.52 * stride - this.balancePitch * 0.45;
      this.rightLeg.rotation.x = -sinPhase * 0.52 * stride - this.balancePitch * 0.45;

      const strafeRoll = (moveStrafe * 0.22 + this.balanceRoll * 0.6) * stride;
      this.leftLeg.rotation.z = Math.max(0, cosPhase * 0.18 * stride) + strafeRoll * 0.5;
      this.rightLeg.rotation.z = -Math.max(0, -cosPhase * 0.18 * stride) + strafeRoll * 0.5;

      const stumbleDrop = Math.min(
        0.12,
        (Math.abs(this.balancePitch) + Math.abs(this.balanceRoll)) * 0.18 +
          (this.dashTimer > 0 ? 0.05 : 0)
      );
      this.pelvis.position.y = 0.86 - stumbleDrop + Math.abs(cosPhase) * 0.045 * stride;

      if (Math.abs(sinPhase) > 0.92 && !this.stepTriggered) {
        this.onFootstep?.(false);
        this.stepTriggered = true;
      } else if (Math.abs(sinPhase) < 0.4) {
        this.stepTriggered = false;
      }
    } else {
      this.leftLeg.rotation.x *= 0.85;
      this.rightLeg.rotation.x *= 0.85;
      this.leftLeg.rotation.z = 0.08;
      this.rightLeg.rotation.z = -0.08;
      this.pelvis.position.y += (0.86 - this.pelvis.position.y) * 0.15;
    }
  }

  public applyArmKinematics(
    dt: number,
    targetYaw: number,
    targetPitch: number,
    targetThrust: number,
    targetBladeRoll: number,
    springStiffness: number,
    damping: number,
    isRMBThrustGuard: boolean
  ): void {
    let stiff = springStiffness;
    let damp = damping;
    if (this.stumbleTimer > 0) {
      stiff *= 0.35;
      damp *= 0.75;
    }

    // Yaw
    const yawAccel = (targetYaw - this.swingYaw) * stiff - this.swingYawVel * damp;
    this.swingYawVel += yawAccel * dt;
    this.swingYaw = Math.max(-1.85, Math.min(1.85, this.swingYaw + this.swingYawVel * dt));

    // Pitch
    const pitchAccel = (targetPitch - this.swingPitch) * stiff - this.swingPitchVel * damp;
    this.swingPitchVel += pitchAccel * dt;
    this.swingPitch = Math.max(-0.65, Math.min(1.55, this.swingPitch + this.swingPitchVel * dt));

    // Thrust
    const thrustAccel = (targetThrust - this.thrustOffset) * 55.0 - this.thrustVel * 9.0;
    this.thrustVel += thrustAccel * dt;
    this.thrustOffset = Math.max(0, Math.min(0.72, this.thrustOffset + this.thrustVel * dt));

    // Kinetic chain
    this.torsoTwist = this.swingYaw * 0.46;
    this.torsoLean =
      -this.swingPitch * 0.24 + this.thrustOffset * 0.36 + this.balancePitch * 0.65;

    this.torso.rotation.y = this.torsoTwist;
    this.torso.rotation.x = this.torsoLean;
    this.torso.rotation.z = -this.swingYaw * 0.11 - this.balanceRoll * 0.5;

    this.leftArm.rotation.x = -0.35 - this.torsoLean * 0.85 - this.balancePitch * 0.9;
    this.leftArm.rotation.z =
      0.25 + Math.abs(this.swingYaw) * 0.18 + Math.abs(this.balanceRoll) * 0.6;

    this.rightShoulder.rotation.y = this.swingYaw * 0.62;
    this.rightShoulder.rotation.x =
      this.swingPitch * 0.75 + 0.35 + this.thrustOffset * 0.4;
    this.rightShoulder.rotation.z = -0.22 - this.swingYaw * 0.25;

    this.rightElbow.rotation.y = this.swingYaw * 0.35;
    this.rightElbow.rotation.x =
      -0.25 + this.swingPitch * 0.4 - this.thrustOffset * 0.55;
    this.rightElbow.position.z = -0.14 - this.thrustOffset * 0.42;

    this.bladeRoll += (targetBladeRoll - this.bladeRoll) * Math.min(1.0, dt * 14.0);

    if (isRMBThrustGuard) {
      this.swordGroup.rotation.x = -Math.PI * 0.42;
      this.swordGroup.rotation.y = 0;
      this.swordGroup.rotation.z = 0;
    } else {
      this.swordGroup.rotation.x = -0.55 + this.swingPitch * 0.48;
      this.swordGroup.rotation.y = this.bladeRoll;
      this.swordGroup.rotation.z = this.swingYaw * 0.58;
    }

    // Save previous blade world coords and compute new ones
    this.prevBaseWorld.copy(this.currBaseWorld);
    this.prevMidWorld.copy(this.currMidWorld);
    this.prevTipWorld.copy(this.currTipWorld);

    this.group.updateMatrixWorld(true);

    this.currBaseWorld.copy(this.swordBaseLocal);
    this.swordGroup.localToWorld(this.currBaseWorld);

    this.currMidWorld.copy(this.swordMidLocal);
    this.swordGroup.localToWorld(this.currMidWorld);

    this.currTipWorld.copy(this.swordTipLocal);
    this.swordGroup.localToWorld(this.currTipWorld);
  }

  public getTipSpeed(dt: number): number {
    return this.currTipWorld.distanceTo(this.prevTipWorld) / Math.max(0.001, dt);
  }

  public dispose(): void {
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
  }
}
