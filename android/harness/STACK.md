# Android build stack (Material 3 Expressive upgrade)

Final, mutually-compatible stable set. Build is GREEN (`:app:assembleDebug`) and the app launches and renders the setup screen on `emulator-5554` (API 35).

## Build tooling

| Component | Old | New |
|---|---|---|
| Gradle wrapper | 8.9 | **8.11.1** |
| Android Gradle Plugin (AGP) | 8.5.2 | **8.9.2** |
| Kotlin (android / compose / serialization plugins) | 2.0.20 | **2.1.20** |
| KSP (`com.google.devtools.ksp`) | (absent) | **2.1.20-1.0.31** |
| compileSdk / targetSdk | 34 / 34 | **35 / 35** |
| minSdk | 26 | 26 (unchanged) |

`org.gradle.parallel` and `org.gradle.caching` kept in `gradle.properties` (untouched).

## Compose / Material 3

| Component | Old | New |
|---|---|---|
| Compose BOM | 2024.09.02 | **2025.05.01** |
| `androidx.compose.material3:material3` | (via BOM) | **1.4.0-alpha14** (pinned explicitly) |

### Expressive APIs: CONFIRMED available
Verified by compiling a throwaway `ExpressiveProbe.kt` against `material3:1.4.0-alpha14`. The symbols
`MaterialExpressiveTheme`, `ButtonGroup`, and `ExperimentalMaterial3ExpressiveApi` all **resolved**
(no "unresolved reference" errors — the only error was an in-probe `@Composable`-context lambda
mismatch, unrelated to API availability). The probe file was deleted after confirmation; no expressive
APIs are used in shipping source.

Note: the latest stable BOM's material3 (1.3.x) does not expose `MaterialExpressiveTheme`, so material3
is pinned to the 1.4.x alpha line per the task brief (1.4.x is where expressive lives; there is no
non-alpha 1.4 yet).

## Added dependencies

| Library | Version |
|---|---|
| `androidx.room:room-runtime` | 2.7.1 |
| `androidx.room:room-ktx` | 2.7.1 |
| `androidx.room:room-compiler` (via `ksp(...)`) | 2.7.1 |
| `androidx.work:work-runtime-ktx` | 2.10.1 |
| `androidx.biometric:biometric-ktx` | 1.2.0-alpha05 |
| `androidx.browser:browser` | 1.8.0 |
| `com.materialkolor:material-kolor` | 2.1.1 |
| `androidx.core:core-splashscreen` | 1.0.1 |

`biometric-ktx` has no stable release; `1.2.0-alpha05` is the latest and the only line shipping the `-ktx`
artifact, so it is used.

## Bumped existing dependencies (for sdk35 / Kotlin 2.1 / AGP 8.9 compatibility)

| Library | Old | New |
|---|---|---|
| `androidx.core:core-ktx` | 1.13.1 | 1.16.0 |
| `androidx.lifecycle:*` | 2.8.5 | 2.9.0 |
| `androidx.activity:activity-compose` | 1.9.2 | 1.10.1 |
| `androidx.navigation:navigation-compose` | 2.8.0 | 2.9.0 |
| `androidx.datastore:datastore-preferences` | 1.1.1 | 1.1.7 |
| `com.android.tools:desugar_jdk_libs` | 2.0.4 | 2.1.4 |

`coreLibraryDesugaring` confirmed still working (`desugarDebugFileDependencies` / `l8DexDesugarLibDebug`
tasks run clean).

All other existing deps kept unchanged: retrofit 2.11.0, okhttp 4.12.0, logging-interceptor 4.12.0,
kotlinx-serialization-json 1.7.1, retrofit2-kotlinx-serialization-converter 1.0.0, security-crypto
1.1.0-alpha06, coil-compose 2.7.0, pgpainless-core 1.6.8, material-icons-extended (BOM), junit 4.13.2.

## Source edits

**None.** No Kotlin source logic was changed. Compilation produced only pre-existing deprecation
warnings (`Icons.Rounded.Send` / `.Logout` / `.Forward` suggesting their `AutoMirrored` variants) which
are non-fatal and were not introduced by this upgrade. The temporary `ExpressiveProbe.kt` was created
solely to confirm expressive APIs and then removed.

## Verification

- `bash android/harness/build.sh` → `BUILD SUCCESSFUL`, APK produced.
- `install.sh` + `launch.sh` + `screenshot.sh` → setup screen renders (Estrogen Mail logo, API key /
  Base URL fields, Connect button). No crash, no black screen.
