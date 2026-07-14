#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"

is_booted() {
  local state
  state="$("$ADB" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')"
  [ "$state" = "1" ]
}

"$ADB" start-server >/dev/null 2>&1 || true

if "$ADB" get-state >/dev/null 2>&1 && is_booted; then
  echo "device already booted: $("$ADB" devices | grep -w device | head -1)"
else
  if ! "$ADB" get-state >/dev/null 2>&1; then
    echo "starting emulator $AVD_NAME ..."
    nohup "$EMULATOR" -avd "$AVD_NAME" -no-snapshot -no-boot-anim \
      -gpu swiftshader_indirect >"$HARNESS_DIR/emulator.log" 2>&1 < /dev/null &
    disown || true
    echo "emulator pid $!"
  fi

  echo "waiting for device ..."
  "$ADB" wait-for-device
  echo "waiting for boot_completed ..."
  for _ in $(seq 1 180); do
    if is_booted; then break; fi
    sleep 2
  done
  is_booted || { echo "ERROR: boot did not complete"; tail -20 "$HARNESS_DIR/emulator.log"; exit 1; }
fi

"$ADB" shell settings put global window_animation_scale 0 >/dev/null 2>&1 || true
"$ADB" shell settings put global transition_animation_scale 0 >/dev/null 2>&1 || true
"$ADB" shell settings put global animator_duration_scale 0 >/dev/null 2>&1 || true
"$ADB" shell input keyevent 82 >/dev/null 2>&1 || true

echo "booted:"
"$ADB" devices
