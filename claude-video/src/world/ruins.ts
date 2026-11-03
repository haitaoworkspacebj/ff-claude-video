import * as THREE from 'three';
import { Noise, mulberry32, clamp, mix } from '../core/math';
import { IslandTerrain } from './terrain';

interface MeshData {
  pos: number[];
  col: number[];
  idx: number[];
}

const STONE = new THREE.Color('#8d8b84');
const STONE_WARM = new THREE.Color('#a0917c');
const STONE_DARK = new THREE.Color('#6a6862');
const MOSS = new THREE.Color('#4c6b34');

function addGeometry(
  d: MeshData,
  geo: THREE.BufferGeometry,
  matrix: THREE.Matrix4,
  color: THREE.Color,
  noise: Noise,
  mossAmount = 1,
) {
  const p = geo.attributes.position as THREE.BufferAttribute;
  const n = geo.attributes.normal as THREE.BufferAttribute;
  const base = d.pos.length / 3;
  const v = new THREE.Vector3();
  const nn = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).applyMatrix4(matrix);
    nn.fromBufferAttribute(n, i).transformDirection(matrix);
    d.pos.push(v.x, v.y, v.z);
    const grain = noise.fbm3(v.x * 2.3, v.y * 2.3, v.z * 2.3, 3);
    const mossMask = clamp(nn.y * 1.4 - 0.25, 0, 1) * clamp(noise.fbm3(v.x * 0.7, v.y * 0.7, v.z * 0.7, 2) * 1.9, 0, 1) * mossAmount;
    const c = color.clone().multiplyScalar(0.82 + grain * 0.45);
    c.lerp(MOSS, mossMask * 0.75);
    d.col.push(c.r, c.g, c.b);
  }
  if (geo.index) geo.index.array.forEach((i) => d.idx.push(base + i));
  else for (let i = 0; i < p.count; i++) d.idx.push(base + i);
}

function block(
  d: MeshData,
  noise: Noise,
  pos: THREE.Vector3,
  size: THREE.Vector3,
  rot: THREE.Euler,
  color: THREE.Color,
  moss = 1,
) {
  const g = new THREE.BoxGeometry(size.x, size.y, size.z);
  const mm = new THREE.Matrix4().compose(
    pos,
    new THREE.Quaternion().setFromEuler(rot),
    new THREE.Vector3(1, 1, 1),
  );
  addGeometry(d, g, mm, color, noise, moss);
  g.dispose();
}

/** A cylindrical stone drum (column section) with a chipped top. */
function column(
  d: MeshData,
  noise: Noise,
  pos: THREE.Vector3,
  radius: number,
  height: number,
  seed: number,
  heightJitter: number,
) {
  const g = new THREE.CylinderGeometry(radius * 0.92, radius, height, 10, 3, false);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const a = Math.atan2(p.getZ(i), p.getX(i));
    // taper drums and add flutes so the column is not a perfect tube
    const flute = 1 + 0.03 * Math.cos(a * 10) + 0.02 * noise.noise3(Math.cos(a) * 3, y * 0.6, seed);
    p.setX(i, p.getX(i) * flute);
    p.setZ(i, p.getZ(i) * flute);
  }
  g.computeVertexNormals();
  const tilt = new THREE.Euler(
    (noise.noise2(seed, 1) * heightJitter) * 0.12,
    seed,
    (noise.noise2(seed, 7) * heightJitter) * 0.12,
  );
  const mm = new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(tilt), new THREE.Vector3(1, 1, 1));
  const c = STONE.clone().lerp(STONE_WARM, clamp(noise.noise2(seed * 2, 3) * 0.5 + 0.5, 0, 1) * 0.6);
  addGeometry(d, g, mm, c, noise, 0.8);
  g.dispose();
}

