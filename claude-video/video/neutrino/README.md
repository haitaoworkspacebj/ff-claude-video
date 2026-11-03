# ai-vibecoding-film-skill — Turn a Song into a Beat-Locked Science Music Film (Three.js + GLSL)

**English** | [简体中文](README.zh-CN.md)

**What is ai-vibecoding-film-skill?** It is an open pipeline that turns a song (mp3 + lyric SRT subtitles) into a science-accurate, beat-locked music film — entirely in code. Scenes are written as real-time Three.js + hand-written GLSL shaders, rendered deterministically frame-by-frame in headless Chrome, and mastered to 1080p with ffmpeg. The reference film *NEUTRINO* (2:04) — the story of how the [IceCube Neutrino Observatory](https://en.wikipedia.org/wiki/IceCube_Neutrino_Observatory) catches "ghost particles" in Antarctic ice — was produced end-to-end with this skill.

> **Quick start:** `git clone https://github.com/haitaoworkspacebj/ai-vibecoding-film-skill.git && cp -R ai-vibecoding-film-skill ~/.claude/skills/srt-science-mv` — then ask your agent *"make a science music video from this song"*. Full steps under **Install the skill** below.

## Key facts

| | |
|---|---|
| **Reference film** | *NEUTRINO* — 2:04, 7 acts, Chinese lyrics, science-explainer MV |
| **Beat lock** | 129.3 BPM, 33 lyric cues (SRT), 4 bass "breaths" + hard stop — every cut lands on a cue, beat, or breath |
| **Rendering** | Three.js 0.186 + 12 custom GLSL scenes (volumetric ray-marching for accretion disk, Earth's interior, cosmic web) |
| **Export** | Headless Chrome deterministic frames, 5–6 motion-blur subframes per frame (180° shutter) → ffmpeg H.264 1080p24, BT.709 |
| **Quality gate** | Structural `SHOT CHECK OK` (no gaps/overlaps in the shot timeline) + visual contact-sheet review after every act |
| **Science accuracy** | Every on-screen number fact-checked (2 km depth, ~130 m DOM spacing, 41° Cherenkov angle in ice, up-going track selection); neutrinos never "glow" — blue Cherenkov light only appears after the interaction, from the charged muon |
| **Stack** | Node ≥ 22, Python ≥ 3.11, ffmpeg ≥ 6, macOS + Chrome (ANGLE Metal) |

## 🎬 Video demo

[![NEUTRINO — the 2:04 film](https://img.youtube.com/vi/udoDeuotY6Y/hqdefault.jpg)](https://youtu.be/udoDeuotY6Y)

**▶ Watch on YouTube: <https://youtu.be/udoDeuotY6Y>**

> GitHub's Markdown has no video player — `<video>` tags are stripped and links to `.mp4` files in the repo render as plain links — so the demo streams on YouTube. The same file ships in the repo as [NEUTRINO_540p.mp4](NEUTRINO_540p.mp4) (960×540, 8.1 MB, H.264).

> **Compressed for the web:** the repo video copy, the gallery images and the reference song are all compressed copies made for fast transmission on GitHub. The video is a 480p H.264 web transcode (audio 48 kbps), the contact sheets are recompressed JPEGs, and `references/example_input.mp3` is a 128 kbps MP3 of the song — its music analysis still reproduces the exact beat map. The pipeline itself delivers full-quality 1920×1080 24 fps masters (H.264 CRF 14, BT.709, AAC 320 kbps) — run the export command in "How to use this skill" to get the uncompressed-quality version.

## 🖼 Film gallery (storyboard contact sheets — compressed copies)

**Act I — Origin & the ghost** (black hole launch → flight → X-ray Earth → the trail itself):
<img src="docs/images/verse1_keyframes.jpg" alt="Act I storyboard contact sheet: supermassive black hole accretion disk, high-speed flight past the Moon, cutaway Earth with a neutrino track through the core, macro shot of the glowing trail" width="820">

**Act II — Buried in ice** (plunge into the Antarctic ice sheet, IceCube DOMs lighting up one by one):
<img src="docs/images/act2_keyframes.jpg" alt="Act II storyboard contact sheet: vertical dive into Antarctic ice, dark ice volume with bubbles and fissures, digital optical modules lighting up in sequence, ICECUBE title" width="820">

**Acts III–IV — Through the core & the capture** (up-going track crossing the whole Earth, Cherenkov light cone, detector cascade):
<img src="docs/images/act3-4_keyframes.jpg" alt="Acts III and IV storyboard contact sheet: neutrino crossing Earth's interior from below, atomic lattice interaction, Cherenkov light cone spreading through ice, detector cascade lighting up with time and position readouts" width="820">

**Acts V–VII — The new window** (direction reconstruction pointing back to the source, multi-messenger channels, epilogue):
<img src="docs/images/act5-7_keyframes.jpg" alt="Acts V to VII storyboard contact sheet: 3D direction arrow piercing the ice toward a blazar, pull-back from Antarctic ice to the whole universe, three messenger channels light gravitational waves and neutrinos, final track extinguishing at the hard stop" width="820">

## How the pipeline works

1. **Music analysis** — `mv/timeline.py` extracts BPM, beat phase, bass "breaths" and dips from the audio → `web/media/timeline.json`. All shot timing derives from this + the SRT; literal seconds never appear in shot code.
2. **Storyboard** — `docs/分镜设计.md` maps 7 acts to musical sections, each shot anchored to "cue N / beat / breath".
3. **Scenes as shaders** — each shot is GLSL (`web/src/glsl/`) + a JS timeline (`web/src/shots/`): volumetric ray-marching, analytic trail lines with pixel-constant width, HDR bloom → ACES → film grain post chain.
4. **Deterministic export** — `tools/export.mjs` drives headless Chrome at exact timestamps (parallel `--workers N`), pipes PNG frames into ffmpeg, muxes the song slice. Re-renders are identical.
5. **QA** — `scripts/qa.sh` + `scripts/stills_sheet.sh` produce contact sheets; the `SHOT CHECK` validates the shot timeline before every render.

## Repository layout

| Path | What it is |
|---|---|
| `SKILL.md` | Skill entry: non-negotiable rules, reproduce steps, new-film workflow |
| `references/` | pitfalls.md, architecture.md, example input — song `example_input.mp3` + lyrics `example_input.srt`, example timeline |
| `scripts/` | setup_project.sh, qa.sh, stills_sheet.sh |
| `template/` | Engine template (web/ + tools/ + mv/) — copy this for a new film |
| `web/ tools/ mv/ docs/` | Working production files of the reference film *NEUTRINO* |
| `docs/images/` | Compressed storyboard contact sheets (gallery above) |
| `NEUTRINO_540p.mp4` | The finished film (480p for inline playback on GitHub) |

## 📦 Install the skill

The repository **is** the skill — installing means copying it into your agent's skills directory.

**Prerequisites:** macOS + Google Chrome (ANGLE Metal), Node ≥ 22, Python ≥ 3.11, ffmpeg ≥ 6.

```bash
git clone https://github.com/haitaoworkspacebj/ai-vibecoding-film-skill.git
cp -R ai-vibecoding-film-skill ~/.claude/skills/srt-science-mv   # Claude Code
# ZCode / other agents: copy it into that agent's skills directory instead
```

That's the whole install. To verify it works, ask your agent in plain language — *"根据这首歌做一部科普 MV"*, *"make a science music video from this song"* — it should pick up `SKILL.md` and run the pipeline.

## How to use this skill

### 1. Use as an agent skill (recommended)

With the skill installed (above), just ask your agent in plain language — *"根据这首歌做一部科普 MV"*, *"make a science music video from this song"*. Read `SKILL.md` first: it carries the non-negotiable rules (timing comes only from SRT + music analysis, `SHOT CHECK OK` before every render, no white-outs, every on-screen number fact-checked).

### 2. Reproduce the reference film *NEUTRINO*

```bash
bash scripts/setup_project.sh ~/work/neutrino-mv references/example_input.mp3 references/example_input.srt
cd ~/work/neutrino-mv
node tools/export.mjs --shots | tail -3      # expect: SHOT CHECK OK
node tools/export.mjs --stills 1,5.5,12      # quick single-frame checks
node tools/export.mjs --video --workers 2 --w 1920 --h 1080 --sub 5 --out out/NEUTRINO_1080p.mp4
bash scripts/qa.sh out/NEUTRINO_1080p.mp4 124.58
```

Expected music analysis: 129.3 BPM, breaths ≈ [29.00–29.81], [46.32–47.14], [85.82–86.73], [103.21–104.05], [124.48–126.50]. If they differ, the input audio is different — the film is built on these numbers.

### 3. Make a new film (new song / new topic)

1. `cp -R template/ ~/work/my-film && cd ~/work/my-film`
2. Drop in `song.mp3` + lyrics `.srt`, run `python3 mv/timeline.py` → `web/media/timeline.json`
3. Write the storyboard (`docs/分镜设计.md`): map acts to musical sections, anchor every shot to "cue N / beat / breath"
4. Implement acts in `web/src/shots/` (timeline) and scenes in `web/src/glsl/` (rendering) — reuse `glsl/common.glsl`'s `trail()` for the protagonist line
5. Preview in the browser (`node tools/serve.mjs`), review contact sheets (`scripts/stills_sheet.sh`) after every act
6. Render: `node tools/export.mjs --shots` must pass first, then `--video --workers 2`

**Requirements:** macOS + Google Chrome (ANGLE Metal), Node ≥ 22, Python ≥ 3.11, ffmpeg ≥ 6. Before writing any shot, read `references/pitfalls.md` — each rule there was learned by breaking it.

## References

- [IceCube Neutrino Observatory](https://en.wikipedia.org/wiki/IceCube_Neutrino_Observatory) — the km³ detector in Antarctic ice the film is about
- [Cherenkov radiation](https://en.wikipedia.org/wiki/Cherenkov_radiation) — the blue light physics behind the film's visual DNA
- [TXS 0506+056](https://en.wikipedia.org/wiki/TXS_0506%2B056) — the blazar-style neutrino source pointed to in the direction-reconstruction act
- [Neutrino](https://en.wikipedia.org/wiki/Neutrino) — the particle the whole film follows
