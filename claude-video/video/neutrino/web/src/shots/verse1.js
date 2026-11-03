// VERSE 1 — "Origin & Ghost" (cues 1–8, up to the first chorus breath).
// Every boundary below is derived from cue starts, the beat grid, and
// detected bass dips; there are no literal timecodes.
import { RayShot } from "../shot.js";
import { LYRICS } from "../lyrics.js";
import { sci, sup, commas } from "../titles.js";
import { clamp, lin, mix, mixv, smooth, smoother, easeOut, easeIn, expoIn, kick, norm } from "../ease.js";

export const VERSE1_GLSL = ["agn", "flight", "earth", "ghost", "sun", "lattice", "web"];

// S1 · SOURCE — frame 0 is already moving: a low, fast orbit skimming the
// lensed disk. The intro bass dip is the inhale (camera pulls in, light swells),
// the bass return is the strike (neutrino fires, camera kick, title slams).
export class Source extends RayShot {
  constructor(tl, start, end) {
    super("S1 source", start, end, "agn", { uFire: -1, uCore: 1, uDir: [0, 0, 0], uShake: 0, uLA: [0, 0, 0], uLB: [0, 0, 0], uLOn: 0 });
    const dip = tl.dipIn(start, end);
    this.inhale = dip ? dip[0] : tl.beat(mix(start, end, 0.45));
    this.fireAt = dip ? dip[1] : this.inhale + tl.period;
    this.post = { bloom: 0.14, exposure: 1.0 };
  }
  cam(time) {
    const t = time - this.start;
    const pull = smoother(lin(this.inhale - 0.4, this.fireAt, time));   // inhale: push toward the hole
    const k = kick(time, this.fireAt, 4);
    const r = mix(46, 32, smoother(lin(0, this.inhale, time))) - pull * 5 + k * 4;
    const az = -0.9 + t * 0.32;                                         // orbiting from frame 0
    const el = mix(0.16, 0.075, smooth(lin(0, this.end - this.start, t)));
    const ro = [Math.sin(az) * Math.cos(el) * r, Math.sin(el) * r, -Math.cos(az) * Math.cos(el) * r];
    const sh = k * 0.35;                                                // impact shake
    const ta = [Math.sin(time * 61) * sh, -0.4 + Math.cos(time * 47) * sh, 0];
    return { ro, ta, fov: mix(44, 36, pull) + k * 6, roll: 0.12 - t * 0.02 + k * 0.03 };
  }
  frame(t, p, g, time) {
    const c = this.cam(time);
    this.setCamera(c);
    const swell = smooth(lin(this.inhale - 0.3, this.fireAt, time));
    this.set("uCore", 1 + swell * 0.8 + kick(time, this.fireAt, 2.5) * 1.8);
    this.set("uFire", time - this.fireAt);
    // fire along the jet axis, tilted so it rakes across frame toward camera-right
    const f = norm(c.ro.map((x) => -x)), right = norm([-f[2], 0, f[0]]);
    this.set("uDir", norm([right[0] * 0.75 - f[0] * 0.35, 0.55, right[2] * 0.75 - f[2] * 0.35]));
  }
  postAt(time) {
    return { ...this.post, flash: kick(time, this.fireAt, 9) * 0.6, exposure: 1 + kick(time, this.fireAt, 3) * 0.4 };
  }
}

