import * as THREE from 'three';
import { Noise, mulberry32, smoothstep } from '../core/math';

const GRASS_A = new THREE.Color('#3a5c2a');
const GRASS_B = new THREE.Color('#557430');
const ROCK_A = new THREE.Color('#5c5f63');
const ROCK_B = new THREE.Color('#7a7670');
const ROCK_C = new THREE.Color('#4a4744');

interface DistSpec {
  x: number;
  y: number;
  z: number;
  radius: number;
  depth: number;
  seed: number;
  fall?: boolean;
  tree?: boolean;
  arch?: boolean;
}

/** A stripped-down floating island: lumpy grass cap over a rock keel. */
function buildDistantIsland(spec: DistSpec, noise: Noise) {
  const NA = 40;
  const NR = 9;
  const ND = 14;
  const pos: number[] = [];
  const col: number[] = [];

  const outline = (a: number) =>
    spec.radius *
    (1 + 0.14 * Math.sin(a * 3 + spec.seed) + 0.08 * Math.sin(a * 5 - spec.seed * 2) +
      0.05 * noise.noise2(Math.cos(a) * 1.7 + spec.seed, Math.sin(a) * 1.7));

  const topH = (x: number, z: number, r: number, R: number) =>
    noise.fbm2(x * 0.02 + spec.seed, z * 0.02 - spec.seed, 3) * spec.radius * 0.14 -
    spec.radius * 0.06 * smoothstep(0.8, 1.0, r / R);

  const verts: number[][] = [[0, spec.radius * 0.1, 0]]; // centre
  const cols: number[][] = [[GRASS_B.r, GRASS_B.g, GRASS_B.b]];
  const ringStart: number[] = [];

  for (let i = 1; i <= NR; i++) {
    ringStart[i] = verts.length;
    const f = i / NR;
    const warp = 1 - Math.pow(1 - f, 1.4);
    for (let j = 0; j < NA; j++) {
      const a = (j / NA) * Math.PI * 2;
      const R = outline(a);
      const r = R * warp;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const y = topH(x, z, r, R) + 0.6;
      verts.push([x, y, z]);
      const g = GRASS_A.clone().lerp(GRASS_B, noise.noise2(x * 0.05, z * 0.05) * 0.5 + 0.5);
      cols.push([g.r, g.g, g.b]);
    }
  }
  const rim = ringStart[NR];
  let prevRing = rim;
  for (let k = 1; k <= ND; k++) {
    const t = k / ND;
    const cur = verts.length;
    const taper = Math.pow(1 - t, 0.55) * (1 - 0.95 * smoothstep(0.55, 1.0, t));
    for (let j = 0; j < NA; j++) {
      const a = (j / NA) * Math.PI * 2;
      const R = outline(a);
      const rimY = topH(Math.cos(a) * R, Math.sin(a) * R, R, R) + 0.6;
      const s = Math.max(taper * (1 + 0.16 * noise.noise2(Math.cos(a) * 2.2 + spec.seed, Math.sin(a) * 2.2 + t * 2)), 0.012);
      const y = rimY - spec.depth * Math.pow(t, 1.05);
      verts.push([Math.cos(a) * R * s, y, Math.sin(a) * R * s]);
      const band = Math.sin(t * 26 + spec.seed);
      const base = ROCK_A.clone().lerp(ROCK_B, 0.35 + band * 0.3);
      base.lerp(ROCK_C, t * 0.55);
      cols.push([base.r, base.g, base.b]);
    }
    ringStart.push(cur);
    void prevRing;
    prevRing = cur;
  }

  const idx: number[] = [];
  for (let j = 0; j < NA; j++) idx.push(0, ringStart[1] + j, ringStart[1] + ((j + 1) % NA));
  for (let i = 1; i < NR; i++) {
    for (let j = 0; j < NA; j++) {
      const j2 = (j + 1) % NA;
      const a0 = ringStart[i] + j;
      const a1 = ringStart[i] + j2;
      const b0 = ringStart[i + 1] + j;
      const b1 = ringStart[i + 1] + j2;
      idx.push(a0, b0, b1, a0, b1, a1);
    }
  }
  for (let k = NR; k < NR + ND; k++) {
    for (let j = 0; j < NA; j++) {
      const j2 = (j + 1) % NA;
      const a0 = ringStart[k] + j;
      const a1 = ringStart[k] + j2;
      const b0 = ringStart[k + 1] + j;
      const b1 = ringStart[k + 1] + j2;
      idx.push(a0, b0, b1, a0, b1, a1);
    }
  }

  for (const v of verts) pos.push(v[0], v[1], v[2]);
  for (const c of cols) col.push(c[0], c[1], c[2]);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

export function createDistantWorld() {
  const noise = new Noise(99001);
  const rand = mulberry32(555);
  const group = new THREE.Group();

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.95,
    metalness: 0,
    envMapIntensity: 0.6,
  });
  const fallMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#e6f6ff'),
    transparent: true,
    opacity: 0.65,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
  });
  const treeMat = new THREE.MeshStandardMaterial({ color: '#33502a', roughness: 0.9 });
  const trunkMat = new THREE.MeshStandardMaterial({ color: '#4a3b2e', roughness: 0.95 });
  const stoneMat = new THREE.MeshStandardMaterial({ color: '#8a8579', roughness: 0.95 });

  const specs: DistSpec[] = [
    // big one behind the main island, left of the sun
    { x: -620, y: -40, z: -540, radius: 120, depth: 150, seed: 3.1, fall: true, tree: true },
    // right, mid distance
    { x: 760, y: 30, z: -360, radius: 88, depth: 110, seed: 8.4, arch: true },
    // far left, low
    { x: -980, y: -120, z: 260, radius: 150, depth: 190, seed: 12.9, fall: true },
    // far right, high
    { x: 1120, y: 120, z: 180, radius: 70, depth: 95, seed: 17.2, tree: true },
    // distant small silhouettes
    { x: 240, y: -170, z: -1180, radius: 190, depth: 230, seed: 21.6 },
    { x: -420, y: 60, z: -1420, radius: 160, depth: 200, seed: 26.3, arch: true },
    { x: 1480, y: -60, z: -760, radius: 130, depth: 170, seed: 31.8 },
  ];

  for (const spec of specs) {
    const geo = buildDistantIsland(spec, noise);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(spec.x, spec.y, spec.z);
    mesh.rotation.y = rand() * Math.PI * 2;
    group.add(mesh);

    if (spec.fall) {
      const geoF = new THREE.PlaneGeometry(spec.radius * 0.09, spec.depth * 1.4, 1, 1);
      const fall = new THREE.Mesh(geoF, fallMat);
      fall.position.set(spec.radius * 0.5, -spec.depth * 0.5, spec.radius * 0.45);
      mesh.add(fall);
    }
    if (spec.tree) {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 2.2, spec.radius * 0.34, 6), trunkMat);
      trunk.position.set(-spec.radius * 0.1, spec.radius * 0.2 + spec.radius * 0.17, 0);
      mesh.add(trunk);
      const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(spec.radius * 0.17, 1), treeMat);
      crown.position.set(-spec.radius * 0.1, spec.radius * 0.2 + spec.radius * 0.42, 0);
      crown.scale.y = 0.8;
      mesh.add(crown);
    }
    if (spec.arch) {
      const arch = new THREE.Group();
      const p1 = new THREE.Mesh(new THREE.BoxGeometry(4, spec.radius * 0.22, 4), stoneMat);
      const p2 = p1.clone();
      p1.position.set(-spec.radius * 0.06, spec.radius * 0.11, 0);
      p2.position.set(spec.radius * 0.06, spec.radius * 0.11, 0);
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(spec.radius * 0.17, 4, 4), stoneMat);
      lintel.position.set(0, spec.radius * 0.23, 0);
      arch.add(p1, p2, lintel);
      arch.position.set(spec.radius * 0.1, spec.radius * 0.16, 0);
      mesh.add(arch);
    }
  }

  // ---- far mountain ridge -------------------------------------------------
  const ridgeMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#8fa9c0'),
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    fog: false,
  });
  for (let ring = 0; ring < 2; ring++) {
    const dist = 3100 + ring * 900;
    const pts: number[] = [];
    const idx: number[] = [];
    const SEG = 160;
    const height = 420 + ring * 160;
    for (let i = 0; i <= SEG; i++) {
      const a = (i / SEG) * Math.PI * 2;
      const h =
        height *
        (0.35 +
          0.42 * (noise.fbm2(Math.cos(a) * 2.4 + ring * 9, Math.sin(a) * 2.4, 4) * 0.5 + 0.5) +
          0.2 * Math.max(0, noise.noise2(Math.cos(a) * 5.5, Math.sin(a) * 5.5)));
      const yBase = -340;
      pts.push(Math.cos(a) * dist, yBase, Math.sin(a) * dist);
      pts.push(Math.cos(a) * dist, yBase + h, Math.sin(a) * dist);
    }
    for (let i = 0; i < SEG; i++) {
      const a0 = i * 2;
      idx.push(a0, a0 + 1, a0 + 3, a0, a0 + 3, a0 + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, ridgeMat);
    m.renderOrder = -40;
    m.frustumCulled = false;
    group.add(m);
  }

  return { group };
}
