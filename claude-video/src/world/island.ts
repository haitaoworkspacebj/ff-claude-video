import * as THREE from 'three';
import { ISLAND, IslandTerrain } from './terrain';
import { clamp, mix, smoothstep, Noise } from '../core/math';

export interface IslandBuild {
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
  terrain: IslandTerrain;
}

/** Per-angle sliver of noise used to break up the rock silhouette. */
function seam(n: Noise, a: number, freq: number, seed: number) {
  return n.noise2(Math.cos(a) * freq + seed, Math.sin(a) * freq - seed);
}

export function buildIsland(terrain: IslandTerrain): IslandBuild {
  const NA = ISLAND.angles;
  const NR = ISLAND.rings;
  const ND = ISLAND.depthRings;
  const n = terrain.noise;

  const vertCount = 1 + NR * NA + ND * NA;
  const pos = new Float32Array(vertCount * 3);
  const col = new Float32Array(vertCount * 3);
  const aGrass = new Float32Array(vertCount);
  const aDirt = new Float32Array(vertCount);
  const aWet = new Float32Array(vertCount);
  const aAO = new Float32Array(vertCount);
  const aStrata = new Float32Array(vertCount);

  let v = 0;
  // ---- centre vertex ----
  const cy = terrain.height(0, 0);
  pos[0] = 0; pos[1] = cy; pos[2] = 0;
  col[0] = 1; col[1] = 1; col[2] = 1;
  aGrass[0] = terrain.grassMask(0, 0, cy);
  aAO[0] = 1;
  v = 1;

  // ---- top surface (polar rings) ----
  const ringStart: number[] = [];
  for (let i = 1; i <= NR; i++) {
    ringStart[i] = v;
    const f = i / NR;
    const warp = 1 - Math.pow(1 - f, 1.4);
    for (let j = 0; j < NA; j++) {
      const a = (j / NA) * Math.PI * 2;
      const rr = terrain.outline(a) * warp;
      const x = Math.cos(a) * rr;
      const z = Math.sin(a) * rr;
      const y = terrain.height(x, z);
      pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
      v++;
    }
  }
  const topEnd = v;

  // ---- under-side keel (shares the outer top ring) ----
  const skirtStart: number[] = [];
  const rimRing = ringStart[NR];
  for (let k = 1; k <= ND; k++) {
    skirtStart[k] = v;
    const t = k / ND;
    // per-layer shelves: the strata read as stacked plates of stone
    const layers = 8.5;
    const ly = t * layers;
    const li = Math.floor(ly);
    const lf = ly - li;
    const ledgeProfile = smoothstep(0.0, 0.42, lf);
    const taper = Math.pow(1 - t, 0.58) * (1 - 0.955 * smoothstep(0.52, 0.99, t));

    for (let j = 0; j < NA; j++) {
      const a = (j / NA) * Math.PI * 2;
      const rx = terrain.rimX[j];
      const rz = terrain.rimZ[j];
      const ry = terrain.rimY[j];

      // large-scale lobe structure
      const lobe = seam(n, a, 1.15, 3.1) * 0.22;
      // medium bulges that drift with depth
      const bulge = n.fbm2(Math.cos(a) * 2.4 + 7, Math.sin(a) * 2.4 + t * 2.2, 3) * 0.13;
      // per-layer shelf offset, varies slowly around the island
      const shelfAmt = seam(n, a, 2.1, li * 4.7) * 0.5 + 0.5;
      const shelf = (0.085 * shelfAmt + 0.02) * (1 - ledgeProfile) * Math.pow(1 - t, 0.7);
      // deep vertical cracks
      const crackField = n.noise2(Math.cos(a) * 6.5 + t * 0.9, Math.sin(a) * 6.5 - t * 0.4);
      const crack = smoothstep(0.42, 0.86, crackField) * 0.2;

      let scale = taper * (1 + lobe + bulge + shelf - crack);
      // lip flare: grass edge overhangs a touch before the cliff sheer starts
      scale += 0.04 * smoothstep(0.14, 0.0, t);
      // ragged bottom
      scale *= 1 + 0.5 * n.noise2(Math.cos(a) * 3.3 + 11, Math.sin(a) * 3.3) * smoothstep(0.55, 1.0, t);
      scale = Math.max(scale, 0.012);

      const depthVar = 0.74 + 0.26 * (seam(n, a, 1.9, 12.4) * 0.5 + 0.5);
      const ease = Math.pow(t, 1.06);
      const y = ry - ISLAND.keelDepth * depthVar * ease;

      // horizontal drift: the keel leans and twists a little
      const lean = n.noise2(a * 0.9, t * 1.2) * 6 * t;
      const x = rx * scale + lean;
      const z = rz * scale + n.noise2(a * 0.8 + 5, t * 1.1) * 5 * t;

      pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;

      // macro colour: strata bands + depth darkening
      const band = Math.sin(ly * 2.0 + seam(n, a, 1.2, 8.8) * 2.4);
      const coarse = n.fbm2(x * 0.05 + 20, z * 0.05 + t * 3.0, 3);
      const l = 0.86 + band * 0.16 + coarse * 0.22;
      const warm = clamp(0.5 + band * 0.5, 0, 1);
      col[v * 3] = l * mix(0.92, 1.1, warm);
      col[v * 3 + 1] = l * mix(0.97, 0.98, warm);
      col[v * 3 + 2] = l * mix(1.06, 0.9, warm);

      aGrass[v] = k === 1 ? 0.28 * smoothstep(0.0, 0.09, 0) : 0;
      aAO[v] = clamp(0.55 + 0.45 * Math.pow(1 - t, 0.6) + coarse * 0.12, 0, 1);
      aStrata[v] = li + lf;
      v++;
    }
  }

  // ---- top vertex attributes ----
  for (let i = 1; i <= NR; i++) {
    const f = i / NR;
    for (let j = 0; j < NA; j++) {
      const idx = ringStart[i] + j;
      const x = pos[idx * 3];
      const y = pos[idx * 3 + 1];
      const z = pos[idx * 3 + 2];
      const g = terrain.grassMask(x, z, y);
      aGrass[idx] = g * smoothstep(0, 0.14, 1 - f) + 0.0;
      // keep a little moss right up to the lip, but the edge itself is rock
      aGrass[idx] = mix(g, 0.3, smoothstep(0.93, 1.0, f) * 0.75);
      aDirt[idx] = terrain.dirtMask(x, z);
      aWet[idx] = terrain.wetMask(x, z);

      // cheap concavity AO
      const h0 = terrain.height(x, z);
      let around = 0;
      const R = 3.2;
      for (let k = 0; k < 6; k++) {
        const aa = (k / 6) * Math.PI * 2;
        around += terrain.height(x + Math.cos(aa) * R, z + Math.sin(aa) * R);
      }
      around /= 6;
      const concavity = clamp((around - h0) / 3.4, -1, 1);
      let ao = 1 - 0.34 * Math.max(0, concavity);
      ao -= 0.1 * smoothstep(0.0, 0.9, terrain.slopeAt(x, z));
      aAO[idx] = clamp(ao, 0.42, 1);

      const tint = n.fbm2(x * 0.028, z * 0.028, 3);
      const fine = n.fbm2(x * 0.12 + 3, z * 0.12 - 1.5, 2);
      col[idx * 3] = 0.92 + tint * 0.2 + fine * 0.06;
      col[idx * 3 + 1] = 0.95 + tint * 0.17 + fine * 0.05;
      col[idx * 3 + 2] = 0.9 + tint * 0.16 + fine * 0.04;
      aStrata[idx] = 0;
    }
  }

  // ---- index buffer ----
  const triCount = NA + (NR - 1) * NA * 2 + ND * NA * 2;
  const index = new Uint32Array(triCount * 3);
  let ii = 0;

  // centre fan
  const first = ringStart[1];
  for (let j = 0; j < NA; j++) {
    const j2 = (j + 1) % NA;
    index[ii++] = 0;
    index[ii++] = first + j2;
    index[ii++] = first + j;
  }
  // top rings (wound CCW seen from above so the surface faces up)
  for (let i = 1; i < NR; i++) {
    const a0 = ringStart[i];
    const a1 = ringStart[i + 1];
    for (let j = 0; j < NA; j++) {
      const j2 = (j + 1) % NA;
      index[ii++] = a0 + j; index[ii++] = a1 + j2; index[ii++] = a1 + j;
      index[ii++] = a0 + j; index[ii++] = a0 + j2; index[ii++] = a1 + j2;
    }
  }
  // keel rings (ring 0 == top outer ring)
  let prev = rimRing;
  for (let k = 1; k <= ND; k++) {
    const cur = skirtStart[k];
    for (let j = 0; j < NA; j++) {
      const j2 = (j + 1) % NA;
      index[ii++] = prev + j; index[ii++] = cur + j2; index[ii++] = cur + j;
      index[ii++] = prev + j; index[ii++] = prev + j2; index[ii++] = cur + j2;
    }
    prev = cur;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aGrass', new THREE.BufferAttribute(aGrass, 1));
  geo.setAttribute('aDirt', new THREE.BufferAttribute(aDirt, 1));
  geo.setAttribute('aWet', new THREE.BufferAttribute(aWet, 1));
  geo.setAttribute('aAO', new THREE.BufferAttribute(aAO, 1));
  geo.setAttribute('aStrata', new THREE.BufferAttribute(aStrata, 1));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();

  const mat = createTerrainMaterial();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'island';

  return { mesh, geometry: geo, terrain };
}

/**
 * Rock / grass / dirt blend driven by the island's own vertex attributes.
 * Textures are procedural and sampled triplanar so no UV seams appear on the
 * keel, and the whole thing still receives real shadows + IBL.
 */
export function createTerrainMaterial() {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.94,
    metalness: 0,
    vertexColors: true,
    envMapIntensity: 0.85,
  });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        attribute float aGrass;
        attribute float aDirt;
        attribute float aWet;
        attribute float aAO;
        attribute float aStrata;
        varying float vGrass;
        varying float vDirt;
        varying float vWet;
        varying float vAO;
        varying float vStrata;
        varying vec3 vWPos;
        varying vec3 vWNormal;`,
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
        vGrass = aGrass; vDirt = aDirt; vWet = aWet; vAO = aAO; vStrata = aStrata;
        vWPos = (modelMatrix * vec4(position, 1.0)).xyz;
        vWNormal = normalize(mat3(modelMatrix) * normal);`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        varying float vGrass;
        varying float vDirt;
        varying float vWet;
        varying float vAO;
        varying float vStrata;
        varying vec3 vWPos;
        varying vec3 vWNormal;

        float hash13(vec3 p) {
          p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
          p *= 17.0;
          return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
        }
        float vnoise(vec3 x) {
          vec3 i = floor(x); vec3 f = fract(x);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(hash13(i + vec3(0,0,0)), hash13(i + vec3(1,0,0)), f.x),
                         mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x),
                         mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z);
        }
        float fbm3(vec3 p) {
          float s = 0.0, a = 0.5;
          for (int i = 0; i < 5; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; }
          return s;
        }
        float fbm2s(vec2 p) {
          float s = 0.0, a = 0.5;
          for (int i = 0; i < 4; i++) { s += a * vnoise(vec3(p, 0.5)); p *= 2.01; a *= 0.5; }
          return s;
        }
        `,
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        vec3 wp = vWPos;
        vec3 wn = normalize(vWNormal);

        // ---- macro rock strata ----
        float strata = fbm3(vec3(wp.x * 0.09, wp.y * 0.55, wp.z * 0.09));
        float band = smoothstep(0.35, 0.65, fract(vStrata * 0.5 + strata * 0.35));
        vec3 rockDark = vec3(0.105, 0.106, 0.113);
        vec3 rockMid  = vec3(0.255, 0.245, 0.235);
        vec3 rockWarm = vec3(0.345, 0.262, 0.196);
        vec3 rockLight= vec3(0.395, 0.383, 0.352);
        vec3 rock = mix(rockDark, rockMid, smoothstep(0.2, 0.75, strata));
        rock = mix(rock, rockWarm, smoothstep(0.62, 0.9, fbm3(vec3(wp.x*0.13, wp.y*0.6, wp.z*0.13))));
        rock = mix(rock, rockLight, band * 0.45);

        // fine mineral speckle + crevice darkening
        float grain = fbm3(wp * 1.35);
        rock *= 0.8 + 0.42 * grain;
        rock *= 0.86 + 0.3 * fbm3(vec3(wp.x * 0.4, wp.y * 4.0, wp.z * 0.4));

        // ---- moss patches (the grass layer is gone in the storm version) ----
        vec3 mossA = vec3(0.11, 0.19, 0.05);
        vec3 mossB = vec3(0.20, 0.31, 0.08);
        vec3 mossC = vec3(0.30, 0.40, 0.12);
        float gm = fbm2s(vec2(wp.x, wp.z) * 0.30);
        float gm2 = fbm2s(vec2(wp.x, wp.z) * 1.4);
        vec3 moss = mix(mossA, mossB, smoothstep(0.3, 0.8, gm));
        moss = mix(moss, mossC, smoothstep(0.55, 0.95, gm2) * 0.4);
        moss *= 0.7 + 0.5 * fbm3(wp * 3.2);
        float mossPatch = smoothstep(0.38, 0.68, fbm2s(vec2(wp.x, wp.z) * 0.42));
        float mossW = clamp(vGrass, 0.0, 1.0) * (0.12 + 0.88 * mossPatch);
        mossW *= smoothstep(-0.25, 0.45, wn.y);

        // ---- wet gravel / dark soil ----
        vec3 dirt = vec3(0.17, 0.155, 0.135);
        dirt = mix(dirt, vec3(0.26, 0.24, 0.21), fbm3(wp * 2.2));
        dirt *= 0.7 + 0.5 * grain;

        float dirtW = clamp(vDirt, 0.0, 1.0) * (1.0 - mossW * 0.5);
        vec3 surf = mix(rock, dirt, dirtW * 0.8);
        surf = mix(surf, moss, mossW);

        // rain-soaked stone reads darker and slightly cooler
        surf *= 0.88;
        surf = mix(surf, surf * vec3(0.34, 0.4, 0.36), vWet * 0.9);

        diffuseColor.rgb *= surf;
        `,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `#include <roughnessmap_fragment>
        roughnessFactor = mix(0.62, 0.8, mossW);
        roughnessFactor = mix(roughnessFactor, 0.3, vWet * 0.9);
        `,
      )
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `#include <normal_fragment_maps>
        {
          // procedural bump from a triplanar-ish blend of world-space noise
          vec3 bn = normalize(vWNormal);
          vec3 bw = abs(bn);
          float e = 0.55;
          float h0 = fbm3(wp * 2.6);
          float hx = fbm3((wp + vec3(e,0.0,0.0)) * 2.6);
          float hy = fbm3((wp + vec3(0.0,e,0.0)) * 2.6);
          float hz = fbm3((wp + vec3(0.0,0.0,e)) * 2.6);
          vec3 g = vec3(hx - h0, hy - h0, hz - h0) / e;
          g *= mix(0.55, 0.14, vGrass);
          normal = normalize(normal - g * 0.35);
        }
        `,
      )
      .replace(
        '#include <aomap_fragment>',
        /* glsl */ `#include <aomap_fragment>
        reflectedLight.indirectDiffuse *= vAO;
        reflectedLight.indirectSpecular *= vAO;
        `,
      );
  };
  mat.customProgramCacheKey = () => 'island-terrain-v3';
  return mat;
}

export { mix, smoothstep, clamp };
