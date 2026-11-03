import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clamp, mulberry32, smoothstep } from '../core/math';

/**
 * A colossal wind-fish style whale drifting through the storm behind the
 * island. The silhouette is deliberately stylised: heavy rounded forehead,
 * long wing-like pectoral fins, forked flukes and glowing rune dashes that
 * echo the crystals on the island.
 */

const LENGTH = 320;
const HALF = LENGTH / 2;
const MAX_R = 40;
const SEG = 64;
const RAD = 28;

const BACK = new THREE.Color('#a9c0cc');
const BELLY = new THREE.Color('#f2efe4');
const FIN = new THREE.Color('#cfd9d6');

/** Body radius profile; s goes 0 (tail) -> 1 (nose). */
function radiusAt(s: number) {
  const u = clamp((s - 0.06) / 0.94, 0, 1);
  // a heavy, rounded head and a long thick torso
  const core = Math.pow(Math.sin(Math.PI * (0.1 + 0.82 * u)), 0.42);
  // the tail stock has to stay thin or the silhouette reads as a torpedo
  const tail = 0.1 + 0.9 * smoothstep(0.0, 0.4, s);
  const head = 1.0 - 0.28 * smoothstep(0.86, 1.0, s);
  return MAX_R * core * tail * head;
}

function buildBody() {
  const pos: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const glow: number[] = [];
  const idx: number[] = [];

  for (let i = 0; i <= SEG; i++) {
    const s = i / SEG;
    const z = -HALF + s * LENGTH;
    const r = radiusAt(s);
    // gentle back arch: the spine rises through the middle and drops toward
    // the head, which is what sells the mammal silhouette
    const spine = -Math.sin(Math.PI * s) * 6;
    for (let j = 0; j < RAD; j++) {
      const a = (j / RAD) * Math.PI * 2;
      const x = Math.cos(a) * r * 0.88;
      const y = spine + Math.sin(a) * r * 1.12 - r * 0.08;
      pos.push(x, y, z);
      uv.push(j / RAD, s);

      const up = Math.sin(a) * 0.5 + 0.5;
      const c = BACK.clone().lerp(BELLY, Math.pow(clamp(1 - up, 0, 1), 1.25));
      // longitudinal throat grooves on the underside
      const belly = smoothstep(0.35, 0.0, up);
      const groove = belly * smoothstep(0.62, 0.95, Math.abs(Math.sin(a * 7.0)));
      c.multiplyScalar(1 - groove * 0.26);
      col.push(c.r, c.g, c.b);

      // rune dashes along the upper flanks
      const flank =
        Math.pow(Math.abs(Math.cos(a)), 4.0) * smoothstep(-0.15, 0.45, Math.sin(a));
      const dash = smoothstep(0.55, 0.92, Math.sin(z * 0.075 + Math.sin(a * 3.0) * 0.8));
      glow.push(clamp(flank * dash, 0, 1));
    }
  }

  // side quads
  for (let i = 0; i < SEG; i++) {
    for (let j = 0; j < RAD; j++) {
      const j2 = (j + 1) % RAD;
      const a0 = i * RAD + j;
      const b0 = i * RAD + j2;
      const c0 = (i + 1) * RAD + j;
      const d0 = (i + 1) * RAD + j2;
      idx.push(a0, d0, c0, a0, b0, d0);
    }
  }

  // nose cap
  const noseTip = pos.length / 3;
  pos.push(0, 2, HALF + 10);
  uv.push(0.5, 1);
  col.push(BACK.r, BACK.g, BACK.b);
  glow.push(0);
  for (let j = 0; j < RAD; j++) {
    const j2 = (j + 1) % RAD;
    idx.push(SEG * RAD + j, SEG * RAD + j2, noseTip);
  }
  // tail cap
  const tailTip = pos.length / 3;
  pos.push(0, 0, -HALF - 2);
  uv.push(0.5, 0);
  col.push(BELLY.r, BELLY.g, BELLY.b);
  glow.push(0);
  for (let j = 0; j < RAD; j++) {
    const j2 = (j + 1) % RAD;
    idx.push(j, tailTip, j2);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aGlow', new THREE.Float32BufferAttribute(glow, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function finGeometry(points: [number, number][], depth: number, bevel: number) {
  const shape = new THREE.Shape();
  points.forEach(([x, y], i) => (i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)));
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 2,
    steps: 1,
    curveSegments: 6,
  });
  g.translate(0, 0, -depth / 2);
  return g;
}

