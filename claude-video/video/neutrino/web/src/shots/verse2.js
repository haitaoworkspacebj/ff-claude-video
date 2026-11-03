// ACTS III–IV — interlude (breath 2 → cue 16) + verse 2 (cues 16–22).
// III: an up-going neutrino crosses the whole Earth (the Earth is a filter:
//      down-going atmospheric muons rain in, only neutrinos come from below).
// IV:  2 KM → macro to the nucleus → interaction → muon → Cherenkov cone →
//      DOMs light in causal order → TIME / POSITION → track grows from data.
import * as THREE from "three";
import { RayShot } from "../shot.js";
import { LYRICS } from "../lyrics.js";
import { commas } from "../titles.js";
import { icecubeStrings } from "../icecube.js";
import { clamp, lin, mix, smooth, smoother, easeOut, easeIn, expoIn, expoOut, kick, norm } from "../ease.js";

export const VERSE2_GLSL = ["capture"];
export const STR = icecubeStrings().map(([x, z]) => new THREE.Vector2(x, z));
const TOP = -14.5, DSP = 0.17;

// The event: vertex inside the array, track rising toward the upper corner.
export const VTX = [-1.6, -22.6, 1.2];
export const DIR = norm([0.42, 0.72, -0.55]);                          // up-going
export const along = (s) => VTX.map((x, i) => x + DIR[i] * s);
// arrival "time" (in 100 m of light path) — identical to domHit() in icecube.glsl
function arrival(p) {
  const q = p.map((x, i) => x - VTX[i]);
  const a = q[0] * DIR[0] + q[1] * DIR[1] + q[2] * DIR[2];
  const perp = Math.hypot(...q.map((x, i) => x - DIR[i] * a));
  return { t: a - perp * 1.18 >= 0 ? a + perp * 0.846 : Math.hypot(...q) * 1.31, perp };
}
// the DOMs that see the event, sorted by arrival — for the TIME labels
const HITS = (() => {
  const out = [];
  STR.forEach((s, i) => {
    for (let k = 0; k < 60; k++) {
      const p = [s.x, TOP - k * DSP, s.y], a = arrival(p);
      if (a.perp < 1.6 && a.t > 0) out.push({ p, t: a.t, perp: a.perp, str: i + 1, dom: k + 1 });
    }
  });
  return out.sort((x, y) => x.t - y.t);
})();
// 100 m of light path in vacuum ≈ 333 ns
const NS = (t) => Math.round(t * 333.6);

export class Cap extends RayShot {
  constructor(name, start, end, opts = {}) {
    super(name, start, end, "capture", { uStr: STR, uLit: 0, uEvA: VTX, uEvB: along(1), uEvT: -1, uEvOn: 0, uDim: 0,
      uMacro: 0, uMacroNu: 0, uVtx: VTX, uVertex: -1, uMuon: 0, uCone: 0, uNuIn: 0, uNuHead: -100, uFit: 0, uArrow: 0,
      uBg: 0, uBgT: 0 }, opts);
    this.post = { bloom: 0.15 };
  }
  apply(u) { for (const [k, v] of Object.entries(u)) this.set(k, v); }
}
import { Earth } from "./verse1.js";

const ch = (num, text, t0, t1) => ({ type: "chapter", num, text, t0, t1 });
const stat = (o) => ({ type: "stat", ...o });
const callout = (o) => ({ type: "callout", ...o });
const title = (o) => ({ type: "title", weight: 600, track: 0.2, stagger: 0.04, inDur: 0.35, outDur: 0.25,
  font: '"PingFang SC", sans-serif', ...o });

