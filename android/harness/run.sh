#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"

"$HARNESS_DIR/boot.sh"
"$HARNESS_DIR/build.sh"
"$HARNESS_DIR/install.sh"
"$HARNESS_DIR/launch.sh"
sleep 3
SHOT="$("$HARNESS_DIR/screenshot.sh")"
echo "screenshot: $SHOT"
