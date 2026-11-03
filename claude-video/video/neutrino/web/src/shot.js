// Shot = a time span with its own scene + camera. RayShot renders one
// full-screen GLSL scene (raymarched / analytic) with the shared library.
import * as THREE from "three";
import { FS_VERT, fsGeometry } from "./post.js";
import { clamp, smooth } from "./ease.js";

export const GLSL = {};
// loads GLSL files and inlines `#include "x.glsl"` (one level is enough here)
export async function loadGLSL(names) {
  const get = async (f) => (await fetch(`/web/src/glsl/${f}`)).text();
  await Promise.all(names.map(async (n) => {
    let src = await get(`${n}.glsl`);
    for (const m of [...src.matchAll(/^#include "(.+)"$/gm)]) src = src.replace(m[0], await get(m[1]));
    GLSL[n] = src;
  }));
}

const HEAD = `precision highp float;
uniform vec2 uRes; uniform float uTime, uT, uP, uFocal, uLow, uFlux, uBeat, uSince;
uniform vec3 uRo; uniform mat3 uCam;
in vec2 vUv; layout(location=0) out highp vec4 fragColor;
`;
const FOOT = `
void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5*uRes)/uRes.y;
  vec3 rd = normalize(uCam*vec3(uv, uFocal));
  fragColor = vec4(max(scene(uRo, rd, uv), 0.0), 1.0);
}`;

// plain [x,y,z] -> Vector3; arrays of objects (e.g. Vector2[]) pass through
const toU = (v) => (Array.isArray(v) && typeof v[0] === "number" ? new THREE.Vector3(...v) : v);

export class Shot {
  constructor(name, start, end, opts = {}) {
    Object.assign(this, { name, start, end, fadeIn: 0, fadeOut: 0, titles: [], post: {} }, opts);
  }
  // dissolve weight at time t (hard cut when fades are 0)
  weight(t) {
    if (t < this.start - this.fadeIn * 0.5 || t >= this.end + this.fadeOut * 0.5) return 0;
    let w = 1;
    if (this.fadeIn > 0) w *= smooth((t - this.start + this.fadeIn * 0.5) / this.fadeIn);
    if (this.fadeOut > 0) w *= 1 - smooth((t - this.end + this.fadeOut * 0.5) / this.fadeOut);
    return w;
  }
  local(t) { return { t: t - this.start, p: clamp((t - this.start) / (this.end - this.start)) }; }
  postAt() { return this.post; }
}

export class RayShot extends Shot {
  constructor(name, start, end, glsl, uniforms = {}, opts = {}) {
    super(name, start, end, opts);
    const base = { uRes: new THREE.Vector2(), uTime: 0, uT: 0, uP: 0, uFocal: 1, uLow: 0, uFlux: 0,
      uBeat: 0, uSince: 0, uRo: new THREE.Vector3(), uCam: new THREE.Matrix3() };
    const all = { ...base, ...Object.fromEntries(Object.entries(uniforms).map(([k, v]) => [k, toU(v)])) };
    this.material = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: FS_VERT,
      fragmentShader: HEAD + GLSL.common + "\n" + GLSL[glsl] + FOOT,
      uniforms: Object.fromEntries(Object.entries(all).map(([k, v]) => [k, { value: v }])),
      depthTest: false, depthWrite: false, blending: THREE.NoBlending,
    });
    const mesh = new THREE.Mesh(fsGeometry, this.material);
    mesh.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(mesh);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }
  set(k, v) {
    const u = this.material.uniforms[k];
    if (!u) throw new Error(`${this.name}: undeclared uniform ${k}`);
    if (u.value && u.value.isVector3) u.value.set(...v); else u.value = v;
  }
  // camera in world space: ro, ta, roll (rad), fov (vertical, deg)
  // up: reference up vector (default +y); roll: true rotation about the view axis
  setCamera({ ro, ta, roll = 0, fov = 40, up = [0, 1, 0] }) {
    const f = new THREE.Vector3(...ta).sub(new THREE.Vector3(...ro)).normalize();
    const r0 = new THREE.Vector3().crossVectors(f, new THREE.Vector3(...up)).normalize();
    const u0 = new THREE.Vector3().crossVectors(r0, f);
    const c = Math.cos(roll), s = Math.sin(roll);
    const r = r0.clone().multiplyScalar(c).addScaledVector(u0, s);
    const u = u0.clone().multiplyScalar(c).addScaledVector(r0, -s);
    this.material.uniforms.uCam.value.set(r.x, u.x, f.x, r.y, u.y, f.y, r.z, u.z, f.z);
    this.material.uniforms.uRo.value.set(...ro);
    this.material.uniforms.uFocal.value = 0.5 / Math.tan((fov * Math.PI) / 360);
    this._cam = { ro: new THREE.Vector3(...ro), r, u, f, focal: this.material.uniforms.uFocal.value };
  }
  // world point -> canvas pixels (y down), null if behind the camera
  project(pw, w, h) {
    const c = this._cam;
    if (!c) return null;
    const d = new THREE.Vector3(...pw).sub(c.ro);
    const z = d.dot(c.f);
    if (z <= 1e-4) return null;
    const x = (d.dot(c.r) / z) * c.focal, y = (d.dot(c.u) / z) * c.focal;
    return [w / 2 + x * h, h / 2 - y * h];
  }
  // subclasses: frame(t, p, g) sets camera + uniforms. t = local seconds.
  update(time, g) {
    const { t, p } = this.local(time);
    const U = this.material.uniforms;
    U.uRes.value.set(g.w, g.h); U.uTime.value = time; U.uT.value = t; U.uP.value = p;
    U.uLow.value = g.tl.env("low", time); U.uFlux.value = g.tl.env("flux", time);
    U.uBeat.value = Math.exp(-g.tl.sinceBeat(time) * 8); U.uSince.value = g.tl.sinceBeat(time);
    this.frame(t, p, g, time);
    // anchored callouts follow their 3D point
    for (const s of this.titles) {
      if (s.world) s.at = this.project(typeof s.world === "function" ? s.world(time) : s.world, g.w, g.h);
      if (s.marks) for (const m of s.marks) m.at = this.project(m.p, g.w, g.h);
    }
  }
  frame() {}
}
