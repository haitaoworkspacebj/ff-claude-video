# Architecture & API reference (template/)

Read when building shots or changing the pipeline. Everything here is the exact code in
`template/`; file paths are relative to a project created by `scripts/setup_project.sh`.

## Contents
1. Data flow  2. Timing API  3. Shot API  4. GLSL conventions  5. Overlay (titles) types
6. Post pipeline  7. Export CLI  8. Reference film: shot list with anchors

## 1. Data flow

```
song.mp3 + lyrics.srt
   │  mv/timeline.py   (numpy: STFT → low band, spectral flux, RMS; beat grid search;
   │                    breaths = bass < 15% median for ≥0.6 s; dips ≥0.35 s; hard stop)
   ▼
web/media/timeline.json   {duration,end,period,phase,breaths,dips,envRate:100,envs{low,flux,rms},cues[]}
   │  web/src/timeline.js  (Timeline: cue/beat/beatAfter/breathIn/dipIn/env/sinceBeat/quietest)
   ▼
web/src/shots/*.js  buildAct(tl, startAt) → { shots[], end, overlay[] }   (chained in main.js)
   │  each Shot: start/end, frame(t,p,g,time) sets camera+uniforms, titles[], postAt(time)
   ▼
web/src/main.js renderAt(time):  for SUB subframes (180° shutter) × live shots (dissolve weights)
   → post.addShot (HDR accumulate) → titles canvas (HDR inject) → post.finish (bloom/ACES/grain)
   ▼
tools/export.mjs   headless Chrome (ANGLE Metal) → PNG per frame → ffmpeg x264 → mux audio
```

Preview: `node tools/serve.mjs` → http://127.0.0.1:5178/ (audio-clocked, scrub bar, `?t=SEC`,
`?from=&to=` loop range). Server binds 127.0.0.1 only, no auth — local use only.

## 2. Timing API (`tl`)

| call | returns |
|---|---|
| `tl.cue(i)` | `{idx,start,end,text}` (SRT index, 1-based) |
| `tl.beat(t, n=0)` | nearest beat to t, shifted n beats (use for EVERY boundary) |
| `tl.beatAfter(t)` | first beat ≥ t |
| `tl.period`, `tl.phase` | beat length (0.464 s here = 129.3 BPM), grid phase |
| `tl.sinceBeat(t)` | seconds since last beat (pulses: `Math.exp(-tl.sinceBeat(t)*6)`) |
| `tl.breathIn(a,b)` / `tl.dipIn(a,b)` | first `[start,end]` bass dropout / soft dip starting in [a,b) |
| `tl.env("low"|"flux"|"rms", t)` | 0..~1 envelope |
| `tl.end` | hard stop (last loud sample) — the film's last frame |

Easing (`ease.js`): `clamp lin mix smooth smoother easeIn easeOut expoIn expoOut settle kick norm`.
`lin(a,b,t)` = clamped progress of t in [a,b]; `kick(t,t0,decay)` = impulse after t0.

## 3. Shot API (`shot.js`)

```js
class RayShot extends Shot {
  constructor(name, start, end, glslName, uniforms, { fadeIn, fadeOut })
  set(k, v)                      // throws on undeclared uniform (catches typos)
  setCamera({ ro, ta, fov=40, roll=0, up=[0,1,0] })   // world units of that scene
  project(p, w, h)               // world → canvas px (callouts follow 3D points)
  frame(t, p, g, time)           // override: t = local seconds, p = 0..1, time = global
  postAt(time) → { bloom, exposure, flash, fade, grain, vignette, ca }
  scaleAt(time) → { log10, what } // persistent scale readout
  titles = [...]                 // overlay items active while the shot is live
}
```
Pattern for reuse: export the class; for one-off motion pass `mode:"custom", custom:(t,p,s)=>{}`
(Earth) or override `frame` on the instance (`shot.frame = (t,p,g,time) => {...}`), keeping a
bound reference to the original if you need it (`const f = s.frame.bind(s)`).

Scenes and their uniforms (all in `template/web/src/glsl/`):

