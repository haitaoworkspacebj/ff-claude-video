---
name: srt-science-mv
description: Produce a science-explainer music video (MV) from a song (mp3) and its lyric subtitles (SRT) — real-time GLSL/Three.js scenes, every cut locked to SRT lines, beats and bass "breaths", dense on-screen data (lyrics, callouts, counting stats), rendered deterministically to 1080p with headless Chrome + ffmpeg. Includes the complete reference project (IceCube neutrino MV, 124.6 s, 7 acts) to reproduce exactly or adapt to a new topic. Use this whenever the user wants a lyric/music video, a science or popular-science animation synced to a song, "根据歌词和音乐做MV", "科普MV", "用SRT对时间做视频", procedural/shader video, or wants to re-render / modify the IceCube neutrino MV — even if they don't say "skill" or "MV".
compatibility: macOS + Google Chrome (ANGLE Metal), Node ≥ 22, Python ≥ 3.11, ffmpeg ≥ 6. GPU required (tested on AMD Radeon Pro 560X).
---

# SRT-locked science MV

Two modes:
- **Reproduce** the reference film exactly → follow "Reproduce" (≈ 15 min setup + ≈ 30 min render).
- **Make a similar film** (new song / topic) → follow "New film". Reuse the engine unchanged;
  write new acts in `web/src/shots/`, new scenes in `web/src/glsl/`.

Before writing any shot, read `references/pitfalls.md` (the problems that cost the most time).
For APIs, scene uniforms, overlay types and the reference shot list read
`references/architecture.md`. The full source is in `template/`.

## Non-negotiable rules (each one was learned by breaking it)

1. **Time comes only from the SRT + music analysis.** No literal seconds in shot files. Every
   boundary = `tl.cue(i)`, `tl.beat(t, n)`, `tl.breathIn(a, b)`, `tl.dipIn(a, b)`, `tl.end`.
2. **Breaths can sit inside a sung line.** Search `breathIn(C(k).start, C(k+2).start)`; the next
   section starts on the breath's END (bass return).
3. **`--shots` must print `SHOT CHECK OK`** (positive lengths, no gaps/overlaps) before any render.
4. **Dense frames.** Every shot: the sung lyric, a chapter tag, the live scale readout, 1–3 data
   items (callout / counting stat / list). First second: moving subject + hook title. No more
   than ~2 s without new information. Black ≤ 1 beat.
5. **Never white-out.** Camera stays outside volumes; flashes are local (global `flash` ≤ 0.1–0.3);
   night albedo ≈ 0.03. Look at a contact sheet after every act.
6. **Every on-screen number is checked** (web search) and listed to the user; physics consistency
   matters (e.g. PeV neutrinos do NOT cross the Earth; an up-going track came from below).
7. **Deliver at full quality**: 1920×1080, 24 fps, `--sub 5`, CRF 14, BT.709 tagged, AAC 320k.
   Speed comes from `--workers 2`, never from lowering quality without asking.
8. **Review-first cadence**: storyboard → act → stills sheet → review video → user feedback →
   next act. Tell the user you checked stills, not motion-with-music.

## Reproduce the reference film exactly

Inputs: the song `10月9日.mp3` (48 kHz) and `10月9日.srt` (compressed copies are included:
`references/example_input.mp3`, 128 kbps, and `references/example_input.srt` — the 128 kbps copy
reproduces the same analysis numbers; the original is 320 kbps).

```bash
SK=~/.claude/skills/srt-science-mv
bash $SK/scripts/setup_project.sh ~/work/neutrino-mv $SK/references/example_input.mp3 $SK/references/example_input.srt
cd ~/work/neutrino-mv
diff <(python3 -c "import json;d=json.load(open('web/media/timeline.json'));print(round(d['period'],4),round(d['phase'],3),[[round(a,2),round(b,2)] for a,b in d['breaths']],round(d['end'],2))") \
     <(python3 -c "import json;d=json.load(open('$SK/references/example_timeline.json'));print(round(d['period'],4),round(d['phase'],3),[[round(a,2),round(b,2)] for a,b in d['breaths']],round(d['end'],2))") \
  && echo "timeline identical"
node tools/export.mjs --shots | tail -3            # expect 42 shots, 0 → 124.60, SHOT CHECK OK
node tools/export.mjs --video --workers 2 --w 1920 --h 1080 --sub 5 --out out/NEUTRINO_1080p.mp4   # run in background
bash $SK/scripts/qa.sh out/NEUTRINO_1080p.mp4 124.58
```
Expected timeline: period 0.464 (129.3 BPM), breaths ≈ [29.00–29.81], [46.32–47.14],
[85.82–86.73], [103.21–104.05], [124.48–126.50]; end 124.60. If they differ, the input audio is
different — stop and tell the user (the film is built on these numbers).
Pixel-identical output additionally needs the same Chrome/ANGLE/GPU; on other GPUs expect tiny
float differences (same picture). Note: the original delivered file was rendered just before the
grain seed was switched to the frame index, so a re-render matches it in every element except
the film-grain pattern; any two re-renders with this template are grain-identical. Versions used: three 0.186.1, puppeteer-core 25.13.0 (pinned
in package-lock), numpy 2.5.3, Node 22.23, ffmpeg 9.0.1.