// S2 · FLIGHT — track beside the thread; whip-settle in, rack focus on the
// quiet bar ("not stars, not the moon"), sink to black for Earth.
class Flight extends RayShot {
  constructor(tl, start, end) {
    super("S2 flight", start, end, "flight", { uHead: 0, uRack: 0, uMoon: [0, 0, 0], uMoonR: 1, uSun: [1, 0.2, -0.3] });
    this.v = 42;                                     // world units / s
    this.quiet = tl.quietest(mix(start, end, 0.45), end - 0.3);
    this.moonZ = this.v * mix(0, end - start, 0.62) + 40;
    this.post = { bloom: 0.1 };
  }
  frame(t, p) {
    const head = this.v * t + 6;
    const settle = Math.exp(-t * 3.2);              // whip pan arrives and settles
    const ro = [1.6 + settle * 2.5, 0.35 - settle * 0.6, head - 7.5 - settle * 3];
    const ta = [0.0, 0.0, head - 1.0 + settle * 4];
    this.setCamera({ ro, ta, fov: 38, roll: -settle * 0.5 + 0.03 });
    this.set("uHead", head);
    const rack = smooth(lin(this.quiet - 0.5, this.quiet + 0.2, this.start + t));
    this.set("uRack", rack);
    this.set("uMoon", [-9, 2.5, this.moonZ]); this.set("uMoonR", 2.2);
  }
  postAt(time) { return { ...this.post, exposure: 1 - smooth(lin(this.end - 0.45, this.end, time)) }; }
}

// S3 · EARTH — long lens dolly; surface turns to glass; thread crosses the core.
export class Earth extends RayShot {
  constructor(tl, start, end, opts = {}) {
    super(opts.name || "S3 earth", start, end, "earth", { uSun: [0, 0, 0], uXray: 0, uA: [0, 0, 0], uB: [0, 0, 0],
      uBright: 1.3, uRain: 0, uRainT: 0 }, { fadeIn: opts.fadeIn ?? 0.35 });
    this.mode = opts.mode || "cross";
    this.custom = opts.custom;
    this.post = { bloom: 0.11 };
  }
  frame(t, p) {
    const sun = norm([-0.85, 0.25, -0.45]);
    this.set("uSun", sun);
    if (this.mode === "custom") { this.custom(t, p, this); return; }
    if (this.mode === "cross") {
      const r = mix(5.6, 3.9, smoother(p));
      const az = mix(0.35, 0.18, p);
      this.setCamera({ ro: [Math.sin(az) * r, 0.5, -Math.cos(az) * r], ta: [0.15, 0.05, 0], fov: 30, roll: 0.05 });
      const D = norm([0.82, -0.42, -0.25]), entry = [-D[0] * 1.15, -D[1] * 1.15 + 0.12, -D[2] * 1.15];
      const head = entry.map((x, i) => x + D[i] * (t - 1.2) * 1.55);
      this.set("uA", entry.map((x, i) => x - D[i] * 30)); this.set("uB", head);
      this.set("uXray", smoother(lin(0.7, 1.6, t)));
    } else {
      // rain of solar neutrinos (wide): every one passes straight through
      this.setCamera({ ro: [3.2, 1.0, -4.8], ta: [0, 0, 0], fov: 34, roll: -0.04 });
      this.set("uXray", 0.85); this.set("uRain", 1); this.set("uRainT", t);
      this.set("uA", [0, 0, -40]); this.set("uB", [0, 0, -40]);
      this.set("uBright", 0);
    }
  }
}

