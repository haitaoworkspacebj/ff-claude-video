// Information layer, drawn with Canvas 2D and injected into the HDR buffer
// before bloom (so type halates like light). Item types:
//   title    — film title design (per-glyph reveal, optional "slam")
//   lyric    — sung line, karaoke sweep timed to the SRT cue
//   callout  — ring on a (projected) point + leader line + label/sub
//   stat     — counting number + unit + caption
//   chapter / scale / brand — persistent frame furniture
import * as THREE from "three";
import { clamp, smooth, easeOut, expoOut, mix } from "./ease.js";

const LATIN = 'system-ui, -apple-system, "Helvetica Neue", Helvetica, sans-serif';
const CJK = '"PingFang SC", "Hiragino Sans GB", system-ui, sans-serif';
const MONO = '"SF Mono", Menlo, monospace';
const WHITE = "#eef4ff", ICE = "#8fc4ff", BLUE = "#5aa0ff";
const SUP = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
export const sup = (n) => String(n).split("").map((c) => SUP[c] ?? c).join("");
export const sci = (m, e) => `${m}×10${sup(e)}`;
export const commas = (v) => Math.round(v).toLocaleString("en-US");

export class Titles {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.canvas = document.createElement("canvas");
    this.canvas.width = w; this.canvas.height = h;
    this.c = this.canvas.getContext("2d");
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.NoColorSpace;
  }
  draw(items, t) {
    const live = items.filter((s) => (s.persistent ? s.t1 === undefined || t <= s.t1 : t >= s.t0 - 0.05 && t <= s.t1 + 0.05));
    if (!live.length) return null;
    this.c.clearRect(0, 0, this.w, this.h);
    for (const s of live) this[s.type](s, t);
    this.c.globalAlpha = 1; this.c.filter = "none";
    this.tex.needsUpdate = true;
    return this.tex;
  }
  _env(s, t, inD = 0.3, outD = 0.25) {
    return easeOut(clamp((t - s.t0) / inD), 2) * (1 - smooth((t - (s.t1 - outD)) / outD));
  }
  _font(px, w = 400, fam = CJK) { this.c.font = `${w} ${px}px ${fam}`; }

  title(s, t) {
    const c = this.c, H = this.h, size = (s.size ?? 0.03) * H;
    const stagger = s.stagger ?? 0.045, inDur = s.inDur ?? 0.7, outDur = s.outDur ?? 0.5;
    const life = t - s.t0, out = smooth((t - (s.t1 - outDur)) / outDur);
    const track = ((s.track ?? 0.35) + (s.drift ?? 0.012) * life) * size;
    this._font(size, s.weight ?? 300, s.font ?? LATIN);
    c.textBaseline = "middle";
    const chars = [...s.text], widths = chars.map((ch) => c.measureText(ch).width);
    const total = widths.reduce((a, b) => a + b, 0) + track * (chars.length - 1);
    const slam = s.slam ? 1 + 0.25 * Math.exp(-life * 9) : 1;      // arrives big, settles
    let x = s.x * this.w - (s.align === "left" ? 0 : total * 0.5 * slam);
    const y = s.y * H;
    chars.forEach((ch, i) => {
      const a = easeOut(clamp((life - i * stagger) / inDur), 2) * (1 - out);
      if (a > 0.003 && ch !== " ") {
        const blur = (1 - a) * size * (s.slam ? 0.08 : 0.25) + out * size * 0.15;
        c.filter = blur > 0.3 ? `blur(${blur.toFixed(2)}px)` : "none";
        c.globalAlpha = a; c.fillStyle = s.color ?? WHITE;
        c.save(); c.translate(x, y + (1 - a) * size * 0.18 - out * size * 0.1); c.scale(slam, slam);
        c.fillText(ch, 0, 0); c.restore();
      }
      x += (widths[i] + track) * slam;
    });
    c.filter = "none";
  }

  // sung line: dim full line + bright sweep that follows the cue's duration
  lyric(s, t) {
    const c = this.c, W = this.w, H = this.h, size = (s.size ?? 0.044) * H;
    const a = this._env(s, t, 0.18, 0.18);
    if (a <= 0) return;
    const y = (s.y ?? 0.875) * H;
    // legibility: soft dark band (darkens the scene under the text)
    const g = c.createLinearGradient(0, y - size * 2.2, 0, H);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(0.55, "rgba(0,0,0,0.55)"); g.addColorStop(1, "rgba(0,0,0,0.65)");
    c.globalAlpha = a; c.fillStyle = g; c.fillRect(0, y - size * 2.2, W, H - y + size * 2.2);
    this._font(size, 500); c.textBaseline = "middle"; c.textAlign = "center";
    const rise = (1 - easeOut(clamp((t - s.t0) / 0.25), 3)) * size * 0.35;
    c.fillStyle = "rgba(220,232,255,0.42)"; c.fillText(s.text, W / 2, y + rise);
    const tw = c.measureText(s.text).width, x0 = W / 2 - tw / 2;
    const p = clamp((t - s.t0) / Math.max(0.3, (s.t1 - s.t0) * 0.85));
    c.save(); c.beginPath(); c.rect(x0 - 4, y - size, tw * p + 8, size * 2); c.clip();
    c.fillStyle = WHITE; c.shadowColor = BLUE; c.shadowBlur = size * 0.35;
    c.fillText(s.text, W / 2, y + rise); c.restore();
    c.textAlign = "left";
  }

  // ring + elbow leader + label; s.at = [px, py] (already projected),
  // or s.atUV = [x, y] in shader uv units (y up, height = 1)
  callout(s, t) {
    if (s.atUV) s.at = [this.w / 2 + s.atUV[0] * this.h, this.h / 2 - s.atUV[1] * this.h];
    if (!s.at) return;
    const c = this.c, H = this.h, a = this._env(s, t, 0.35, 0.25);
    if (a <= 0) return;
    const [ax, ay] = s.at, dx = s.dx ?? 1, dy = s.dy ?? -1;
    const life = t - s.t0, k = expoOut(clamp(life / 0.45));
    const e1 = H * 0.05, len = (s.len ?? 0.16) * H;
    const ex = ax + dx * e1, ey = ay + dy * e1, hx = ex + dx * len * k;
    c.globalAlpha = a; c.strokeStyle = ICE; c.lineWidth = Math.max(1, H / 720);
    c.beginPath(); c.arc(ax, ay, H * (0.008 + 0.012 * (1 - k)), 0, Math.PI * 2); c.stroke();
    c.fillStyle = WHITE; c.beginPath(); c.arc(ax, ay, H * 0.0028, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.moveTo(ax + dx * H * 0.01, ay + dy * H * 0.01);
    const seg1 = clamp(k * 2.2);
    c.lineTo(mix(ax, ex, seg1), mix(ay, ey, seg1));
    if (seg1 >= 1) c.lineTo(hx, ey);
    c.stroke();
    const tx = dx > 0 ? ex + H * 0.004 : hx + H * 0.004, ta = clamp((k - 0.4) / 0.6);
    c.globalAlpha = a * ta; c.textBaseline = "alphabetic";
    this._font(H * (s.size ?? 0.027), 600); c.fillStyle = WHITE;
    c.fillText(s.label, tx, ey - H * 0.01);
    if (s.sub) { this._font(H * 0.018, 400, MONO); c.fillStyle = ICE; c.textBaseline = "top"; c.fillText(s.sub, tx, ey + H * 0.008); }
  }

  // counting number: value(p) -> string, p eased 0..1 over s.count seconds
  stat(s, t) {
    const c = this.c, W = this.w, H = this.h, a = this._env(s, t, 0.25, 0.25);
    if (a <= 0) return;
    const p = expoOut(clamp((t - s.t0) / (s.count ?? 1.2)));
    const x = s.x * W, y = s.y * H, size = (s.size ?? 0.07) * H, right = s.align === "right";
    c.globalAlpha = a; c.textAlign = right ? "right" : "left"; c.textBaseline = "alphabetic";
    if (s.kicker) { this._font(H * 0.017, 500, MONO); c.fillStyle = ICE; c.fillText(s.kicker, x, y - size * 1.05); }
    this._font(size, 250, LATIN); c.fillStyle = WHITE; c.shadowColor = BLUE; c.shadowBlur = size * 0.25;
    const num = s.value(p);
    c.fillText(num, x, y); c.shadowBlur = 0;
    if (s.unit) {
      const nw = c.measureText(num).width;
      this._font(size * 0.38, 400, CJK); c.fillStyle = ICE;
      c.textAlign = "left"; c.fillText(s.unit, right ? x + H * 0.01 : x + nw + H * 0.012, y);
      c.textAlign = right ? "right" : "left";
    }
    if (s.label) { this._font(H * 0.024, 500); c.fillStyle = WHITE; c.fillText(s.label, x, y + H * 0.042); }
    if (s.note) { this._font(H * 0.017, 400); c.fillStyle = "rgba(200,215,240,0.75)"; c.fillText(s.note, x, y + H * 0.072); }
    // thin rule that draws on with the count
    c.strokeStyle = ICE; c.lineWidth = 1; c.beginPath();
    const rw = H * 0.22 * p, ry = y + H * 0.014;
    c.moveTo(x, ry); c.lineTo(right ? x - rw : x + rw, ry); c.stroke();
    c.textAlign = "left";
  }

  chapter(s, t) {
    const c = this.c, H = this.h, x = this.w * 0.045, y = H * 0.075;
    const a = this._env(s, t, 0.4, 0.3);
    c.globalAlpha = a * 0.9; c.textBaseline = "middle";
    this._font(H * 0.017, 500, MONO); c.fillStyle = ICE; c.fillText(s.num, x, y);
    c.strokeStyle = ICE; c.lineWidth = 1; c.beginPath(); c.moveTo(x + H * 0.04, y); c.lineTo(x + H * 0.09, y); c.stroke();
    this._font(H * 0.021, 500); c.fillStyle = WHITE; c.fillText(s.text, x + H * 0.1, y);
  }

  // live scale readout: 10^n m with a ruler whose ticks slide as n changes
  scale(s, t) {
    const v = s.at(t);
    if (!v) return;
    const c = this.c, H = this.h, x = this.w * 0.045, y = H * 0.165, n = v.log10;
    s = { ...s, what: v.what };
    c.globalAlpha = 0.85; c.textBaseline = "middle";
    this._font(H * 0.015, 500, MONO); c.fillStyle = ICE; c.fillText("SCALE 尺度", x, y - H * 0.03);
    this._font(H * 0.03, 300, LATIN); c.fillStyle = WHITE;
    const label = `10${sup(Math.round(n))} m`;
    c.fillText(label, x, y);
    const lw = c.measureText(label).width + H * 0.02, rw = H * 0.16, fr = n - Math.floor(n);
    c.strokeStyle = "rgba(143,196,255,0.7)"; c.lineWidth = 1; c.beginPath();
    c.moveTo(x + lw, y); c.lineTo(x + lw + rw, y);
    for (let i = 0; i <= 10; i++) {
      const tx = x + lw + ((i + fr * 10) % 10) / 10 * rw, th = i % 5 === 0 ? H * 0.012 : H * 0.006;
      c.moveTo(tx, y - th); c.lineTo(tx, y);
    }
    c.stroke();
    if (s.what) { this._font(H * 0.016, 400); c.fillStyle = "rgba(200,215,240,0.8)"; c.fillText(s.what, x + lw + rw + H * 0.015, y); }
  }

  // timeline / fact list: kicker + rows (big thin key + text), each revealed at its t0
  list(s, t) {
    const c = this.c, W = this.w, H = this.h, a = this._env(s, t, 0.3, 0.3);
    if (a <= 0) return;
    const x = s.x * W, right = s.align === "right", gap = H * (s.gap ?? 0.075);
    c.textAlign = right ? "right" : "left"; c.textBaseline = "alphabetic";
    c.globalAlpha = a; this._font(H * 0.017, 500, MONO); c.fillStyle = ICE;
    c.fillText(s.kicker, x, s.y * H - H * 0.045);
    s.rows.forEach((r, i) => {
      if (t < r.t0) return;
      const k = easeOut(clamp((t - r.t0) / 0.35), 3), y = s.y * H + i * gap, dx = (1 - k) * H * 0.03 * (right ? 1 : -1);
      c.globalAlpha = a * k;
      this._font(H * 0.04, 250, LATIN); c.fillStyle = r.hot ? "#9cc8ff" : WHITE;
      c.shadowColor = BLUE; c.shadowBlur = r.hot ? H * 0.02 : 0;
      const kw = H * 0.13;
      c.fillText(r.k, right ? x + dx - H * 0.0 : x + dx, y);
      c.shadowBlur = 0;
      this._font(H * 0.022, 500); c.fillStyle = WHITE;
      if (right) c.fillText(r.v, x + dx - kw, y); else c.fillText(r.v, x + dx + kw, y);
      if (r.sub) { this._font(H * 0.016, 400); c.fillStyle = "rgba(200,215,240,0.75)"; c.fillText(r.sub, right ? x + dx - kw : x + dx + kw, y + H * 0.026); }
    });
    c.textAlign = "left";
  }

  // projected marks: tiny ring + mono label per point (DOM hit times etc.)
  marks(s, t) {
    const c = this.c, H = this.h, a = this._env(s, t, 0.2, 0.25);
    if (a <= 0) return;
    c.lineWidth = 1; c.textBaseline = "middle";
    this._font(H * 0.016, 500, MONO);
    for (const m of s.marks) {
      if (!m.at || t < m.t0) continue;
      const k = easeOut(clamp((t - m.t0) / 0.25), 2), [x, y] = m.at;
      c.globalAlpha = a * k;
      c.strokeStyle = ICE; c.beginPath(); c.arc(x, y, H * (0.006 + 0.01 * (1 - k)), 0, Math.PI * 2); c.stroke();
      c.fillStyle = WHITE; c.fillText(m.label, x + H * 0.012, y - H * 0.012);
    }
  }

  // depth gauge on the right edge: vertical ruler + live metres
  depth(s, t) {
    const c = this.c, W = this.w, H = this.h, m = s.at(t), a = this._env(s, t, 0.3, 0.2);
    if (a <= 0) return;
    const x = W * 0.94, y0 = H * 0.2, y1 = H * 0.78, max = 2800;
    c.globalAlpha = a; c.strokeStyle = "rgba(143,196,255,0.6)"; c.lineWidth = 1;
    c.beginPath(); c.moveTo(x, y0); c.lineTo(x, y1);
    for (let d = 0; d <= max; d += 100) {
      const y = mix(y0, y1, d / max), w = d % 500 === 0 ? H * 0.014 : H * 0.006;
      c.moveTo(x - w, y); c.lineTo(x, y);
    }
    c.stroke();
    // instrumented band 1,450–2,450 m
    c.fillStyle = "rgba(90,160,255,0.18)";
    c.fillRect(x - H * 0.004, mix(y0, y1, 1450 / max), H * 0.008, mix(0, y1 - y0, 1000 / max));
    const y = mix(y0, y1, clamp(m / max));
    c.fillStyle = WHITE; c.beginPath(); c.moveTo(x - H * 0.02, y); c.lineTo(x - H * 0.032, y - H * 0.008); c.lineTo(x - H * 0.032, y + H * 0.008); c.fill();
    c.textAlign = "right"; c.textBaseline = "middle";
    this._font(H * 0.04, 250, LATIN); c.fillText(`${commas(Math.max(0, m))} m`, x - H * 0.04, y);
    this._font(H * 0.015, 500, MONO); c.fillStyle = ICE; c.fillText("DEPTH 深度", x - H * 0.04, y - H * 0.035);
    c.textAlign = "left";
  }

  brand(s, t) {
    const c = this.c, H = this.h;
    c.globalAlpha = 0.6; c.textAlign = "right"; c.textBaseline = "middle";
    this._font(H * 0.015, 500, MONO); c.fillStyle = ICE;
    c.fillText("NOBEL PRIZE IN PHYSICS 2026", this.w * 0.955, H * 0.075);
    this._font(H * 0.015, 400); c.fillStyle = "rgba(220,230,250,0.8)";
    c.fillText("IceCube 中微子天文台 · Francis Halzen", this.w * 0.955, H * 0.105);
    c.textAlign = "left";
  }
}
