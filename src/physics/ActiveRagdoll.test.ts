import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ActiveRagdoll, RAGDOLL_PRESETS } from './ActiveRagdoll.ts';
import { GhostRig } from './GhostRig.ts';

test('ActiveRagdoll applies presets correctly', () => {
  const ragdoll = new ActiveRagdoll();
  ragdoll.applyPreset('gang_beasts');
  assert.equal(ragdoll.kp, RAGDOLL_PRESETS.gang_beasts.kp);
  assert.equal(ragdoll.kd, RAGDOLL_PRESETS.gang_beasts.kd);
  assert.equal(ragdoll.kBalance, RAGDOLL_PRESETS.gang_beasts.kBalance);

  ragdoll.applyPreset('iron_knight');
  assert.equal(ragdoll.kp, RAGDOLL_PRESETS.iron_knight.kp);
  assert.equal(ragdoll.kd, RAGDOLL_PRESETS.iron_knight.kd);
  assert.equal(ragdoll.kBalance, RAGDOLL_PRESETS.iron_knight.kBalance);
});

test('toggleRagdoll collapses character into limp ragdoll and recovers into getting_up', () => {
  const ragdoll = new ActiveRagdoll();
  assert.equal(ragdoll.state, 'active');

  // Trigger ragdoll collapse ("обмякает мешком")
  ragdoll.toggleRagdoll();
  assert.equal(ragdoll.state, 'limp_ragdoll');
  assert.ok(ragdoll.rootVel.y < 0, 'Should have downward velocity on collapse');

  // Trigger stand back up
  ragdoll.toggleRagdoll();
  assert.equal(ragdoll.state, 'getting_up');
  assert.ok(ragdoll.getUpTimer > 0);
});

test('step updates physical bones and maintains joint limits', () => {
  const ragdoll = new ActiveRagdoll();
  const ghost = new GhostRig();
  const dummyPos = new THREE.Vector3(0, 0, -0.4);

  // Run a few physics steps
  for (let i = 0; i < 10; i++) {
    ragdoll.step(0.016, ghost, dummyPos);
  }

  // Knees cannot bend forwards past limit
  assert.ok(ragdoll.leftLegBone.rot.x <= 0.05);
  assert.ok(ragdoll.rightLegBone.rot.x <= 0.05);

  // Stability should be positive
  assert.ok(ragdoll.balanceStability > 0);
});
