"""SRT + audio analysis -> the only timing source for the film.

Nothing in the shot list hardcodes a timecode. Every shot boundary is
expressed as a query against this module: a cue start/end, a beat, or a
detected bass dropout ("breath") in the music.
"""
import hashlib
import os
import re
import subprocess
from dataclasses import dataclass

import numpy as np

# Inputs: env MV_SRT / MV_MP3 (defaults: the original IceCube song).
SRT_PATH = os.environ.get("MV_SRT", "/Users/alextao/Movies/10月9日/10月9日.srt")
MP3_PATH = os.environ.get("MV_MP3", "/Users/alextao/Movies/10月9日/10月9日.mp3")
CACHE = os.path.join(os.path.dirname(__file__), "..", "analysis")
SR = 22050


@dataclass
class Cue:
    idx: int
    start: float
    end: float
    text: str


def _ts(s):
    h, m, rest = s.split(":")
    sec, ms = rest.split(",")
    return int(h) * 3600 + int(m) * 60 + int(sec) + int(ms) / 1000.0


def load_cues(path=SRT_PATH):
    raw = open(path, encoding="utf-8-sig").read().strip()
    cues = []
    for block in re.split(r"\n\s*\n", raw):
        lines = [l for l in block.splitlines() if l.strip()]
        if len(lines) < 3:
            continue
        a, b = [x.strip() for x in lines[1].split("-->")]
        cues.append(Cue(int(lines[0]), _ts(a), _ts(b), " ".join(lines[2:])))
    return cues


def _mono():
    os.makedirs(CACHE, exist_ok=True)
    # cache keyed by the source file, so a new song never reuses stale samples
    st = os.stat(MP3_PATH)
    key = f"{os.path.basename(MP3_PATH)}-{st.st_size}-{int(st.st_mtime)}"
    # md5, not hash(): Python salts str hashes per process, so hash() would
    # give a new cache name on every run and never hit the cache
    p = os.path.join(CACHE, f"mono-{hashlib.md5(key.encode()).hexdigest()[:12]}.f32")
    if not os.path.exists(p):
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", MP3_PATH, "-ac", "1",
                        "-ar", str(SR), "-f", "f32le", p], check=True)
    return np.fromfile(p, dtype=np.float32)


class Music:
    """Beat grid, breaths (bass dropouts), hard stop, per-frame envelopes."""

    def __init__(self):
        x = _mono()
        self.duration = len(x) / SR
        fr, h = 1024, 512
        self.hop_fps = SR / h
        win = np.lib.stride_tricks.sliding_window_view(x, fr)[::h] * np.hanning(fr)
        F = np.abs(np.fft.rfft(win, axis=1))
        low = np.convolve(F[:, :8].sum(1), np.ones(5) / 5, "same")
        flux = np.maximum(np.diff(np.log1p(F), axis=0), 0).sum(1)
        flux = np.maximum(flux - np.convolve(flux, np.ones(43) / 43, "same"), 0)
        rms = np.sqrt(np.convolve(x ** 2, np.ones(h) / h, "same")[::h])
        self.low = low / (np.percentile(low, 95) + 1e-9)
        self.flux = flux / (np.percentile(flux, 99) + 1e-9)
        self.rms = rms / (np.percentile(rms, 95) + 1e-9)
        self.end = self._hard_stop(rms)
        self.period, self.phase = self._beat_grid(flux)
        self.beats = np.arange(self.phase, self.end, self.period)
        self.breaths = self._breaths(low)
        # softer bass dips (intro "inhales") — candidates for anticipation beats
        self.dips = self._breaths(low, min_len=0.35, ratio=0.35)

    def _hard_stop(self, rms):
        loud = np.where(rms > rms.max() * 0.05)[0]
        return float(loud[-1] / self.hop_fps)

    def _beat_grid(self, flux):
        idx = np.arange(len(flux))
        best = (0.0, 0.46, 0.0)
        for P in np.arange(0.40, 0.55, 0.0002):
            for ph in np.arange(0, P, 0.004):
                bt = np.arange(ph, self.duration - 1, P) * self.hop_fps
                s = np.interp(bt, idx, flux).mean()
                if s > best[0]:
                    best = (s, P, ph)
        return best[1], best[2]

    def _breaths(self, low, min_len=0.6, ratio=0.15):
        """Bass dropouts longer than min_len seconds: structural breaths."""
        q = low < np.median(low) * ratio
        out, i = [], 0
        while i < len(q):
            if q[i]:
                j = i
                while j < len(q) and q[j]:
                    j += 1
                if (j - i) / self.hop_fps >= min_len:
                    out.append((i / self.hop_fps, j / self.hop_fps))
                i = j
            else:
                i += 1
        return out

    # ---- queries -------------------------------------------------------
    def beat(self, t, offset=0):
        """Nearest beat to t, shifted by `offset` beats."""
        k = int(round((t - self.phase) / self.period)) + offset
        return self.phase + k * self.period

    def beat_after(self, t):
        k = int(np.ceil((t - self.phase) / self.period - 1e-6))
        return self.phase + k * self.period

    def breath_near(self, t):
        return min(self.breaths, key=lambda b: abs(b[0] - t))

    def env(self, name, t):
        a = getattr(self, name)
        return float(np.interp(t * self.hop_fps, np.arange(len(a)), a))

    def beat_phase(self, t):
        """0..1 sawtooth locked to the beat grid (0 = on the beat)."""
        return ((t - self.phase) / self.period) % 1.0


def export_json(path):
    """Everything the web renderer needs; envelopes resampled to 100 Hz."""
    import json
    m = Music()
    t = np.arange(0, m.duration, 0.01) * m.hop_fps
    env = {k: np.round(np.interp(t, np.arange(len(getattr(m, k))), getattr(m, k)), 3).tolist()
           for k in ("low", "flux", "rms")}
    data = dict(duration=m.duration, end=m.end, period=m.period, phase=m.phase,
                breaths=m.breaths, dips=m.dips, envRate=100, envs=env,
                cues=[c.__dict__ for c in load_cues()])
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    return m


if __name__ == "__main__":
    out = os.path.join(os.path.dirname(__file__), "..", "web", "media", "timeline.json")
    export_json(out)
    m = Music()
    print("dips", [(round(a, 2), round(b, 2)) for a, b in m.dips])
    print("duration %.2f  hard stop %.2f  bpm %.2f  phase %.3f"
          % (m.duration, m.end, 60 / m.period, m.phase))
    print("breaths", [(round(a, 2), round(b, 2)) for a, b in m.breaths])
    for c in load_cues():
        print(c.idx, round(c.start, 2), round(c.end, 2), c.text)
