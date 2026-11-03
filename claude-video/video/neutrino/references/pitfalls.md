# Pitfalls — every problem hit while making the IceCube MV, and the rule that prevents it

Read this BEFORE writing any shot. Each entry: **symptom → root cause → rule → how to check**.
Grouped by how often they recurred. The ★ ones happened more than once.

## Contents
1. Timing (★★★)  2. Exposure / brightness (★★★)  3. Information density (★★ — user feedback)
4. Shot structure  5. Shader & geometry  6. Science correctness  7. Export & encoding (★★)
8. Process / tooling

---

## 1. Timing

### 1.1 ★ Hard-coded timecodes drift from the song
- Symptom: a cut lands half a beat off; changes to one act shift everything after it.
- Cause: writing `start: 29.0` instead of deriving it.
- Rule: **no literal seconds anywhere in `web/src/shots/*`**. Every boundary is a query:
  `tl.cue(i).start/.end`, `tl.beat(t, n)` (snap to grid, ±n beats), `tl.breathIn(a, b)`,
  `tl.dipIn(a, b)`, `tl.end` (hard stop). Acts chain: `buildX(tl, previousAct.end)`.
- Check: `grep -nE "[^a-zA-Z_.][0-9]{2,}\.[0-9]+" web/src/shots/*.js` should only hit
  geometry/colour constants, never times.

### 1.2 ★★ A breath (bass dropout) falls INSIDE a lyric line → negative shot length
- Symptom: `--shots` printed `85.82 → 85.49  S1 source` (end < start), and a second shot
  overlapped. Same bug class: breath 4 was "not found" so the act fell back to a guess.
- Cause: assumed breath N sits in the gap between cue k's end and cue k+1's start, and searched
  only `[cue.end − 1, nextCue.end]`. In this song breath 3 (85.8 s) is inside cue 25 (85.5 s start).
- Rule: search breaths over the whole region they could be in: `tl.breathIn(C(k).start, C(k+2).start)`.
  When a breath is inside a sung line, **the act boundary is the breath's END (bass return)**,
  not the cue start — the music, not the subtitle, decides where the chorus hits.
- Check: `node tools/export.mjs --shots` prints `SHOT CHECK OK` (positive durations, no gaps,
  no overlaps, first/last shot match the range). Never render before this passes.

### 1.3 The music does not do what you assume at the end
- Symptom: planned a slow fade-out coda; the outro bass is actually full (≈0.9) right up to the
  hard stop at 124.5 s → 16 s of slow, empty picture over loud music.
- Rule: before designing any section, print the energy envelope for it:
  `python -c` over `timeline.json → envs.low` in 0.25 s steps (see SKILL.md step 2). Design the
  pacing from the numbers: full bass = cut on beats (2-beat cuts in the coda); bass out = hold.
- The final frame must cut to black exactly at `tl.end` (`postAt → fade: time >= stop - 1/48 ? 0 : 1`).

### 1.4 Short shots inherit long-shot choreography
- Symptom: W1 was planned as a slow reveal but the breath fix made it 0.6 s long — the reveal
  never happened, the frame showed grey snow.
- Rule: after any timing change re-read `--shots`; any shot < 1.0 s must open already "at the
  money frame" (start state = the interesting state) and only drift.

## 2. Exposure / brightness

### 2.1 ★★★ Frames blown out to white/grey
Hit four separate times: opening AGN (camera inside the disk radius), ice dive (in-scatter too
bright), impact flash at the nucleus (whole frame white), Cherenkov cone (camera inside the
shell → full-screen blue fog). Also the night snow surface came out mid-grey.
- Causes and rules:
  - **Camera inside a volume** (disk, cone shell, fog) fills every pixel. Keep the camera
    outside: for the cone `r = (L − s)·1.18`, put the camera ≥ 1.5× the shell radius away.
  - **Volumetric step weight must be divided by the shell thickness** and kept small
    (`dt / w * 0.12`); a constant weight explodes when the step count or thickness changes.
  - **Flashes are local, not global**: impact = small `exp(-r*20)` glow + `flash ≤ 0.1`.
    Global `flash` > 0.3 or `exposure` kicks > 0.3 wipe the frame.
  - **Night surfaces**: albedo × 0.03, not 0.07+. Night snow must read darker than the sky glow.
