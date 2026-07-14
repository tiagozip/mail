#!/usr/bin/env bash
# Sourced by every harness script. Sets SDK/JDK paths and ids.
# Safe to source from any cwd.

export ANDROID_HOME="$HOME/Library/Android/sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"

export ADB="$ANDROID_HOME/platform-tools/adb"
export EMULATOR="$ANDROID_HOME/emulator/emulator"
export SDKMANAGER="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"
export AVDMANAGER="$ANDROID_HOME/cmdline-tools/latest/bin/avdmanager"

export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"

export AVD_NAME="estrogen"
export PKG_ID="zip.estrogen.mail"
export ACTIVITY="zip.estrogen.mail/.MainActivity"

# Resolve android project dir (parent of harness/) regardless of cwd.
HARNESS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export HARNESS_DIR
export ANDROID_DIR="$(cd "$HARNESS_DIR/.." && pwd)"
export APK_PATH="$ANDROID_DIR/app/build/outputs/apk/debug/app-debug.apk"
export SHOTS_DIR="$HARNESS_DIR/shots"
