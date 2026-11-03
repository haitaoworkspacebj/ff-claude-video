import * as THREE from 'three';
import { Noise, mulberry32, clamp, mix } from '../core/math';
import { IslandTerrain } from './terrain';

const BARK = new THREE.Color('#3b322a');
const BARK_LIGHT = new THREE.Color('#5d5042');
const LEAF_DARK = new THREE.Color('#33562f');
const LEAF_MID = new THREE.Color('#567f45');
const LEAF_LIGHT = new THREE.Color('#86a86a');

interface MeshData {
  pos: number[];
  col: number[];
  idx: number[];
}

function newData(): MeshData {
  return { pos: [], col: [], idx: [] };
}

function pushTube(
  d: MeshData,
  curve: THREE.Curve<THREE.Vector3>,
  r0: number,
  r1: number,
  segs: number,
  radial: number,
  colorA: THREE.Color,
  colorB: THREE.Color,
  rnd: () => number,
) {
  const frames = curve.computeFrenetFrames(segs, false);
  const base = d.pos.length / 3;
  const tint = 0.85 + rnd() * 0.3;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const p = curve.getPointAt(t);
    const n = frames.normals[i];
    const b = frames.binormals[i];
    const r = mix(r0, r1, Math.pow(t, 0.75));
    const c = colorA.clone().lerp(colorB, t * 0.7 + rnd() * 0.1).multiplyScalar(tint);
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const vx = p.x + (n.x * ca + b.x * sa) * r;
      const vy = p.y + (n.y * ca + b.y * sa) * r;
      const vz = p.z + (n.z * ca + b.z * sa) * r;
      d.pos.push(vx, vy, vz);
      const shade = 0.86 + 0.14 * ca;
      d.col.push(c.r * shade, c.g * shade, c.b * shade);
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < radial; j++) {
      const j2 = (j + 1) % radial;
      const a0 = base + i * radial + j;
      const a1 = base + i * radial + j2;
      const b0 = base + (i + 1) * radial + j;
      const b1 = base + (i + 1) * radial + j2;
      d.idx.push(a0, b0, b1, a0, b1, a1);
    }
  }
}

/** Irregular canopy blob — a lumpy sphere that reads as a clump of leaves. */
function pushBlob(
  d: MeshData,
  noise: Noise,
  center: THREE.Vector3,
  radius: number,
  squash: number,
  seed: number,
  shade: number,
) {
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const p = geo.attributes.position as THREE.BufferAttribute;
  const base = d.pos.length / 3;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const n =
      noise.fbm3(x * 1.7 + seed, y * 1.7, z * 1.7 - seed, 3) * 0.34 +
      noise.noise3(x * 4 + seed, y * 4, z * 4) * 0.1;
    const s = 1 + n;
    const vx = center.x + x * radius * s;
    const vy = center.y + y * radius * s * squash;
    const vz = center.z + z * radius * s;
    d.pos.push(vx, vy, vz);
    // leaf colour: darker underneath, brighter on top
    const up = y * 0.5 + 0.5;
    const c = LEAF_DARK.clone()
      .lerp(LEAF_MID, smooth01(up))
      .lerp(LEAF_LIGHT, smooth01(up * up) * 0.55);
    c.multiplyScalar(shade * (0.9 + 0.2 * (noise.noise3(vx * 0.7, vy * 0.7, vz * 0.7) * 0.5 + 0.5)));
    d.col.push(c.r, c.g, c.b);
  }
  // IcosahedronGeometry is non-indexed, so vertices map 1:1 to indices.
  if (geo.index) {
    const ia = geo.index.array;
    for (let i = 0; i < ia.length; i++) d.idx.push(base + ia[i]);
  } else {
    for (let i = 0; i < p.count; i++) d.idx.push(base + i);
  }
  geo.dispose();
}

const smooth01 = (x: number) => clamp(x, 0, 1) * clamp(x, 0, 1) * (3 - 2 * clamp(x, 0, 1));

interface TreeOpts {
  x: number;
  z: number;
  height: number;
  lean: number;
  canopy: number;
  layers: number;
  seed: number;
  ancient?: boolean;
}

