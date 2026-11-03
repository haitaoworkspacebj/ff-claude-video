#!/usr/bin/env bash
# Render stills at given times into a labelled contact sheet (fast visual check).
#   bash stills_sheet.sh <project_dir> "29.3,30.5,31.2" [w h]
# Output: <project_dir>/out/sheet.png   (Read it; then delete out/still_*.png)
# NOTE: if a render is already running it owns port 5178 — this script then
# reuses that server via --noserve instead of failing with EADDRINUSE.
set -euo pipefail
DIR="${1:?project}"; T="${2:?comma times}"; W="${3:-1280}"; H="${4:-720}"
cd "$DIR"; rm -f out/still_*.png
NS=""; (echo > /dev/tcp/127.0.0.1/5178) 2>/dev/null && NS="--noserve"
node tools/export.mjs $NS --sub 1 --w "$W" --h "$H" --stills "$T" 2>&1 | grep -v -E "404|still " || true
.venv/bin/python - <<'EOF'
from PIL import Image, ImageDraw
import glob
fs = sorted(glob.glob('out/still_*.png'), key=lambda f: float(f.split('_')[1][:-4]))
w, h, cols = 480, 270, 4
rows = (len(fs) + cols - 1) // cols
sheet = Image.new('RGB', (cols * (w + 4), rows * (h + 4)), (40, 40, 40))
for i, f in enumerate(fs):
    im = Image.open(f).convert('RGB').resize((w, h))
    ImageDraw.Draw(im).text((6, 250), f.split('_')[1][:-4], fill=(255, 220, 0))
    sheet.paste(im, ((i % cols) * (w + 4), (i // cols) * (h + 4)))
sheet.save('out/sheet.png'); print('out/sheet.png', len(fs), 'frames')
EOF
