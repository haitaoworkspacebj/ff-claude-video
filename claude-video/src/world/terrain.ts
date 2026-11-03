import * as THREE from 'three';
import { Noise, clamp, mix, smoothstep, mulberry32, type Rand } from '../core/math';

export const ISLAND = {
  radius: 100,
  angles: 256,
  rings: 84,
  depthRings: 56,
  keelDepth: 138,
  springHeight: 0, // filled at runtime
};

/** A polyline with a precomputed water/height profile, queried by distance. */
export class PolylineField {
  pts: THREE.Vector2[] = [];
  /** smoothed surface elevation at each sample */
  elevation: number[] = [];
  private heights: number[] = [];

  constructor(points: [number, number][], samples = 96) {
    const curve = new THREE.CatmullRomCurve3(
      points.map((p) => new THREE.Vector3(p[0], 0, p[1])),
      false,
      'catmullrom',
      0.4,
    );
    for (let i = 0; i <= samples; i++) {
      const p = curve.getPoint(i / samples);
      this.pts.push(new THREE.Vector2(p.x, p.z));
    }
  }

  /** Returns squared distance + local param (0..1) of the nearest sample. */
  query(x: number, z: number): { d: number; t: number; y: number } {
    const n = this.pts.length;
    let best = Infinity;
    let bi = 0;
    for (let i = 0; i < n; i++) {
      const p = this.pts[i];
      const dx = p.x - x;
      const dz = p.y - z;
      const d2 = dx * dx + dz * dz;
      if (d2 < best) {
        best = d2;
        bi = i;
      }
    }
    return { d: Math.sqrt(best), t: bi / (n - 1), y: this.elevation[bi] ?? 0 };
  }
}

export class IslandTerrain {
  noise = new Noise(20260829);
  rand: Rand = mulberry32(90210);

  streamPath: [number, number][] = [
    [-44, -30], [-38, -14], [-30, 2], [-22, 15], [-8, 27],
    [10, 38], [26, 48], [36, 56], [42, 63],
  ];
  pathTrail: [number, number][] = [
    [-19, -12], [-27, -2], [-29, 12], [-23, 27], [-13, 39], [-4, 47],
  ];

  stream!: PolylineField;
  trail!: PolylineField;
  streamWidth = 3.4;
  trailWidth = 2.6;

  /** ruins plateau */
  plateau = { x: -17, z: -6, r: 25, h: 0, blend: 16 };

  rimX = new Float32Array(ISLAND.angles + 1);
  rimZ = new Float32Array(ISLAND.angles + 1);
  rimY = new Float32Array(ISLAND.angles + 1);

  constructor() {
    this.stream = new PolylineField(this.streamPath, 110);
    this.trail = new PolylineField(this.pathTrail, 80);
    this.initElevation(this.stream, false);
    this.initElevation(this.trail, true);
    // plateau height from the uncarved landform
    this.plateau.h = this.baseHeight(this.plateau.x, this.plateau.z) + 1.2;
    for (let j = 0; j <= ISLAND.angles; j++) {
      const a = (j / ISLAND.angles) * Math.PI * 2;
      const r = this.outline(a);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      this.rimX[j] = x;
      this.rimZ[j] = z;
      this.rimY[j] = this.height(x, z);
    }
  }

  /**
   * Water/lane elevation profile. Water MUST run downhill: each sample takes the
   * lower of its own bed and everything upstream, then we smooth the result so
   * the surface reads as a continuous flowing ribbon.
   */
  private initElevation(field: PolylineField, isTrail: boolean) {
    const bed = field.pts.map((p) => this.baseHeight(p.x, p.y));
    const out: number[] = [];
    let running = Infinity;
    for (let i = 0; i < bed.length; i++) {
      running = Math.min(running, bed[i]);
      out.push(running);
    }
    // smooth backwards so pools form instead of stair steps
    const smooth: number[] = [];
    for (let i = 0; i < out.length; i++) {
      let acc = 0, wsum = 0;
      for (let k = -3; k <= 3; k++) {
        const idx = clamp(i + k, 0, out.length - 1);
        const w = 1 - Math.abs(k) / 4;
        acc += out[idx] * w;
        wsum += w;
      }
      smooth.push(acc / wsum - (isTrail ? 0.32 : 0.85));
    }
    // re-enforce monotonic descent after smoothing
    let r2 = Infinity;
    for (let i = 0; i < smooth.length; i++) {
      r2 = Math.min(r2, smooth[i]);
      smooth[i] = r2;
    }
    field.elevation = smooth;
  }

  /** Irregular island footprint radius at angle a (radians). */
  outline(a: number): number {
    const n = this.noise;
    const lobe =
      0.108 * Math.sin(a * 3 + 0.7) +
      0.062 * Math.sin(a * 5 - 1.9) +
      0.035 * Math.sin(a * 8 + 2.6);
    const wobble = 0.05 * n.noise2(Math.cos(a) * 1.9 + 4.2, Math.sin(a) * 1.9 - 1.3);
    return ISLAND.radius * (1 + lobe + wobble);
  }