| glsl | scene | key uniforms |
|---|---|---|
| agn | black hole: lensed disk (geodesic-ish bending), Doppler, jet; emission | uFire uCore uDir uShake uLA uLB uLOn |
| flight | thread flight, dust streaks, moon, rack focus | uHead uRack uMoon uMoonR uSun |
| earth | Earth surface → x-ray layered interior; solar ν rain | uSun uXray uA uB uBright uRain uRainT |
| ghost | macro thread with DOF bokeh, braid (oscillation hint), head-on pass | uA uB uFocus uCoc uBright uBraid uBokeh uPass |
| sun | photosphere/corona, thread in & out | — |
| lattice | 3D-DDA atom lattice, photon / charged / neutrino encounters | — |
| web | cosmic web (ridged fbm) log zoom | — |
| ice | polar descent (mode 0), ice dive volume (1), array (2); night, lab, cutaway | uMode uSurfLight uNight uCut uLit uStarUp uNuA uNuB uNuOn + icecube |
| icecube (include) | 86 strings × 60 DOMs, causal hit timing `domHit()` | uStr[86] uLit uDim uEvA uEvB uEvT uEvOn |
| capture | macro to nucleus, vertex, muon, Cherenkov cone, fit, arrow, atm. muons | uMacro uMacroNu uVtx uVertex uMuon uCone uNuIn uNuHead uFit uArrow uBg uBgT |
| window | 3 messengers (light/GW/ν), dust, window aperture, neutrino sky map | uSrc uLight uGW uNu uFlowT uDust uWin uWinR uMap uMapT uGal uHot |

Units: agn in gravitational radii-ish; earth R=1; ice/capture 1 unit = 100 m, y=0 ice surface.

## 4. GLSL conventions

- Each scene file defines `vec3 scene(vec3 ro, vec3 rd, vec2 uv)` returning **linear HDR**.
  Header (uniforms uRes uTime uT uP uFocal uLow uFlux uBeat uSince uRo uCam) + `common.glsl`
  are prepended; `#include "file.glsl"` inlined by `loadGLSL`.
- `common.glsl`: hashes `h11 h13 h33`, `noise fbm ridged`, `pxScale()` (px per radian),
  `stars(rd, amt, blur)`, `segRay`, **`trail(ro,rd,a,b,tmax,haloR,bright,tailPow)`** — the
  hairline neutrino (pixel-width core + halo), `pointGlow`, `sphIntersect`.
- Colour semantics: `CBLUE` only for neutrino / Cherenkov; `SILVER`/`ICE`/grey for everything
  else (charged particles drawn with `grey(trail(...))`).
- Thin things are sized in **pixels** (`d/t*pxScale()`), never world units, so they stay a line.

## 5. Overlay (titles.js) item types

All have `t0, t1` (seconds) and enter/exit envelopes. Positions: `x,y` = fraction of frame.