export function buildVerse2(tl, startAt) {
  const C = (i) => tl.cue(i);
  const b = (t, n = 0) => tl.beat(t, n);
  const shots = [];
  const c16 = b(C(16).start), c17 = b(C(17).start), c18 = b(C(18).start), c19 = b(C(19).start);
  const c20 = b(C(20).start), c21 = b(C(21).start), c22 = b(C(22).start);
  const end = b(C(23).start);                                     // hand-off to Act V on cue 23
  const mid = b(mix(startAt, c16, 0.5));                          // interlude split on a beat

  // ===== ACT III · interlude: the Earth as a filter =========================
  // III-a: wide — an up-going neutrino enters the northern sky side, crosses
  // the core, exits under the South Pole. Down-going cosmic-ray muons can't.
  const D = norm([0.18, -1, 0.12]);                               // north → south through the core
  const entry = D.map((x) => -x * 1.25);
  const e1 = new Earth(tl, startAt, mid, { name: "E1 Earth filter", mode: "custom", fadeIn: 0.2, custom: (t, p, s) => {
    const k = smoother(p);
    const r = mix(4.2, 3.2, k), az = 1.2 + t * 0.12;
    s.setCamera({ ro: [Math.sin(az) * r, mix(0.6, -0.2, k), -Math.cos(az) * r], ta: [0, -0.1, 0], fov: 34, roll: 0.06 });
    s.set("uXray", 0.9);
    s.set("uA", entry.map((x, i) => x - D[i] * 30)); s.set("uB", entry.map((x, i) => x + D[i] * (t * 0.62 - 0.1)));
    s.set("uBright", 1.5); s.set("uRain", 0);
  } });
  e1.scaleAt = () => ({ log10: 7.1, what: "地球" });
  e1.titles = [
    ch("12", "地球是过滤器", startAt, c16),
    callout({ label: "南极 · IceCube", sub: "从「下方」接收", t0: startAt + 0.6, t1: mid - 0.05, world: [0.06, -0.995, 0.04], dx: 1, dy: 1, len: 0.1 }),
    stat({ kicker: "FILTER 地球过滤", value: () => "12,742", unit: "km 岩石", t0: startAt + 0.4, t1: mid, x: 0.045, y: 0.66, size: 0.055,
      label: "只有中微子能从地球另一侧穿过来", note: "其他粒子全部被挡住", count: 0.01 }),
  ];
  shots.push(e1);

  // III-b: inside the array — muons rain DOWN (background); the one track that
  // comes UP through the bedrock is the neutrino.
  const e2 = new Cap("E2 up-going", mid, c16, { fadeIn: 0 });
  e2.frame = (t, p, g, time) => {
    e2.setCamera({ ro: [6.5 - p * 1.4, -20 + p * 0.8, -6.5 + p * 1.6], ta: [0, -19.5, 0], fov: 50, roll: 0.03 });
    e2.apply({ uLit: 0.15, uDim: 0.75, uBg: 1, uBgT: time, uNuIn: 1.3, uNuHead: mix(-16, -2.5, p) });
    e2.set("uEvOn", 0);
  };
  e2.scaleAt = () => ({ log10: 3, what: "IceCube 阵列" });
  e2.titles = [
    callout({ label: "大气 μ 子", sub: "从上方来 · 背景噪声", t0: mid + 0.2, t1: c16 - 0.05, world: [2.0, -16, 2.5], dx: 1, dy: -1, len: 0.1 }),
    callout({ label: "中微子", sub: "从地球下方穿上来", t0: mid + 0.5, t1: c16 - 0.05, world: () => along(mix(-16, -2.5, lin(mid, c16, e2.start + (c16 - mid) * 0.8)) - 3), dx: -1, dy: 1, len: 0.1 }),
    stat({ kicker: "RATIO 比例", value: (p) => `1 : ${commas(p * 1000000)}`, t0: b(mid, 1), t1: c16, x: 0.955, y: 0.3, align: "right", size: 0.05,
      label: "中微子事件 : 背景 μ 子", count: 1.2 }),
  ];
  shots.push(e2);
  // ===== ACT IV · the capture ================================================
  // F1 (cue 16 "两公里深的冰，藏着数千个探测器"): a string drops 2 KM; scale bar
  const f1 = new Cap("F1 two km", c16, c17);
  f1.frame = (t, p, g, time) => {
    const k = smoother(p);
    f1.setCamera({ ro: [STR[50].x + 0.9, mix(-1.5, -16.5, k), STR[50].y - 1.4], ta: [STR[50].x, mix(-6, -20, k), STR[50].y], fov: 46, roll: -0.04 });
    f1.apply({ uLit: 0.12 + 0.4 * k, uDim: 0, uBg: 0 });
    f1.depthNow = mix(150, 1650, k);
  };
  f1.scaleAt = () => ({ log10: 3.3, what: "冰下 2 km" });
  f1.titles = [
    ch("13", "两公里深", c16, c18),
    { type: "title", text: "2 KM", t0: c16 + 0.05, t1: c17 - 0.05, x: 0.5, y: 0.42, size: 0.13, weight: 200, track: 0.3, stagger: 0.08, inDur: 0.5, outDur: 0.3, slam: true },
    { type: "depth", t0: c16, t1: c17, at: () => f1.depthNow },
    stat({ kicker: "DETECTORS 探测器", value: (p) => commas(p * 5160), unit: "个", t0: b(c16, 2), t1: c17, x: 0.045, y: 0.66, size: 0.055,
      label: "每个都在等一次偶然的撞击", count: 0.9 }),
  ];
  shots.push(f1);

  // F2 (cue 17 "等一个中微子，偶然撞上原子核"): extreme macro ice → H₂O → nucleus
  const hitAt = b(C(17).end, -1);                                 // the collision lands one beat before cue 18
  const f2 = new Cap("F2 macro", c17, c18);
  f2.frame = (t, p, g, time) => {
    const m = smoother(lin(c17, hitAt - 0.1, time));
    f2.setCamera({ ro: [0, 0, 0], ta: [0, 0, 1], fov: mix(60, 40, m), roll: t * 0.15 });
    f2.apply({ uMacro: Math.max(0.03, m), uMacroNu: clamp(lin(b(c17, 1), hitAt, time)), uVertex: time - hitAt });
  };
  f2.postAt = (time) => ({ ...f2.post, bloom: 0.08, flash: kick(time, hitAt, 16) * 0.08 });
  f2.scaleAt = (time) => ({ log10: mix(-3, -14.6, smoother(lin(c17, hitAt - 0.1, time))), what: time < b(c17, 2) ? "冰晶" : time < hitAt - 0.4 ? "水分子 H₂O" : "氧原子核" });
  f2.titles = [
    ch("14", "撞击", c17, c19),
    callout({ label: "水分子 H₂O", sub: "冰的基本单元", t0: b(c17, 1), t1: b(c17, 3), world: [0.04, 0.03, 1], dx: 1, dy: -1, len: 0.1 }),
    callout({ label: "氧原子核", sub: "8 质子 + 8 中子", t0: b(hitAt, -2), t1: c18 - 0.05, world: [0.1, 0.06, 4], dx: 1, dy: -1, len: 0.1 }),
    callout({ label: "中微子", sub: "终于撞上了", t0: b(c17, 2), t1: hitAt, world: () => [-5 + 5 * clamp(lin(b(c17, 1), hitAt, f2.start + 0.001)), 1.8, 7], dx: -1, dy: -1, len: 0.08 }),
    stat({ kicker: "RARE 罕见", value: (p) => `${Math.round(p * 1)}`, unit: "次 / 月", t0: b(c17, 1), t1: hitAt, x: 0.955, y: 0.66, align: "right", size: 0.06,
      label: "来自宇宙深处的高能事件，大约每月一例", count: 0.6 }),
  ];
  shots.push(f2);

  // F3 (cue 18 "这一撞，产生新的粒子"): pull back out — vertex, sparks, muon born
  const f3 = new Cap("F3 vertex", c18, c19);
  f3.frame = (t, p, g, time) => {
    const k = smoother(p);
    const r = mix(0.25, 1.4, expoOut(p));
    f3.setCamera({ ro: [VTX[0] + r * 0.8, VTX[1] + r * 0.25, VTX[2] - r], ta: along(mix(0.0, 0.25, k)), fov: 44, roll: 0.05 });
    f3.apply({ uVertex: time - c18 + 0.3, uMuon: Math.max(0, (time - c18) * 0.12), uCone: 0.0, uNuIn: 0.6, uNuHead: 0, uLit: 0.1, uDim: 0.8 });
  };
  f3.scaleAt = () => ({ log10: 1, what: "相互作用点" });
  f3.titles = [
    callout({ label: "μ 子 (muon)", sub: "带电 · 继承中微子的方向", t0: b(c18, 1), t1: c19 - 0.05, world: () => along(Math.max(0.05, (f3.start + 1 - c18) * 0.12)), dx: 1, dy: -1, len: 0.1 }),
    callout({ label: "中微子消失", sub: "能量转给了新粒子", t0: c18 + 0.1, t1: c19 - 0.05, world: VTX, dx: -1, dy: 1, len: 0.1 }),
    title({ text: "中微子 → μ 子", t0: b(c18, 2), t1: c19 - 0.05, x: 0.5, y: 0.2, size: 0.04 }),
  ];
  shots.push(f3);

  // F4 (cue 19 "高速穿过冰层，闪出蓝色的光迹"): THE climax — Cherenkov cone
  const f4 = new Cap("F4 cherenkov", c19, c20);
  const muAt = (time) => 0.3 + (time - c19) * 1.1;                // muon length (100 m)
  f4.frame = (t, p, g, time) => {
    const L = muAt(time), head = along(L);
    const side = [DIR[2], 0, -DIR[0]].map((x) => x * 1.6);         // tracking alongside the muon
    // stay outside the cone shell (r = back·1.18): 0.9 back → shell at 1.06, camera at 2.6
    f4.setCamera({ ro: head.map((x, i) => x - DIR[i] * 0.9 + side[i] * 1.6 + (i === 1 ? 0.2 : 0)), ta: along(L - 0.6), fov: mix(48, 58, p), roll: 0.08 + t * 0.03 });
    f4.apply({ uMuon: L, uCone: smooth(lin(c19, c19 + 0.25, time)), uEvOn: 1, uEvT: L, uLit: 0.1, uDim: 0.8, uVertex: time - c18 + 2 });
  };
  f4.postAt = (time) => ({ ...f4.post, bloom: 0.2, flash: kick(time, c19, 8) * 0.4 });
  f4.scaleAt = () => ({ log10: 2, what: "冰中 · 光锥" });
  f4.titles = [
    ch("15", "切伦科夫光", c19, c21),
    { type: "title", text: "CHERENKOV LIGHT", t0: b(c19, 1), t1: c20 - 0.05, x: 0.5, y: 0.22, size: 0.05, weight: 200, track: 0.55, stagger: 0.04, inDur: 0.5, outDur: 0.3 },
    stat({ kicker: "SPEED 速度", value: (p) => (p * 0.99999).toFixed(5), unit: "c", t0: b(c19, 2), t1: c20, x: 0.045, y: 0.66, size: 0.05,
      label: "μ 子比冰中的光还快", note: "冰中光速只有 0.76 c", count: 0.6 }),
    callout({ label: "光锥 41°", sub: "像超音速飞机的音爆", t0: b(c19, 3), t1: c20 - 0.05, world: () => along(muAt(f4.start + 1.5) - 0.9).map((x, i) => x + [0.3, -0.25, 0.3][i]), dx: 1, dy: 1, len: 0.1 }),
  ];
  shots.push(f4);
  // F5 (cue 20 "一个亮，两个亮，更多探测器亮起来"): wide — the array answers in order
  const tEv = (time) => muAt(c20) + (time - c20) * 1.3;          // event clock continues
  const lastT = HITS.length ? HITS[Math.min(HITS.length - 1, 60)].t : 10;
  const f5 = new Cap("F5 cascade", c20, c21);
  f5.frame = (t, p, g, time) => {
    const az = -2.2 + t * 0.22, r = mix(7.5, 9.5, p);
    f5.setCamera({ ro: [VTX[0] + Math.sin(az) * r, -18.5, VTX[2] - Math.cos(az) * r], ta: along(3.0), fov: 46, roll: 0.03 });
    f5.apply({ uMuon: Math.min(tEv(time), 14), uCone: 1 - smooth(lin(c20 + 1.5, c21, time)), uEvOn: 1, uEvT: tEv(time), uLit: 0.1, uDim: 0.8, uVertex: 9 });
    f5.nLit = HITS.filter((h) => h.t <= tEv(time)).length;
  };
  f5.scaleAt = () => ({ log10: 3, what: "IceCube 阵列" });
  const countLbl = ["一个", "两个", "五个", "十个", "数十个"];
  f5.titles = [
    stat({ kicker: "HITS 响应", value: () => commas(f5.nLit || 0), unit: "个探测器", t0: c20, t1: c21, x: 0.955, y: 0.3, align: "right", size: 0.08,
      label: "按光到达的先后依次点亮", note: "不是同时 · 有先有后", count: 0.01 }),
    { type: "title", text: "1  →  2  →  5  →  10  →  50+", t0: b(c20, 1), t1: c21 - 0.05, x: 0.5, y: 0.2, size: 0.032, weight: 300,
      track: 0.25, stagger: 0.12, inDur: 0.3, outDur: 0.25 },
  ];
  shots.push(f5);

  // F6 (cue 21 "记录时间和位置，把轨迹连起来"): freeze, labels, the fit grows
  const f6 = new Cap("F6 reconstruct", c21, c22);
  const shown = HITS.slice(0, 14);
  f6.frame = (t, p, g, time) => {
    const az = -1.0 + t * 0.12;
    f6.setCamera({ ro: [VTX[0] + Math.sin(az) * 6.8, -19.5, VTX[2] - Math.cos(az) * 6.8], ta: along(3.0), fov: 44, roll: 0.02 });
    f6.apply({ uMuon: 0, uCone: 0, uEvOn: 1, uEvT: 40, uLit: 0.1, uDim: 0.85, uVertex: 9, uFit: smoother(lin(b(c21, 3), c22, time)) });
  };
  f6.scaleAt = () => ({ log10: 3, what: "事件重建" });
  f6.titles = [
    ch("16", "重建轨迹", c21, end),
    { type: "marks", t0: c21, t1: c22, marks: shown.map((h, i) => ({ p: h.p, t0: c21 + i * (tl.period / 2), label: `t+${NS(h.t - shown[0].t)} ns` })) },
    { type: "title", text: "TIME", t0: c21 + 0.05, t1: c22 - 0.05, x: 0.38, y: 0.18, size: 0.045, weight: 200, track: 0.5, stagger: 0.05, inDur: 0.4 },
    { type: "title", text: "POSITION", t0: b(c21, 1), t1: c22 - 0.05, x: 0.62, y: 0.18, size: 0.045, weight: 200, track: 0.5, stagger: 0.05, inDur: 0.4 },
    stat({ kicker: "PRECISION 精度", value: (p) => `${(p * 3).toFixed(0)}`, unit: "纳秒", t0: b(c21, 2), t1: c22, x: 0.045, y: 0.7, size: 0.05,
      label: "每个探测器自带原子钟级时间戳", count: 0.6 }),
  ];
  shots.push(f6);

  // F7 (cue 22 "光从哪里来，粒子从哪里来"): two questions, two reverse shots, the arrow
  const half = b(mix(c22, end, 0.5));
  const f7 = new Cap("F7 where from", c22, end);
  f7.frame = (t, p, g, time) => {
    const first = time < half;
    const c = first
      ? { ro: along(-1.8).map((x, i) => x + [0.9, -0.4, 0.6][i]), ta: along(3), fov: 52, roll: -0.05 }    // down the track: "where did the light come from"
      : { ro: along(14).map((x, i) => x + [1.2, 0.8, -0.8][i]), ta: VTX, fov: 40, roll: 0.04 };          // reverse: "where did the particle come from"
    f7.setCamera(c);
    f7.apply({ uEvOn: 1, uEvT: 40, uLit: 0.1, uDim: 0.85, uVertex: 9, uFit: 1, uArrow: first ? 0 : expoOut(lin(half, end, time)) * 30 });
  };
  f7.postAt = (time) => ({ ...f7.post, flash: kick(time, half, 10) * 0.3 });
  f7.scaleAt = () => ({ log10: 3, what: "方向重建" });
  f7.titles = [
    title({ text: "光从哪里来？", t0: c22 + 0.05, t1: half - 0.05, x: 0.5, y: 0.2, size: 0.045 }),
    title({ text: "粒子从哪里来？", t0: half + 0.05, t1: end - 0.05, x: 0.5, y: 0.2, size: 0.045 }),
    { type: "title", text: "DIRECTION", t0: b(half, 1), t1: end - 0.02, x: 0.5, y: 0.3, size: 0.03, weight: 300, track: 0.6, stagger: 0.04, inDur: 0.3, outDur: 0.15 },
    stat({ kicker: "ANGULAR ERROR 指向精度", value: (p) => `< ${(1.0 - p * 0.6).toFixed(1)}`, unit: "°", t0: half + 0.1, t1: end, x: 0.955, y: 0.66, align: "right",
      size: 0.055, label: "反推中微子的来向", count: 0.8 }),
  ];
  shots.push(f7);
  const overlay = tl.cues.filter((c) => c.idx >= 16 && c.idx <= 22).map((c) => ({
    type: "lyric", text: LYRICS[c.idx], t0: c.start, t1: c.end + 0.15 }));
  return { shots, end, overlay };
}
