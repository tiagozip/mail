#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"

cd "$ANDROID_DIR"
echo "JAVA_HOME=$JAVA_HOME"
"$JAVA_HOME/bin/javac" -version
echo "building :app:assembleDebug ..."
./gradlew :app:assembleDebug "$@"

if [ -f "$APK_PATH" ]; then
  echo "APK: $APK_PATH"
else
  echo "ERROR: APK not found at $APK_PATH"
  exit 1
fi
