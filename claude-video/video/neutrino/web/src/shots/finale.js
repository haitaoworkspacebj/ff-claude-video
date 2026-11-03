// ACTS V–VII — cues 23–33 and the outro, to the hard stop.
// V   (23–24)  look back: the arrow leaves the ice and the Earth, reaches the source
// VI  (25–31)  final chorus: the pole → the Earth → the neutrino sky → three messengers
// VII (32–33 + outro) the ice at night, one last thread, cut on the hard stop
import { RayShot } from "../shot.js";
import { LYRICS } from "../lyrics.js";
import { commas } from "../titles.js";
import { Source, Earth } from "./verse1.js";
import { Ice } from "./chorus1.js";
import { Cap, VTX, DIR } from "./verse2.js";
import { clamp, lin, mix, smooth, smoother, easeOut, easeIn, expoIn, expoOut, kick, norm } from "../ease.js";

export const FINALE_GLSL = ["window"];

const ch = (num, text, t0, t1) => ({ type: "chapter", num, text, t0, t1 });
const stat = (o) => ({ type: "stat", ...o });
const callout = (o) => ({ type: "callout", ...o });
const title = (o) => ({ type: "title", weight: 600, track: 0.2, stagger: 0.04, inDur: 0.35, outDur: 0.25,
  font: '"PingFang SC", sans-serif', ...o });
const thin = (o) => ({ type: "title", weight: 200, track: 0.6, stagger: 0.05, inDur: 0.5, outDur: 0.35, ...o });

class Win extends RayShot {
  constructor(name, start, end, opts = {}) {
    super(name, start, end, "window", { uSrc: [0, 0, 60], uLight: 0, uGW: 0, uNu: 0, uFlowT: 0, uDust: 0, uWin: 0, uWinR: 0.3,
      uMap: 0, uMapT: 0, uGal: 0, uHot: 0 }, opts);
    this.post = { bloom: 0.14 };
  }
  apply(u) { for (const [k, v] of Object.entries(u)) this.set(k, v); }
}
const apply = (s, u) => { for (const [k, v] of Object.entries(u)) s.set(k, v); };

