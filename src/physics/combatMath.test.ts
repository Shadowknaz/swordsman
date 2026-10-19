import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeAngle,
  clamp,
  springDamperStep,
  calculateEdgeAlignment,
  determineHitZone,
  calculateEffectiveKineticEnergy,
  classifyGuardZone,
  recognizeGestureType,
} from './combatMath.ts';

test('normalizeAngle restricts radians to [-PI, PI]', () => {
  assert.equal(Math.round(normalizeAngle(0)), 0);
  // cos/sin equivalence for wrap-around
  const wrapped = normalizeAngle(3 * Math.PI);
  assert.ok(Math.abs(wrapped) <= Math.PI);
  assert.ok(Math.abs(Math.cos(wrapped) - Math.cos(Math.PI)) < 1e-5);
  assert.ok(Math.abs(normalizeAngle(Math.PI * 2)) < 1e-6);
});

test('clamp ensures value sits within bounds', () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-2, 0, 10), 0);
  assert.equal(clamp(15, 0, 10), 10);
});

test('springDamperStep accelerates towards target', () => {
  const current = 0;
  const target = 1;
  const velocity = 0;
  const stiffness = 20;
  const damping = 5;
  const dt = 0.05;

  const result = springDamperStep(current, target, velocity, stiffness, damping, dt);
  assert.ok(result.velocity > 0, 'Velocity should increase towards target');
  assert.ok(result.value > current, 'Value should move towards target');
});

test('calculateEdgeAlignment computes perpendicular vs parallel edge dot product', () => {
  // Perfect alignment: velocity aligned with cutting edge
  const perfect = calculateEdgeAlignment(1, 0, 0, 1, 0, 0);
  assert.equal(perfect, 1.0);

  // Perpendicular alignment: velocity perpendicular to cutting edge (flat slap)
  const flat = calculateEdgeAlignment(0, 0, 1, 1, 0, 0);
  assert.equal(flat, 0.15);
});

test('determineHitZone classifies forte, sweetspot, and point accurately', () => {
  // Forte: close to crossguard
  assert.equal(determineHitZone(0.3, false, 0.1), 'forte');
  // Sweet spot: cutting section on a swing
  assert.equal(determineHitZone(0.7, false, 0.1), 'sweetspot');
  // Transverse cut with the tip is still sweetspot cut
  assert.equal(determineHitZone(0.9, false, 0.1), 'sweetspot');
  // Puncture thrust with tip triggers point
  assert.equal(determineHitZone(0.9, true, 0.8), 'point');
});

test('calculateEffectiveKineticEnergy scales quadratically with speed', () => {
  const mass = 1.2;
  const speed1 = 2.0;
  const speed2 = 4.0;
  const e1 = calculateEffectiveKineticEnergy(mass, speed1, 1.0);
  const e2 = calculateEffectiveKineticEnergy(mass, speed2, 1.0);
  assert.equal(e1, 0.5 * 1.2 * 4.0);
  assert.equal(e2, 0.5 * 1.2 * 16.0);
  assert.equal(e2 / e1, 4.0);
});

test('classifyGuardZone recognizes radial combat ranges', () => {
  assert.equal(classifyGuardZone(1.0, 0.2), 'high');
  assert.equal(classifyGuardZone(1.8, 0.2), 'mid');
  assert.equal(classifyGuardZone(2.8, 0.2), 'low');
});

test('recognizeGestureType classifies drag directions into strikes', () => {
  // Pull back towards body -> Overhead
  assert.equal(recognizeGestureType(-0.3, 0.05, 'high'), 'overhead');
  // Thrust straight forward
  assert.equal(recognizeGestureType(0.4, 0.05, 'mid'), 'thrust');
  // Undercut from low stance
  assert.equal(recognizeGestureType(0.35, 0.25, 'low'), 'undercut');
  // Horizontal cleave
  assert.equal(recognizeGestureType(0.05, 0.35, 'mid'), 'cleave');
});
