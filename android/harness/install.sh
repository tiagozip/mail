#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"

if [ ! -f "$APK_PATH" ]; then
  echo "APK missing, building first ..."
  "$HARNESS_DIR/build.sh"
fi

echo "installing $APK_PATH ..."
"$ADB" install -r "$APK_PATH"
echo "installed $PKG_ID"
