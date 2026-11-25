#!/usr/bin/env bash
set -euo pipefail

apk="${1:?usage: release-android.sh <apk> [notes]}"
notes="${2:-}"
tools="${ANDROID_HOME:-$HOME/Library/Android/sdk}/build-tools"
aapt="$(ls -d "$tools"/*/aapt2 2>/dev/null | sort -V | tail -1 || true)"
[ -x "$aapt" ] || { echo "aapt2 not found under $tools" >&2; exit 1; }

badging="$("$aapt" dump badging "$apk")"
code="$(sed -n "s/.*versionCode='\([0-9]*\)'.*/\1/p" <<<"$badging" | head -1)"
name="$(sed -n "s/.*versionName='\([^']*\)'.*/\1/p" <<<"$badging" | head -1)"
min="$(sed -n "s/^minSdkVersion:'\([0-9]*\)'.*/\1/p" <<<"$badging" | head -1)"
size="$(stat -f%z "$apk" 2>/dev/null || stat -c%s "$apk")"
sha="$(shasum -a 256 "$apk" | cut -d' ' -f1)"

current="$(curl -fsS https://mail.estrogen.delivery/api/app/android.json 2>/dev/null | jq -r '.versionCode // 0' || echo 0)"
if [ "$code" -le "${current:-0}" ]; then
  echo "versionCode $code is not above the published $current, bump it in build.gradle.kts" >&2
  exit 1
fi

manifest="$(mktemp)"
jq -n --argjson code "$code" --arg name "$name" --argjson size "$size" --arg sha "$sha" \
  --arg notes "$notes" --argjson min "${min:-26}" \
  '{versionCode:$code,versionName:$name,size:$size,sha256:$sha,url:"https://mail.estrogen.delivery/api/app/android.apk",notes:$notes,minSdk:$min}' >"$manifest"

echo "uploading $name ($code), $size bytes"
npx wrangler r2 object put "estrogen-mail/app/android/$code.apk" --file "$apk" --content-type application/vnd.android.package-archive --remote
npx wrangler r2 object put estrogen-mail/app/android/latest.json --file "$manifest" --content-type application/json --remote
cat "$manifest"
rm "$manifest"
