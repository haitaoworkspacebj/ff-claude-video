import * as THREE from 'three';
import { mulberry32 } from '../core/math';

/**
 * GPU rain. One instanced quad per streak, wrapped inside a box that follows
 * the camera, so the shower covers the whole view without needing particles
 * far outside the frame. The streak is billboarded against the fall direction
 * (wind + gravity) rather than the view axis, which keeps it reading as a
 * line of water instead of a flat sprite.
 */
export function createRain(count = 9000) {
  const rand = mulberry32(4711);

  const pos = new Float32Array([
    -0.5, 0, 0,
    0.5, 0, 0,
    0.5, 1, 0,
    -0.5, 1, 0,
  ]);
  const uv = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
  const idx = [0, 1, 2, 0, 2, 3];

  const iPos = new Float32Array(count * 3);
  const iSeed = new Float32Array(count);
  const iSpeed = new Float32Array(count);
  const iLen = new Float32Array(count);
  const iWidth = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    iPos[i * 3] = rand();
    iPos[i * 3 + 1] = rand();
    iPos[i * 3 + 2] = rand();
    iSeed[i] = rand();
    iSpeed[i] = 26 + rand() * 30;
    iLen[i] = 3.0 + rand() * 6.0;
    iWidth[i] = 0.035 + rand() * 0.05;
  }

  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.setAttribute('iPos', new THREE.InstancedBufferAttribute(iPos, 3));
  geo.setAttribute('iSeed', new THREE.InstancedBufferAttribute(iSeed, 1));
  geo.setAttribute('iSpeed', new THREE.InstancedBufferAttribute(iSpeed, 1));
  geo.setAttribute('iLen', new THREE.InstancedBufferAttribute(iLen, 1));
  geo.setAttribute('iWidth', new THREE.InstancedBufferAttribute(iWidth, 1));
  geo.instanceCount = count;
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 5000);

  const uniforms = {
    uTime: { value: 0 },
    uWind: { value: new THREE.Vector2(0.22, 0.06) },
    uColor: { value: new THREE.Color('#cfdde6').convertSRGBToLinear() },
    uOpacity: { value: 0.42 },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    fog: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform vec2 uWind;
      attribute vec3 iPos;
      attribute float iSeed;
      attribute float iSpeed;
      attribute float iLen;
      attribute float iWidth;
      varying vec2 vUv;
      varying float vAlpha;

      const float BOX_W = 760.0;
      const float BOX_H = 560.0;
      const float BOX_D = 760.0;

      void main() {
        vUv = uv;

        // fall + wrap: the streak's height cycles through the box over time
        float y0 = mod(iPos.y * BOX_H - uTime * iSpeed + iSeed * BOX_H, BOX_H);
        vec3 center = cameraPosition + vec3(
          (iPos.x - 0.5) * BOX_W,
          y0 - BOX_H * 0.46,
          (iPos.z - 0.5) * BOX_D
        );

        vec3 fallDir = normalize(vec3(uWind.x, -1.0, uWind.y));
        vec3 toCam = normalize(cameraPosition - center);
        vec3 side = normalize(cross(fallDir, toCam));

        vec3 world = center + side * position.x * iWidth * 12.0 + fallDir * position.y * iLen;

        float dist = length(center - cameraPosition);
        float edge = smoothstep(0.0, 55.0, y0) * smoothstep(BOX_H, BOX_H - 55.0, y0);
        vAlpha = smoothstep(620.0, 90.0, dist) * edge * (0.35 + 0.65 * iSeed);

        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec2 vUv;
      varying float vAlpha;
      void main() {
        // soft core, tapered ends
        float core = 1.0 - abs(vUv.x - 0.5) * 2.0;
        core = smoothstep(0.0, 1.0, core);
        float ends = smoothstep(0.0, 0.18, vUv.y) * smoothstep(1.0, 0.8, vUv.y);
        float a = vAlpha * core * ends * uOpacity;
        if (a < 0.003) discard;
        gl_FragColor = vec4(uColor, a);
      }
    `,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 20;
  mesh.name = 'rain';

  return {
    mesh,
    uniforms,
    updater: (t: number) => {
      uniforms.uTime.value = t;
      uniforms.uWind.value.x = 0.2 + Math.sin(t * 0.07) * 0.06;
    },
  };
}
