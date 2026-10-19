/**
 * Training Dummy Entity (Quintain)
 * Articulated wooden dummy with X/Z spring-damper tilt,
 * 360-degree rotational swivel around Y, and a counterweight flail.
 * Enhanced with baked PS1 vertex ambient occlusion for grounded base shadows.
 */

import * as THREE from 'three';
import { DUMMY_CONFIG } from '../config/combatConfig.ts';
import { applyPS1MaterialShader, applyVertexAO, ensureDefaultVertexColors } from '../rendering/ps1Shader.ts';
import {
  createWoodTexture,
  createArmorMetalTexture,
  createBurlapTexture,
  createBlobShadowTexture,
} from '../rendering/proceduralTextures.ts';
import { normalizeAngle } from '../physics/combatMath.ts';

export class TrainingDummy {
  public group = new THREE.Group();
  public pivotGroup = new THREE.Group();
  public torsoMesh: THREE.Mesh;
  public headMesh: THREE.Mesh;
  public shieldArm: THREE.Mesh;
  public flailPivot: THREE.Group;
  public flailWeight: THREE.Mesh;
  public blobShadow: THREE.Mesh;

  public pos = new THREE.Vector3(
    DUMMY_CONFIG.INITIAL_POSITION.x,
    DUMMY_CONFIG.INITIAL_POSITION.y,
    DUMMY_CONFIG.INITIAL_POSITION.z
  );
  public radius = DUMMY_CONFIG.COLLISION_RADIUS;

  // Spring-damper angular tilt + Quintain Y rotation
  public tiltX = 0;
  public tiltZ = 0;
  public velX = 0;
  public velZ = 0;
  public twistY = 0;
  public velTwistY = 0;
  public flailSwingAngle = 0;
  public counterHitCooldown = 0;

