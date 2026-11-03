import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { createGodRaysPass } from './godrays';
import { damp, clamp } from './math';

/** Scene-wide constants shared by the world builders. */
// The hero camera sits near azimuth 0.34 (on the +z side, looking toward -z),
// so the sun has to sit on the far side of the island for the backlit,
// rim-lit silhouette the brief asks for. -2.62 rad puts it behind the island
// and to screen-left, a little above the horizon.
export const SUN_AZIMUTH = -2.62;
export const SUN_ELEVATION = 0.1;
export const sunDirection = (() => {
  // URL overrides, used by the look-dev screenshot harness
  const q = new URLSearchParams(location.search);
  const az = q.has('sunaz') ? parseFloat(q.get('sunaz')!) : SUN_AZIMUTH;
  const el = q.has('sunel') ? parseFloat(q.get('sunel')!) : SUN_ELEVATION;
  return new THREE.Vector3(
    Math.sin(az) * Math.cos(el),
    Math.sin(el),
    Math.cos(az) * Math.cos(el),
  ).normalize();
})();

export const PALETTE = {
  sunWarm: new THREE.Color('#dce6ee'),
  skyTop: new THREE.Color('#2f4356'),
  skyMid: new THREE.Color('#5a7082'),
  skyHorizon: new THREE.Color('#9fb1bd'),
  hazeCool: new THREE.Color('#8fa1ad'),
  fog: new THREE.Color('#93a5b1'),
};

export class Engine {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  rays: ShaderPass;
  grade: ShaderPass;
  private sunProbe = new THREE.Vector3();
  clock = new THREE.Clock();
  /** callbacks run once per frame before render */
  updaters: Array<(t: number, dt: number) => void> = [];
  frame = 0;
  fpsAvg = 60;
  private raf = 0;
  private statsEl: HTMLElement | null;
  private lastStatsUpdate = 0;
  /** when set, the render loop holds still (used by the screenshot harness) */
  paused = false;

  constructor(canvas?: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.97;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    document.body.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(
      28,
      window.innerWidth / window.innerHeight,
      0.5,
      9000,
    );

    this.scene.fog = location.search.includes('nofog')
      ? null
      : new THREE.FogExp2(PALETTE.fog.getHex(), 0.00065);

    this.composer = new EffectComposer(this.renderer);
    this.composer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.16,
      0.68,
      0.95,
    );
    this.composer.addPass(this.bloom);

    this.rays = createGodRaysPass();
    const q = new URLSearchParams(location.search);
    if (q.has('norays')) this.rays.enabled = false;
    if (q.has('rayi')) this.rays.uniforms.uIntensity.value = parseFloat(q.get('rayi')!);
    this.composer.addPass(this.rays);

    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());

    this.statsEl = document.getElementById('stats');
    window.addEventListener('resize', () => this.onResize());
  }

  private onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
  }

  start() {
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(this.clock.getDelta(), 0.1);
      if (this.paused) {
        this.renderer.render(this.scene, this.camera);
        return;
      }
      this.step(dt);
    };
    loop();
  }

  step(dt: number) {
    const t = this.clock.elapsedTime;
    this.frame++;
    for (const u of this.updaters) u(t, dt);

    // project the sun direction into screen space for the ray pass
    this.sunProbe
      .copy(this.camera.position)
      .addScaledVector(sunDirection, 1000)
      .project(this.camera);
    const rayUniforms = this.rays.uniforms;
    rayUniforms.uSunUv.value.set(
      this.sunProbe.x * 0.5 + 0.5,
      this.sunProbe.y * 0.5 + 0.5,
    );

    this.composer.render(dt);

    const inst = 1 / Math.max(dt, 1e-4);
    this.fpsAvg = this.fpsAvg * 0.94 + inst * 0.06;
    if (this.statsEl && t - this.lastStatsUpdate > 0.4) {
      this.lastStatsUpdate = t;
      const info = this.renderer.info;
      this.statsEl.textContent =
        `${this.fpsAvg.toFixed(0)} fps\n${(info.render.calls).toString()} draws\n${(info.render.triangles / 1000).toFixed(0)}k tris`;
      this.statsEl.style.whiteSpace = 'pre-line';
    }
  }
}

/** Final colour grade: gentle filmic contrast, cool shadows, warm highlights. */
export const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uVignette: { value: 0.42 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uVignette;
    varying vec2 vUv;

    vec3 saturate_(vec3 c, float s) {
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      return mix(vec3(l), c, s);
    }

    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;

      // split-tone: cool the shadow end, warm the highlight end
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(c, c * vec3(0.94, 1.0, 1.06), (1.0 - smoothstep(0.0, 0.45, l)) * 0.35);
      c = mix(c, c * vec3(1.05, 1.0, 0.955), smoothstep(0.55, 1.0, l) * 0.5);
      c = saturate_(c, 1.16);

      // subtle S-curve
      c = clamp(c, 0.0, 1.0);
      c = mix(c, c * c * (3.0 - 2.0 * c), 0.26);

      // vignette
      vec2 q = (vUv - 0.5) * vec2(1.0, 0.92);
      float v = 1.0 - dot(q, q) * uVignette * 1.35;
      c *= clamp(v, 0.0, 1.0);

      gl_FragColor = vec4(c, 1.0);
    }
  `,
};

export { THREE, damp, clamp };
