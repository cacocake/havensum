# Building the Havensum Android package (ANDROID-1)

The owner builds and signs Havensum on their own PC (decision A04 in DECISIONS.md). This repository holds the configuration only. The native `android/` project, the upload keystore, its passwords, and every APK/AAB stay out of Git.

| Setting | Value | Where |
| --- | --- | --- |
| Application ID | `com.havensum.app` | `app.json` → `expo.android.package` |
| Version name | `0.1.0` | `app.json` → `expo.version` |
| Version code | `1` | `app.json` → `expo.android.versionCode` |
| Minimum Android | 7.0 (API 24), portrait phones | Expo SDK 54 default (`minSdk 24`) |
| Target / compile SDK | API 36 | Expo SDK 54 default |
| First delivery | Release APK for sideloading (`assembleRelease`) | Play AAB (`bundleRelease`) kept for later |
| Signing | Owner's upload keystore, read from the owner's Gradle properties | `plugins/withHavensumReleaseSigning.cjs` |
| Android Auto Backup | Off (`allowBackup: false`) | `app.json` |

## One-time PC setup

1. Install **Node 24** (the repository requires `>=24.18.0`) and Git.
2. Install **Android Studio**. In *SDK Manager* install *Android SDK Platform 36*, *Android SDK Build-Tools 36.0.0*, *Android SDK Platform-Tools* and *NDK (Side by side) 27.1.12297006*. Accept the licences.
3. Set `ANDROID_HOME` to the SDK folder (shown in SDK Manager). On Windows it is usually `%LOCALAPPDATA%\Android\Sdk`; on macOS `~/Library/Android/sdk`; on Linux `~/Android/Sdk`.
4. Use JDK 17 (React Native's recommendation) or the JDK bundled with Android Studio as `JAVA_HOME`.
5. On Windows, clone the repository to a short path such as `C:\src\havensum`. The native C++ build can exceed Windows' 260-character path limit from a deeply nested folder. Alternatively, enable Windows long paths.

## Create the upload keystore (once, then keep it forever)

The keystore signs every Havensum package. Android installs an update only when it is signed with the same key as the installed app. **If the keystore or its password is lost, the installed app can never be updated**: it would have to be uninstalled, which erases its on-phone data (Auto Backup is off).

Create it **outside the repository**, in a `havensum-signing` folder in your home directory. The first line moves to your home folder (in Windows cmd use `cd %USERPROFILE%`), so the key is never written inside the checkout, where a `git clean` could delete it:

```sh
cd ~
mkdir havensum-signing
cd havensum-signing
keytool -genkeypair -v -storetype PKCS12 -keystore havensum-upload.jks -alias havensum-upload -keyalg RSA -keysize 4096 -validity 10000
```

`keytool` comes with the JDK (`%JAVA_HOME%\bin\keytool` on Windows). Choose a long password made of ASCII letters, digits and simple punctuation. Avoid `\`, accented or other non-ASCII characters, and leading spaces: the Gradle properties file below would read them differently and signing would fail. Back up the `.jks` file **and** the password in two places you control, such as a password manager and an offline copy. Never put either in the repository, chat, or a cloud session.

Then add these four lines to your **user** Gradle properties file, not the project's. On Windows it is `%USERPROFILE%\.gradle\gradle.properties`; on macOS/Linux, `~/.gradle/gradle.properties`. Use an absolute path, with forward slashes on Windows:

```properties
HAVENSUM_UPLOAD_STORE_FILE=C:/Users/you/havensum-signing/havensum-upload.jks
HAVENSUM_UPLOAD_STORE_PASSWORD=your-keystore-password
HAVENSUM_UPLOAD_KEY_ALIAS=havensum-upload
HAVENSUM_UPLOAD_KEY_PASSWORD=your-keystore-password
```

PKCS12 keystores use one password for the store and the key, so both password lines hold the same value.

A release build without all four properties stops with *"Havensum release builds need the owner's upload key"*. It never falls back to the public debug key.

## Build a release APK

From a clean checkout of the commit you want to ship (normally the tip of `develop`):

```sh
git status                      # must be clean; note the commit with: git rev-parse --short HEAD
npm ci
npx expo prebuild --platform android --clean --no-install
git restore package.json        # prebuild rewrites npm scripts; keep the committed ones
```

Then build:

- Windows (PowerShell or cmd): `cd android` then `.\gradlew.bat assembleRelease`
- macOS/Linux: `cd android && ./gradlew assembleRelease`

The APK is written to `android/app/build/outputs/apk/release/app-release.apk`. The first build downloads Gradle and dependencies and takes several minutes.

Check the signature before installing (the build-tools folder is inside the SDK):

```sh
<ANDROID_HOME>/build-tools/36.0.0/apksigner verify --print-certs android/app/build/outputs/apk/release/app-release.apk
```

The printed *SHA-256 digest* must be the same for every Havensum build. Record it (it is public, not a secret).

## Install on a phone

- With USB debugging on: `adb install -r android/app/build/outputs/apk/release/app-release.apk`. `adb` is in `<ANDROID_HOME>/platform-tools`.
- Or copy the APK to the phone and open it. Android asks once to allow installs from that app (the file manager or browser).

Before uninstalling Havensum, or moving to a new phone, export a Havensum backup from the app. Auto Backup is off, so Android will not keep the data for you.

**Do not install a development build on a phone that holds your real data.** `npx expo run:android` (or `gradlew installDebug`) installs a debug build with the same application ID, signed with the public debug key. Android refuses to put one over the other (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`), and the only way out is to uninstall, which erases the ledger. Use development builds only on an emulator or a spare phone.

## Play App Bundle (later)

`.\gradlew.bat bundleRelease` (Windows) or `./gradlew bundleRelease` (macOS/Linux) writes `android/app/build/outputs/bundle/release/app-release.aab`. For Play, the same keystore acts as the **upload key** under Play App Signing. Play publishing is not part of ANDROID-1.

## Version policy

- `expo.android.versionCode` in `app.json` is the single source of the version code. Raise it by exactly 1, in a commit on `develop`, before building any package that will be installed on a phone or uploaded. Never reuse or lower a version code: Android refuses to install a lower one over a higher one.
- `expo.version` is the version name people see. Change it when a release changes what users get (for example `0.1.0` to `0.2.0`). Raising the version name never replaces raising the version code.
- Record every package that leaves the PC in `docs/FEATURE_BACKLOG.md` (ANDROID-1 / ANDROID-2 notes): source commit, version name and code, build type (APK/AAB), build date, and the signing certificate SHA-256.

## What must never be committed

`android/` (regenerated by prebuild), `*.apk`, `*.aab`, `*.jks`, `*.keystore`, and any Gradle properties file containing the signing values. `.gitignore` covers these, but check `git status` before every commit anyway.

## EAS

`eas.json` remains for a possible future switch to Expo's cloud builds. The owner chose local PC builds (A04), so it is unused. It reads the version from `app.json` (`appVersionSource: local`), so both paths share one version policy.

## What this configuration has and has not proven

The cloud session that set this up ran `expo prebuild`. The automated test `tests/androidPackage.test.js` checks the generated application ID, version code, backup and permission settings, and release signing. It could not run Gradle, because that container has no Android SDK and its network blocks Google's Android downloads. The first real `assembleRelease`, the missing-key guard, the installation and every device check therefore happen on the owner's PC and phone (ANDROID-2).
