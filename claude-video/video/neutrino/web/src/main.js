// Boot: timeline -> shots -> preview loop (audio-clocked) or export hook.
import * as THREE from "three";
import { loadTimeline } from "./timeline.js";
import { Post } from "./post.js";
import { Titles } from "./titles.js";
import { loadGLSL } from "./shot.js";
import { buildVerse1, VERSE1_GLSL } from "./shots/verse1.js";
import { buildChorus1, CHORUS1_GLSL } from "./shots/chorus1.js";
import { buildVerse2, VERSE2_GLSL } from "./shots/verse2.js";
import { buildFinale, FINALE_GLSL } from "./shots/finale.js";

const q = new URLSearchParams(location.search);
const W = +(q.get("w") || 1280), H = +(q.get("h") || 720);
const FPS = +(q.get("fps") || 24), SHUTTER = 0.5;    // 180° shutter
const EXPORT = q.has("export");
let SUB = +(q.get("sub") || (EXPORT ? 6 : 1));

const tl = await loadTimeline();
await loadGLSL(["common", ...VERSE1_GLSL, ...CHORUS1_GLSL, ...VERSE2_GLSL, ...FINALE_GLSL]);

const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true,
  powerPreference: "high-performance" });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.autoClear = false;
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;   // FINAL pass does its own gamma
document.getElementById("stage").appendChild(renderer.domElement);

const post = new Post(renderer, W, H);
const titles = new Titles(W, H);
const g = { w: W, h: H, tl };
// acts chain end-to-start; each act derives its own internal timing from the SRT
const act1 = buildVerse1(tl);
const act2 = buildChorus1(tl, act1.range.end);
const act34 = buildVerse2(tl, act2.end);
const act57 = buildFinale(tl, act34.end);
const shots = act1.shots;                 // shared array: the scale readout sees every act
shots.push(...act2.shots, ...act34.shots, ...act57.shots);
const overlay = [...act1.overlay, ...act2.overlay, ...act34.overlay, ...act57.overlay];
// persistent frame furniture stops with the picture
for (const o of overlay) if (o.persistent) o.t1 = act57.end - 1 / 48;
const range = { start: +(q.get("from") || 0), end: +(q.get("to") || act57.end) };

function renderAt(time) {
  post.begin();
  const live = shots.map((s) => [s, s.weight(time)]).filter(([, w]) => w > 1e-4);
  for (let i = 0; i < SUB; i++) {
    const dt = ((i + 0.5) / SUB - 0.5) * SHUTTER / FPS;   // motion-blur subframe
    for (const [s, w] of live) { s.update(time + dt, g); post.addShot(s, w / SUB); }
  }
  const tex = titles.draw([...overlay, ...live.flatMap(([s]) => s.titles)], time);
  if (tex) post.addText(tex);
  const main = live.reduce((a, b) => (b[1] > a[1] ? b : a), [null, 0])[0];
  post.finish({ ...(main ? main.postAt(time) : { fade: 0 }), seed: Math.round(time * FPS) });
  return main;
}

if (EXPORT) {
  window.__mv = {
    range, fps: FPS,
    shots: shots.map((s) => ({ name: s.name, start: +s.start.toFixed(3), end: +s.end.toFixed(3) })),
    frame(t) { renderAt(t); return renderer.domElement.toDataURL("image/png"); },
    // profiling: GPU render only (1-pixel readback forces the GPU to finish)
    renderOnly(t) { renderAt(t); const gl = renderer.getContext(), px = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return px[0]; },
    // raw RGBA readback, no PNG encode (bottom-up rows)
    raw(t) {
      renderAt(t);
      const gl = renderer.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      const px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return px;
    },
  };
} else {
  const audio = document.getElementById("song"), scrub = document.getElementById("scrub");
  const info = document.getElementById("info"), play = document.getElementById("play");
  const hq = document.getElementById("hq");
  audio.currentTime = +(q.get("t") || range.start);
  play.onclick = () => (audio.paused ? audio.play() : audio.pause());
  hq.onchange = () => { SUB = hq.checked ? 4 : 1; };
  scrub.oninput = () => { audio.currentTime = range.start + (scrub.value / 1000) * (range.end - range.start); };
  const tick = () => {
    if (audio.currentTime >= range.end) audio.currentTime = range.start;
    const t = audio.currentTime, main = renderAt(t);
    const cue = tl.cues.find((c) => t >= c.start && t < c.end);
    info.textContent = `${t.toFixed(2)}s  ${main ? main.name : "-"}  ${cue ? "#" + cue.idx : ""}`;
    if (document.activeElement !== scrub) scrub.value = ((t - range.start) / (range.end - range.start)) * 1000;
    play.textContent = audio.paused ? "▶︎" : "❚❚";
    requestAnimationFrame(tick);
  };
  tick();
}
