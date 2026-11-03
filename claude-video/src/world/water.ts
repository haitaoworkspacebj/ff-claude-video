import * as THREE from 'three';
import { GLSL_NOISE } from '../core/glsl';
import { sunDirection } from '../core/engine';
import { Noise, mulberry32, mix, smoothstep } from '../core/math';
import { IslandTerrain } from './terrain';

const WATER_VERT = /* glsl */ `
  varying vec3 vWorldPos;
  varying vec2 vUv;
  varying vec3 vNormalW;
  void main() {
    vUv = uv;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorldPos = w.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

function waterFragment(opts: { flow: number; foam: number; alpha: number; fade: number }) {
  return /* glsl */ `
  uniform float uTime;
  uniform vec3 uSunDir, uDeep, uShallow, uSky, uFoamColor;
  uniform float uOpacity;
  varying vec3 vWorldPos;
  varying vec2 vUv;
  varying vec3 vNormalW;
  ${GLSL_NOISE}

  void main() {
    float t = uTime;
    vec2 uv = vUv;

    // two scrolling ripple layers + fine rain stipple
    float n1 = fbm2d(vec2(uv.x * 3.0, uv.y * 1.4 - t * ${opts.flow.toFixed(2)}), 4);
    float n2 = fbm2d(vec2(uv.x * 7.5 + 3.7, uv.y * 3.2 - t * ${(opts.flow * 1.9).toFixed(2)}), 3);
    float n3 = fbm2d(vec2(uv.x * 21.0 + 1.3, uv.y * 11.0 - t * ${(opts.flow * 3.2).toFixed(2)}), 2);
    float ripple = n1 * 0.58 + n2 * 0.32 + n3 * 0.1;

    vec3 N = normalize(vNormalW + vec3(n1 - 0.5, 0.0, n2 - 0.5) * 0.55 + vec3(n3 - 0.5, 0.0, n3 - 0.5) * 0.16);
    vec3 V = normalize(cameraPosition - vWorldPos);
    float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);

    vec3 col = mix(uDeep, uShallow, smoothstep(0.25, 0.85, ripple));
    col = mix(col, uSky, fres * 0.8);

    vec3 H = normalize(normalize(uSunDir) + V);
    col += vec3(1.0, 0.97, 0.9) * pow(max(dot(N, H), 0.0), 110.0) * 1.1;

    // foam streaks
    float foamN = fbm2d(vec2(uv.x * 9.0, uv.y * 3.6 - t * ${(opts.flow * 1.7).toFixed(2)}), 3);
    float foam = smoothstep(0.58, 0.84, foamN) * ${opts.foam.toFixed(2)};
    col = mix(col, uFoamColor, foam * 0.85);

    float a = uOpacity * (0.7 + 0.3 * ripple);
    a = mix(a, 1.0, foam * 0.7);
    // vertical fade for falls so they melt into mist instead of ending flat
    a *= ${opts.fade > 0 ? `(1.0 - smoothstep(${(1 - opts.fade).toFixed(2)}, 1.0, uv.y) * 0.92)` : '1.0'};
    // soften the sheet edges
    a *= smoothstep(0.0, 0.12, uv.x) * smoothstep(1.0, 0.88, uv.x);

    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
}

function waterUniforms(alpha: number) {
  return {
    uTime: { value: 0 },
    uSunDir: { value: sunDirection.clone() },
    uDeep: { value: new THREE.Color('#123c47').convertSRGBToLinear() },
    uShallow: { value: new THREE.Color('#3f7d86').convertSRGBToLinear() },
    uSky: { value: new THREE.Color('#9fb6c4').convertSRGBToLinear() },
    uFoamColor: { value: new THREE.Color('#e6eef3').convertSRGBToLinear() },
    uOpacity: { value: alpha },
  };
}