  constructor(scene: THREE.Scene) {
    this.group.position.copy(this.pos);

    const woodTex = createWoodTexture();
    const ironTex = createArmorMetalTexture();
    const burlapTex = createBurlapTexture();
    const shadowTex = createBlobShadowTexture();

    const woodMat = applyPS1MaterialShader(
      new THREE.MeshLambertMaterial({
        map: woodTex,
        color: 0xc29b68,
        flatShading: true,
        vertexColors: true,
      })
    );
    const darkWoodMat = applyPS1MaterialShader(
      new THREE.MeshLambertMaterial({
        map: woodTex,
        color: 0x6e5233,
        flatShading: true,
        vertexColors: true,
      })
    );
    const ironMat = applyPS1MaterialShader(
      new THREE.MeshLambertMaterial({
        map: ironTex,
        color: 0x777d84,
        flatShading: true,
        vertexColors: true,
      })
    );
    const sackMat = applyPS1MaterialShader(
      new THREE.MeshLambertMaterial({
        map: burlapTex,
        color: 0xd4be94,
        flatShading: true,
        vertexColors: true,
      })
    );

    // Blob shadow
    const shadowGeo = new THREE.CircleGeometry(0.76, 12);
    shadowGeo.rotateX(-Math.PI * 0.5);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
    });
    this.blobShadow = new THREE.Mesh(shadowGeo, shadowMat);
    this.blobShadow.position.set(this.pos.x, 0.012, this.pos.z);
    scene.add(this.blobShadow);

    // Wooden cross base with baked contact AO
    const cross1Geo = new THREE.BoxGeometry(1.3, 0.14, 0.26);
    applyVertexAO(cross1Geo, -0.07, 0.07, 0.2, true);
    const cross1 = new THREE.Mesh(cross1Geo, darkWoodMat);
    cross1.position.y = 0.07;

    const cross2Geo = new THREE.BoxGeometry(0.26, 0.14, 1.3);
    applyVertexAO(cross2Geo, -0.07, 0.07, 0.2, true);
    const cross2 = new THREE.Mesh(cross2Geo, darkWoodMat);
    cross2.position.y = 0.07;
    this.group.add(cross1, cross2);

    // Spring base with bottom contact AO
    const springGeo = new THREE.CylinderGeometry(0.16, 0.18, 0.35, 6, 2);
    applyVertexAO(springGeo, -0.175, 0.175, 0.25, true);
    const springMesh = new THREE.Mesh(springGeo, ironMat);
    springMesh.position.y = 0.22;
    this.group.add(springMesh);

    // Pivot group
    this.pivotGroup.position.y = 0.32;
    this.group.add(this.pivotGroup);

    // Central wooden post with gradient AO along height
    const postGeo = new THREE.CylinderGeometry(0.11, 0.12, 1.7, 6, 4);
    applyVertexAO(postGeo, -0.85, 0.85, 0.26, true);
    const post = new THREE.Mesh(postGeo, darkWoodMat);
    post.position.y = 0.85;
    this.pivotGroup.add(post);

    // Iron swivel ring
    const swivelRingGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.12, 6);
    ensureDefaultVertexColors(swivelRingGeo);
    const swivelRing = new THREE.Mesh(swivelRingGeo, ironMat);
    swivelRing.position.y = 0.45;
    this.pivotGroup.add(swivelRing);

    // Torso barrel with bottom AO
    const torsoGeo = new THREE.CylinderGeometry(0.33, 0.29, 0.92, 8, 3);
    applyVertexAO(torsoGeo, -0.46, 0.46, 0.38, true);
    this.torsoMesh = new THREE.Mesh(torsoGeo, woodMat);
    this.torsoMesh.position.y = 0.96;
    this.pivotGroup.add(this.torsoMesh);

    // Torso iron bands
    const bandGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.07, 8);
    ensureDefaultVertexColors(bandGeo);
    const topBand = new THREE.Mesh(bandGeo, ironMat);
    topBand.position.y = 1.24;
    const botBand = new THREE.Mesh(bandGeo, ironMat);
    botBand.position.y = 0.68;
    this.pivotGroup.add(topBand, botBand);

    // Horizontal arm bar
    const armBarGeo = new THREE.BoxGeometry(1.52, 0.13, 0.13);
    ensureDefaultVertexColors(armBarGeo);
    const armBar = new THREE.Mesh(armBarGeo, darkWoodMat);
    armBar.position.set(0.08, 1.18, 0);
    this.pivotGroup.add(armBar);

    // Practice shield (-X)
    const shieldGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.08, 8);
    ensureDefaultVertexColors(shieldGeo);
    this.shieldArm = new THREE.Mesh(shieldGeo, woodMat);
    this.shieldArm.rotation.z = Math.PI * 0.5;
    this.shieldArm.rotation.y = 0.25;
    this.shieldArm.position.set(-0.62, 1.12, 0.12);
    this.pivotGroup.add(this.shieldArm);

    // Counterweight flail (+X)
    this.flailPivot = new THREE.Group();
    this.flailPivot.position.set(0.82, 1.18, 0);
    this.pivotGroup.add(this.flailPivot);

    const chainLinkGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.36, 4);
    ensureDefaultVertexColors(chainLinkGeo);
    const chainLink = new THREE.Mesh(chainLinkGeo, ironMat);
    chainLink.position.y = -0.18;
    this.flailPivot.add(chainLink);

    const flailWeightGeo = new THREE.DodecahedronGeometry(0.19, 0);
    applyVertexAO(flailWeightGeo, -0.19, 0.19, 0.45, true);
    this.flailWeight = new THREE.Mesh(flailWeightGeo, sackMat);
    this.flailWeight.position.y = -0.42;
    this.flailPivot.add(this.flailWeight);

    const weightBandGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.06, 6);
    ensureDefaultVertexColors(weightBandGeo);
    const weightBand = new THREE.Mesh(weightBandGeo, ironMat);
    weightBand.position.y = -0.42;
    this.flailPivot.add(weightBand);

    // Straw head
    const headGeo = new THREE.DodecahedronGeometry(0.24, 0);
    ensureDefaultVertexColors(headGeo);
    this.headMesh = new THREE.Mesh(headGeo, sackMat);
    this.headMesh.position.y = 1.68;
    this.pivotGroup.add(this.headMesh);

    scene.add(this.group);
  }

  public update(dt: number): void {
    const { SPRING_K, SPRING_DAMPING, ROTATIONAL_FRICTION, MAX_TILT_RAD } = DUMMY_CONFIG;

    // X and Z spring tilt
    const accX = -this.tiltX * SPRING_K - this.velX * SPRING_DAMPING;
    const accZ = -this.tiltZ * SPRING_K - this.velZ * SPRING_DAMPING;
    this.velX += accX * dt;
    this.velZ += accZ * dt;

    this.tiltX = Math.max(-MAX_TILT_RAD, Math.min(MAX_TILT_RAD, this.tiltX + this.velX * dt));
    this.tiltZ = Math.max(-MAX_TILT_RAD, Math.min(MAX_TILT_RAD, this.tiltZ + this.velZ * dt));

    // Quintain Y swivel rotation with bearing friction
    this.velTwistY *= Math.max(0, 1.0 - ROTATIONAL_FRICTION * dt);
    this.twistY = normalizeAngle(this.twistY + this.velTwistY * dt);

    if (this.counterHitCooldown > 0) {
      this.counterHitCooldown -= dt;
    }

    // Centrifugal outward swing of the spiked sack / flail weight
    const spinSpeed = Math.abs(this.velTwistY);
    const targetFlailAngle = Math.min(1.42, spinSpeed * 0.14);
    this.flailSwingAngle += (targetFlailAngle - this.flailSwingAngle) * Math.min(1.0, dt * 14.0);
    this.flailPivot.rotation.z = -this.flailSwingAngle;

    // Assemble hierarchical matrices
    this.pivotGroup.rotation.set(this.tiltX, this.twistY, this.tiltZ);
  }

  public resetPosition(): void {
    this.tiltX = 0;
    this.tiltZ = 0;
    this.velX = 0;
    this.velZ = 0;
    this.twistY = 0;
    this.velTwistY = 0;
    this.flailSwingAngle = 0;
    this.counterHitCooldown = 0;
    this.pivotGroup.rotation.set(0, 0, 0);
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
