# Build the Habitracker Android app (APK)

The `android/` project already exists in this folder, the icon and notification sound are already
in it, so you do NOT run `npx cap add android` or any copy-icons script.

## Before you start (once)
1. Install **Node.js 18+** and **Android Studio** (it brings the Android SDK; this project uses compileSdk 34, so let it install SDK 34 when asked) and **JDK 17** (Android Studio's bundled JDK is fine).
2. Make sure the database steps in `MERGE_GUIDE.md` are done (SQL migration + edge functions), otherwise login/backup will fail in the app.

## Build
```bash
npm install
npm run build:android      # builds the web app, syncs to android/, installs the widgets
npm run open:android       # opens the project in Android Studio
```

## In Android Studio
1. Wait for "Gradle sync" to finish (first time takes a few minutes).
2. Bottom-left **Build Variants** panel → set `app` to **directDebug**
   (`direct` = install the APK yourself; `play` = Google Play build).
3. **Build → Build Bundle(s) / APK(s) → Build APK(s)** → click "locate".

APK location:
```
android/app/build/outputs/apk/direct/debug/app-direct-debug.apk
```
Copy it to your phone and open it (allow "Install unknown apps" when asked).

Command-line alternative (no Android Studio window):
```bash
cd android
./gradlew assembleDirectDebug      # Windows: gradlew.bat assembleDirectDebug
```

## Every time you change the app code
Run `npm run build:android` again, then rebuild the APK.

## Sharing with other people / Play Store
A debug APK is fine for your own phone. To give it to others, make a signed one:
Android Studio → **Build → Generate Signed Bundle / APK** → create a keystore and keep it safe
(you need the same keystore for every future update). Raise `versionCode` in
`android/app/build.gradle` for each new release.

## App details
- App ID: com.habitracker.app, Name: Habitracker
- Backend: https://znkapwdqnyviudyxlofx.supabase.co
- Widgets: long-press home screen → Widgets → Habitracker