function buildTree(d: MeshData, terrain: IslandTerrain, noise: Noise, o: TreeOpts) {
  const rnd = mulberry32(o.seed);
  const y = terrain.height(o.x, o.z);
  const base = new THREE.Vector3(o.x, y - 0.6, o.z);
  const az = rnd() * Math.PI * 2;
  const leanDir = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));

  const top = base.clone().addScaledVector(leanDir, o.lean).add(new THREE.Vector3(0, o.height, 0));
  const mid = base
    .clone()
    .lerp(top, 0.5)
    .addScaledVector(leanDir, -o.lean * 0.25)
    .add(new THREE.Vector3(Math.sin(o.seed) * 1.5, 0, Math.cos(o.seed) * 1.5));

  const trunkCurve = new THREE.CatmullRomCurve3([base, mid, top]);
  const r0 = o.height * 0.055 * (o.ancient ? 1.5 : 1);
  pushTube(d, trunkCurve, r0, r0 * 0.28, 10, o.ancient ? 9 : 7, BARK, BARK_LIGHT, rnd);

  // exposed roots for the ancient tree
  if (o.ancient) {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + rnd() * 0.5;
      const rr = o.height * (0.35 + rnd() * 0.35);
      const p0 = base.clone().add(new THREE.Vector3(Math.cos(a) * r0 * 0.8, r0 * 0.5, Math.sin(a) * r0 * 0.8));
      const p1 = base.clone().add(new THREE.Vector3(Math.cos(a) * rr * 0.45, -o.height * 0.1, Math.sin(a) * rr * 0.45));
      const gy = terrain.height(base.x + Math.cos(a) * rr, base.z + Math.sin(a) * rr);
      const p2 = new THREE.Vector3(base.x + Math.cos(a) * rr, gy + 0.3, base.z + Math.sin(a) * rr);
      const c = new THREE.CatmullRomCurve3([p0, p1, p2]);
      pushTube(d, c, r0 * 0.42, r0 * 0.12, 7, 6, BARK, BARK_LIGHT, rnd);
    }
  }

  // canopy: broad crown made of several blob clusters, plus branch stems
  const crownBase = top.y - o.height * 0.1;
  for (let layer = 0; layer < o.layers; layer++) {
    const t = o.layers === 1 ? 0.5 : layer / (o.layers - 1);
    const layerY = crownBase + (t - 0.5) * o.height * 0.4;
    const spread = o.canopy * (1 - Math.abs(t - 0.62) * 0.85);
    const blobs = 3 + Math.floor(rnd() * 3);
    for (let i = 0; i < blobs; i++) {
      const a = rnd() * Math.PI * 2;
      const rr = Math.pow(rnd(), 0.6) * spread;
      const cx = top.x + Math.cos(a) * rr;
      const cz = top.z + Math.sin(a) * rr;
      const cy = layerY + (rnd() - 0.35) * o.height * 0.16;
      if (rnd() > 0.45) {
        const stem = new THREE.CatmullRomCurve3([
          new THREE.Vector3(top.x, layerY - o.height * 0.22, top.z),
          new THREE.Vector3(top.x + Math.cos(a) * rr * 0.55, cy - o.height * 0.05, top.z + Math.sin(a) * rr * 0.55),
          new THREE.Vector3(cx, cy, cz),
        ]);
        pushTube(d, stem, r0 * 0.24, r0 * 0.07, 4, 5, BARK, BARK_LIGHT, rnd);
      }
      pushBlob(
        d,
        noise,
        new THREE.Vector3(cx, cy, cz),
        o.canopy * (0.36 + rnd() * 0.26),
        0.72 + rnd() * 0.3,
        o.seed + layer * 3.3 + i * 1.7,
        0.86 + rnd() * 0.3,
      );
    }
  }
  // crown cap
  pushBlob(d, noise, new THREE.Vector3(top.x, crownBase + o.height * 0.24, top.z), o.canopy * 0.55, 0.8, o.seed + 9, 1.02);
}

export function createTrees(terrain: IslandTerrain) {
  const noise = new Noise(5512);
  const d = newData();

  // hand-placed hero trees + scattered companions
  const specs: TreeOpts[] = [
    // the ancient tree on the high ground to the right of the temple
    { x: 34, z: 4, height: 34, lean: 3.5, canopy: 15, layers: 4, seed: 11, ancient: true },
    // companions around the island
    { x: 8, z: -34, height: 19, lean: 2.2, canopy: 8.5, layers: 3, seed: 23 },
    { x: -40, z: -26, height: 22, lean: 2.8, canopy: 9.5, layers: 3, seed: 37 },
    { x: -52, z: 16, height: 18, lean: 2.4, canopy: 8, layers: 3, seed: 53 },
    { x: -6, z: 54, height: 13, lean: 1.6, canopy: 6, layers: 2, seed: 71 },
    { x: 20, z: -10, height: 12, lean: 1.5, canopy: 5.2, layers: 2, seed: 83 },
    { x: 62, z: 8, height: 11, lean: 1.2, canopy: 4.6, layers: 2, seed: 101 },
    { x: -58, z: -8, height: 15, lean: 2.1, canopy: 6.6, layers: 2, seed: 113 },
    { x: 4, z: 22, height: 10, lean: 1.1, canopy: 4.4, layers: 2, seed: 127 },
    { x: -24, z: -44, height: 13, lean: 1.7, canopy: 5.6, layers: 2, seed: 139 },
    { x: -46, z: 34, height: 11, lean: 1.3, canopy: 4.8, layers: 2, seed: 157 },
  ];

  for (const s of specs) {
    if (!terrain.insideIsland(s.x, s.z, 6)) continue;
    buildTree(d, terrain, noise, s);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(d.pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(d.col, 3));
  geo.setIndex(d.idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.6,
    metalness: 0,
    flatShading: false,
    envMapIntensity: 0.9,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'trees';
  return { mesh, material: mat };
}
