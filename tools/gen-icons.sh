#!/usr/bin/env bash
# Regenerates the app icons (assets/icon-*.png, assets/apple-touch-icon.png).
# Brand gradient tile with an "AR" wordmark. Requires ffmpeg + DejaVu fonts.
set -euo pipefail
cd "$(dirname "$0")/.."

FONT=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf

gen() { # size, out, fontsize
  ffmpeg -loglevel error -y \
    -f lavfi -i "gradients=s=$1x$1:c0=#00d4ff:c1=#7b2cbf:x0=0:y0=0:x1=$1:y1=$1,format=rgba" \
    -vf "drawtext=fontfile=$FONT:text=AR:fontcolor=white:fontsize=$3:x=(w-text_w)/2:y=(h-text_h)/2" \
    -frames:v 1 "$2"
}

gen 512 assets/icon-512.png 220
gen 192 assets/icon-192.png 82
gen 180 assets/apple-touch-icon.png 78
echo "icons written to assets/"