function tint(geo: THREE.BufferGeometry, color: THREE.Color, glow = 0) {
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  const gl = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    col[i * 3] = color.r;
    col[i * 3 + 1] = color.g;
    col[i * 3 + 2] = color.b;
    gl[i] = glow;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aGlow', new THREE.BufferAttribute(gl, 1));
  if (!geo.attributes.uv) {
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  }
  return geo;
}

function placed(geo: THREE.BufferGeometry, m: THREE.Matrix4) {
  geo.applyMatrix4(m);
  return geo.index ? geo.toNonIndexed() : geo;
}

function buildWhaleGeometry() {
  const body = buildBody();
  const parts: THREE.BufferGeometry[] = [body.toNonIndexed()];

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();

  // pectoral fins: short, paddle-like flippers rather than wings
  const finPts: [number, number][] = [
    [0, 0],
    [14, 4],
    [30, 5],
    [44, -1],
    [36, -10],
    [18, -12],
    [4, -5],
  ];
  for (const side of [1, -1]) {
    const pts = finPts.map(([x, y]) => [x * side, y] as [number, number]);
    const geo = tint(finGeometry(pts, 3.0, 1.0), FIN, 0.08);
    e.set(0.15, 0.95 * side, -0.45 * side);
    q.setFromEuler(e);
    m.compose(
      new THREE.Vector3(26 * side, -20, 55),
      q,
      new THREE.Vector3(1.15, 1.15, 1.15),
    );
    parts.push(placed(geo, m));
  }

  // forked flukes, swept back, with a notch at the centre
  const flukePts: [number, number][] = [
    [0, 0],
    [16, 10],
    [42, 16],
    [70, 12],
    [58, -8],
    [28, -12],
    [0, -4],
  ];
  for (const side of [1, -1]) {
    const pts = flukePts.map(([x, y]) => [x * side, y] as [number, number]);
    const geo = tint(finGeometry(pts, 2.4, 0.8), FIN, 0.08);
    e.set(-Math.PI / 2, 0, 0);
    q.setFromEuler(e);
    m.compose(
      new THREE.Vector3(8 * side, 0, -HALF + 8),
      q,
      new THREE.Vector3(1.1, 1.1, 1.1),
    );
    parts.push(placed(geo, m));
  }

  // small dorsal fin
  const dorsal = tint(
    finGeometry(
      [
        [0, 0],
        [12, 0],
        [20, 14],
        [10, 13],
      ],
      2.0,
      0.6,
    ),
    FIN,
    0.1,
  );
  e.set(0, Math.PI / 2, 0);
  q.setFromEuler(e);
  m.compose(new THREE.Vector3(0, 30, -40), q, new THREE.Vector3(1.3, 1.3, 1.3));
  parts.push(placed(dorsal, m));

  return mergeGeometries(parts, false)!;
}

function makeMaterial(uniforms: { uTime: { value: number } }) {
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.48,
    metalness: 0.05,
    envMapIntensity: 0.9,
    fog: false,
    side: THREE.DoubleSide,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        attribute float aGlow;
        uniform float uTime;
        varying float vGlow;`,
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
        vGlow = aGlow;
        float along = clamp(position.z / ${HALF.toFixed(1)} * 0.5 + 0.5, 0.0, 1.0);
        float amp = 8.0 * smoothstep(0.65, 0.0, along);
        transformed.y += sin(uTime * 0.9 - along * 5.2) * amp;
        transformed.x += sin(uTime * 0.7 - along * 4.1) * amp * 0.18;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        varying float vGlow;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(0.22, 0.85, 1.0) * vGlow * 1.35;
        float rim = pow(1.0 - max(dot(normalize(normal), normalize(vViewPosition)), 0.0), 3.0);
        totalEmissiveRadiance += vec3(0.34, 0.52, 0.64) * rim * 0.2;`,
      );
  };
  mat.customProgramCacheKey = () => 'whale-v1';
  return mat;
}