export function buildFinale(tl, startAt) {
  const C = (i) => tl.cue(i);
  const b = (t, n = 0) => tl.beat(t, n);
  const shots = [];
  const c23 = startAt, c24 = b(C(24).start), c26 = b(C(26).start), c27 = b(C(27).start);
  const c28 = b(C(28).start), c29 = b(C(29).start), c30 = b(C(30).start), c31 = b(C(31).start);
  const c32 = b(C(32).start), c33 = b(C(33).start);
  // structural breaths found by searching the gaps around the cues (not fixed offsets)
  const br3 = tl.breathIn(C(24).start, C(26).start);              // bass out before the final chorus
  const br4 = tl.breathIn(C(31).start, C(32).start);              // bass out before the coda
  const c25 = br3 ? br3[1] : b(C(25).start);                      // the final chorus hits on the bass return
  const stop = tl.end;                                            // the hard stop

  // ===== ACT V · look back ===================================================
  // V1 (cue 23 "沿着它的方向回头看"): the track is up-going, so the neutrino came
  // from BELOW. Ride the reconstructed arrow back down (−DIR): out of the array,
  // through the bedrock — retracing Act III's path through the Earth.
  const v1end = b(mix(c23, c24, 0.55));
  const v1 = new Cap("V1 arrow down", c23, v1end);
  v1.frame = (t, p, g, time) => {
    const L = mix(2, 24, expoIn(p));
    const head = VTX.map((x, i) => x - DIR[i] * L);
    v1.setCamera({ ro: head.map((x, i) => x + DIR[i] * 2.2 + [1.0, 0.3, 0.9][i]), ta: head, fov: 54, roll: 0.05 + t * 0.06 });
    apply(v1, { uEvOn: 1, uEvT: 40, uLit: 0.1, uDim: 0.85, uVertex: 9, uFit: 1, uArrow: L });
    v1.depthNow = Math.max(0, -head[1] * 100);
  };
  v1.scaleAt = () => ({ log10: 3, what: "沿来向回溯" });
  v1.titles = [
    ch("17", "回头看", c23, c25),
    { type: "depth", t0: c23, t1: v1end, at: () => v1.depthNow },
    thin({ text: "DIRECTION", t0: c23 + 0.1, t1: v1end - 0.05, x: 0.5, y: 0.2, size: 0.04 }),
    callout({ label: "冰层之下 · 基岩", sub: "2,800 m 以下", t0: b(c23, 3), t1: v1end - 0.05, world: () => VTX.map((x, i) => x - DIR[i] * 8), dx: 1, dy: 1, len: 0.1 }),
  ];
  shots.push(v1);

  // V2 (cue 23, 2nd half): wide — the line runs back through the whole Earth and
  // out of the northern hemisphere into space
  const D3 = norm([0.18, -1, 0.12]);                               // Act III travel direction (north → south pole)
  const back = D3.map((x) => -x);
  const pole = [0, -1, 0];
  const v2 = new Earth(tl, v1end, c24, { name: "V2 out of Earth", mode: "custom", fadeIn: 0.15, custom: (t, p, s) => {
    const k = smoother(p);
    s.setCamera({ ro: [mix(3.0, 4.6, k), mix(-0.6, 0.4, k), mix(-2.6, -3.4, k)], ta: [0.1, mix(-0.3, 0.6, k), 0.1], fov: 40, roll: -0.06 });
    s.set("uXray", 0.85); s.set("uBright", 1.7); s.set("uRain", 0);
    s.set("uA", pole); s.set("uB", pole.map((x, i) => x + back[i] * mix(0.1, 7, expoOut(p))));
  } });
  v2.scaleAt = (t) => ({ log10: mix(6.8, 7.8, smoother(lin(v1end, c24, t))), what: "穿回地球" });
  v2.titles = [
    callout({ label: "南极 · IceCube", sub: "事件发生地", t0: v1end + 0.1, t1: c24 - 0.05, world: pole, dx: -1, dy: 1, len: 0.1 }),
    stat({ kicker: "ARRIVAL 来向", value: (p) => `+${(p * 5.7).toFixed(1)}°`, unit: "赤纬", t0: b(v1end, 1), t1: c24, x: 0.045, y: 0.68, size: 0.05,
      label: "赤经 77.4°  ·  北半球天空中的一个点", count: 0.8 }),
    stat({ kicker: "ALERT 全球警报", value: (p) => `${Math.max(1, Math.round(p * 43))}`, unit: "秒", t0: b(v1end, 1), t1: c24, x: 0.955, y: 0.3, align: "right", size: 0.06,
      label: "自动通知全世界的望远镜", note: "光学 · X 射线 · 伽马射线一起看过去", count: 0.8 }),
  ];
  shots.push(v2);
  // V3 (cue 24 "就能找到宇宙的答案"): arrival at the source — the black hole
  // from frame 0, now with the line arriving. Bookend to the opening.
  const v3end = br3 ? br3[0] : b(C(24).end);
  const v3 = new Source(tl, c24, v3end);
  v3.cam = (time) => {
    const t = time - c24, p = lin(c24, v3end, time);
    const r = mix(60, 38, smoother(p)), az = 0.6 + t * 0.12, el = 0.13;
    return { ro: [Math.sin(az) * Math.cos(el) * r, Math.sin(el) * r, -Math.cos(az) * Math.cos(el) * r], ta: [0, -0.4, 0], fov: 40, roll: -0.08 };
  };
  v3.fireAt = c24 - 100; v3.inhale = c24 - 101;                    // no emission swell here
  const v3frame = v3.frame.bind(v3);
  v3.frame = (t, p, g, time) => {
    v3frame(t, p, g, time);
    v3.set("uFire", -1); v3.set("uCore", 1.1);
    const k = expoOut(lin(c24, b(c24, 4), time));
    const from = norm([0.8, 0.12, -0.6]).map((x) => x * 200);      // the line comes in from far off-frame
    v3.set("uLA", from); v3.set("uLB", from.map((x) => x * (1 - k * 0.995))); v3.set("uLOn", 1);
  };
  v3.postAt = (time) => ({ bloom: 0.14, flash: kick(time, b(c24, 4), 10) * 0.35 });
  v3.scaleAt = () => ({ log10: 25.6, what: "40 亿光年外" });
  v3.titles = [
    thin({ text: "SOURCE", t0: b(c24, 4), t1: v3end - 0.05, x: 0.5, y: 0.2, size: 0.06, slam: true }),
    callout({ label: "TXS 0506+056", sub: "耀变体 · 喷流正对地球", t0: b(c24, 5), t1: v3end - 0.05, world: [0, 0.4, 0], dx: 1, dy: -1, len: 0.12 }),
    stat({ kicker: "2017 · 09 · 22", value: (p) => commas(p * 40), unit: "亿光年", t0: b(c24, 5), t1: v3end, x: 0.045, y: 0.7, size: 0.06,
      label: "第一次确认：高能中微子的宇宙源头", note: "IceCube-170922A + 费米伽马射线望远镜", count: 0.9 }),
  ];
  shots.push(v3);

  // V4 (breath 3, 85.8–86.7 s): line 25 is already being sung over the bass
  // drop-out, so the final chorus starts on the breath's END (the bass return).
  // The black hole recedes through the breath.
  if (br3) {
    const v4 = new Source(tl, br3[0], br3[1]);
    v4.cam = (time) => {
      const p = lin(br3[0], br3[1], time), r = mix(38, 120, easeIn(p, 2)), az = 0.6 + (time - c24) * 0.12;
      return { ro: [Math.sin(az) * r, 0.13 * r, -Math.cos(az) * r], ta: [0, -0.4, 0], fov: 40, roll: -0.08 };
    };
    v4.fireAt = -100; v4.inhale = -101;
    const f = v4.frame.bind(v4);
    v4.frame = (t, p, g, time) => { f(t, p, g, time); v4.set("uFire", -1); v4.set("uCore", 1 - p * 0.5); v4.set("uLOn", 0); };
    v4.postAt = () => ({ bloom: 0.12 });
    v4.scaleAt = () => ({ log10: 26, what: "宇宙深处" });
    shots.push(v4);
  }
  // ===== ACT VI · the final chorus: a new window =============================
  // W1 (cue 25 "把宇宙埋进冰里", bass return): night on the polar plateau, the
  // IceCube Lab lit, then the snow turns to glass and the whole array glows below
  const w1 = new Ice("W1 the pole at night", c25, c26, { fadeIn: 0 });
  w1.set("uMode", 2); w1.set("uSurfLight", 0); w1.set("uNight", 1);
  w1.frame = (t, p, g, time) => {
    // the shot is under a second (bass return → cue 26), so it opens already high
    // with the array showing through the snow
    const k = smoother(p), az = -0.5 + t * 0.12;
    const r = mix(5.5, 9, k), y = mix(3.0, 6.5, k);
    w1.setCamera({ ro: [0.4 + Math.sin(az) * r, y, 0.1 - Math.cos(az) * r], ta: [0.3, mix(-3, -8, k), 0.1], fov: mix(46, 50, k), roll: 0.03 });
    w1.set("uCut", 0.6 + 0.4 * smooth(p));
    w1.set("uLit", 0.85 + 0.15 * Math.exp(-tl.sinceBeat(time) * 6));
  };
  w1.postAt = (time) => ({ bloom: 0.14, flash: kick(time, c25, 9) * 0.3 });
  w1.scaleAt = (t) => ({ log10: mix(2.5, 3.4, smoother(lin(c25, c26, t))), what: "南极点 · 冬夜" });
  w1.titles = [
    ch("18", "新的窗口", c25, c32),
    callout({ label: "5,160 个探测器", sub: "冰下 1,450 – 2,450 m · 全年无休", t0: c25 + 0.05, t1: c26 - 0.02, world: [0, -14.5, 0], dx: -1, dy: 1, len: 0.12 }),
  ];
  shots.push(w1);

  // W2 (cue 26 "把答案藏进黑暗里"): a decade of events fills the sky map
  const w2 = new Win("W2 neutrino sky", c26, c27);
  w2.frame = (t, p, g, time) => {
    w2.setCamera({ ro: [0, 0, 0], ta: [0, 0, 1], fov: 40 });
    w2.apply({ uMap: smooth(lin(c26, c26 + 0.3, time)), uMapT: mix(4, 90, smoother(p)), uGal: 0, uHot: smooth(lin(b(c26, 3), c27, time)) });
  };
  w2.scaleAt = () => ({ log10: 26, what: "全天 · 中微子天图" });
  w2.titles = [
    thin({ text: "THE NEUTRINO SKY", t0: c26 + 0.1, t1: c27 - 0.05, x: 0.5, y: 0.12, size: 0.034 }),
    { type: "list", kicker: "DISCOVERIES 发现", x: 0.045, y: 0.82, gap: 0.0, t0: c26, t1: c27, rows: [
      { k: "2013", v: "首批宇宙高能中微子", sub: "「伯特」和「厄尼」 · 千万亿 eV", t0: c26 + 0.2 } ] },
    callout({ label: "TXS 0506+056", sub: "2018 · 第一个源", t0: b(c26, 3), t1: c27 - 0.05, atUV: [1.14 * 0.3, 0.063 * 0.3], dx: 1, dy: -1, len: 0.08 }),
    callout({ label: "NGC 1068", sub: "2022 · 塞弗特星系", t0: b(c26, 4), t1: c27 - 0.05, atUV: [1.55 * 0.3, -0.02 * 0.3], dx: 1, dy: 1, len: 0.08 }),
  ];
  shots.push(w2);

  // W3 (cue 27 "中微子穿过地球，蓝光留下它的足迹"): our own Galaxy, seen in neutrinos
  const w3 = new Win("W3 galactic plane", c27, c28);
  w3.frame = (t, p, g, time) => {
    w3.setCamera({ ro: [0, 0, 0], ta: [0, 0, 1], fov: 40 });
    w3.apply({ uMap: 1, uMapT: 90, uHot: 1, uGal: smoother(lin(c27, b(c27, 4), time)) });
  };
  w3.scaleAt = () => ({ log10: 21, what: "银河系 · 中微子图像" });
  w3.titles = [
    thin({ text: "THE NEUTRINO SKY", t0: c27, t1: c28 - 0.05, x: 0.5, y: 0.12, size: 0.034, inDur: 0.01 }),
    callout({ label: "银河系盘面", sub: "2023 · 第一张中微子银河图", t0: b(c27, 2), t1: c28 - 0.05, atUV: [-0.6 * 0.3, 0.55 * Math.sin(-0.6 * 1.55 + 0.45) * 0.3], dx: -1, dy: -1, len: 0.1 }),
    stat({ kicker: "EVENTS 事件", value: (p) => commas(p * 60000), unit: "个", t0: c27 + 0.1, t1: c28, x: 0.955, y: 0.82, align: "right", size: 0.05,
      label: "十年数据 · 画出天空的另一张地图", count: 1.4 }),
  ];
  shots.push(w3);
  // W4 (cue 28 "把宇宙埋进冰里"): pull out — the whole Earth, the flux pouring through it
  const w4 = new Earth(tl, c28, c29, { name: "W4 Earth flux", mode: "custom", fadeIn: 0, custom: (t, p, s) => {
    const k = smoother(p), az = 2.4 + t * 0.15, r = mix(2.6, 5.2, expoOut(p));
    s.setCamera({ ro: [Math.sin(az) * r, mix(-1.4, -0.6, k), -Math.cos(az) * r], ta: [0, mix(-0.6, 0, k), 0], fov: 38, roll: 0.1 });
    s.set("uSun", norm([-0.5, 0.35, -0.8])); s.set("uXray", 0.6); s.set("uBright", 0);
    s.set("uRain", 1.2); s.set("uRainT", s.start + t);
  } });
  w4.postAt = (time) => ({ bloom: 0.13, flash: kick(time, c28, 9) * 0.25 });
  w4.scaleAt = (t) => ({ log10: mix(6.5, 7.4, smoother(lin(c28, c29, t))), what: "地球" });
  w4.titles = [
    callout({ label: "IceCube", sub: "地球就是它的屏蔽层", t0: c28 + 0.2, t1: c29 - 0.05, world: [0, -1, 0], dx: 1, dy: 1, len: 0.1 }),
    stat({ kicker: "EVERY SECOND 每一秒", value: (p) => commas(p * 100), unit: "万亿个", t0: c28 + 0.1, t1: c29, x: 0.045, y: 0.3, size: 0.06,
      label: "中微子穿过你 · 从未停下", count: 0.8 }),
  ];
  shots.push(w4);

  // W5 (cue 29 "打开宇宙新的窗口"): the frame becomes a window onto deep space
  const SRC = [0, 0, 80];
  const w5 = new Win("W5 a new window", c29, c30);
  w5.frame = (t, p, g, time) => {
    w5.setCamera({ ro: [0, 0, mix(-6, 0, smoother(p))], ta: SRC, fov: 40 });
    w5.apply({ uSrc: SRC, uWin: 1 - smoother(lin(b(c29, 2), c30, time)), uWinR: mix(0.04, 0.55, expoOut(lin(c29, b(c29, 3), time))),
      uLight: 0.6, uNu: 0.6, uGW: 0.6, uFlowT: time, uDust: 0 });
  };
  w5.scaleAt = () => ({ log10: 26, what: "多信使天文学" });
  w5.titles = [
    thin({ text: "MULTI-MESSENGER ASTRONOMY", t0: b(c29, 1), t1: c30 - 0.05, x: 0.5, y: 0.14, size: 0.03 }),
    title({ text: "多信使天文学", t0: b(c29, 2), t1: c30 - 0.05, x: 0.5, y: 0.86 - 0.12, size: 0.04 }),
  ];
  shots.push(w5);

  // W6 (cue 30 "以前我们用光看星空"): light is blocked and bent by dust
  const w6 = new Win("W6 light", c30, c31);
  w6.frame = (t, p, g, time) => {
    w6.setCamera({ ro: [mix(14, 10, p), 6, -10], ta: [0, 0, 40], fov: 40, roll: 0.03 });
    w6.apply({ uSrc: SRC, uWin: 0, uLight: 1, uNu: 0.15, uGW: 0, uFlowT: time, uDust: smooth(lin(b(c30, 1), b(c30, 3), time)) });
  };
  w6.scaleAt = () => ({ log10: 22, what: "光的旅程" });
  w6.titles = [
    { type: "list", kicker: "MESSENGERS 信使", x: 0.045, y: 0.62, t0: c30, t1: c31 + 0.2, rows: [
      { k: "光", v: "400 年的天文学", sub: "会被尘埃挡住 · 被磁场偏折", t0: c30 + 0.1 } ] },
    callout({ label: "星际尘埃", sub: "光在这里被吸收", t0: b(c30, 2), t1: c31 - 0.05, world: () => [0, 2.2, 36], dx: 1, dy: -1, len: 0.1 }),
  ];
  shots.push(w6);

  // W7 (cue 31 "现在用粒子看宇宙"): all three — and only the neutrino goes straight through
  const w7end = br4 ? br4[0] : b(C(31).end);
  const w7 = new Win("W7 three messengers", c31, w7end);
  w7.frame = (t, p, g, time) => {
    w7.setCamera({ ro: [mix(10, 8, p), 5, -12], ta: [0, 0, 40], fov: 42, roll: 0.03 });
    w7.apply({ uSrc: SRC, uLight: 1, uDust: 1, uFlowT: time, uGW: smooth(lin(c31 + 0.3, b(c31, 2), time)), uNu: smooth(lin(b(c31, 2), b(c31, 3), time)) * 1.3 });
  };
  w7.scaleAt = () => ({ log10: 22, what: "三种信使" });
  w7.titles = [
    { type: "list", kicker: "MESSENGERS 信使", x: 0.045, y: 0.62, t0: c31, t1: w7end, rows: [
      { k: "光", v: "400 年的天文学", sub: "会被尘埃挡住 · 被磁场偏折", t0: c31 - 1 },
      { k: "引力波", v: "2015 · LIGO", sub: "时空本身的涟漪", t0: c31 + 0.3 },
      { k: "中微子", v: "2013 · IceCube", sub: "直线飞行 · 什么都挡不住", t0: b(c31, 2), hot: true } ] },
  ];
  shots.push(w7);

  // W8 (breath 4): everything else falls away — only the neutrino thread remains
  if (br4) {
    const w8 = new Win("W8 only the thread", br4[0], br4[1]);
    w8.frame = (t, p, g, time) => {
      w8.setCamera({ ro: [8, 5, -12], ta: [0, 0, 40], fov: 42, roll: 0.03 });
      w8.apply({ uSrc: SRC, uLight: 1 - smooth(p * 3), uDust: 1 - smooth(p * 3), uGW: 1 - smooth(p * 3), uNu: 1.3, uFlowT: time });
    };
    w8.titles = [title({ text: "用粒子看宇宙", t0: br4[0] + 0.05, t1: br4[1] + 0.1, x: 0.5, y: 0.45, size: 0.05 })];
    w8.scaleAt = () => ({ log10: 22, what: "中微子" });
    shots.push(w8);
  }
  // ===== ACT VII · coda ======================================================
  // X1 (bass return → cue 32): the pole at night again, the strings glowing
  // through the snow; recap numbers line up on the left
  const x1 = new Ice("X1 recap", br4 ? br4[1] : w7end, c32, { fadeIn: 0 });
  x1.set("uMode", 2); x1.set("uSurfLight", 0); x1.set("uNight", 1);
  x1.frame = (t, p, g, time) => {
    const az = 2.2 + t * 0.1, r = mix(7, 5.5, smoother(p));
    x1.setCamera({ ro: [0.4 + Math.sin(az) * r, mix(5, 3, p), 0.1 - Math.cos(az) * r], ta: [0.3, -6, 0.1], fov: 48, roll: -0.03 });
    x1.set("uCut", 0.9); x1.set("uLit", 0.9 + 0.1 * Math.exp(-tl.sinceBeat(time) * 6));
  };
  x1.postAt = (time) => ({ bloom: 0.14, flash: kick(time, x1.start, 9) * 0.25 });
  x1.scaleAt = () => ({ log10: 3, what: "南极 · IceCube" });
  const beatN = (n) => b(x1.start, n);
  x1.titles = [
    ch("19", "南极的冰", x1.start, stop),
    { type: "list", kicker: "ICECUBE 冰立方", x: 0.045, y: 0.3, gap: 0.085, t0: x1.start, t1: c32 + 0.6, rows: [
      { k: "1 km³", v: "南极冰层", sub: "世界上最大的中微子望远镜", t0: beatN(0) },
      { k: "5,160", v: "个光学探测器", sub: "86 根线缆 · 冰下 2.5 km", t0: beatN(1) },
      { k: "2013", v: "首次发现宇宙高能中微子", sub: "打开中微子天文学", t0: beatN(2) },
      { k: "2026", v: "诺贝尔物理学奖", sub: "Francis Halzen", t0: beatN(3), hot: true } ] },
  ];
  shots.push(x1);

  // X2 (cue 32 "南极的冰" → cue 33 "听见了宇宙"): ground level, Milky Way above;
  // one thread falls out of the sky and lands in the ice on cue 33
  const x2end = b(C(33).end, 2);
  const x2 = new Ice("X2 the ice hears", c32, x2end, { fadeIn: 0.25 });
  x2.set("uMode", 2); x2.set("uSurfLight", 0); x2.set("uNight", 1);
  const nuIn = b(c33, -3), nuHit = c33;
  x2.frame = (t, p, g, time) => {
    const k = smoother(p);
    x2.setCamera({ ro: [mix(-0.6, -1.0, k), mix(0.035, 0.06, k), mix(-1.2, -1.8, k)], ta: [0.4, mix(0.3, 0.45, k), 0.4], fov: mix(46, 50, k), roll: 0.02 });
    x2.set("uLit", 0); x2.set("uCut", 0);
    const s = clamp(lin(nuIn, nuHit, time));
    const top = [2.8, 6, 3.5], hit = [0.3, 0.0, 0.6];
    x2.set("uNuA", top); x2.set("uNuB", top.map((x, i) => mix(x, hit[i], s))); x2.set("uNuOn", time > nuIn ? 1.4 : 0);
  };
  x2.postAt = (time) => ({ bloom: 0.15, flash: kick(time, nuHit, 6) * 0.25 });
  x2.scaleAt = () => ({ log10: 0, what: "南极点 · 冰面" });
  shots.push(x2);

  // X3 (outro, full energy to the stop): 2-beat recap cuts back through the
  // story, in reverse — ice → cone → Earth → source — then the title card
  const recap = [];
  const at = (n) => b(x2end, n);
  const cut = (s) => { s.fadeIn = 0; recap.push(s); shots.push(s); return s; };
  // cone
  const r1 = cut(new Cap("X3a cone", at(0), at(2)));
  r1.frame = (t, p, g, time) => {
    const L = 3 + p * 2, head = VTX.map((x, i) => x + DIR[i] * L), side = [DIR[2], 0, -DIR[0]];
    r1.setCamera({ ro: head.map((x, i) => x - DIR[i] * 0.9 + side[i] * 1.6 + (i === 1 ? 0.2 : 0)), ta: VTX.map((x, i) => x + DIR[i] * (L - 0.6)), fov: 52, roll: 0.1 });
    apply(r1, { uMuon: L, uCone: 1, uEvOn: 1, uEvT: L, uLit: 0.1, uDim: 0.8, uVertex: 9 });
  };
  // the lit array, wide
  const r2 = cut(new Cap("X3b array", at(2), at(4)));
  r2.frame = (t, p, g, time) => {
    const az = -2.0 + t * 0.3;
    r2.setCamera({ ro: [VTX[0] + Math.sin(az) * 9, -18.5, VTX[2] - Math.cos(az) * 9], ta: VTX.map((x, i) => x + DIR[i] * 3), fov: 46, roll: 0.03 });
    apply(r2, { uMuon: 0, uCone: 0, uEvOn: 1, uEvT: 40, uLit: 0.1, uDim: 0.85, uVertex: 9, uFit: 1 });
  };
  // the Earth with the thread through it
  const r3 = cut(new Earth(tl, at(4), at(6), { name: "X3c Earth", mode: "custom", fadeIn: 0, custom: (t, p, s) => {
    const az = 1.2 + t * 0.3;
    s.setCamera({ ro: [Math.sin(az) * 3.4, 0.3, -Math.cos(az) * 3.4], ta: [0, -0.1, 0], fov: 34, roll: 0.06 });
    s.set("uXray", 0.9); s.set("uBright", 1.6); s.set("uRain", 0);
    s.set("uA", [0.25, 1.25, 0.15].map((x, i) => x - [-0.18, 1, -0.12][i] * 30)); s.set("uB", [0, -1, 0].map((x, i) => x + [0.18, -1, 0.12][i] * 2));
  } }));
  // the source, the opening frame
  const r4 = cut(new Source(tl, at(6), at(8)));
  r4.cam = (time) => { const t = time - r4.start, az = -0.9 + t * 0.32, r = 34;
    return { ro: [Math.sin(az) * r, 0.1 * r, -Math.cos(az) * r], ta: [0, -0.4, 0], fov: 40, roll: 0.1 }; };
  r4.fireAt = -100; r4.inhale = -101;
  const r4f = r4.frame.bind(r4);
  r4.frame = (t, p, g, time) => { r4f(t, p, g, time); r4.set("uFire", -1); r4.set("uCore", 1.2); };
  r4.postAt = () => ({ bloom: 0.14 });
  const recapWords = ["切伦科夫光", "冰立方", "穿过地球", "宇宙深处"];
  recap.forEach((s, i) => {
    s.scaleAt = () => ({ log10: [2, 3, 7, 25.6][i], what: recapWords[i] });
    s.titles = [title({ text: recapWords[i], t0: s.start + 0.02, t1: s.end - 0.02, x: 0.5, y: 0.86, size: 0.032, inDur: 0.15, outDur: 0.1 })];
  });

  // X4 (to the hard stop): the pole at night, one blue line standing in the ice;
  // title card; the picture cuts to black on the music's last frame
  const x4 = new Ice("X4 end card", at(8), stop, { fadeIn: 0 });
  x4.set("uMode", 2); x4.set("uSurfLight", 0); x4.set("uNight", 1);
  x4.frame = (t, p, g, time) => {
    x4.setCamera({ ro: [mix(-1.0, -1.3, p), 0.06, mix(-1.8, -2.2, p)], ta: [0.4, 0.45, 0.4], fov: 50, roll: 0.02 });
    x4.set("uLit", 0); x4.set("uCut", 0);
    x4.set("uNuA", [2.8, 6, 3.5]); x4.set("uNuB", [0.3, 0.0, 0.6]); x4.set("uNuOn", 1.4 * (1 + 0.15 * Math.exp(-tl.sinceBeat(time) * 6)));
  };
  x4.postAt = (time) => ({ bloom: 0.15, fade: time >= stop - 1 / 48 ? 0 : 1 });
  x4.scaleAt = () => ({ log10: 0, what: "南极点" });
  x4.titles = [
    { type: "title", text: "THE ICE  ·  HEARS  ·  THE UNIVERSE", t0: x4.start, t1: stop - 0.01, x: 0.5, y: 0.36, size: 0.028,
      weight: 300, track: 0.5, stagger: 0.03, inDur: 0.6, outDur: 0.01 },
    { type: "title", text: "冰，听见了宇宙", t0: b(x4.start, 2), t1: stop - 0.01, x: 0.5, y: 0.43, size: 0.04,
      weight: 500, track: 0.3, stagger: 0.06, inDur: 0.5, outDur: 0.01, font: '"PingFang SC", sans-serif' },
    { type: "title", text: "IceCube Neutrino Observatory", t0: b(x4.start, 6), t1: stop - 0.01, x: 0.5, y: 0.52, size: 0.018,
      weight: 300, track: 0.4, stagger: 0.02, inDur: 0.5, outDur: 0.01 },
    { type: "title", text: "Nobel Prize in Physics 2026  ·  Francis Halzen", t0: b(x4.start, 8), t1: stop - 0.01, x: 0.5, y: 0.555, size: 0.018,
      weight: 300, track: 0.3, stagger: 0.02, inDur: 0.5, outDur: 0.01 },
  ];
  shots.push(x4);
  const overlay = tl.cues.filter((c) => c.idx >= 23).map((c) => ({ type: "lyric", text: LYRICS[c.idx], t0: c.start, t1: c.end + 0.15 }));
  return { shots, end: stop, overlay };
}