// S4/S5a · GHOST — macro DOF on the thread; NEUTRINO title. Or head-on pass.
export class Ghost extends RayShot {
  constructor(tl, start, end, opts = {}) {
    super(opts.name || "S4 ghost", start, end, "ghost", { uA: [0, 0, 0], uB: [0, 0, 0], uFocus: 1, uCoc: 6,
      uBright: 1, uBraid: 0, uBokeh: 1, uPass: 0 });
    this.mode = opts.mode || "macro";
    this.titles = opts.titles || [];
    this.post = { bloom: 0.13 };
  }
  frame(t, p) {
    if (this.mode === "macro") {
      const x = mix(-0.25, 0.35, p);
      this.setCamera({ ro: [x, 0.07, -1.1], ta: [x + 0.32, 0.0, 0], fov: 32, roll: 0.02 });
      this.set("uA", [-25, 0.02, 0.6]); this.set("uB", [6 + t * 2, -0.03, -0.25]);
      this.set("uFocus", mix(0.6, 1.15, smoother(lin(0.1, 1.2, t))));
      this.set("uCoc", 9); this.set("uBraid", smooth(lin(0.8, 2.0, t)) * 0.9);
      this.set("uBright", 1.0); this.set("uBokeh", 1); this.set("uPass", 0);
    } else {
      // head-on: the thread flies straight at (and through) the lens
      const dur = this.end - this.start, arrive = dur * 0.82;
      const k = (t - arrive) * 9;
      this.setCamera({ ro: [0, 0, 0], ta: [0.02, 0.01, 1], fov: 40 });
      const B = [0.05 * k / 9, 0.03, -k];                    // head z crosses 0 at arrival
      this.set("uA", [0.6, 0.4, 60]); this.set("uB", B);
      this.set("uFocus", 3); this.set("uCoc", 4); this.set("uBraid", 0);
      this.set("uBright", 1.4); this.set("uBokeh", 0.6);
      this.set("uPass", Math.exp(-Math.abs(t - arrive) * 22) * 0.6);
    }
  }
}
// S5c · SUN — through the Sun's limb; the thread enters and exits.
class Sun extends RayShot {
  constructor(tl, start, end) {
    super("S5c sun", start, end, "sun", { uA: [0, 0, 0], uB: [0, 0, 0], uBright: 1.4 });
    this.post = { bloom: 0.08, exposure: 0.55 };
  }
  frame(t, p) {
    this.setCamera({ ro: [0.25, 0.9, -2.6], ta: [0.55, 0.85, 0], fov: 26, roll: -0.08 });
    const D = norm([1, -0.06, 0.25]), a = [-1.3, 0.98, -0.45];
    this.set("uA", a.map((x, i) => x - D[i] * 20));
    this.set("uB", a.map((x, i) => x + D[i] * (t * 2.8)));
  }
}

// S6 · LATTICE — three encounters on the beat; the lattice then empties.
class Lattice extends RayShot {
  constructor(tl, start, end, hits) {
    super("S6 lattice", start, end, "lattice", { uFill: 0.3, uPA0: [0, 0, 0], uPA1: [0, 0, 0], uPAr: [0, 0, 0], uPAt: 0,
      uPB0: [0, 0, 0], uPB1: [0, 0, 0], uPB2: [0, 0, 0], uPB3: [0, 0, 0], uPBt: 0, uNA: [0, 0, 0], uNB: [0, 0, 0], uNBright: 0 });
    this.hits = hits;                               // [photon, charged, neutrino] absolute beat times
    this.post = { bloom: 0.12 };
    this.set("uPA1", [-1, 0, 4]); this.set("uPA0", [-8, 3, 2]); this.set("uPAr", norm([-0.4, 0.8, -0.5]));
    this.set("uPB0", [7, -3, 7]); this.set("uPB1", [3, -1, 6]); this.set("uPB2", [2, 1, 7]); this.set("uPB3", [2, 2, 6]);
  }
  frame(t, p, g, time) {
    const [hA, hB, hC] = this.hits;
    const drift = smoother(p);
    this.setCamera({ ro: [0.5 + drift * 0.6, 0.4, -1.5 - drift * 2.5], ta: [0.6, 0.2, 7], fov: 46, roll: 0.03 });
    const lead = 0.35;                              // travel time before contact
    this.set("uPAt", time < hA - lead ? 0 : time < hA ? (time - hA + lead) / lead : 1 + (time - hA));
    this.set("uPBt", time < hB - lead * 2 ? 0 : Math.min(3.0001, (time - hB + lead * 2) / (lead * 2 / 3)) + Math.max(0, time - hB - lead) * 0);
    const nT = time - (hC - lead);
    this.set("uNBright", nT > 0 ? 1.3 : 0);
    this.nuHead = [-6 + nT * 7, -0.5 + nT * 1.2, -20 + nT * 28];
    this.set("uNA", [-6, -0.5, -20]); this.set("uNB", this.nuHead);
    // the world thins out after the neutrino passes (never fully black: the
    // stat card holds the frame, and the last beat hands off to the lone point)
    this.set("uFill", 0.32 * (1 - 0.75 * smoother(lin(hC + 0.2, this.end, time))));
  }
}

