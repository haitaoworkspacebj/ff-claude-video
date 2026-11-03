// Motion curves with weight: nothing moves linearly in this film.
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lin = (a, b, t) => clamp((t - a) / (b - a));
export const mix = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
export const smoother = (t) => { t = clamp(t); return t * t * t * (t * (t * 6 - 15) + 10); };
export const easeOut = (t, p = 3) => 1 - Math.pow(1 - clamp(t), p);
export const easeIn = (t, p = 3) => Math.pow(clamp(t), p);
export const expoOut = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * clamp(t)));
export const expoIn = (t) => (t <= 0 ? 0 : Math.pow(2, 10 * (clamp(t) - 1)));
// critically-damped-ish settle: overshoots once, then rests (camera "weight")
export const settle = (t, k = 7) => { t = Math.max(0, t); return 1 - Math.exp(-k * t) * (1 + k * t * 0.6) * Math.cos(t * 2.2); };
// impulse decaying after time t0 (camera kicks, flashes)
export const kick = (t, t0, decay = 6) => (t < t0 ? 0 : Math.exp(-(t - t0) * decay));
export const mixv = (a, b, t) => a.map((x, i) => mix(x, b[i], t));
export const norm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
export const add = (a, b) => a.map((x, i) => x + b[i]);
export const scale = (a, s) => a.map((x) => x * s);