export function createRuins(terrain: IslandTerrain) {
  const noise = new Noise(60613);
  const rand = mulberry32(4242);
  const d: MeshData = { pos: [], col: [], idx: [] };
  const runes: THREE.Mesh[] = [];

  const px = terrain.plateau.x;
  const pz = terrain.plateau.z;
  const groundY = (x: number, z: number) => terrain.height(x, z);
  const centerY = groundY(px, pz);

  const place = (x: number, z: number, y: number) =>
    new THREE.Vector3(px + x, y, pz + z);

  // ---- stepped circular platform -----------------------------------------
  const platformR = 22;
  for (let step = 0; step < 3; step++) {
    const r = platformR - step * 1.5;
    const h = 1.15;
    const segs = 26;
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2;
      const a1 = ((i + 1) / segs) * Math.PI * 2;
      const am = (a0 + a1) / 2;
      const rr = r - 0.9;
      const x = Math.cos(am) * rr;
      const z = Math.sin(am) * rr;
      const y = centerY + 0.35 + step * h;
      const size = new THREE.Vector3(r * 0.25, h, 1.9);
      const wobble = noise.noise2(am * 3, step) * 0.06;
      block(
        d,
        noise,
        place(x, z, y - h * 0.5),
        size,
        new THREE.Euler(0, -am + Math.PI / 2 + wobble, 0),
        STONE.clone().lerp(STONE_DARK, step * 0.12 + rand() * 0.2),
        1.1,
      );
    }
  }
  // paved top
  const capTile = 5;
  for (let gx = -4; gx <= 4; gx++) {
    for (let gz = -4; gz <= 4; gz++) {
      const x = gx * capTile;
      const z = gz * capTile;
      if (Math.hypot(x, z) > platformR - 1.4) continue;
      if (rand() < 0.14) continue; // missing slabs
      block(
        d,
        noise,
        place(x, z, centerY + 0.35),
        new THREE.Vector3(capTile * 0.94, 0.75, capTile * 0.94),
        new THREE.Euler(0, (rand() - 0.5) * 0.06, 0),
        STONE.clone().lerp(STONE_WARM, rand() * 0.5),
        1.3,
      );
    }
  }

  // ---- column ring -------------------------------------------------------
  const colR = 14.5;
  const colCount = 9;
  for (let i = 0; i < colCount; i++) {
    const a = (i / colCount) * Math.PI * 2 + 0.22;
    const x = Math.cos(a) * colR;
    const z = Math.sin(a) * colR;
    const x2 = Math.cos(a + 0.05) * (colR + 3);
    const z2 = Math.sin(a + 0.05) * (colR + 3);
    // keep the seaward side of the ring intact so the silhouette reads
    const broken = i % 3 === 1 || rand() < 0.25;
    const fullH = 9.5 + rand() * 1.5;
    const h = broken ? 1.4 + rand() * 4.2 : fullH;
    const base = centerY + 0.7;
    block(d, noise, place(x, z, base + 0.35), new THREE.Vector3(3.6, 0.7, 3.6), new THREE.Euler(0, rand() * 0.4, 0), STONE_DARK.clone(), 0.9);
    column(d, noise, place(x, z, base + 0.7 + h * 0.5), 1.28, h, i * 3.7 + 1, 1);
    if (!broken) {
      block(d, noise, place(x, z, base + 0.7 + h + 0.5), new THREE.Vector3(3.4, 0.9, 3.4), new THREE.Euler(0, a, 0), STONE_WARM.clone(), 1.2);
    } else {
      // fallen drum beside the stump
      const fa = a + 0.5;
      column(
        d,
        noise,
        place(x + Math.cos(fa) * 4.5, z + Math.sin(fa) * 4.5, base + 0.55),
        1.15,
        2.8,
        i * 7.1,
        3,
      );
    }
    if (i === 2 || i === 6) {
      // toppled capital lying on the pavement, half sunk
      block(d, noise, place(x2, z2, centerY + 0.75), new THREE.Vector3(3.2, 1.1, 3.2), new THREE.Euler(0.2, a, 0.15), STONE.clone(), 1.5);
    }
  }

  // ---- broken arch on the landward side ----------------------------------
  const archA = -2.45;
  const ax = Math.cos(archA) * 12;
  const az = Math.sin(archA) * 12;
  const abase = centerY + 0.7;
  block(d, noise, place(ax - 1.6, az, abase + 0.4), new THREE.Vector3(2.6, 0.8, 4.6), new THREE.Euler(0, -archA, 0), STONE_DARK.clone(), 0.8);
  column(d, noise, place(ax - 1.6, az, abase + 0.8 + 5.4), 1.05, 10.8, 21, 0.2);
  column(d, noise, place(ax + 2.6, az + 1.4, abase + 0.8 + 3.2), 1.05, 6.4, 22, 1.2);
  // lintel: a few voussoir blocks forming a partial arch
  for (let i = 0; i < 4; i++) {
    const t = i / 4;
    const bx = mix(ax - 1.6, ax + 2.6, t) + 1.6;
    const by = abase + 10.9 + Math.sin(t * Math.PI) * 1.5;
    block(
      d,
      noise,
      place(bx, az + t * 1.4, by),
      new THREE.Vector3(1.9, 1.3, 2.0),
      new THREE.Euler(0, -archA + t * 0.35, (rand() - 0.5) * 0.25),
      STONE.clone().lerp(STONE_WARM, 0.3),
      1.1,
    );
  }

  // ---- collapsed wall segments -------------------------------------------
  for (let seg = 0; seg < 3; seg++) {
    const a0 = 1.05 + seg * 0.42;
    const blocks = 5 - seg;
    for (let i = 0; i < blocks; i++) {
      const a = a0 + i * 0.075;
      const r = platformR - 3.6;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const h = 1.8 - seg * 0.32 - i * 0.16;
      if (h < 0.5) continue;
      block(
        d,
        noise,
        place(x, z, centerY + 0.6 + h * 0.5),
        new THREE.Vector3(2.6, h, 1.5),
        new THREE.Euler((rand() - 0.5) * 0.1, -a + Math.PI / 2, (rand() - 0.5) * 0.08),
        STONE.clone().lerp(STONE_WARM, rand() * 0.45),
        1.4,
      );
    }
  }

  // ---- central dais -------------------------------------------------------
  const daisH = 1.4;
  const daisGeo = new THREE.CylinderGeometry(6.2, 7.0, daisH, 14, 1);
  addGeometry(d, daisGeo, new THREE.Matrix4().makeTranslation(px, centerY + 0.7 + daisH * 0.5, pz), STONE_WARM.clone(), noise, 1.0);
  const inner = new THREE.CylinderGeometry(4.4, 4.8, 0.5, 14, 1);
  addGeometry(d, inner, new THREE.Matrix4().makeTranslation(px, centerY + 0.7 + daisH + 0.2, pz), STONE.clone(), noise, 0.8);

  // rune stones: emissive shards around the dais
  const runeGeo = new THREE.BoxGeometry(0.45, 2.1, 0.28);
  const runeMat = new THREE.MeshStandardMaterial({
    color: 0x1e3a44,
    emissive: new THREE.Color('#59d8e8'),
    emissiveIntensity: 1.5,
    roughness: 0.5,
    metalness: 0.1,
  });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    const r = 3.2;
    const mesh = new THREE.Mesh(runeGeo, runeMat);
    mesh.position.set(px + Math.cos(a) * r, centerY + 0.7 + daisH + 1.1, pz + Math.sin(a) * r);
    mesh.rotation.set(0, -a, (rand() - 0.5) * 0.2);
    mesh.castShadow = false;
    runes.push(mesh);
  }

  // ---- scattered rubble ---------------------------------------------------
  for (let i = 0; i < 60; i++) {
    const a = rand() * Math.PI * 2;
    const r = platformR + rand() * 10 - 2;
    const x = px + Math.cos(a) * r;
    const z = pz + Math.sin(a) * r;
    if (!terrain.insideIsland(x, z, 3)) continue;
    const y = groundY(x, z);
    const s = 0.7 + rand() * 2.1;
    block(
      d,
      noise,
      new THREE.Vector3(x, y + s * 0.22, z),
      new THREE.Vector3(s, s * 0.6, s * 0.8),
      new THREE.Euler(rand() * 0.5, rand() * Math.PI, rand() * 0.5),
      STONE.clone().lerp(STONE_DARK, rand() * 0.6),
      1.6,
    );
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(d.pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(d.col, 3));
  geo.setIndex(d.idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0,
    envMapIntensity: 0.7,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'ruins';

  const group = new THREE.Group();
  group.add(mesh);
  for (const r of runes) group.add(r);

  return { group, mesh, runeMat };
}