/** Flowing ribbon that follows the carved stream channel. */
function buildStream(terrain: IslandTerrain, noise: Noise) {
  const field = terrain.stream;
  const n = field.pts.length;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const ACROSS = 5;
  for (let i = 0; i < n; i++) {
    const p = field.pts[i];
    const t = i / (n - 1);
    const tNext = field.pts[Math.min(i + 1, n - 1)];
    const tPrev = field.pts[Math.max(i - 1, 0)];
    const dx = tNext.x - tPrev.x;
    const dz = tNext.y - tPrev.y;
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len;
    const nz = dx / len;
    const w = terrain.streamWidth * (1 + t * 0.55) * (1 + 0.12 * noise.noise2(t * 9, 2.1));
    const y = field.elevation[i] + 0.08;
    for (let j = 0; j < ACROSS; j++) {
      const u = j / (ACROSS - 1);
      const off = (u - 0.5) * 2 * w;
      pos.push(p.x + nx * off, y, p.y + nz * off);
      uv.push(u, t * (n * 0.35) * 0.35 + t * 2.0);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < ACROSS - 1; j++) {
      const a = i * ACROSS + j;
      const b = a + 1;
      const c = a + ACROSS;
      const d = c + 1;
      idx.push(a, c, d, a, d, b);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

interface FallSpec {
  angle: number; // rim angle, radians
  startDrop: number; // how far below the rim the sheet begins
  height: number;
  width: number;
  spread: number;
  drift: number;
  seed: number;
}

function buildFall(terrain: IslandTerrain, noise: Noise, spec: FallSpec) {
  const a = spec.angle;
  const rimIdx = Math.round(((a / (Math.PI * 2)) % 1) * 256) % 256;
  const rimX = terrain.rimX[rimIdx];
  const rimZ = terrain.rimZ[rimIdx];
  const rimY = terrain.rimY[rimIdx];
  const out = new THREE.Vector3(rimX, 0, rimZ).normalize();
  const side = new THREE.Vector3(-out.z, 0, out.x).normalize();

  const SEG = 40;
  const ACROSS = 7;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];

  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG;
    // start slightly inside the rim so the sheet touches the cliff
    const drop = spec.startDrop + Math.pow(t, 1.06) * spec.height;
    const push = spec.drift * (0.25 + t * 0.9) + Math.sin(t * 5.5 + spec.seed) * 1.2;
    const cx = rimX + out.x * push * 0.5 - out.x * 1.5;
    const cz = rimZ + out.z * push * 0.5 - out.z * 1.5;
    const cy = rimY - drop;
    const w = mix(spec.width, spec.width + spec.spread, Math.pow(t, 0.7)) *
      (1 + 0.16 * noise.noise2(t * 7 + spec.seed, 3.3));
    for (let j = 0; j < ACROSS; j++) {
      const u = j / (ACROSS - 1);
      const off = (u - 0.5) * 2 * w;
      // the sheet bows outward in the middle
      const bow = Math.sin(u * Math.PI) * 1.1 * (0.3 + t);
      pos.push(cx + side.x * off + out.x * bow, cy, cz + side.z * off + out.z * bow);
      uv.push(u, t);
    }
  }
  for (let i = 0; i < SEG; i++) {
    for (let j = 0; j < ACROSS - 1; j++) {
      const a0 = i * ACROSS + j;
      const b0 = a0 + 1;
      const c0 = a0 + ACROSS;
      const d0 = c0 + 1;
      idx.push(a0, c0, d0, a0, d0, b0);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return { geo, rim: new THREE.Vector3(rimX, rimY, rimZ), out };
}

function mistTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 2, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255,255,255,0.85)');
  grad.addColorStop(0.45, 'rgba(240,250,255,0.35)');
  grad.addColorStop(1, 'rgba(240,250,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createWater(terrain: IslandTerrain) {
  const noise = new Noise(31337);
  const rand = mulberry32(717);
  const group = new THREE.Group();
  const materials: THREE.ShaderMaterial[] = [];

  // ---- stream -------------------------------------------------------------
  const streamGeo = buildStream(terrain, noise);
  const streamMat = new THREE.ShaderMaterial({
    uniforms: waterUniforms(0.86),
    vertexShader: WATER_VERT,
    fragmentShader: waterFragment({ flow: 0.55, foam: 0.35, alpha: 0.86, fade: 0 }),
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const stream = new THREE.Mesh(streamGeo, streamMat);
  stream.renderOrder = 4;
  group.add(stream);
  materials.push(streamMat);

  // ---- waterfalls ---------------------------------------------------------
  const fallSpecs: FallSpec[] = [
    // main fall, right off the stream mouth
    { angle: Math.atan2(63, 42), startDrop: -0.4, height: 152, width: 8.5, spread: 11, drift: 22, seed: 1.7 },
    // thin fall down a crack in the left cliff (near side, visible from hero)
    { angle: 2.4, startDrop: 20, height: 104, width: 2.8, spread: 5.0, drift: 13, seed: 4.2 },
    // small trickle over a rock shelf on the front face
    { angle: 1.65, startDrop: 12, height: 78, width: 1.9, spread: 3.2, drift: 9, seed: 8.9 },
  ];

  const mistSpots: THREE.Vector3[] = [];
  for (const spec of fallSpecs) {
    const { geo, rim, out } = buildFall(terrain, noise, spec);
    const mat = new THREE.ShaderMaterial({
      uniforms: waterUniforms(0.94),
      vertexShader: WATER_VERT,
      fragmentShader: waterFragment({ flow: 1.9, foam: 0.55, alpha: 0.94, fade: 0.55 }),
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const fall = new THREE.Mesh(geo, mat);
    fall.renderOrder = 6;
    group.add(fall);
    materials.push(mat);

    // mist plume at the base + a little spray at the lip
    mistSpots.push(rim.clone().addScaledVector(out, spec.drift * 0.5).add(new THREE.Vector3(0, -spec.startDrop - spec.height * 0.92, 0)));
    mistSpots.push(rim.clone().addScaledVector(out, 2).add(new THREE.Vector3(0, -spec.startDrop - 2, 0)));
  }

  // ---- mist sprites -------------------------------------------------------
  const mTex = mistTexture();
  const mMat = new THREE.SpriteMaterial({
    map: mTex,
    transparent: true,
    depthWrite: false,
    opacity: 0.34,
    color: new THREE.Color('#c9d6de'),
  });
  for (const spot of mistSpots) {
    for (let i = 0; i < 7; i++) {
      const s = new THREE.Sprite(mMat);
      const scale = 16 + rand() * 26;
      s.position.copy(spot).add(new THREE.Vector3((rand() - 0.5) * 18, (rand() - 0.5) * 16, (rand() - 0.5) * 18));
      s.scale.set(scale, scale * 0.75, 1);
      group.add(s);
    }
  }

  return {
    group,
    updater: (t: number) => {
      for (const m of materials) (m.uniforms.uTime as { value: number }).value = t;
    },
  };
}