  /** Landform before channels are cut. */
  baseHeight(x: number, z: number): number {
    const n = this.noise;
    const r = Math.hypot(x, z);
    const a = Math.atan2(z, x);
    const u = r / this.outline(a);

    // rolling hills, layered octaves
    let h = n.fbm2(x * 0.0105 + 3.1, z * 0.0105 - 2.7, 4) * 11.5;
    h += n.fbm2(x * 0.031 - 8.4, z * 0.031 + 5.2, 3) * 2.6;
    h += n.fbm2(x * 0.084 + 1.7, z * 0.084 + 9.3, 2) * 0.55;

    // broad crown so the centre reads higher than the shoulders
    h += 3.4 * (1 - smoothstep(6, 88, r));

    // ruins plateau: a raised, flattened mesa
    const pd = Math.hypot(x - this.plateau.x, z - this.plateau.z);
    const mesa = smoothstep(this.plateau.r + this.plateau.blend, this.plateau.r * 0.72, pd);
    h = mix(h, this.plateau.h, mesa);

    // rounded grassy shoulder just inside the rim
    h -= 6.8 * smoothstep(0.885, 1.0, u);

    // rim relief: edges are not a level ring
    h += n.fbm2(Math.cos(a) * 2.6, Math.sin(a) * 2.6, 3) * 2.4;
    return h;
  }

  /** Final, channel-carved land height. */
  height(x: number, z: number): number {
    let h = this.baseHeight(x, z);
    const r = Math.hypot(x, z);
    const u = r / this.outline(Math.atan2(z, x));

    // --- stream channel ---
    const s = this.stream.query(x, z);
    const sw = this.streamWidth * (1 + 0.5 * s.t);
    if (s.d < sw + 7) {
      const floor = s.y - 1.05;
      const core = smoothstep(sw + 4.2, sw * 0.55, s.d);
      h = mix(h, Math.min(h, floor), core);
      // keep banks from swallowing the ribbon
      h = Math.max(h, floor - 1.1 * core);
      // rocky notch right at the rim so the fall has a lip
      if (u > 0.93) h = mix(h, floor, smoothstep(0.93, 0.995, u) * 0.85);
    }

    // --- dirt trail ---
    const p = this.trail.query(x, z);
    if (p.d < this.trailWidth + 4) {
      const core = smoothstep(this.trailWidth + 3.0, 0, p.d);
      h = mix(h, p.y - 0.1, core * 0.55);
    }
    return h;
  }

  normalAt(x: number, z: number, out = new THREE.Vector3(), eps = 0.9): THREE.Vector3 {
    const hL = this.height(x - eps, z);
    const hR = this.height(x + eps, z);
    const hD = this.height(x, z - eps);
    const hU = this.height(x, z + eps);
    out.set(hL - hR, 2 * eps, hD - hU).normalize();
    return out;
  }

  slopeAt(x: number, z: number): number {
    return 1 - this.normalAt(x, z).y;
  }

  /** 1 = lush grass, 0 = bare rock/dirt. */
  grassMask(x: number, z: number, y = this.height(x, z)): number {
    const r = Math.hypot(x, z);
    const u = r / this.outline(Math.atan2(z, x));
    const slope = this.slopeAt(x, z);
    let m = smoothstep(0.62, 0.28, slope);
    m *= smoothstep(1.0, 0.975, u); // rocky lip at the very edge
    const s = this.stream.query(x, z);
    m *= smoothstep(1.6, 4.6, s.d); // wet banks are muddy
    const p = this.trail.query(x, z);
    m *= smoothstep(this.trailWidth * 0.6, this.trailWidth + 1.6, p.d);
    m *= smoothstep(-26, -14, y); // deep dark valleys stay mossy-rock
    return clamp(m, 0, 1);
  }

  dirtMask(x: number, z: number): number {
    const p = this.trail.query(x, z);
    const s = this.stream.query(x, z);
    const w = this.trailWidth * 0.9;
    let m = smoothstep(w + 1.8, w * 0.35, p.d);
    m = Math.max(m, smoothstep(3.0, 1.2, s.d) * 0.75); // wet sand banks
    return clamp(m, 0, 1);
  }

  /** 1 = wet / dark rock near water */
  wetMask(x: number, z: number): number {
    const s = this.stream.query(x, z);
    return smoothstep(this.streamWidth + 5.0, this.streamWidth * 0.6, s.d);
  }

  streamY(x: number, z: number): number {
    return this.stream.query(x, z).y;
  }

  insideIsland(x: number, z: number, margin = 1): boolean {
    const r = Math.hypot(x, z);
    return r < this.outline(Math.atan2(z, x)) - margin;
  }
}
