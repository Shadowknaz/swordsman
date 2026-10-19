import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePDTorque1D,
  calculatePDTorque3D,
  calculateUprightBalanceTorque,
  calculateAngularError3D,
  clampHingeJoint,
  clampConeTwist,
  calculateHovercraftGroundSpring,
  calculateRagdollStrain,
  normalizeAngle,
} from './ActiveRagdollMath.ts';

test('calculatePDTorque1D produces restorative torque toward target with damping', () => {
  // Target is ahead by 0.5 rad, angular velocity is zero
  const torqueRestoring = calculatePDTorque1D(0.0, 0.5, 0.0, 100, 10);
  assert.equal(torqueRestoring, 50);

  // When moving rapidly towards target (velocity = 5), damping reduces torque
  const torqueDamped = calculatePDTorque1D(0.0, 0.5, 5.0, 100, 10);
  assert.equal(torqueDamped, 0); // 50 - 50 = 0

  // Overshooting target (current > target) produces negative torque
  const torqueNegative = calculatePDTorque1D(1.0, 0.5, 0.0, 100, 10);
  assert.equal(torqueNegative, -50);
});

test('calculateUprightBalanceTorque generates honest restoring torque to align with world up (0, 1, 0)', () => {
  // Character is tilted sideways to the right (normal vector tilted in +X)
  const nCurrent = { x: 0.38, y: 0.92, z: 0 };
  const angVel = { x: 0, y: 0, z: 0 };
  const kBalance = 200;
  const cDamp = 15;

  const torque = calculateUprightBalanceTorque(nCurrent, { x: 0, y: 1, z: 0 }, angVel, kBalance, cDamp);
  // Cross product (0.38, 0.92, 0) x (0, 1, 0) = (0, 0, 0.38)
  assert.equal(torque.x, 0);
  assert.equal(torque.y, 0);
  assert.ok(torque.z > 50, 'Should apply strong restorative torque in Z to counter roll tilt');

  // When kBalance is zero (limp ragdoll knockdown), balance torque drops to 0
  const limpTorque = calculateUprightBalanceTorque(nCurrent, { x: 0, y: 1, z: 0 }, angVel, 0, cDamp);
  assert.equal(limpTorque.x, 0);
  assert.equal(limpTorque.y, 0);
  assert.equal(limpTorque.z, 0);
});

test('calculateAngularError3D handles shortest circular paths and wraparound', () => {
  const current = { x: 0.1, y: 3.1, z: -0.2 };
  const target = { x: 0.3, y: -3.1, z: -0.2 };
  const err = calculateAngularError3D(current, target);

  assert.ok(Math.abs(err.x - 0.2) < 0.001);
  // 3.1 to -3.1 wraparound distance is small (~0.083), not full circle
  assert.ok(Math.abs(err.y) < 0.2);
  assert.equal(err.z, 0);
});

test('clampHingeJoint constrains elbow and knee rotation strictly to anatomical bounds', () => {
  const kneeLimits = { min: -2.1, max: 0.0 }; // Knees only bend backwards

  assert.equal(clampHingeJoint(-1.2, kneeLimits), -1.2);
  assert.equal(clampHingeJoint(0.5, kneeLimits), 0.0); // Cannot hyperextend forwards
  assert.equal(clampHingeJoint(-3.0, kneeLimits), -2.1); // Cannot overbend beyond 2.1 rad
});

test('clampConeTwist restricts spherical joints from 360-degree spinning', () => {
  const neckLimits = { maxYaw: 0.55, maxPitch: 0.45, maxRoll: 0.3 };

  const clamped = clampConeTwist(1.5, -0.9, 0.1, neckLimits);
  assert.equal(clamped.yaw, 0.55);
  assert.equal(clamped.pitch, -0.45);
  assert.equal(clamped.roll, 0.1);
});

test('calculateHovercraftGroundSpring provides upward buoyant force on ground compression', () => {
  const groundY = 0;
  const targetHeight = 0.86;
  const kGround = 600;
  const dGround = 45;

  // Pelvis dropped to 0.7m (0.16m below target) with zero vertical velocity
  const force = calculateHovercraftGroundSpring(0.7, groundY, targetHeight, 0, kGround, dGround);
  assert.ok(force > 90, 'Ground spring should push up firmly to maintain standing stance');

  // Pelvis high in air (1.5m), no ground force
  const airborneForce = calculateHovercraftGroundSpring(1.5, groundY, targetHeight, 0, kGround, dGround);
  assert.equal(airborneForce, 0);
});

test('calculateRagdollStrain computes aggregate RMS joint flex for telemetry', () => {
  const errors = [
    { x: 0.1, y: 0.2, z: 0.0 },
    { x: 0.0, y: 0.0, z: 0.0 },
  ];
  const strain = calculateRagdollStrain(errors);
  assert.ok(strain > 0.15 && strain < 0.17);
});
