/**
 * Pure combat math and kinematic formulas.
 * Free of DOM and WebGL dependencies for deterministic testing and zero-overhead reuse.
 */

import { COMBAT_CONFIG } from '../config/combatConfig.ts';

export type HitZone = 'forte' | 'sweetspot' | 'point';
export type GuardZone = 'high' | 'mid' | 'low';
export type StrikeMode = 'cleave' | 'overhead' | 'undercut' | 'thrust' | 'none';

/**
 * Normalizes an angle into the [-PI, PI] range.
 */
export function normalizeAngle(angle: number): number {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/**
 * Clamps a number between min and max bounds.
 */
export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * Calculates a single Euler integration step of a damped harmonic oscillator.
 */
export function springDamperStep(
  current: number,
  target: number,
  velocity: number,
  stiffness: number,
  damping: number,
  dt: number,
  minVal?: number,
  maxVal?: number
): { value: number; velocity: number } {
  const displacement = target - current;
  const acceleration = displacement * stiffness - velocity * damping;
  const newVelocity = velocity + acceleration * dt;
  let newValue = current + newVelocity * dt;

  if (minVal !== undefined && maxVal !== undefined) {
    newValue = clamp(newValue, minVal, maxVal);
  }

  return { value: newValue, velocity: newVelocity };
}

/**
 * Computes Edge Alignment between blade cutting edge vector and its velocity vector.
 * Returns a value in [0.15, 1.0]. A value below FLAT_HIT_EDGE_ALIGN_THRESHOLD indicates a flat slap.
 */
export function calculateEdgeAlignment(
  velX: number,
  velY: number,
  velZ: number,
  edgeX: number,
  edgeY: number,
  edgeZ: number
): number {
  const vLen = Math.hypot(velX, velY, velZ);
  const eLen = Math.hypot(edgeX, edgeY, edgeZ);
  if (vLen < 0.0001 || eLen < 0.0001) {
    return 1.0;
  }
  const dot = (velX * edgeX + velY * edgeY + velZ * edgeZ) / (vLen * eLen);
  return clamp(Math.abs(dot) * 1.25 + 0.15, 0.15, 1.0);
}

/**
 * Determines which zone of the longsword landed the impact.
 * - Forte (ratio < 0.55): Heavy base near crossguard, high leverage, low velocity
 * - Sweet Spot (0.55 <= ratio < 0.84): Percussion center with maximum cutting leverage
 * - Point (ratio >= 0.84 or thrust): Tip puncture
 */
export function determineHitZone(
  ratioAlongBlade: number,
  isThrust: boolean,
  longitudinalAlignment: number
): HitZone {
  if (ratioAlongBlade >= 0.84 && (isThrust || longitudinalAlignment > 0.68)) {
    return 'point';
  }
  if (ratioAlongBlade < 0.55) {
    return 'forte';
  }
  return 'sweetspot';
}

/**
 * Calculates effective kinetic energy delivered into the target.
 * E_k = 0.5 * m * v^2 * alignment_multiplier
 */
export function calculateEffectiveKineticEnergy(
  mass: number,
  speed: number,
  alignmentMultiplier: number
): number {
  return 0.5 * mass * (speed * speed) * alignmentMultiplier;
}

/**
 * Classifies guard zone (High, Mid, Low) from cursor distance and angle relative to hero.
 */
export function classifyGuardZone(
  distanceFromHero: number,
  localAngleRad: number
): GuardZone {
  const { GUARD_ZONES } = COMBAT_CONFIG;
  if (
    distanceFromHero < GUARD_ZONES.HIGH_RADIUS_MAX &&
    Math.abs(localAngleRad) < GUARD_ZONES.HIGH_ANGLE_LIMIT_RAD
  ) {
    return 'high';
  }
  if (distanceFromHero > GUARD_ZONES.LOW_RADIUS_MIN) {
    return 'low';
  }
  return 'mid';
}

/**
 * Classifies mouse drag vector into deliberate strike intents.
 */
export function recognizeGestureType(
  dragForward: number,
  dragRight: number,
  chamberType: GuardZone
): StrikeMode | null {
  const { GESTURES } = COMBAT_CONFIG;
  const dragLen = Math.hypot(dragForward, dragRight);
  if (dragLen < GESTURES.DRAG_THRESHOLD_MIN) {
    return null;
  }

  // Pulled back towards hero -> Overhead Chop
  if (
    dragForward < GESTURES.OVERHEAD_DRAG_FORWARD_MAX &&
    Math.abs(dragRight) < GESTURES.OVERHEAD_DRAG_RIGHT_MAX
  ) {
    return 'overhead';
  }

  // Pushed forward diagonally from low stance -> Undercut
  if (
    dragForward > GESTURES.UNDERCUT_DRAG_FORWARD_MIN &&
    Math.abs(dragRight) > GESTURES.UNDERCUT_DRAG_RIGHT_MIN &&
    chamberType === 'low'
  ) {
    return 'undercut';
  }

  // Pushed straight forward -> Thrust
  if (
    dragForward > GESTURES.THRUST_DRAG_FORWARD_MIN &&
    Math.abs(dragRight) < GESTURES.THRUST_DRAG_RIGHT_MAX
  ) {
    return 'thrust';
  }

  // Lateral swipe -> Cleave
  if (Math.abs(dragRight) >= GESTURES.LATERAL_CLEAVE_DRAG_MIN) {
    return 'cleave';
  }

  return null;
}