function makeMotes() {
  const rand = mulberry32(8811);
  const N = 140;
  const pos = new Float32Array(N * 3);
  const seed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    // a soft cloud of spores trailing behind the tail
    const z = -HALF - 20 - Math.pow(rand(), 1.6) * 230;
    pos[i * 3] = (rand() - 0.5) * (70 + rand() * 90);
    pos[i * 3 + 1] = (rand() - 0.5) * 60;
    pos[i * 3 + 2] = z;
    seed[i] = rand();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const uniforms = { uTime: { value: 0 } };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
    vertexShader: /* glsl */ `
      uniform float uTime;
      attribute float aSeed;
      varying float vAlpha;
      void main() {
        vec3 p = position;
        p.y += sin(uTime * 0.6 + aSeed * 6.28) * 6.0;
        p.x += cos(uTime * 0.4 + aSeed * 6.28) * 8.0;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (1.4 + aSeed * 2.2) * (300.0 / max(-mv.z, 1.0));
        gl_Position = projectionMatrix * mv;
        vAlpha = 0.12 + aSeed * 0.3;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d) * vAlpha;
        if (a < 0.01) discard;
        gl_FragColor = vec4(0.62, 0.9, 1.0, a);
      }
    `,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return { points: pts, uniforms };
}

export function createWhale() {
  const group = new THREE.Group();
  group.name = 'whale';

  const uniforms = { uTime: { value: 0 } };
  const material = makeMaterial(uniforms);
  const geometry = buildWhaleGeometry();

  // A thin dark shell around the body. The storm light is very flat, so a
  // crisp edge is what makes the whale read at distance instead of turning
  // into a fuzzy grey blob.
  const outlineMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: uniforms.uTime,
      uColor: { value: new THREE.Color('#1b242b') },
    },
    side: THREE.BackSide,
    fog: false,
    vertexShader: /* glsl */ `
      uniform float uTime;
      void main() {
        vec3 p = position;
        float along = clamp(p.z / ${HALF.toFixed(1)} * 0.5 + 0.5, 0.0, 1.0);
        float amp = 8.0 * smoothstep(0.65, 0.0, along);
        p.y += sin(uTime * 0.9 - along * 5.2) * amp;
        p.x += sin(uTime * 0.7 - along * 4.1) * amp * 0.18;
        p += normalize(normal) * 0.6;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      void main() { gl_FragColor = vec4(uColor, 1.0); }
    `,
  });
  const outline = new THREE.Mesh(geometry, outlineMat);
  outline.frustumCulled = false;
  group.add(outline);

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  group.add(mesh);

  const motes = makeMotes();
  group.add(motes.points);

  // A long, slow orbit behind the island. The ellipse stays inside the hero
  // frame so the whale is present most of the time; it passes behind the
  // island on the near half of the loop and drifts through open cloud on the
  // far half.
  const center = new THREE.Vector3(-300, -62, -860);
  const rx = 260;
  const rz = 220;
  const period = 150; // seconds per orbit
  const angle0 = Math.PI * 1.12;
  const forcedU = new URLSearchParams(location.search).get('whaleu');
  const fixedU = forcedU !== null ? parseFloat(forcedU) : null;
  const heading = new THREE.Vector3();

  function placeAt(u: number) {
    const ang = angle0 + u * Math.PI * 2;
    const x = center.x + Math.cos(ang) * rx;
    const z = center.z + Math.sin(ang) * rz;
    const y = center.y + Math.sin(ang * 2) * 4;
    group.position.set(x, y, z);
    heading.set(-Math.sin(ang) * rx, Math.cos(ang * 2) * 5, Math.cos(ang) * rz).normalize();
    group.lookAt(group.position.clone().add(heading));
    group.rotateZ(Math.sin(ang) * 0.05);
  }
  placeAt(0);

  return {
    group,
    updater: (t: number) => {
      uniforms.uTime.value = t;
      motes.uniforms.uTime.value = t;
      placeAt(fixedU !== null ? fixedU : (t / period) % 1);
    },
  };
}
