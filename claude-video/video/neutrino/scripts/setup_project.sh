#!/usr/bin/env bash
# Scaffold a new MV project from the reference template and analyse the inputs.
#   bash setup_project.sh <project_dir> <song.mp3> <lyrics.srt>
# Result: <project_dir> with node deps, a Python venv, web/media/song.mp3 and
# web/media/timeline.json (the ONLY timing source), and a printed cue table.
set -euo pipefail
SKILL="$(cd "$(dirname "$0")/.." && pwd)"
DIR="${1:?project dir}"; MP3="${2:?song.mp3}"; SRT="${3:?lyrics.srt}"
MP3="$(cd "$(dirname "$MP3")" && pwd)/$(basename "$MP3")"
SRT="$(cd "$(dirname "$SRT")" && pwd)/$(basename "$SRT")"

for bin in node ffmpeg ffprobe python3; do command -v "$bin" >/dev/null || { echo "missing: $bin"; exit 1; }; done
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || echo "WARN: Chrome not found at $CHROME — edit executablePath in tools/export.mjs"

mkdir -p "$DIR"
rsync -a "$SKILL/template/" "$DIR/"
cd "$DIR"
npm ci --silent                                   # exact pinned versions from package-lock.json
python3 -m venv .venv
.venv/bin/pip install -q "numpy==2.5.3" "pillow==12.3.0"
mkdir -p web/media out analysis
ln -sf "$MP3" web/media/song.mp3
MV_MP3="$MP3" MV_SRT="$SRT" .venv/bin/python mv/timeline.py
echo
echo "Next: read the cue table above, fill web/src/lyrics.js, write docs/分镜设计.md, then build acts."
