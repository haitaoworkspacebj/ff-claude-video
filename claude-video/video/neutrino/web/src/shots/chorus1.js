// ACT II — "Bury the universe in ice" (cues 9–15, chorus 1, up to breath 2).
// The first breath's bass return is the plunge. Boundaries come from cue
// starts, beats and breaths only.
import * as THREE from "three";
import { RayShot } from "../shot.js";
import { LYRICS } from "../lyrics.js";
import { commas } from "../titles.js";
import { icecubeStrings } from "../icecube.js";
import { clamp, lin, mix, smooth, smoother, easeOut, easeIn, expoIn, expoOut, kick, norm } from "../ease.js";

export const CHORUS1_GLSL = ["ice"];
const STR = icecubeStrings().map(([x, z]) => new THREE.Vector2(x, z));

export class Ice extends RayShot {
  constructor(name, start, end, opts = {}) {
    super(name, start, end, "ice", { uStr: STR, uLit: 0, uEvA: [0, 0, 0], uEvB: [0, 0, 1], uEvT: 0, uEvOn: 0,
      uMode: 1, uSurfLight: 1, uDepth: 0, uSun: norm([0.6, 0.12, -0.5]), uNuA: [0, 0, 0], uNuB: [0, 0, 0], uNuOn: 0, uStarUp: 0,
      uDim: 0, uNight: 0, uCut: 0 }, opts);
    this.post = { bloom: 0.13 };
  }
}

// D1 · polar descent: from orbit straight down onto the South Pole
// held above the pole through the breath (quiet), crash on the bass return
class Descent extends Ice {
  constructor(tl, start, end, dropAt) {
    super("D1 polar descent", start, end, { fadeIn: 0.25 });
    this.dropAt = dropAt; this.set("uMode", 0);
  }
  frame(t, p, g, time) {
    const hold = lin(this.start, this.dropAt, time) * 0.08;        // slow drift in the breath
    const k = expoIn(lin(this.dropAt, this.end, time));             // accelerating fall
    const alt = Math.exp(mix(Math.log(3.2), Math.log(1.003), hold + k * 0.92));
    const ro = [0.35 * (1 - k), -alt, 0.55 * (1 - k)];
    this.setCamera({ ro, ta: [0, -1, 0], fov: mix(36, 75, k), up: [0, 0, 1], roll: t * 0.25 + k * 0.6 });
  }
  postAt(time) { return { ...this.post, flash: kick(time, this.end - 0.05, 12) * 0.5 }; }
}

// D2 · ice dive: punch through the surface and keep falling into the dark
class Dive extends Ice {
  constructor(tl, start, end, darkAt) { super("D2 ice dive", start, end); this.darkAt = darkAt; }
  depth(time) {
    const p = lin(this.start, this.end, time);
    return mix(-0.25, 14.0, easeIn(p, 1.6));                       // -25 m above → 1,400 m
  }
  frame(t, p, g, time) {
    const d = this.depth(time);
    this.depthNow = d;
    const sway = Math.sin(time * 1.3) * 0.02;
    this.setCamera({ ro: [sway, -d, 0], ta: [sway + 0.04, -d - 1, 0.03], fov: 64, up: [0, 0, 1], roll: t * 0.35 });
    // daylight dies with depth; full black by darkAt
    this.set("uSurfLight", 1.0 - smoother(lin(this.start + 0.3, this.darkAt, time)));
    this.set("uMode", 1);
  }
}

// D3 · the array wakes: first one DOM, then another, then the whole grid
class Array3 extends Ice {
  constructor(tl, start, end, opts) {
    super(opts.name, start, end, { fadeIn: opts.fadeIn ?? 0 });
    Object.assign(this, opts);
    this.set("uMode", 2); this.set("uSurfLight", 0);
  }
  frame(t, p, g, time) {
    const c = this.camAt(time, t, p);
    this.setCamera(c);
    this.camNow = c;
    this.litNow = this.litAt ? this.litAt(time) : 0.3;
    this.set("uLit", this.litNow);
    if (this.nu) { const n = this.nu(time); this.set("uNuOn", n.on); this.set("uNuA", n.a); this.set("uNuB", n.b); }
    if (this.ev) { const e = this.ev(time); this.set("uEvOn", e.on); this.set("uEvA", e.a); this.set("uEvB", e.b); this.set("uEvT", e.t); }
    this.set("uStarUp", this.starUp ? this.starUp(time) : 0);
  }
}
// array centre (100 m units): middle of the instrumented depth
const MID = [0, -19.5, 0];
const orbit = (r, az, y, ta = MID) => [ta[0] + Math.sin(az) * r, y, ta[2] - Math.cos(az) * r];
const N_DOM = 5160;
// fraction of DOMs awake when `n` are lit (rank threshold in the shader)
const awake = (n) => Math.min(1.001, n / N_DOM);
// log ramp: 1 → N over [a, b], count snaps up on each beat so it pulses
const wake = (tl, a, b, n0, n1) => (time) => {
  if (time < a) return 0;
  const tq = Math.min(b, tl.beat(time) <= time ? tl.beat(time) : tl.beat(time, -1));
  const k = clamp((Math.max(tq, a) - a) / (b - a) + 0.12 * clamp((time - a) / (b - a)));
  return awake(Math.exp(mix(Math.log(n0), Math.log(n1), k)));
};

