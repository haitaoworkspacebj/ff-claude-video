import * as THREE from 'three';
import { GLSL_NOISE } from '../core/glsl';
import { PALETTE, sunDirection } from '../core/engine';

export interface SkyResult {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  envMap: THREE.Texture;
}

export function createSky(renderer: THREE.WebGLRenderer): SkyResult {
  const uniforms = {
    uSunDir: { value: sunDirection.clone() },
    uTop: { value: new THREE.Color('#2f4356').convertSRGBToLinear() },
    uMid: { value: new THREE.Color('#5a7082').convertSRGBToLinear() },
    uHorizon: { value: new THREE.Color('#9fb1bd').convertSRGBToLinear() },
    uLow: { value: new THREE.Color('#8c9ba6').convertSRGBToLinear() },
    uSunColor: { value: new THREE.Color('#cdd8e0').convertSRGBToLinear() },
    uTime: { value: 0 },
    uFlash: { value: 0 },
    // 0 = normal, 1 = raw sun dot, 2 = sun-only contribution
    uDebug: { value: Number(new URLSearchParams(location.search).get('skydebug') ?? 0) },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir, uTop, uMid, uHorizon, uLow, uSunColor;
      uniform float uTime;
      uniform float uFlash;
      uniform float uDebug;
      varying vec3 vDir;
      ${GLSL_NOISE}

      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;

        // vertical gradient
        vec3 col = mix(uHorizon, uMid, smoothstep(-0.01, 0.16, h));
        col = mix(col, uTop, smoothstep(0.10, 0.55, h));

        // below the horizon the sky reads as a cool haze bank
        col = mix(uLow, col, smoothstep(-0.32, 0.02, h));

        float sd = max(dot(d, uSunDir), 0.0);

        // Overcast storm: no sun disc, just a faint cool break in the cloud
        // behind the island so the silhouette still separates.
        col = mix(col, uSunColor, pow(sd, 8.0) * 0.35);
        col += uSunColor * pow(sd, 24.0) * 0.22;

        // heavy storm bands instead of fair-weather cirrus
        if (h > 0.03) {
          vec2 p = d.xz / max(h + 0.16, 0.001);
          p = mat2(0.86, -0.5, 0.5, 0.86) * p;
          float streak = fbm2d(p * vec2(0.55, 3.1) + vec2(uTime * 0.004, 0.0), 4);
          float wisp = smoothstep(0.40, 0.78, streak);
          wisp *= smoothstep(0.03, 0.28, h) * smoothstep(1.0, 0.45, h);
          float feather = fbm2d(p * vec2(1.9, 7.5), 3);
          wisp *= smoothstep(0.25, 0.75, feather) * 0.9 + 0.1;
          vec3 cloudCol = mix(vec3(0.16, 0.20, 0.25), vec3(0.42, 0.47, 0.52), feather);
          cloudCol = mix(cloudCol, uSunColor, pow(sd, 3.0) * 0.35);
          col = mix(col, cloudCol, wisp * 0.62);
        }

        // faint air haze band right above the horizon
        col = mix(col, uHorizon * 1.02, smoothstep(0.12, -0.03, h) * 0.45);

        // dither to keep the gradient from banding
        col += (hash13(vec3(gl_FragCoord.xy, 1.0)) - 0.5) * 0.0035;

        // lightning: the whole cloud deck lights up for a beat
        col += vec3(0.52, 0.60, 0.72) * uFlash;

        // NB: no in-shader tone mapping / colour-space conversion here — the
        // EffectComposer's OutputPass is the single place that does that.
        gl_FragColor = vec4(col, 1.0);
        if (uDebug > 0.5) {
          gl_FragColor = uDebug < 1.5
            ? vec4(vec3(sd), 1.0)
            : vec4(uSunColor * (pow(sd, 5.0) * 0.2 + pow(sd, 42.0) * 0.55), 1.0);
        }
      }
    `,
  });

  const geo = new THREE.SphereGeometry(6000, 48, 32);
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.name = 'sky';

  // Bake an IBL probe from the sky itself so every material picks up the
  // sky's colour and the sun's warm gradient.
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envScene = new THREE.Scene();
  const envSky = new THREE.Mesh(geo, material);
  envSky.frustumCulled = false;
  envScene.add(envSky);
  const envRT = pmrem.fromScene(envScene, 0.04, 0.1, 20000);
  pmrem.dispose();

  return { mesh, material, envMap: envRT.texture };
}

export function createLighting(scene: THREE.Scene, envMap: THREE.Texture) {
  const sun = new THREE.DirectionalLight(PALETTE.sunWarm, 1.4);
  sun.position.copy(sunDirection).multiplyScalar(420);
  sun.target.position.set(0, -40, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const cam = sun.shadow.camera as THREE.OrthographicCamera;
  cam.left = -175;
  cam.right = 175;
  cam.top = 175;
  cam.bottom = -175;
  cam.near = 60;
  cam.far = 900;
  cam.updateProjectionMatrix();
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.9;
  sun.shadow.radius = 2.2;
  scene.add(sun);
  scene.add(sun.target);

  // Overcast storm light: cold sky dome, dark ground bounce.
  const hemi = new THREE.HemisphereLight(0xc2ccd2, 0x4e5052, 1.5);
  scene.add(hemi);

  // A cool fill from the camera side keeps the wet cliffs readable.
  const fill = new THREE.DirectionalLight(0xccd2d4, 1.35);
  fill.position.set(-sunDirection.x, 0.55, -sunDirection.z).multiplyScalar(300);
  scene.add(fill);

  scene.environment = envMap;
  scene.environmentIntensity = 1.2;

  return { sun, hemi, fill };
}
