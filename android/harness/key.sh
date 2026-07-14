#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"

if [ $# -lt 1 ]; then echo "usage: key.sh <keycode>   e.g. key.sh 66 (ENTER), key.sh 4 (BACK)"; exit 1; fi
"$ADB" shell input keyevent "$1"
echo "keyevent $1"