export function buildChorus1(tl, startAt) {
  const C = (i) => tl.cue(i);
  const b = (t, n = 0) => tl.beat(t, n);
  const ch = (num, text, t0, t1) => ({ type: "chapter", num, text, t0, t1 });
  const stat = (o) => ({ type: "stat", ...o });
  const callout = (o) => ({ type: "callout", ...o });
  const shots = [];

  // startAt = breath 1 onset: hold above the pole, crash on the bass return
  const breath1 = tl.breathIn(startAt - 0.1, startAt + 2);
  const dropAt = breath1 ? breath1[1] : b(startAt, 2);
  const diveStart = b(dropAt, 2);                                   // 2 beats of free fall
  const firstDom = b(C(10).end);                                    // first DOM lights at the end of cue 10
  const darkAt = b(firstDom, -1);                                   // "藏进黑暗里": black for one beat only
  const c11 = b(C(11).start), c13 = b(C(13).start), c14 = b(C(14).start), c15 = b(C(15).start);
  const breath2 = tl.breathIn(C(15).start, C(16).start);
  const end = breath2 ? breath2[1] : b(C(15).end, 2);

  // ---- D1 polar descent (cue 9 begins)
  const d1 = new Descent(tl, startAt, diveStart, dropAt);
  d1.scaleAt = (t) => ({ log10: mix(7.2, 4.2, expoIn(lin(startAt, diveStart, t))), what: "地球 → 南极" });
  d1.titles = [
    ch("07", "南极点", startAt, diveStart),
    callout({ label: "南极点", sub: "90° S · 冰盖厚 2,800 m", t0: startAt + 0.3, t1: diveStart - 0.05, world: [0, -1, 0], dx: 1, dy: -1, len: 0.12 }),
    stat({ kicker: "TEMPERATURE 地表温度", value: (p) => `−${Math.round(p * 49)}`, unit: "°C 年均", t0: startAt + 0.4, t1: diveStart,
      x: 0.955, y: 0.66, align: "right", size: 0.06, label: "地球上最纯净、最透明的冰", count: 1.0 }),
  ];
  shots.push(d1);

  // ---- D2 ice dive (cues 9 → 10): through the surface, into the dark
  const d2 = new Dive(tl, diveStart, firstDom, darkAt);
  d2.scaleAt = (t) => ({ log10: 3, what: "南极冰层" });
  d2.titles = [
    ch("08", "潜入冰层", diveStart, firstDom),
    { type: "depth", t0: diveStart, t1: firstDom, at: (t) => d2.depth(t) * 100 },
    stat({ kicker: "ICE AGE 冰龄", value: (p) => commas(p * 100000), unit: "年前的雪", t0: b(diveStart, 2), t1: darkAt,
      x: 0.955, y: 0.66, align: "right", size: 0.055, label: "越往深处，冰越古老", count: 1.4 }),
    callout({ label: "气泡", sub: "被高压挤出 · 冰变得极透明", t0: b(diveStart, 1), t1: b(diveStart, 4), world: () => [0.06, -d2.depthNow - 0.12, 0.02], dx: -1, dy: 1, len: 0.1 }),
  ];
  shots.push(d2);

  // ---- D3a first lights (cue 11 "一个粒子穿过大地" / 12 "留下一点蓝光的痕迹")
  const d3a = new Array3(tl, firstDom, c13, {
    name: "D3a first lights",
    camAt: (time, t, p) => ({ ro: [0.3 + p * 0.5, -14.2 - p * 0.6, -0.4 - p * 0.3], ta: [1.2, -15.5, 1.4], fov: 52, roll: 0.05 }),
    // one, then another, then a few: 1 → 40 DOMs across cues 11–12
    litAt: (time) => (time < firstDom ? 0 : wake(tl, c11, c13, 1, 40)(Math.max(time, c11)) || awake(1)),
    nu: (time) => {
      const k = lin(b(C(12).start), c13, time);
      return { on: k > 0 ? 1.2 : 0, a: [-6, -8, -4], b: [-6 + k * 9, -8 - k * 12, -4 + k * 7] };
    },
  });
  d3a.scaleAt = () => ({ log10: 2, what: "IceCube · 光学探测器" });
  d3a.titles = [
    ch("09", "冰下的眼睛", firstDom, c13),
    callout({ label: "DOM 数字光学模块", sub: "直径 33 cm · 灵敏度达单个光子", t0: firstDom + 0.1, t1: c11 + 1.2, world: [STR[40].x, -14.5, STR[40].y], dx: 1, dy: -1, len: 0.12 }),
    stat({ kicker: "AWAKE 已点亮", value: () => commas(Math.max(1, (d3a.litNow || 0) * N_DOM)), unit: "/ 5,160 个探测器", t0: firstDom + 0.05, t1: c13,
      x: 0.955, y: 0.3, align: "right", size: 0.07, label: "86 根线缆 × 60 个", count: 0.01 }),
    callout({ label: "痕迹", sub: "粒子留下的蓝光", t0: b(C(12).start, 2), t1: c13 - 0.05, world: () => [-6 + lin(b(C(12).start), c13, d3a.start + 0.0001 + (c13 - d3a.start) * 0.9) * 9 * 0.6, -14.5, -1], dx: -1, dy: -1, len: 0.1 }),
  ];
  shots.push(d3a);

  // ---- D3b reveal (cue 13 — chorus repeat, escalate): orbit out, the whole array + ICECUBE title
  const d3b = new Array3(tl, c13, c15, {
    name: "D3b the array",
    camAt: (time, t, p) => {
      const k = smoother(lin(c13, c14 + 0.6, time));
      const r = mix(3, 15, k), az = -0.6 + t * 0.18;
      return { ro: orbit(r, az, mix(-16, -12.5, k)), ta: [0, mix(-17, -19.5, k), 0], fov: mix(60, 42, k), roll: 0.04 };
    },
    litAt: wake(tl, c13, c14 + 1.0, 40, N_DOM),
  });
  d3b.scaleAt = (t) => ({ log10: mix(2.2, 3.1, smoother(lin(c13, c14 + 0.6, t))), what: "IceCube 阵列 · 1 km³" });
  d3b.titles = [
    ch("10", "冰立方", c13, c15),
    { type: "title", text: "ICECUBE", t0: b(c13, 2), t1: c15 - 0.05, x: 0.5, y: 0.3, size: 0.085, weight: 200, track: 0.75,
      drift: 0.02, stagger: 0.06, inDur: 0.6, outDur: 0.35 },
    { type: "title", text: "NEUTRINO OBSERVATORY", t0: b(c13, 3), t1: c15 - 0.05, x: 0.5, y: 0.385, size: 0.022, weight: 400,
      track: 0.6, stagger: 0.03, inDur: 0.5, outDur: 0.35 },
    callout({ label: "深度 1,450 m", sub: "阵列顶部", t0: c14, t1: c15 - 0.05, world: [STR[77].x, -14.5, STR[77].y], dx: 1, dy: -1, len: 0.1 }),
    callout({ label: "深度 2,450 m", sub: "阵列底部", t0: b(c14, 1), t1: c15 - 0.05, world: [STR[77].x, -24.5, STR[77].y], dx: 1, dy: 1, len: 0.1 }),
    callout({ label: "间距 125 m", sub: "86 根线缆", t0: b(c14, 2), t1: c15 - 0.05, world: [STR[0].x, -14.5, STR[0].y], dx: -1, dy: -1, len: 0.1 }),
    stat({ kicker: "AWAKE 已点亮", value: () => commas(Math.min(N_DOM, (d3b.litNow || 0) * N_DOM)), unit: "/ 5,160", t0: c13, t1: c14 + 0.2,
      x: 0.955, y: 0.66, align: "right", size: 0.06, label: "整个冰层活了起来", count: 0.01 }),
    stat({ kicker: "BUILT 建成", value: (p) => `${Math.round(2004 + p * 6)}`, unit: "年", t0: b(c14, 3), t1: c15,
      x: 0.045, y: 0.66, size: 0.05, label: "热水钻 86 个 2.5 km 深孔", note: "2004 – 2010 · 南极夏季施工", count: 1.0 }),
  ];
  shots.push(d3b);

  // ---- D3c look up (cue 15 "微弱的光来自遥远的天际"): from the array floor, up past
  // the lit strings toward the surface and sky; a faint trace falls from above
  const d3c = new Array3(tl, c15, end, {
    name: "D3c look up",
    camAt: (time, t, p) => ({ ro: [STR[30].x + 0.35, -25.2 + p * 0.8, STR[30].y + 0.2], ta: [STR[30].x - 1.2, -8, STR[30].y - 2.5], fov: 50, roll: t * 0.05 }),
    litAt: (time) => 0.35 * (1 - 0.7 * smooth(lin(C(15).end - 0.5, end, time))),
    starUp: () => 0.9,
    nu: (time) => {
      const k = lin(b(c15, 2), end, time);                          // a faint trace falling from the sky
      return { on: k > 0 ? 1.4 : 0, a: [-1, 8, -2], b: [-1 + k * 1.2, 8 - k * 34, -2 + k * 1.8] };
    },
  });
  d3c.scaleAt = () => ({ log10: 3, what: "仰望 · 冰层之上" });
  d3c.titles = [
    ch("11", "来自遥远的天际", c15, end),
    stat({ kicker: "FROM 来自", value: (p) => commas(p * 40), unit: "亿光年外", t0: b(c15, 2), t1: end,
      x: 0.5, y: 0.5, size: 0.08, label: "这一束光，比地球还古老", count: 1.4 }),
  ];
  d3c.titles.at(-1).align = "left"; d3c.titles.at(-1).x = 0.36;
  shots.push(d3c);

  const overlay = tl.cues.filter((c) => c.idx >= 9 && c.idx <= 15).map((c) => ({
    type: "lyric", text: LYRICS[c.idx], t0: c.start, t1: c.end + 0.15 }));
  return { shots, end, overlay };
}
