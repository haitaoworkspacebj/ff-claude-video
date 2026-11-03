import * as THREE from 'three';
import { Noise, mulberry32 } from '../core/math';
import { IslandTerrain, ISLAND } from './terrain';

export interface DebrisResult {
  group: THREE.Group;
  updater: (t: number) => void;
}

/** A rough, angular boulder geometry shared by every floating shard. */
function boulderGeometry(noise: Noise, seed: number) {
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const p = geo.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = noise.fbm3(v.x * 1.6 + seed, v.y * 1.6, v.z * 1.6 - seed, 3);
    const s = 1 + n * 0.55;
    p.setXYZ(i, v.x * s, v.y * s * 0.82, v.z * s);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Broken chunks that have torn loose from the underside of the island and now
 * drift in the air around it. This is what sells the "floating rock" fantasy
 * silhouette from a distance.
 */
export function createDebris(terrain: IslandTerrain) {
  const noise = new Noise(48211);
  const rand = mulberry32(9182);
  const group = new THREE.Group();
  group.name = 'debris';

  const mat = new THREE.MeshStandardMaterial({
    roughness: 0.96,
    metalness: 0,
    flatShading: true,
    envMapIntensity: 0.65,
  });

  const geo = boulderGeometry(noise, 2.7);
  const COUNT = 34;
  const mesh = new THREE.InstancedMesh(geo, mat, COUNT);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;

  interface Rock {
    base: THREE.Vector3;
    scale: THREE.Vector3;
    rot0: THREE.Euler;
    spin: THREE.Vector3;
    phase: number;
    bob: number;
  }
  const rocks: Rock[] = [];

  const col = new THREE.Color();
  for (let i = 0; i < COUNT; i++) {
    const a = rand() * Math.PI * 2;
    const R = terrain.outline(a);
    // drift just outside the cliff, mostly under the rim
    const dist = R * (0.92 + rand() * 0.42);
    const y = terrain.rimY[
      Math.round(((a / (Math.PI * 2)) % 1) * ISLAND.angles) % ISLAND.angles
    ] - 18 - Math.pow(rand(), 0.8) * 128;
    const big = i < 6;
    const s = big ? 6 + rand() * 7 : 1.6 + rand() * 4.6;
    const base = new THREE.Vector3(Math.cos(a) * dist, y, Math.sin(a) * dist);

    // darker, cooler chunks read as distance; the rest pick up warm rock
    col.setHSL(0.07 + rand() * 0.05, 0.06 + rand() * 0.12, 0.24 + rand() * 0.2);
    if (rand() < 0.3) col.offsetHSL(0.5, 0.05, -0.03);

    rocks.push({
      base,
      scale: new THREE.Vector3(s * (0.7 + rand() * 0.7), s * (0.6 + rand() * 0.8), s * (0.7 + rand() * 0.7)),
      rot0: new THREE.Euler(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI),
      // rad/s at the old 60 fps per-frame rate
      spin: new THREE.Vector3(
        (rand() - 0.5) * 0.02 * 60,
        (rand() - 0.5) * 0.035 * 60,
        (rand() - 0.5) * 0.02 * 60,
      ),
      phase: rand() * Math.PI * 2,
      bob: 0.6 + rand() * 1.6,
    });
    mesh.setColorAt(i, col);
  }

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const rot = new THREE.Euler();
  const write = (t: number) => {
    for (let i = 0; i < rocks.length; i++) {
      const r = rocks[i];
      pos.copy(r.base);
      pos.y += Math.sin(t * 0.22 + r.phase) * r.bob;
      pos.x += Math.sin(t * 0.11 + r.phase * 1.7) * r.bob * 0.5;
      rot.set(
        r.rot0.x + r.spin.x * t,
        r.rot0.y + r.spin.y * t,
        r.rot0.z + r.spin.z * t,
      );
      q.setFromEuler(rot);
      m.compose(pos, q, r.scale);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };
  write(0);
  group.add(mesh);

  return {
    group,
    updater: (t: number) => write(t),
  };
}

/**
 * Cyan crystal clusters embedded in the cliff strata. They are anchored to the
 * island surface with a raycast so nothing floats in mid-air.
 */
export function createCrystals(terrain: IslandTerrain, island: THREE.Mesh) {
  const rand = mulberry32(7331);
  const group = new THREE.Group();
  group.name = 'crystals';
  island.updateMatrixWorld(true);

  const raycaster = new THREE.Raycaster();
  const outwardAngles = [0.34, 0.02, -0.42, 0.8, 1.35, -0.95, 2.2, 2.9, 4.2, 0.6, 1.9, 2.7];
  const drops = [16, 34, 52, 74, 96];

  const shardGeo = new THREE.OctahedronGeometry(1, 0);
  shardGeo.scale(0.55, 1, 0.55);
  const shardMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#103a45'),
    emissive: new THREE.Color('#44d8f0'),
    emissiveIntensity: 2.6,
    roughness: 0.28,
    metalness: 0.25,
    flatShading: true,
  });

  const placements: Array<{ p: THREE.Vector3; n: THREE.Vector3; s: number }> = [];
  for (let i = 0; i < outwardAngles.length; i++) {
    const a = outwardAngles[i] + (rand() - 0.5) * 0.18;
    const drop = drops[i % drops.length] + rand() * 10;
    const originY = terrain.rimY[Math.round(((a / (Math.PI * 2)) % 1) * ISLAND.angles) % ISLAND.angles] - drop;
    const origin = new THREE.Vector3(Math.cos(a) * 280, originY, Math.sin(a) * 280);
    raycaster.set(origin, new THREE.Vector3(-Math.cos(a), 0, -Math.sin(a)));
    const hits = raycaster.intersectObject(island, false);
    if (!hits.length) continue;
    const hit = hits[0];
    const n = hit.face
      ? hit.face.normal.clone().transformDirection(island.matrixWorld)
      : new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const s = 1.3 + rand() * 2.0;
    placements.push({ p: hit.point.clone().addScaledVector(n, 0.55), n, s });
  }

  const shards: THREE.Mesh[] = [];
  for (const pl of placements) {
    const cluster = new THREE.Group();
    cluster.position.copy(pl.p);
    // face outward, shards fan around the surface normal
    cluster.lookAt(pl.p.clone().add(pl.n));
    const count = 3 + Math.floor(rand() * 3);
    for (let j = 0; j < count; j++) {
      const shard = new THREE.Mesh(shardGeo, shardMat);
      const s = pl.s * (0.55 + rand() * 0.8);
      shard.scale.set(s * (0.6 + rand() * 0.5), s * (1.2 + rand() * 1.6), s * (0.6 + rand() * 0.5));
      shard.position.set((rand() - 0.5) * 2.2, (rand() - 0.5) * 1.6, (rand() - 0.3) * 1.4);
      shard.rotation.set((rand() - 0.5) * 0.7, rand() * Math.PI, (rand() - 0.5) * 0.7);
      cluster.add(shard);
      shards.push(shard);
    }
    group.add(cluster);
  }

  return { group, shards };
}