// S7 · ONE POINT → THE WEB — near-black, a lone point; on "catch it" crash in.
class Web extends RayShot {
  constructor(tl, start, end, catchAt) {
    super("S7 web", start, end, "web", { uDot: 1, uWeb: 0, uThread: 0 });
    this.catchAt = catchAt;
    this.post = { bloom: 0.14 };
  }
  frame(t, p, g, time) {
    const k = smoother(lin(this.catchAt, this.end - 0.2, time));
    // log-distance dive: constant perceived zoom rate that accelerates into the web
    const dive = easeIn(lin(this.catchAt, this.end - 0.1, time), 2.2);
    const z = -Math.exp(mix(Math.log(60), Math.log(0.25), dive));
    this.setCamera({ ro: [0.0, 0.0, z], ta: [0, 0, 0], fov: mix(18, 55, k), roll: k * 0.12 });
    const breath = 0.6 + 0.4 * Math.sin(time * 2.1);
    this.set("uDot", mix(0.9 * breath, 0.0, k));
    // the far web is already faintly there (a smudge around the point), then opens up
    this.set("uWeb", 0.35 + smooth(lin(this.catchAt, this.end - 0.6, time)) * 1.25);
    this.set("uThread", smooth(lin(this.catchAt + 0.6, this.end - 0.5, time)) * 1.2);
  }
  postAt(time) {
    const w = smooth(lin(this.end - 0.45, this.end, time));     // exposure bloom into the breath
    return { ...this.post, exposure: 1 + w * 2.5, flash: w * 0.25 };
  }
}

// Breath — the music drops out; so does the picture. One filament, fading.
class Breath extends RayShot {
  constructor(tl, start, end) {
    super("breath", start, end, "ghost", { uA: [0, 0, 0], uB: [0, 0, 0], uFocus: 1, uCoc: 0, uBright: 0, uBraid: 0, uBokeh: 0, uPass: 0 });
  }
  frame(t, p) {
    this.setCamera({ ro: [0, 0, -2], ta: [0, 0, 0], fov: 35 });
    this.set("uA", [-3, 0.0, 0]); this.set("uB", [3, 0.0, 0]);
    this.set("uBright", 0.5 * (1 - smooth(p)));
  }
}

// Information layer for the whole act: sung lines, chapter tags, live scale.
// `shots` is read lazily so later acts' shots (pushed into the same array) count.
function overlayFor(tl, shots, lastCue) {
  const items = tl.cues.filter((c) => c.idx <= lastCue).map((c) => ({
    type: "lyric", text: LYRICS[c.idx], t0: c.start, t1: c.end + 0.15 }));
  items.push({ type: "brand", persistent: true });
  const scaleOf = (t) => { const s = shots.find((x) => t >= x.start && t < x.end); return s && s.scaleAt ? s.scaleAt(t) : null; };
  items.push({ type: "scale", persistent: true, at: scaleOf });
  return items;
}

