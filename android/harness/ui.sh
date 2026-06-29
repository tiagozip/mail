#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"

"$ADB" shell uiautomator dump /sdcard/window_dump.xml >/dev/null 2>&1
"$ADB" exec-out cat /sdcard/window_dump.xml
echo
