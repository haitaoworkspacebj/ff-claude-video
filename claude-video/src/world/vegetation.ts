import * as THREE from 'three';
import { Noise, mulberry32, clamp } from '../core/math';
import { IslandTerrain } from './terrain';

/** Paints a clump of tapered blades onto a canvas and returns it as a texture. */
function makeGrassTexture(seed: number, blades: number, hue: number, size = 256): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, size, size);
  const rand = mulberry32(seed);
  for (let i = 0; i < blades; i++) {
    const x0 = size * (0.18 + rand() * 0.64);
    const h = size * (0.45 + rand() * 0.5);
    const lean = (rand() - 0.5) * size * 0.34;
    const w = size * (0.018 + rand() * 0.028);
    const l = 0.55 + rand() * 0.45;
    const col = `hsl(${hue + (rand() - 0.5) * 26}, ${45 + rand() * 30}%, ${26 + l * 26}%)`;
    g.fillStyle = col;
    g.beginPath();
    const tipX = x0 + lean;
    const tipY = size - h;
    g.moveTo(x0 - w, size);
    g.quadraticCurveTo(x0 - w * 0.6 + lean * 0.4, size - h * 0.6, tipX, tipY);
    g.quadraticCurveTo(x0 + w * 0.6 + lean * 0.4, size - h * 0.6, x0 + w, size);
    g.closePath();
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function crossGeometry(planes = 2, height = 1, width = 1) {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let p = 0; p < planes; p++) {
    const a = (p / planes) * Math.PI;
    const cx = Math.cos(a) * width * 0.5;
    const sx = Math.sin(a) * width * 0.5;
    const base = p * 4;
    pos.push(-cx, 0, -sx, cx, 0, sx, cx, height, sx, -cx, height, -sx);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function swayMaterial(map: THREE.Texture, opts: { alphaTest: number; sway: number; color: number }) {
  const mat = new THREE.MeshStandardMaterial({
    map,
    color: opts.color,
    alphaTest: opts.alphaTest,
    side: THREE.DoubleSide,
    roughness: 0.85,
    metalness: 0,
    vertexColors: false,
    envMapIntensity: 0.55,
  });
  const uniforms = { uTime: { value: 0 }, uSway: { value: opts.sway } };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uSway = uniforms.uSway;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform float uSway;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          float ph = ip.x * 0.21 + ip.z * 0.17;
          float h = max(transformed.y, 0.0);
          float w = sin(uTime * 1.5 + ph) * 0.6 + sin(uTime * 2.7 + ph * 1.7) * 0.25;
          transformed.x += w * uSway * h * h;
          transformed.z += w * uSway * 0.45 * h * h;
        }`,
      );
  };
  mat.customProgramCacheKey = () => 'sway-' + opts.sway;
  return { mat, uniforms };
}

export function createVegetation(terrain: IslandTerrain) {
  const noise = new Noise(88112);
  const rand = mulberry32(2024);
  const group = new THREE.Group();

  const grassTex = makeGrassTexture(9, 26, 92);
  const bushTex = makeGrassTexture(31, 40, 118);
  const flowerTex = makeGrassTexture(77, 14, 60);

  const insidePlateau = (x: number, z: number) => {
    const p = terrain.plateau;
    return Math.hypot(x - p.x, z - p.z) < p.r * 0.8;
  };

  const sampler = (opts: {
    minMask: number;
    maxSlope: number;
    allowPlateau: boolean;
    tintBase: THREE.Color;
    tintVar: number;
  }) => () => {
    for (let attempt = 0; attempt < 6; attempt++) {
      const a = rand() * Math.PI * 2;
      const rr = Math.sqrt(rand()) * 98;
      const x = Math.cos(a) * rr;
      const z = Math.sin(a) * rr;
      if (!terrain.insideIsland(x, z, 2.5)) continue;
      const g = terrain.grassMask(x, z);
      if (g < opts.minMask) continue;
      if (terrain.slopeAt(x, z) > opts.maxSlope) continue;
      if (!opts.allowPlateau && insidePlateau(x, z)) continue;
      const s = terrain.stream.query(x, z);
      if (s.d < terrain.streamWidth + 1.0) continue;
      const y = terrain.height(x, z);
      const v = noise.fbm2(x * 0.06, z * 0.06, 3);
      const tint = opts.tintBase
        .clone()
        .offsetHSL(v * 0.03, v * 0.1, v * opts.tintVar)
        .multiplyScalar(0.85 + 0.3 * (noise.noise2(x * 0.4, z * 0.4) * 0.5 + 0.5));
      return { x, y, z, tint };
    }
    return null;
  };

  // ---- grass tufts -------------------------------------------------------
  const grassCount = 46000;
  const grassGeo = crossGeometry(2, 1, 1);
  const grassSway = swayMaterial(grassTex, { alphaTest: 0.35, sway: 0.055, color: 0xffffff });
  const grass = new THREE.InstancedMesh(grassGeo, grassSway.mat, grassCount);
  grass.castShadow = false;
  grass.receiveShadow = true;
  grass.frustumCulled = false;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const sampleGrass = sampler({
    minMask: 0.25,
    maxSlope: 0.6,
    allowPlateau: true,
    tintBase: new THREE.Color('#ffffff'),
    tintVar: 0.14,
  });
  let gi = 0;
  for (let i = 0; i < grassCount * 2 && gi < grassCount; i++) {
    const p = sampleGrass();
    if (!p) continue;
    const s = 1.9 + rand() * 2.4;
    pos.set(p.x, p.y - 0.15, p.z);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI);
    scl.set(s * (0.8 + rand() * 0.4), s, s * (0.8 + rand() * 0.4));
    m.compose(pos, q, scl);
    grass.setMatrixAt(gi, m);
    grass.setColorAt(gi, p.tint);
    gi++;
  }
  grass.count = gi;
  group.add(grass);

  // ---- shrubs / ferns ----------------------------------------------------
  const bushCount = 2600;
  const bushGeo = crossGeometry(3, 1, 1);
  const bushSway = swayMaterial(bushTex, { alphaTest: 0.32, sway: 0.03, color: 0xffffff });
  const bushes = new THREE.InstancedMesh(bushGeo, bushSway.mat, bushCount);
  bushes.castShadow = false;
  bushes.receiveShadow = true;
  bushes.frustumCulled = false;
  const sampleBush = sampler({
    minMask: 0.35,
    maxSlope: 0.5,
    allowPlateau: false,
    tintBase: new THREE.Color('#ffffff'),
    tintVar: 0.1,
  });
  let bi = 0;
  for (let i = 0; i < bushCount * 3 && bi < bushCount; i++) {
    const p = sampleBush();
    if (!p) continue;
    const s = 3.2 + rand() * 3.6;
    pos.set(p.x, p.y - 0.2, p.z);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI);
    scl.set(s, s * (0.8 + rand() * 0.5), s);
    m.compose(pos, q, scl);
    bushes.setMatrixAt(bi, m);
    bushes.setColorAt(bi, p.tint);
    bi++;
  }
  bushes.count = bi;
  group.add(bushes);

  // ---- flowers -----------------------------------------------------------
  const flowerCount = 900;
  const flowerGeo = crossGeometry(2, 1, 1);
  const flowerMat = new THREE.MeshStandardMaterial({
    map: flowerTex,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
    roughness: 0.8,
    emissive: new THREE.Color('#241a06'),
    emissiveIntensity: 0.4,
  });
  const flowers = new THREE.InstancedMesh(flowerGeo, flowerMat, flowerCount);
  flowers.frustumCulled = false;
  const sampleFlower = sampler({
    minMask: 0.45,
    maxSlope: 0.38,
    allowPlateau: false,
    tintBase: new THREE.Color(0xffffff),
    tintVar: 0.05,
  });
  let fi = 0;
  for (let i = 0; i < flowerCount * 4 && fi < flowerCount; i++) {
    const p = sampleFlower();
    if (!p) continue;
    const s = 0.9 + rand() * 0.9;
    pos.set(p.x, p.y - 0.05, p.z);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI);
    scl.set(s, s, s);
    m.compose(pos, q, scl);
    flowers.setMatrixAt(fi, m);
    const tint = new THREE.Color().setHSL(0.03 + rand() * 0.12, 0.75, 0.72);
    if (rand() < 0.3) tint.setHSL(0.62, 0.5, 0.78);
    flowers.setColorAt(fi, tint);
    fi++;
  }
  flowers.count = fi;
  group.add(flowers);

  const updater = (t: number) => {
    grassSway.uniforms.uTime.value = t;
    bushSway.uniforms.uTime.value = t;
  };

  return { group, updater };
}
