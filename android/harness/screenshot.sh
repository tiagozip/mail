#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"

OUT="${1:-$SHOTS_DIR/shot-$(date +%Y%m%d-%H%M%S).png}"
mkdir -p "$(dirname "$OUT")"
"$ADB" exec-out screencap -p > "$OUT"
ABS="$(cd "$(dirname "$OUT")" && pwd)/$(basename "$OUT")"
echo "$ABS"
