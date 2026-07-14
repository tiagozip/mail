#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"

if [ $# -lt 2 ]; then echo "usage: tap.sh <x> <y>"; exit 1; fi
"$ADB" shell input tap "$1" "$2"
echo "tapped $1 $2"