## New film (similar style, new song / topic)

### Step 1 — set up and read the music
```bash
bash $SK/scripts/setup_project.sh ~/work/<name> song.mp3 lyrics.srt
```
It prints the cue table, BPM, breaths, dips, hard stop. Then print the energy you will design to:
```bash
.venv/bin/python -c "
import json;d=json.load(open('web/media/timeline.json'));e=d['envs']['low'];r=d['envRate']
print(' '.join('%.1f:%.2f'%(i/r,sum(e[i:i+25])/25) for i in range(0,len(e)-25,25)))"
```
Full bass (≈0.8–1.0) = cut on beats; bass out (< 0.15) = hold / breathe; check the ending —
it may be full-energy to a hard stop (then do fast recap cuts, not a fade).

### Step 2 — fix the lyrics
SRT text is often ASR output. Write `web/src/lyrics.js` (`LYRICS[idx] = "corrected"`, original in
a comment). List every correction and any guess to the user.

### Step 3 — storyboard (`docs/分镜设计.md`, user's language)
Acts = music sections (verse / chorus / interlude / bridge / final chorus / coda), split at
breaths. Per shot: anchor (cue/beat/breath — never seconds), picture, camera, VFX, the data on
screen, transition. Mark the climaxes and the deliberate silences. One visual DNA element
through the whole film (here: the hairline blue neutrino `trail()`; blue reserved for it).
Show the storyboard to the user before building.

### Step 4 — build act by act
For each act create `web/src/shots/<act>.js` exporting `buildX(tl, startAt) → {shots, end, overlay}`
and chain it in `web/src/main.js` (push into the ONE shared shots array; add its GLSL names to
`loadGLSL`). Copy the patterns in `template/web/src/shots/verse1.js` (first act, overlayFor with
brand + scale) and `chorus1.js` / `verse2.js` / `finale.js` (later acts). New scene = new
`glsl/<name>.glsl` with `vec3 scene(ro, rd, uv)` + a `RayShot` subclass declaring all uniforms.

After each act:
```bash
node tools/export.mjs --shots | tail -20                          # SHOT CHECK OK
bash $SK/scripts/stills_sheet.sh . "t1,t2,...(2–3 per shot)"      # Read out/sheet.png
# fix: blown-out frames, empty frames, missing data, wrong anchors; zoom suspicious frames
node tools/export.mjs --video --sub 5 --out out/actN_review.mp4   # background; 720p review
bash $SK/scripts/qa.sh out/actN_review.mp4
```
Report to the user: what each shot shows (by lyric line), data used, what you only checked on
stills, open questions. Wait for feedback before the next act.

### Step 5 — final render
Only after the user approves the full 720p review:
```bash
node tools/export.mjs --video --workers 2 --w 1920 --h 1080 --sub 5 --out out/<NAME>_1080p.mp4
bash $SK/scripts/qa.sh out/<NAME>_1080p.mp4 <tl.end>
```
Run in the background, poll the log (tool calls time out at 10 min). Expect ≈ 0.6 s/frame/worker
at 1080p on a mid GPU. Don't run other GPU work meanwhile; a second export needs `--noserve`.

## Quality bar (what "good" looked like to the user)

- 0–1 s: the black hole is already orbiting, lensed disk, hook title "宇宙中最难抓住的粒子";
  fires on the first bass accent with flash + camera kick + energy stat.
- Every sung line visible as a lyric; every shot has callouts anchored to real 3D points and
  numbers that count; chapter tags 01–19; scale readout 10ⁿ m always on.
- Science climax rendered from physics, not decoration: Cherenkov cone at θc ≈ 41°, DOMs lighting
  in causal arrival order, ns time labels computed by the same formula as the shader.
- Bookends: the opening black hole returns as the SOURCE; the last frame cuts to black exactly on
  the music's hard stop.