- Check (mandatory after every act): render a contact sheet and look. Any frame whose mean
  luminance > ~0.6 or that is a flat colour is a defect. `scripts/stills_sheet.sh`.

### 2.2 ★ Too dark / black stretches
- Symptom: user: "24 s 时候是全黑的". Long dark "breath" shots and an empty lattice.
- Rule: black is allowed for **at most one beat**. `qa.sh` fails on ≥ 0.25 s of black anywhere
  except the last frame. Dark scenes still need a lit subject + data on screen.

### 2.3 Far detail disappears
- Symptom: DOMs (33 cm spheres) on far strings vanished; cables at distance became a grey haze
  that washed the array.
- Rule: emissive points have a **minimum screen size** (`w = max(sz, 1.4 px)`); thin lines get
  distance falloff and low gain (cables × 0.06–0.09). Check 4–5 neighbours along a string, not 1.

## 3. Information density (the user's strongest feedback)

After v1 the user said: first 5 s not striking, viewers will leave; frames too empty; no tip
text or data; "只听歌用户是不懂的" — lyrics must be on screen. This overrides any
"minimal / negative space" aesthetic in the brief.

Rules, per shot, no exceptions:
- **Lyric** line on screen for every sung cue (corrected text in `lyrics.js`, keep the original
  as a comment; timing from the SRT).
- **Chapter tag** (number + short name) and a **live scale readout** (`scaleAt → 10ⁿ m + what`).
- **1–3 data items**: callouts anchored to 3D points (`world:`), counting stats (`stat`),
  lists (`list`), marks (`marks`). Numbers count up; they are not static.
- **First second** of the film: the subject is already moving and a hook title is on screen.
  The first "event" (the neutrino firing) lands on the first musical accent (≈ 2.6 s here).
- No more than ~2 s without a new piece of information appearing.

## 4. Shot structure

### 4.1 Shots must tile the range exactly
- Gaps render black, overlaps double-expose. `--shots` check enforces it. Dissolves are
  `fadeIn` on the incoming shot only.

### 4.2 Shared shot list for the scale readout
- The persistent scale overlay looks up "the shot at time t". Acts push into ONE array
  (`act1.shots.push(...act2.shots, ...)`); a copy breaks the lookup for later acts.

### 4.3 Persistent overlays must stop at the end
- Brand/scale overlays had no `t1`, so they drew over the final black frame. Set
  `o.t1 = end - 1/48` for every `persistent` item; titles filter honours `t1` for persistent items.

### 4.4 Reusing a class across acts
- Export the shot classes (`export class Source/Earth/Ice/Cap`) and add every new uniform to
  the class's constructor list — `set()` throws "undeclared uniform" otherwise (intended: it
  catches typos). Mode switches go through a `custom` callback, not copy-pasted classes.

## 5. Shader & geometry

- `#include "x.glsl"` is resolved by `loadGLSL` (one level). Shared IceCube geometry lives in
  `icecube.glsl` + `icecube.js`; JS-side hit timing (`arrival()` in verse2.js) **must be the
  same formula** as `domHit()` in GLSL, or the "t+128 ns" labels sit on the wrong DOMs.
- Early `return` in a branch (above-ice sky) skipped later layers (the neutrino thread). Put
  shared overlays in a helper and add it on every return path.
- Uniform arrays (`uStr[86]`) need `toU` to pass non-number arrays through untouched.
- The camera `roll` must rotate about the view axis (`setCamera` builds r/u from `up`, then
  rotates); a naïve `up = (sin roll, cos roll, 0)` breaks for looking straight down.
- Grain seed must come from the **frame index**, not a running counter, or parallel workers /
  stills render different grain for the same frame (fixed in `post.js` + `main.js`).

## 6. Science correctness

Verify every number with a search before putting it on screen; list them for the user.
Mistakes caught in this project:
- "1000 万亿 eV" (1 PeV) contradicted "passes through the whole Earth" (PeV neutrinos are mostly
  absorbed). Changed to 100 万亿 eV ≈ 7× LHC collision energy.
