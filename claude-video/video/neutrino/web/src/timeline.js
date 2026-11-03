// Timing queries. The SRT (cues) and the music analysis are the only
// sources of time — shots are built from these, never from literals.
export class Timeline {
  constructor(d) { Object.assign(this, d); }
  cue(i) { return this.cues.find((c) => c.idx === i); }
  // nearest beat to t, shifted by n beats
  beat(t, n = 0) { return this.phase + (Math.round((t - this.phase) / this.period) + n) * this.period; }
  beatAfter(t) { return this.phase + Math.ceil((t - this.phase) / this.period - 1e-6) * this.period; }
  beatPhase(t) { const x = (t - this.phase) / this.period; return x - Math.floor(x); }
  // seconds since the most recent beat
  sinceBeat(t) { return this.beatPhase(t) * this.period; }
  dipIn(a, b) { return this.dips.find(([s]) => s >= a && s < b); }
  breathIn(a, b) { return this.breaths.find(([s]) => s >= a && s < b); }
  env(name, t) {
    const a = this.envs[name], x = t * this.envRate, i = Math.floor(x);
    if (i < 0) return a[0];
    if (i >= a.length - 1) return a[a.length - 1];
    return a[i] + (a[i + 1] - a[i]) * (x - i);
  }
  // quietest moment of the low band inside [a,b] (a "breath" too short to detect)
  quietest(a, b) {
    let best = a, v = 1e9;
    for (let t = a; t < b; t += 0.01) { const e = this.env("low", t); if (e < v) { v = e; best = t; } }
    return best;
  }
}

export async function loadTimeline() {
  return new Timeline(await (await fetch("/web/media/timeline.json")).json());
}
