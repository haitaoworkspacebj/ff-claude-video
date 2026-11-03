#!/usr/bin/env bash
# Quality gate. Run after every act and before delivery. Exits non-zero on failure.
#   bash qa.sh <video.mp4> [expected_seconds]
# Checks: duration, black stretches, frozen stretches, colour tags, audio
# format, plus a 4×N keyframe contact sheet for visual review (Read the PNG).
set -uo pipefail
V="${1:?video}"; EXP="${2:-}"; FAIL=0
dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$V")
echo "duration: ${dur}s"
if [ -n "$EXP" ]; then
  python3 -c "import sys; d=abs($dur-$EXP); print('  expected', $EXP, 'diff', round(d,3)); sys.exit(0 if d<0.1 else 1)" || { echo "FAIL duration"; FAIL=1; }
fi
blk=$(ffmpeg -i "$V" -vf "blackdetect=d=0.25:pix_th=0.06" -an -f null - 2>&1 | grep -o "black_start:[0-9.]* black_end:[0-9.]*" || true)
# the last frame is allowed to be black (hard stop); anything else is a failure
blk_bad=$(echo "$blk" | awk -v D="$dur" -F'[: ]' 'NF{ if ($2 < D-0.3) print }')
if [ -n "$blk_bad" ]; then echo "FAIL black stretches ≥0.25s:"; echo "$blk_bad"; FAIL=1; else echo "black: OK"; fi
frz=$(ffmpeg -i "$V" -vf "freezedetect=n=0.001:d=1.5" -an -f null - 2>&1 | grep -o "freeze_start: [0-9.]*" || true)
if [ -n "$frz" ]; then echo "WARN frozen ≥1.5s (static frame — check it is intended):"; echo "$frz"; else echo "freeze: OK"; fi
ffprobe -v error -select_streams v -show_entries stream=width,height,r_frame_rate,pix_fmt,color_space,color_primaries,color_transfer,color_range -of default=nw=1 "$V"
tags=$(ffprobe -v error -select_streams v -show_entries stream=color_space,color_primaries,color_transfer -of csv=p=0 "$V")
[ "$tags" = "bt709,bt709,bt709" ] && echo "colour tags: OK" || { echo "FAIL colour tags: $tags (need bt709 ×3)"; FAIL=1; }
ffprobe -v error -select_streams a -show_entries stream=codec_name,sample_rate,channels,bit_rate -of default=nw=1 "$V"
# contact sheet: 16 evenly spaced frames
OUTP="${V%.*}_sheet.png"
ffmpeg -v error -y -i "$V" -vf "fps=16/$dur,scale=480:-1,tile=4x4:padding=4:color=0x141414" -frames:v 1 "$OUTP" && echo "sheet: $OUTP"
exit $FAIL