| type | fields | use |
|---|---|---|
| `lyric` | `text` | sung line, karaoke sweep (built from cues in each act's `overlay`) |
| `chapter` | `num, text` | top-left chapter tag |
| `scale` (persistent) | `at(t)→{log10,what}` | live 10ⁿ m readout |
| `brand` (persistent) | — | top-right Nobel/IceCube tag |
| `title` | `text, size, weight, track, stagger, inDur, outDur, font, slam` | hook / big words |
| `callout` | `label, sub, world (vec3 or fn) | atUV, dx, dy, len` | ring + elbow leader to a 3D point |
| `stat` | `kicker, value(p)→str, unit, label, note, count, align` | counting number |
| `list` | `kicker, rows[{k,v,sub,t0,hot}], gap` | timelines / fact lists |
| `marks` | `marks[{p,t0,label}]` | per-point labels (DOM hit ns times) |
| `depth` | `at(t)→metres` | right-edge depth gauge (instrumented band highlighted) |

Text is drawn on a 2D canvas, then injected into the HDR buffer before bloom (it glows).
Chinese font: `"PingFang SC", sans-serif`; Latin thin: SF Pro / Helvetica Neue.

## 6. Post pipeline (post.js)

HalfFloat RTs. Per frame: `begin()` → for each subframe × live shot `addShot(shot, w/SUB)` →
`addText(tex)` → `finish(o)`: 6-level dual-filter bloom → chromatic aberration → + bloom →
exposure + flash → cool-mids grade → ACES → vignette → gamma 2.2 → two-octave grain (seed =
frame index) → fade → dither. Defaults: bloom 0.1, grain 0.03, vignette 0.4, ca 0.0012.

## 7. Export CLI (`tools/export.mjs`)

```
node tools/export.mjs --shots                       # shot list + SHOT CHECK (tiling)
node tools/export.mjs --stills 1,5.5,12 [--sub 1]   # out/still_<t>.png
node tools/export.mjs --video [--from A --to B] [--w 1920 --h 1080] [--sub 5] [--out f.mp4]
node tools/export.mjs --video --workers 2 ...       # parallel segments → concat → mux
  --noserve   reuse an already running server on :5178
```
Delivered settings: 1920×1080, 24 fps, `--sub 5`, x264 slow CRF 14 tune film aq-mode 3,
yuv420p BT.709 tv-range tagged, AAC 320k 48 kHz, faststart. Review cuts: 1280×720 `--sub 5`.

## 8. Reference film: shot list (124.6 s, 7 acts) with anchors

| shot | anchor (how start is derived) | content |
|---|---|---|
| S1 source | 0 → beat(cue2.start); fire = dip end | black hole, neutrino fires on 1st bass accent, hook title |
| S2 flight | cue 2–3 | thread flight, rack focus on quietest moment of cue 3 |
| S3 earth | cue 4 | Earth → x-ray interior, thread through core, layer callouts |
| S4 ghost | cue 5 | macro, NEUTRINO title, "100 万亿 / s through you" |
| S5a/b/c | cue 6 split in 3 beats | through you / through Earth / through Sun |
| S6 lattice | cue 7 | photon scatters, charged stops, ν passes |
| S7 web | cue 8 → breath 1 start | "怎么抓住它？" → cosmic web, 930 亿光年 |
| D1 polar descent | breath 1 (hold) → bass return +2 beats | orbit → South Pole, −49 °C |
| D2 ice dive | → end of cue 10 | depth gauge, ice age count, black for one beat |
| D3a first lights | cue 10 end → cue 13 | DOM wake 1→2→5→40 on beats, "已点亮 N / 5,160" |
| D3b the array | cue 13 → 15 | orbit-out reveal, ICECUBE, depth/spacing callouts, 2004–2010 |
| D3c look up | cue 15 → breath 2 end | from the array floor up, "40 亿光年外" |
| E1 Earth filter | breath 2 → mid-interlude beat | up-going ν through the core |
| E2 up-going | → cue 16 | atmospheric muons rain down, ν comes up, 1 : 1,000,000 |
| F1 two km | cue 16 | 2 KM, string drop, 5,160 count |
| F2 macro | cue 17; hit = beat(cue17.end, −1) | ice → H₂O → O nucleus, impact |
| F3 vertex | cue 18 | vertex sparks, muon born, "中微子 → μ 子" |
| F4 cherenkov | cue 19 | tracking shot, cone, CHERENKOV LIGHT, 0.99999 c vs 0.76 c, 41° |
| F5 cascade | cue 20 | causal DOM hits, live count, 1→2→5→10→50+ |
| F6 reconstruct | cue 21 | TIME / POSITION, ns marks on first 14 hits, fit grows |
| F7 where from | cue 22, split on a beat | two reverse shots, arrow, DIRECTION, < 0.4° |
| V1 arrow down | cue 23 | arrow back DOWN through bedrock (up-going event) |
| V2 out of Earth | cue 23 2nd half | line back through Earth to the north sky, RA/Dec |
| V3 source | cue 24 → breath 3 start | black hole + arriving line, SOURCE, TXS 0506+056, 2017-09-22 |
| V4 | breath 3 (inside cue 25!) | black hole recedes |
| W1 pole at night | breath 3 end → cue 26 | night pole, snow → glass, array glows |
| W2/W3 neutrino sky | cue 26 / 27 | sky map: 2013, TXS, NGC 1068, Galactic plane 2023 |
| W4 Earth flux | cue 28 | flux through Earth, 100 万亿 / s |
| W5 window | cue 29 | MULTI-MESSENGER ASTRONOMY, aperture opens |
| W6 light | cue 30 | light lane blocked by dust |
| W7 three messengers | cue 31 → breath 4 start | light / GW (2015 LIGO) / ν (2013 IceCube) |
| W8 only the thread | breath 4 | others fade, "用粒子看宇宙" |
| X1 recap | breath 4 end → cue 32 | night array, recap list (1 km³ / 5,160 / 2013 / 2026 Nobel) |
| X2 the ice hears | cue 32 → beat(cue33.end, 2) | ground level, Milky Way, thread lands on cue 33 |
| X3a–d recap cuts | 2 beats each | cone → array → Earth → source (reverse story) |
| X4 end card | → tl.end | THE ICE · HEARS · THE UNIVERSE / 冰，听见了宇宙 / credits; cut to black on last frame |
