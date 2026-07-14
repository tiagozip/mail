# Android dev harness

Command-line harness to build, boot, install, launch, screenshot, and drive the
Estrogen Mail Compose app (`zip.estrogen.mail`) from any cwd. Every script
sources `env.sh`, which pins the SDK, JDK, and device ids, so each script is
self-contained.

## Toolchain (verified)

- **JAVA_HOME**: `/Applications/Android Studio.app/Contents/jbr/Contents/Home` (JDK 21, JBR). System `java` is JDK 8 and is unusable for Gradle.
- **ANDROID_HOME**: `~/Library/Android/sdk`
- **System image**: `system-images;android-35;google_apis;arm64-v8a` (Android 15, API 35, arm64). `platforms;android-35`, `build-tools;35.0.0`, plus platform-tools and emulator.
- **AVD**: `estrogen`, based on `pixel_7`, hardware keyboard enabled (`hw.keyboard=yes`), density 420, image above.
- **App**: `applicationId=zip.estrogen.mail`, launchable activity `zip.estrogen.mail/.MainActivity`, debug APK at `app/build/outputs/apk/debug/app-debug.apk`.

## Scripts

| Script | Usage | What it does |
| --- | --- | --- |
| `env.sh` | `source env.sh` | Exports ANDROID_HOME, JAVA_HOME, PATH, ADB, EMULATOR, AVD_NAME, PKG_ID, ACTIVITY, paths. Sourced by the rest. |
| `boot.sh` | `bash boot.sh` | Boots the `estrogen` AVD detached (`-no-snapshot -gpu swiftshader_indirect`), waits for `sys.boot_completed`, disables animations. Idempotent: no-op if a device is already booted. |
| `build.sh` | `bash build.sh [gradle args]` | Runs `./gradlew :app:assembleDebug`, prints the APK path. |
| `install.sh` | `bash install.sh` | `adb install -r` the debug APK; builds first if the APK is missing. |
| `launch.sh` | `bash launch.sh` | `am start` MainActivity. |
| `screenshot.sh` | `bash screenshot.sh [outfile]` | `screencap -p` to a PNG (default `shots/shot-<ts>.png`); prints the absolute path. |
| `ui.sh` | `bash ui.sh` | `uiautomator dump` of the current view hierarchy to stdout (find element `bounds` to tap). |
| `tap.sh` | `bash tap.sh <x> <y>` | `input tap`. |
| `text.sh` | `bash text.sh <string>` | `input text` (spaces handled). |
| `key.sh` | `bash key.sh <keycode>` | `input keyevent` (e.g. 66=ENTER, 4=BACK, 82=MENU). |
| `run.sh` | `bash run.sh` | boot + build + install + launch + screenshot, end to end. |

## Full loop (copy-paste)

```bash
cd android/harness
bash boot.sh                       # boot the API 35 emulator
bash build.sh                      # produce app-debug.apk
bash install.sh                    # adb install -r
bash launch.sh                     # start MainActivity
bash screenshot.sh                 # -> prints PNG path
bash ui.sh | grep -o 'bounds="[^"]*"'   # find tap targets
bash tap.sh 540 1198               # tap the API key field
bash text.sh "my-api-key"          # type into it
bash key.sh 66                     # press ENTER
```

Or the whole thing at once: `bash run.sh`.

## Note on the app working tree

This harness builds the app as committed. As of setup, the **uncommitted working
tree does not compile**: a WIP refactor made `MeResponse.user` nullable
(`User? = null`) in `data/model/Models.kt`, but consumer ViewModels
(`ui/compose/ComposeViewModel.kt`, `ui/settings/SettingsViewModel.kt`,
`ui/setup/SetupViewModel.kt`) still call members on the now-nullable receiver
without `?.`, and the modified `AndroidManifest.xml` references
`@xml/network_security_config`, which did not exist. The harness adds the missing
`app/src/main/res/xml/network_security_config.xml` resource. The Kotlin
null-safety errors are app-source logic and were left untouched. Build/install/
launch were validated against the committed `HEAD` (which compiles); fix the WIP
null-safety calls to build the working tree.
