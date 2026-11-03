import * as THREE from 'three';
import { GLSL_NOISE } from '../core/glsl';
import { sunDirection } from '../core/engine';
import { mulberry32, Noise } from '../core/math';

export const CLOUD_SEA_Y = -205;

/** The endless white sea of cloud far below the island. */
export function createCloudSea() {
  const uniforms = {
    uTime: { value: 0 },
    uSunDir: { value: sunDirection.clone() },
    uHorizon: { value: new THREE.Color('#aab6bf').convertSRGBToLinear() },
    uDeep: { value: new THREE.Color('#6f7f8a').convertSRGBToLinear() },
    uLit: { value: new THREE.Color('#dfe7ec').convertSRGBToLinear() },
    uShade: { value: new THREE.Color('#9caab5').convertSRGBToLinear() },
    uWarm: { value: new THREE.Color('#c9c0b2').convertSRGBToLinear() },
    uFlash: { value: 0 },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uSunDir, uHorizon, uDeep, uLit, uShade, uWarm;
      uniform float uFlash;
      varying vec3 vWorld;
      ${GLSL_NOISE}

      void main() {
        vec2 p = vWorld.xz;
        float dist = length(p);
        // scale detail with distance so far clouds blur into soft banks
        float lod = mix(0.0016, 0.00018, smoothstep(300.0, 3400.0, dist));
        vec2 q = p * lod;
        float t = uTime * 0.006;

        float warp = fbm2d(q * 0.62 + vec2(t, t * 0.4), 3);
        float n = fbm2d(q * 1.55 + warp * 1.7 + vec2(t * 0.5, 0.0), 5);
        float fine = fbm2d(q * 5.5 + warp * 0.8, 3);
        float hgt = n * 0.74 + fine * 0.26;

        // billowy relief: high spots catch the sun, troughs sit in cool shade
        float relief = smoothstep(0.26, 0.72, hgt);
        vec3 col = mix(uShade, uLit, relief);
        col = mix(col, uDeep, smoothstep(0.44, 0.14, hgt) * 0.4);

        // warm scatter from the low sun
        vec3 vd = normalize(vWorld - cameraPosition);
        float sunAmt = pow(max(dot(vd, normalize(vec3(uSunDir.x, 0.22, uSunDir.z))), 0.0), 3.0);
        col = mix(col, uWarm, sunAmt * 0.35 * relief);

        // distance haze into the horizon
        float haze = smoothstep(700.0, 3600.0, dist);
        col = mix(col, uHorizon, haze * 0.82);

        // very slight brightening right under the sun
        col += uWarm * sunAmt * 0.06;

        col += vec3(0.45, 0.50, 0.58) * uFlash;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  const geo = new THREE.CircleGeometry(4200, 96);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = CLOUD_SEA_Y;
  mesh.renderOrder = -50;
  mesh.frustumCulled = false;
  mesh.name = 'cloud-sea';

  return { mesh, material: mat, uniforms };
}

/**
 * Soft volumetric-looking cloud puffs. Each "puff" is a camera-facing quad whose
 * shading is derived from a fake sphere normal, so clusters read as billows
 * instead of flat decals. One draw call for thousands of puffs.
 */
export function createCloudBanks() {
  const noise = new Noise(77123);
  const rand = mulberry32(4411);

  const quads: number[] = [];
  const quadUV: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < 4; i++) {
    const x = i === 0 || i === 3 ? -1 : 1;
    const y = i < 2 ? -1 : 1;
    quads.push(x, y, 0);
    quadUV.push(x * 0.5 + 0.5, y * 0.5 + 0.5);
  }
  idx.push(0, 1, 2, 0, 2, 3);

  const iPos: number[] = [];
  const iScale: number[] = [];
  const iSeed: number[] = [];
  const iTint: number[] = [];
  const iRot: number[] = [];

  const addPuff = (x: number, y: number, z: number, s: number, seed: number, tint: number) => {
    iPos.push(x, y, z);
    iScale.push(s, s * (0.62 + rand() * 0.3), s * 1.35);
    iSeed.push(seed);
    iTint.push(tint);
    iRot.push((rand() - 0.5) * 0.5);
  };

  // Cluster generator: warm the whole sky ring with layered banks.
  const clusterCount = 46;
  for (let c = 0; c < clusterCount; c++) {
    const ang = (c / clusterCount) * Math.PI * 2 + rand() * 0.14;
    // bias more banks toward the back-left (sun side) and the far horizon
    const dist = 620 + Math.pow(rand(), 1.4) * 2300;
    const cx = Math.cos(ang) * dist;
    const cz = Math.sin(ang) * dist;
    const cy = -150 + (rand() - 0.35) * 260 + (dist / 2900) * 90;
    const clusterR = 60 + rand() * 150 + dist * 0.03;
    const puffs = 9 + Math.floor(rand() * 12);
    const seedBase = rand() * 100;
    for (let p = 0; p < puffs; p++) {
      const a = rand() * Math.PI * 2;
      const rr = Math.pow(rand(), 0.6) * clusterR;
      const px = cx + Math.cos(a) * rr;
      const pz = cz + Math.sin(a) * rr * 1.25;
      const py = cy + (rand() - 0.45) * clusterR * 0.42;
      const s = clusterR * (0.42 + rand() * 0.55);
      addPuff(px, py, pz, s, seedBase + p * 3.1, rand());
    }
  }

  // a few low foreground banks that skim the cloud sea
  for (let i = 0; i < 26; i++) {
    const ang = rand() * Math.PI * 2;
    const dist = 380 + rand() * 900;
    addPuff(
      Math.cos(ang) * dist,
      CLOUD_SEA_Y + 30 + rand() * 70,
      Math.sin(ang) * dist,
      90 + rand() * 170,
      rand() * 100,
      rand(),
    );
  }

  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(quads, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(quadUV, 2));
  geo.setIndex(idx);
  geo.setAttribute('iPos', new THREE.InstancedBufferAttribute(new Float32Array(iPos), 3));
  geo.setAttribute('iScale', new THREE.InstancedBufferAttribute(new Float32Array(iScale), 3));
  geo.setAttribute('iSeed', new THREE.InstancedBufferAttribute(new Float32Array(iSeed), 1));
  geo.setAttribute('iTint', new THREE.InstancedBufferAttribute(new Float32Array(iTint), 1));
  geo.setAttribute('iRot', new THREE.InstancedBufferAttribute(new Float32Array(iRot), 1));
  geo.instanceCount = iSeed.length;
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, -100, 0), 4000);

  const uniforms = {
    uTime: { value: 0 },
    uSunDir: { value: sunDirection.clone() },
    uLit: { value: new THREE.Color('#c9d5dd').convertSRGBToLinear() },
    uShade: { value: new THREE.Color('#77889a').convertSRGBToLinear() },
    uWarm: { value: new THREE.Color('#b3a695').convertSRGBToLinear() },
    uFogColor: { value: new THREE.Color('#8fa1ad').convertSRGBToLinear() },
    uFogDensity: { value: 0.00065 },
    uFlash: { value: 0 },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */ `
      attribute vec3 iPos;
      attribute vec3 iScale;
      attribute float iSeed;
      attribute float iTint;
      attribute float iRot;
      varying vec2 vUv;
      varying vec2 vLocal;
      varying float vSeed;
      varying float vTint;
      varying vec3 vWorld;
      varying float vDist;

      void main() {
        vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 camUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        float s = sin(iRot), c = cos(iRot);
        vec2 pp = mat2(c, -s, s, c) * position.xy;
        vec3 world = iPos + camRight * pp.x * iScale.x + camUp * pp.y * iScale.y;
        vWorld = world;
        vUv = uv;
        vLocal = position.xy;
        vSeed = iSeed;
        vTint = iTint;
        vDist = length(iPos - cameraPosition);
        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uSunDir, uLit, uShade, uWarm, uFogColor;
      uniform float uFogDensity;
      uniform float uFlash;
      varying vec2 vUv;
      varying vec2 vLocal;
      varying float vSeed;
      varying float vTint;
      varying vec3 vWorld;
      varying float vDist;
      ${GLSL_NOISE}

      void main() {
        vec2 p = vLocal;
        float r = length(p);
        if (r > 1.12) discard;

        // noise-shaped silhouette so no puff reads as a circle
        vec2 nq = p * 1.9 + vec2(vSeed, vSeed * 0.37) + uTime * 0.004;
        float edge = fbm2d(nq * 1.6, 4);
        float soft = 0.55 + 0.45 * edge;
        float a = smoothstep(soft * 1.02, soft * 0.35, r);

        // fake sphere normal for billow shading
        float z = sqrt(max(0.0, 1.0 - r * r));
        vec3 n = normalize(vec3(p * 0.85, z * 0.9 + 0.25));
        vec3 sun = normalize(uSunDir);
        float lambert = clamp(dot(n, sun) * 0.5 + 0.5, 0.0, 1.0);
        float up = clamp(n.y * 0.5 + 0.5, 0.0, 1.0);

        float detail = fbm2d(p * 2.4 + vSeed + uTime * 0.01, 3);
        float dens = a * (0.72 + 0.5 * detail);

        vec3 col = mix(uShade, uLit, pow(lambert, 1.25) * 0.9 + up * 0.2);
        col = mix(col, uWarm, pow(max(dot(normalize(sun), vec3(0.0, 0.55, 1.0)), 0.0), 4.0) * 0.0
                                 + smoothstep(0.6, 1.0, lambert) * 0.22);
        // underside picks up cool bounce from the cloud sea below
        col = mix(col, uShade * vec3(0.9, 0.95, 1.05), smoothstep(0.1, -0.9, p.y) * 0.35);

        // aerial perspective
        float fog = 1.0 - exp(-pow(vDist * uFogDensity * 1.35, 2.0));
        col = mix(col, uFogColor, fog * 0.92);
        col += vec3(0.5, 0.55, 0.62) * uFlash;

        gl_FragColor = vec4(col, dens * 0.9);
      }
    `,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;
  mesh.name = 'cloud-banks';

  return { mesh, material: mat, uniforms };
}
