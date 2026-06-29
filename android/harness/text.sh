#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"

if [ $# -lt 1 ]; then echo "usage: text.sh <string>"; exit 1; fi
ESCAPED="${*// /%s}"
"$ADB" shell input text "$ESCAPED"
echo "typed: $*"