export function buildVerse1(tl) {
  const C = (i) => tl.cue(i);
  const b = (t, n = 0) => tl.beat(t, n);
  const shots = [];
  // Act boundaries: lyric starts snapped to the beat grid.
  const s1end = b(C(2).start);
  const s3start = b(C(4).start);
  const s4start = b(C(5).start);
  const s5start = b(C(6).start);
  const s6start = b(C(7).start);
  const s7start = b(C(8).start);
  // first structural breath: the bass drops out just after the chorus vocal
  // enters; the drop (bass return) is where the ice dive will begin.
  const breath = tl.breathIn(C(8).end - 1, C(9).end);
  const v1end = breath ? breath[0] : b(C(8).end);
  const ch = (num, text, t0, t1) => ({ type: "chapter", num, text, t0, t1 });
  const stat = (o) => ({ type: "stat", ...o });
  const callout = (o) => ({ type: "callout", ...o });

  // ---- S1 · source: hook in the first second, data on the strike
  const s1 = new Source(tl, 0, s1end);
  s1.scaleAt = (t) => ({ log10: mix(13.8, 13.2, lin(0, s1end, t)), what: "超大质量黑洞 · 吸积盘" });
  s1.titles = [
    ch("01", "宇宙深处的信使", 0, s1end),
    { type: "title", text: "宇宙中最难抓住的粒子", t0: 0.15, t1: s1.fireAt - 0.05, x: 0.5, y: 0.66, size: 0.062,
      weight: 600, track: 0.12, stagger: 0.03, inDur: 0.35, outDur: 0.2, font: '"PingFang SC", sans-serif', slam: true },
    { type: "title", text: "THE GHOST PARTICLE", t0: 0.45, t1: s1.fireAt - 0.05, x: 0.5, y: 0.735, size: 0.022,
      weight: 300, track: 0.7, stagger: 0.02, inDur: 0.4, outDur: 0.2 },
    callout({ label: "黑洞吸积盘", sub: "T ≈ 10⁵ – 10⁶ K", t0: 0.5, t1: s1.fireAt - 0.1, world: [-11, 0.2, 0], dx: -1, dy: 1, len: 0.12 }),
    callout({ label: "相对论喷流", sub: "v ≈ 0.99 c", t0: 0.9, t1: s1.fireAt - 0.1, world: [0, 14, 0], dx: 1, dy: -1, len: 0.12 }),
    stat({ kicker: "ENERGY 能量", value: (p) => `${commas(p * 100)}`, unit: "万亿 eV", t0: s1.fireAt + 0.1, t1: s1end,
      x: 0.955, y: 0.66, align: "right", size: 0.06, label: "约为大型强子对撞机碰撞能量的 7 倍", count: 0.9 }),
    callout({ label: "中微子 ν", sub: "诞生", t0: s1.fireAt + 0.05, t1: s1end, world: (t) => [0, 0.3, 0], dx: 1, dy: 1, len: 0.1 }),
  ];
  shots.push(s1);
  // ---- S2 · flight (cues 2–3): what kind of telescope is this?
  const s2 = new Flight(tl, s1end, s3start);
  s2.scaleAt = (t) => ({ log10: mix(16.5, 12.5, lin(s1end, s3start, t)), what: "星际空间" });
  s2.titles = [
    ch("02", "一台奇怪的望远镜", s1end, s3start),
    stat({ kicker: "VELOCITY 速度", value: (p) => `${(p * 0.99999).toFixed(5)}`, unit: "c  接近光速", t0: s1end + 0.15, t1: C(3).start,
      x: 0.955, y: 0.3, align: "right", size: 0.055, label: "飞越 4,000,000,000 光年", count: 1.0 }),
    stat({ kicker: "ICECUBE 冰立方", value: (p) => `${(p * 1).toFixed(p < 1 ? 2 : 0)}`, unit: "立方公里 冰", t0: b(C(2).start, 2), t1: C(3).start + 0.3,
      x: 0.045, y: 0.62, size: 0.06, label: "世界上最大的中微子望远镜", note: "南极点 · 冰下 1,450 – 2,450 米", count: 1.0 }),
    { type: "title", text: "不看光   看粒子", t0: b(C(3).start, 1), t1: s3start - 0.05, x: 0.5, y: 0.45, size: 0.055,
      weight: 600, track: 0.25, stagger: 0.05, inDur: 0.35, outDur: 0.25, font: '"PingFang SC", sans-serif' },
    callout({ label: "月球", sub: "可见光 · 被挡住", t0: C(3).start + 0.4, t1: s3start - 0.1, world: () => [-9, 2.5, s2.moonZ], dx: 1, dy: -1, len: 0.1 }),
  ];
  shots.push(s2);

  // ---- S3 · earth (cue 4): it really goes through
  const s3 = new Earth(tl, s3start, s4start);
  s3.scaleAt = (t) => ({ log10: 7.1, what: "地球 · 直径 12,742 km" });
  const L = (label, sub, w, dx, dy, k) => callout({ label, sub, world: w, dx, dy, len: 0.11, t0: s3start + 1.5 + k * 0.35, t1: s4start - 0.05 });
  s3.titles = [
    ch("03", "穿过整个地球", s3start, s4start),
    L("地壳", "0 – 35 km", [-0.62, 0.76, -0.1], -1, -1, 0),
    L("地幔", "35 – 2,900 km", [0.62, 0.42, -0.1], 1, -1, 1),
    L("外核 · 液态铁", "≈ 5,000 °C", [-0.36, -0.28, -0.1], -1, 1, 2),
    L("内核", "≈ 5,400 °C", [0.03, -0.04, -0.1], 1, 1, 3),
    stat({ kicker: "CROSSING TIME 穿越用时", value: (p) => (p * 0.0425).toFixed(4), unit: "秒", t0: s3start + 0.3, t1: s3start + 1.9,
      x: 0.955, y: 0.33, align: "right", size: 0.06, label: "一路畅通 · 几乎零阻挡", count: 1.2 }),
  ];
  shots.push(s3);

  // ---- S4 · ghost (cue 5): name it
  const s4 = new Ghost(tl, s4start, s5start, {
    titles: [
      ch("04", "宇宙的幽灵", s4start, s6start),
      { type: "title", text: "NEUTRINO", t0: b(C(5).start, 1), t1: s5start - 0.05, x: 0.5, y: 0.36, size: 0.075,
        weight: 200, track: 0.9, drift: 0.02, stagger: 0.06, inDur: 0.7, outDur: 0.35 },
      { type: "title", text: "中微子  ν", t0: b(C(5).start, 2), t1: s5start - 0.05, x: 0.5, y: 0.46, size: 0.034,
        weight: 500, track: 0.4, stagger: 0.06, inDur: 0.5, outDur: 0.3, font: '"PingFang SC", sans-serif' },
      stat({ kicker: "CHARGE 电荷", value: () => "0", t0: b(C(5).start, 3), t1: s5start - 0.05, x: 0.06, y: 0.68, size: 0.05,
        label: "不带电 · 电磁力抓不住它", count: 0.3 }),
      stat({ kicker: "MASS 质量", value: (p) => `< 1/${commas(p * 500000)}`, t0: b(C(5).start, 4), t1: s5start - 0.05, x: 0.94, y: 0.68,
        align: "right", size: 0.05, label: "电子质量 · 极小但不为零", count: 0.8 }),
      callout({ label: "三种「味」", sub: "νe · νμ · ντ 飞行中相互转换", t0: b(C(5).start, 5), t1: s5start - 0.05,
        world: () => [0.35 + s4.local(Math.min(s5start, s4start + 2.5)).p * 0.2, 0.0, 0.0], dx: 1, dy: 1, len: 0.08 }),
    ],
  });
  s4.scaleAt = () => ({ log10: -1, what: "微距 · 一条轨迹" });
  shots.push(s4);

  // ---- S5 · cue 6: through you / through Earth / through the Sun
  const thirds = [s5start, b(mix(s5start, s6start, 1 / 3)), b(mix(s5start, s6start, 2 / 3)), s6start];
  const s5a = new Ghost(tl, thirds[0], thirds[1], { name: "S5a through you", mode: "headon" });
  s5a.scaleAt = () => ({ log10: 0, what: "你的身体" });
  s5a.titles = [stat({ kicker: "EVERY SECOND 每一秒", value: (p) => commas(p * 100), unit: "万亿个", t0: thirds[0], t1: thirds[1] + 0.25,
    x: 0.5, y: 0.5, size: 0.085, label: "中微子正穿过你的身体", count: 0.7 })];
  s5a.titles[0].align = "left"; s5a.titles[0].x = 0.3;
  const s5b = new Earth(tl, thirds[1], thirds[2], { name: "S5b through Earth", mode: "rain", fadeIn: 0 });
  s5b.scaleAt = () => ({ log10: 7.1, what: "地球" });
  s5b.titles = [stat({ kicker: "STOPPED BY EARTH 被地球挡下", value: () => "< 10⁻¹¹", unit: "", t0: thirds[1] + 0.05, t1: thirds[2],
    x: 0.955, y: 0.78, align: "right", size: 0.05, label: "被地球挡下的比例 · 几乎全部穿过", count: 0.5 })];
  const s5c = new Sun(tl, thirds[2], thirds[3]);
  s5c.scaleAt = () => ({ log10: 9.1, what: "太阳 · 直径 139 万 km" });
  s5c.titles = [
    stat({ kicker: "ESCAPE THE SUN 逃出太阳", value: (p) => (p * 2).toFixed(1), unit: "秒", t0: thirds[2] + 0.05, t1: thirds[3] + 0.2,
      x: 0.06, y: 0.75, size: 0.06, label: "中微子", count: 0.5 }),
    stat({ kicker: " ", value: (p) => commas(p * 100000), unit: "年", t0: thirds[2] + 0.2, t1: thirds[3] + 0.2,
      x: 0.94, y: 0.75, align: "right", size: 0.06, label: "光子要走约 10 万年", count: 0.6 }),
  ];
  shots.push(s5a, s5b, s5c);

  // ---- S6 · lattice (cue 7): three encounters, then the punchline number
  const hit = (n) => b(s6start, 1 + n * 2);
  const s6 = new Lattice(tl, s6start, s7start, [hit(0), hit(1), hit(2)]);
  s6.scaleAt = () => ({ log10: -10, what: "原子尺度" });
  s6.titles = [
    ch("05", "为什么这么难抓", s6start, s7start),
    callout({ label: "光子", sub: "撞上 · 被散射", t0: hit(0), t1: s7start - 0.1, world: [-1, 0, 4], dx: -1, dy: -1, len: 0.1 }),
    callout({ label: "带电粒子", sub: "电离 · 停下", t0: hit(1), t1: s7start - 0.1, world: [2, 2, 6], dx: 1, dy: -1, len: 0.1 }),
    callout({ label: "中微子", sub: "直接穿过 · 无反应", t0: hit(2), t1: s7start - 0.1, world: () => s6.nuHead, dx: 1, dy: 1, len: 0.1 }),
    stat({ kicker: "TO STOP HALF OF THEM 挡住一半需要", value: (p) => `${(p * 1).toFixed(p < 1 ? 1 : 0)}`, unit: "光年厚的铅", t0: hit(2) + 0.5, t1: s7start + 0.6,
      x: 0.5, y: 0.5, size: 0.1, label: "约 9.5 万亿公里", count: 0.8 }),
  ];
  s6.titles.at(-1).align = "left"; s6.titles.at(-1).x = 0.33;
  shots.push(s6);

  // ---- S7 · web (cue 8): catch it -> the shape of the universe
  const catchAt = b(mix(C(8).start, C(8).end, 0.42));
  const s7 = new Web(tl, s7start, v1end, catchAt);
  s7.scaleAt = (t) => ({ log10: mix(-3, 26, smoother(lin(catchAt, v1end, t))), what: t < catchAt ? "一个粒子" : "宇宙大尺度结构" });
  s7.titles = [
    ch("06", "抓住它", s7start, v1end),
    { type: "title", text: "怎么抓住它？", t0: s7start + 0.1, t1: catchAt, x: 0.5, y: 0.38, size: 0.05, weight: 600,
      track: 0.2, stagger: 0.05, inDur: 0.35, outDur: 0.2, font: '"PingFang SC", sans-serif' },
    stat({ kicker: "OBSERVABLE UNIVERSE 可观测宇宙", value: (p) => commas(p * 930), unit: "亿光年", t0: catchAt + 0.3, t1: v1end,
      x: 0.955, y: 0.33, align: "right", size: 0.06, label: "它能带回宇宙最深处的信息", count: 1.2 }),
  ];
  shots.push(s7);
  // the breath itself belongs to Act II (held above the pole, then the plunge)
  return { shots, range: { start: 0, end: v1end }, overlay: overlayFor(tl, shots, 8) };
}
