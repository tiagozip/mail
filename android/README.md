# Estrogen Mail (Android)

A native Android client for the **estrogen.delivery** mail service, talking to the existing JSON API at `https://mail.estrogen.delivery/api`. Kotlin, Jetpack Compose, Material 3 (Material You), with a plum/rose theme that echoes the web app.

> **Status: unverified prototype.** This project was written without an Android SDK or emulator available, so it has **not** been compiled or run. It is intended to be opened in Android Studio and iterated on a real device. Expect to fix a few things on first build (dependency catalog tweaks, an import here and there). The architecture and UI are complete and idiomatic.

## What it does

- **Setup**: paste a developer API key (`emk_...`) and optionally a base URL. The key is validated by calling `GET /api/me` and then stored locally via DataStore.
- **Mail list**: a folder drawer (Inbox, Starred, Sent, Drafts, Archive, Spam, Trash) with unread/total badges, a `LazyColumn` of message rows (avatar, sender, subject, snippet, relative time, unread dot, star toggle, attachment + PGP icons), pull-to-refresh, infinite scroll via `nextCursor`, and an extended FAB to compose.
- **Thread reader**: the full conversation, each message collapsible, body rendered as plain text or sanitized HTML (in a locked-down `WebView`), attachment chips, a "Encrypted, open on web" chip for PGP messages, and reply / reply-all / forward.
- **Compose**: read-only From, To/Cc/Bcc, Subject, body, Send via `POST /api/send`.

## Tech

- Kotlin + Jetpack Compose, Material 3
- Navigation-Compose for screen routing
- One `ViewModel` per screen with a `StateFlow` UI state (unidirectional)
- Retrofit + OkHttp + kotlinx.serialization for the API
- Coil for avatars
- DataStore (Preferences) for the API key and base URL
- Package root: `zip.estrogen.mail`

## Project layout

```
android/
  settings.gradle.kts
  build.gradle.kts
  gradle.properties
  gradlew / gradlew.bat
  gradle/wrapper/gradle-wrapper.properties
  app/
    build.gradle.kts
    proguard-rules.pro
    src/main/
      AndroidManifest.xml
      res/...                       theme colors, launcher icon, strings
      java/zip/estrogen/mail/
        MailApp.kt                  Application, holds the repository
        MainActivity.kt             sets the Compose content, picks start route
        nav/AppNavHost.kt           routes: setup, maillist, thread, compose
        data/
          Folder.kt                 folder enum + counts mapping
          SettingsStore.kt          DataStore credentials
          MailRepository.kt         single source of truth over the API
          model/Models.kt           serializable DTOs
          remote/MailApi.kt         Retrofit interface
          remote/ApiFactory.kt      Retrofit/OkHttp builder + Bearer auth
        ui/
          ViewModelFactory.kt       wires repository into ViewModels
          theme/                    Color, Theme, Type (plum/rose, dark + light)
          common/                   Avatar, time formatting
          setup/                    SetupScreen + SetupViewModel
          maillist/                 MailListScreen, MailRow, FolderDrawer, ViewModel
          thread/                   ThreadScreen, HtmlBody, ThreadViewModel
          compose/                  ComposeScreen, ComposeViewModel, ComposePrefill
```

## Open and run

1. **Android Studio**: Hedgehog (2023.1) or newer, ideally Koala / Ladybug for AGP 8.5.
2. `File > Open` and select the `android/` directory.
3. The Gradle wrapper `.jar` is intentionally **not** committed (it is a binary). On first sync Android Studio regenerates it, or from a machine with Gradle installed run:
   ```
   gradle wrapper --gradle-version 8.9
   ```
   inside `android/`.
4. SDK versions: `compileSdk 34`, `targetSdk 34`, `minSdk 26` (Android 8.0). Install the Android 14 (API 34) SDK platform if prompted.
5. Build/run on a device or emulator.
6. On first launch, paste an API key minted in the web app under developer settings.

## Auth

API-key only, for the prototype. Every request sends `Authorization: Bearer <key>`. The key lives in DataStore on the device.

**Future step**: the real product should use the OIDC mobile login flow rather than asking users to paste a developer key. That is out of scope here and would replace the Setup screen with an OAuth/OIDC redirect and token storage.

## Known limitations

- **Not compiled in this environment.** Treat the first build as a shakedown.
- **API-key auth only.** No OIDC, no session refresh, no key rotation UI.
- **PGP is not handled on mobile.** Encrypted messages show a chip that says to open them on the web. There is no client-side decryption.
- **HTML email rendering** uses a `WebView` with JavaScript disabled, network loads blocked, and remote images off (the server already sanitizes HTML server-side; this is defense in depth). Some complex layouts may render imperfectly versus a desktop client. Plain-text bodies render natively.
- **Attachments** are listed (name + size) but not downloaded; wiring up `GET /api/attachments/:id` is a straightforward next step.
- **Send** posts plain text; rich-text/HTML composition and attachment upload are not implemented.
- The Gradle **wrapper jar** is not included (binary); see "Open and run" above.

## Theme

Plum background (`#1C0F16`), rose primary (`#BF3264`), warm light text, mirroring the web app's plum palette. Dark scheme is the default; a light scheme is provided. Dynamic color (Material You) is supported and can be enabled by passing `dynamicColor = true` to `EstrogenMailTheme` in `MainActivity`.
