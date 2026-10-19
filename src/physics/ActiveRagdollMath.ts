/**
 * Active Ragdoll Math & Controller Utilities
 * Implements Proportional-Derivative (PD) controllers, active upright balance torque,
 * quaternion angular error vectors, and joint constraint clamping.
 * Decoupled pure logic module ready for Node.js native testing.
 */

export interface JointAngleLimits {
  min: number;
  max: number;
}

export interface ConeTwistLimits {
  maxYaw: number;
  maxPitch: number;
  maxRoll: number;
}

/**
 * 1D Proportional-Derivative (PD) Controller
 * Formula: tau = kp * (target - current) - kd * angularVelocity
 *
 * @param current Current angle or position
 * @param target Desired target angle or position
 * @param velocity Current angular or linear velocity
 * @param kp Proportional spring stiffness coefficient
 * @param kd Derivative damping coefficient
 * @returns Restoring control torque / acceleration
 */
export function calculatePDTorque1D(
  current: number,
  target: number,
  velocity: number,
  kp: number,
  kd: number
): number {
  const error = target - current;
  return kp * error - kd * velocity;
}

/**
 * Normalizes an angle into the [-PI, PI] range
 */
export function normalizeAngle(angle: number): number {
  let a = angle % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  if (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/**
 * Clamps a 1D value between min and max bounds
 */
export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * Clamps a hinge joint angle to physical anatomical limits
 * e.g. knees cannot bend forwards past 0, elbows cannot bend backwards past 0
 */
export function clampHingeJoint(angle: number, limits: JointAngleLimits): number {
  return clamp(angle, limits.min, limits.max);
}

/**
 * Clamps spherical 3D rotation angles (yaw, pitch, roll) to cone-twist limits
 * Prevents head or limbs from spinning 360 degrees
 */
export function clampConeTwist(
  yaw: number,
  pitch: number,
  roll: number,
  limits: ConeTwistLimits
): { yaw: number; pitch: number; roll: number } {
  return {
    yaw: clamp(yaw, -limits.maxYaw, limits.maxYaw),
    pitch: clamp(pitch, -limits.maxPitch, limits.maxPitch),
    roll: clamp(roll, -limits.maxRoll, limits.maxRoll),
  };
}

/**
 * 3D Active Upright Balance Torque (Honest Balance - Variant A)
 * Formula: tau_balance = k_balance * (n_current x n_up) - c_damp * omega
 *
 * @param nCurrent Current normalized up vector of the character's spine/pelvis (x, y, z)
 * @param nUp Desired world up vector (default 0, 1, 0)
 * @param angVel Current angular velocity vector (x, y, z)
 * @param kBalance Upright spring stiffness coefficient (set to 0 when knocked out / ragdolling!)
 * @param cDamp Angular damping coefficient
 * @returns Restoring balance torque vector [tx, ty, tz]
 */
export function calculateUprightBalanceTorque(
  nCurrent: { x: number; y: number; z: number },
  nUp: { x: number; y: number; z: number } = { x: 0, y: 1, z: 0 },
  angVel: { x: number; y: number; z: number },
  kBalance: number,
  cDamp: number
): { x: number; y: number; z: number } {
  // Cross product: nCurrent x nUp
  const crossX = nCurrent.y * nUp.z - nCurrent.z * nUp.y;
  const crossY = nCurrent.z * nUp.x - nCurrent.x * nUp.z;
  const crossZ = nCurrent.x * nUp.y - nCurrent.y * nUp.x;

  return {
    x: kBalance * crossX - cDamp * angVel.x,
    y: kBalance * crossY - cDamp * angVel.y,
    z: kBalance * crossZ - cDamp * angVel.z,
  };
}

/**
 * Computes 3D angular error vector between current and target Euler rotations (in radians)
 * Taking shortest circular path along [-PI, PI] for each axis
 */
export function calculateAngularError3D(
  current: { x: number; y: number; z: number },
  target: { x: number; y: number; z: number }
): { x: number; y: number; z: number } {
  return {
    x: normalizeAngle(target.x - current.x),
    y: normalizeAngle(target.y - current.y),
    z: normalizeAngle(target.z - current.z),
  };
}

/**
 * 3D Proportional-Derivative (PD) Motor Torque
 * tau = kp * angularError - kd * angularVelocity
 */
export function calculatePDTorque3D(
  current: { x: number; y: number; z: number },
  target: { x: number; y: number; z: number },
  angVel: { x: number; y: number; z: number },
  kp: number,
  kd: number
): { x: number; y: number; z: number } {
  const err = calculateAngularError3D(current, target);
  return {
    x: kp * err.x - kd * angVel.x,
    y: kp * err.y - kd * angVel.y,
    z: kp * err.z - kd * angVel.z,
  };
}

/**
 * Spring Raycast / Hovercraft Vertical Ground Support Force
 * Supports the pelvis stably at the target standing height above ground
 *
 * @param currentY Current vertical position of root / pelvis
 * @param groundY Ground height at current (x, z)
 * @param targetHeight Ideal standing clearance above ground (e.g. 0.86m)
 * @param verticalVel Current vertical velocity
 * @param kGround Ground suspension spring stiffness
 * @param dGround Suspension damping
 */
export function calculateHovercraftGroundSpring(
  currentY: number,
  groundY: number,
  targetHeight: number,
  verticalVel: number,
  kGround: number,
  dGround: number,
  gravityCompensation = 0
): number {
  const distanceAboveGround = currentY - groundY;
  const compression = targetHeight - distanceAboveGround;

  // Spring supports body weight plus elastic restorative force
  const springForce = gravityCompensation + kGround * compression - dGround * verticalVel;
  return Math.max(0, springForce);
}

/**
 * Computes total angular strain metric across joints
 * Used for HUD telemetry to show how much the active ragdoll is flexing / resisting
 */
export function calculateRagdollStrain(
  jointErrors: Array<{ x: number; y: number; z: number }>
): number {
  if (jointErrors.length === 0) return 0;
  let totalSq = 0;
  for (let i = 0; i < jointErrors.length; i++) {
    const e = jointErrors[i];
    totalSq += e.x * e.x + e.y * e.y + e.z * e.z;
  }
  return Math.sqrt(totalSq / jointErrors.length);
}