- AGN disk temperature: 10⁵–10⁶ K, not >10⁷ K. Earth stopping fraction: write "< 10⁻¹¹".
- Up-going track ⇒ the neutrino came **through the Earth from below**; the "look back" arrow
  must go DOWN through the bedrock, not up into the sky.
- Cherenkov in ice: n ≈ 1.31, θc ≈ 40–41°, light speed in ice ≈ 0.76 c. Hit time:
  `c·t = along + perp·tanθc`; before-vertex points use `n·distance`.
- Real IceCube: 86 strings, 60 DOMs each = 5,160, 125 m spacing, 17 m DOM spacing,
  1,450–2,450 m depth, built 2004–2010, ~1 km³.
- Dates: 2013 first astrophysical neutrinos; 2017-09-22 IceCube-170922A → TXS 0506+056 (2018
  paper); NGC 1068 (2022); Galactic plane (2023); Nobel Physics 2026 Francis Halzen.
- Lyrics: the SRT had ASR errors; last line "停止了宇宙" assumed to be "听见了宇宙".
  Correct in `lyrics.js`, keep the original as a comment, **tell the user what you assumed**.

## 7. Export & encoding

### 7.1 ★ Untagged colour
- Symptom: files had `color_space=unknown`; players guess BT.601 for some HD files → blues shift.
- Rule: encode with `scale=out_color_matrix=bt709:out_range=tv`, set `-colorspace/-color_primaries/
  -color_trc bt709 -color_range tv`, and on the stream-copy mux add
  `-bsf:v h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1`
  (copy drops the container tags otherwise). `qa.sh` fails if tags ≠ bt709×3.

### 7.2 Audio
- Keep the source sample rate (48 kHz here) and 320k AAC; cut audio with `-ss from -t dur`
  matching the video range; `-shortest`; `-movflags +faststart`.

### 7.3 ★ Speed
- Measured at 1080p: GPU render ≈ 415 ms/frame mean (cone shots ≈ 900 ms), PNG encode+transfer
  ≈ 200 ms. Two worker processes (`--workers 2`) overlap them: 85 s → 50 s per 48 frames
  (1.7×). A third worker gives nothing (GPU-bound). Full 124.6 s @1080p ≈ 30 min with 2 workers.
- Do NOT trade quality for speed without asking: `--sub 5` (motion-blur subframes) and CRF 14
  are the delivered settings. Lower `--sub` shows stepped motion blur on fast shots.
- Segments are concatenated by stream copy; check PSNR vs single-process on a short clip
  (got 42.9 dB — encode noise only).

### 7.4 Port 5178 already in use
- A running render owns the static server. Any second `export.mjs` must pass `--noserve` or it
  crashes with EADDRINUSE. `stills_sheet.sh` detects this.

### 7.5 Long renders
- Always run them in the background and poll the log; tool calls time out at 10 min. Don't run
  other GPU work during the final render. Stopping a render: kill `export.mjs` **and** headless
  Chrome, then delete `out/_seg*`.

### 7.6 Python `hash()` is not stable across runs
- Symptom: the audio-decode cache never hit; every analysis run re-decoded the mp3.
- Cause: `hash(str)` is salted per process (PYTHONHASHSEED). Use `hashlib.md5(...)` for any
  on-disk key. The analysis output itself is deterministic (`timeline.json` byte-identical).

## 8. Process / tooling

- **Never delete user-visible files (old review cuts, renders) without explicit permission.**
  Temporary files you created (`out/still_*`, sheets, `_seg*`) may be removed.

- Review-first workflow: storyboard doc → one act → stills sheet → review video → user feedback
  → next act. The user approved each act before the next; keep that cadence.
- Look at the frames yourself (Read the PNG) before showing the user; zoom (2×2 at 640×360)
  on anything suspicious. Say explicitly that you only checked stills, not motion with music.
- Keep `out/` clean: delete stills/sheets after use; old review cuts only with permission.
- Record decisions in memory (project facts, the user's density feedback) so a resumed session
  doesn't regress to sparse frames.
