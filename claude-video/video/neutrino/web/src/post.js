// HDR pipeline: shot -> sceneRT -> (weighted, additive) accumulation (motion blur
// + dissolves) -> title injection -> bloom chain -> filmic finish -> canvas.
import * as THREE from "three";

export const FS_VERT = `precision highp float;
in vec3 position; out vec2 vUv;
void main(){ vUv = position.xy*0.5+0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const FRAG_HEAD = `precision highp float; in vec2 vUv; layout(location=0) out highp vec4 fragColor;\n`;

export const fsGeometry = (() => {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  return g;
})();

function pass(frag, uniforms, blend) {
  const m = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3, vertexShader: FS_VERT, fragmentShader: FRAG_HEAD + frag,
    uniforms, depthTest: false, depthWrite: false,
  });
  if (blend) Object.assign(m, { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: blend[0], blendDst: blend[1], blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor });
  else m.blending = THREE.NoBlending;
  const mesh = new THREE.Mesh(fsGeometry, m);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(mesh);
  return { m, scene, u: m.uniforms };
}

const rt = (w, h, depth = false) => new THREE.WebGLRenderTarget(w, h, {
  type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: depth,
  minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false,
});

const DOWN = `uniform sampler2D uSrc; uniform vec2 uTexel;
void main(){ vec2 d = uTexel;
  vec3 a = texture(uSrc, vUv+d*vec2(-1,-1)).rgb + texture(uSrc, vUv+d*vec2(1,-1)).rgb
         + texture(uSrc, vUv+d*vec2(-1,1)).rgb + texture(uSrc, vUv+d*vec2(1,1)).rgb;
  vec3 c = a*0.125 + texture(uSrc, vUv).rgb*0.5;
  c = c/(1.0 + max(max(c.r,c.g),c.b)*0.04);      // tame fireflies
  fragColor = vec4(c, 1.0); }`;
const UP = `uniform sampler2D uSrc; uniform vec2 uTexel;
void main(){ vec2 d = uTexel; vec3 c = texture(uSrc, vUv).rgb*4.0;
  c += (texture(uSrc, vUv+vec2(d.x,0)).rgb + texture(uSrc, vUv-vec2(d.x,0)).rgb
      + texture(uSrc, vUv+vec2(0,d.y)).rgb + texture(uSrc, vUv-vec2(0,d.y)).rgb)*2.0;
  c += texture(uSrc, vUv+d).rgb + texture(uSrc, vUv-d).rgb
     + texture(uSrc, vUv+vec2(d.x,-d.y)).rgb + texture(uSrc, vUv+vec2(-d.x,d.y)).rgb;
  fragColor = vec4(c/16.0, 1.0); }`;
const ADD = `uniform sampler2D uSrc; uniform float uW;
void main(){ fragColor = vec4(texture(uSrc, vUv).rgb*uW, 1.0); }`;
const TEXT = `uniform sampler2D uSrc; uniform float uGain;
void main(){ vec4 t = texture(uSrc, vUv);
  fragColor = vec4(pow(t.rgb, vec3(2.2))*t.a*uGain, t.a*0.9); }`;
const FINAL = `uniform sampler2D uSrc, uBloom; uniform vec2 uRes;
uniform float uExposure, uBloomAmt, uGrain, uVignette, uCA, uFade, uSeed, uFlash;
float h12(vec2 p){ vec3 q = fract(vec3(p.xyx)*0.1031); q += dot(q, q.yzx+33.33); return fract((q.x+q.y)*q.z); }
vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
void main(){
  vec2 c = vUv-0.5; float r2 = dot(c,c);
  vec2 off = c*uCA*(1.0+4.0*r2);
  vec3 col = vec3(texture(uSrc, vUv-off).r, texture(uSrc, vUv).g, texture(uSrc, vUv+off).b);
  col += texture(uBloom, vUv).rgb*uBloomAmt;
  col = col*uExposure + uFlash*vec3(0.85,0.93,1.0);
  float l = dot(col, vec3(0.2126,0.7152,0.0722));       // cool mids, true blacks
  col = mix(col, col*vec3(0.93,1.0,1.09), smoothstep(0.02,0.6,l)*(1.0-smoothstep(0.6,3.0,l)));
  col = aces(col);
  col *= mix(1.0, smoothstep(1.05, 0.2, length(c*vec2(uRes.x/uRes.y,1.0))), uVignette);
  col = pow(col, vec3(1.0/2.2));
  float lum = dot(col, vec3(0.333));
  float g = (h12(gl_FragCoord.xy+uSeed*17.13)-0.5) + (h12(floor(gl_FragCoord.xy*0.5)+uSeed*3.7)-0.5);
  col += g*uGrain*(0.3+lum*(1.0-lum)*2.0);
  col *= uFade;
  col += (h12(gl_FragCoord.xy+uSeed)-0.5)/255.0;
  fragColor = vec4(clamp(col,0.0,1.0), 1.0); }`;

export class Post {
  constructor(renderer, w, h) {
    this.r = renderer; this.w = w; this.h = h;
    this.sceneRT = rt(w, h, true);
    this.acc = rt(w, h);
    this.levels = [];
    let lw = w, lh = h;
    for (let i = 0; i < 6; i++) { lw = Math.max(1, lw >> 1); lh = Math.max(1, lh >> 1); this.levels.push(rt(lw, lh)); }
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const ONE = THREE.OneFactor;
    this.pAdd = pass(ADD, { uSrc: { value: null }, uW: { value: 1 } }, [ONE, ONE]);
    this.pText = pass(TEXT, { uSrc: { value: null }, uGain: { value: 1 } }, [ONE, THREE.OneMinusSrcAlphaFactor]);
    this.pDown = pass(DOWN, { uSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.pUp = pass(UP, { uSrc: { value: null }, uTexel: { value: new THREE.Vector2() } }, [ONE, ONE]);
    this.pFinal = pass(FINAL, Object.fromEntries(["uSrc", "uBloom", "uRes", "uExposure", "uBloomAmt", "uGrain",
      "uVignette", "uCA", "uFade", "uSeed", "uFlash"].map((k) => [k, { value: 0 }])));
    this.frame = 0;
  }
  _draw(p, target) { this.r.setRenderTarget(target); this.r.render(p.scene, this.cam); }
  begin() { this.r.setRenderTarget(this.acc); this.r.setClearColor(0x000000, 0); this.r.clear(); }
  // render a shot's scene into sceneRT and add it, weighted, to the accumulator
  addShot(shot, weight) {
    this.r.setRenderTarget(this.sceneRT); this.r.setClearColor(0x000000, 1); this.r.clear();
    this.r.render(shot.scene, shot.camera);
    this.pAdd.u.uSrc.value = this.sceneRT.texture; this.pAdd.u.uW.value = weight;
    this._draw(this.pAdd, this.acc);
  }
  addText(tex, gain = 1.15) { this.pText.u.uSrc.value = tex; this.pText.u.uGain.value = gain; this._draw(this.pText, this.acc); }
  finish(o = {}) {
    let src = this.acc;
    for (const lv of this.levels) {
      this.pDown.u.uSrc.value = src.texture; this.pDown.u.uTexel.value.set(1 / src.width, 1 / src.height);
      this._draw(this.pDown, lv); src = lv;
    }
    for (let i = this.levels.length - 1; i > 0; i--) {
      const a = this.levels[i];
      this.pUp.u.uSrc.value = a.texture; this.pUp.u.uTexel.value.set(1 / a.width, 1 / a.height);
      this._draw(this.pUp, this.levels[i - 1]);
    }
    const u = this.pFinal.u;
    u.uSrc.value = this.acc.texture; u.uBloom.value = this.levels[0].texture;
    u.uRes.value = new THREE.Vector2(this.w, this.h);
    u.uExposure.value = o.exposure ?? 1; u.uBloomAmt.value = o.bloom ?? 0.1; u.uGrain.value = o.grain ?? 0.03;
    u.uVignette.value = o.vignette ?? 0.4; u.uCA.value = o.ca ?? 0.0012; u.uFade.value = o.fade ?? 1;
    // grain seed comes from the frame index (o.seed), never a counter, so any
    // process rendering frame N produces identical pixels (parallel workers, stills)
    u.uFlash.value = o.flash ?? 0; u.uSeed.value = (o.seed ?? this.frame++) % 997;
    this._draw(this.pFinal, null);
  }
}
