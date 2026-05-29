---
description: Unified workflow to build the mobile app locally for iOS, Android, or Both, with automatic version and build-number increments.
---

# Mobile Build Workflow (`/app`)

This workflow guides the process of building the BeanPool mobile app locally for **Android**, **iOS**, or **Both** platforms. It covers strict version/build-number bumping rules, running local EAS builds, and archiving the compiled assets for App Store / Play Store upload.

---

## 📋 Pre-Flight Checklist

Before building, ensure your local development environment has the necessary tooling and credentials configured:

1. **EAS CLI**: Verify EAS CLI is installed:
   ```bash
   npx eas --version
   ```
2. **Apple Developer Account / Android Keystore**:
   - iOS: Local EAS builds require Xcode and will prompt for Apple Developer credentials to fetch/generate provisioning profiles and distribution certificates.
   - Android: Uses local credentials defined in [credentials.json](file:///Users/marty/projects/beanpool/apps/native/credentials.json).

---

## 🎯 Step 1: Choose Your Platform

Determine which platform(s) you are building:
* **`a`**: Android only (generates `.aab`)
* **`i`**: iOS only (generates `.ipa`)
* **`b`**: Both platforms (generates both `.aab` and `.ipa`)

---

## 🔢 Step 2: Version Bumping Protocol

You must increment the version and build numbers inside [app.json](file:///Users/marty/projects/beanpool/apps/native/app.json) **before** starting the build.

### Shared Semantic Version (`expo.version`)
- **Rule**: If this is a new release cycle (or you are building both platforms from scratch), increment the shared semantic version `expo.version` (e.g. `1.1.1` -> `1.1.2`).
- **Exception**: If you have **just** bumped the version for one platform (e.g., you built iOS yesterday, and now you are building Android today to match), keep `expo.version` identical to maintain parity.

### Platform-Specific Build Identifiers (Always Bump!)
Regardless of whether you changed the shared semantic version, **the build number for the platform being built MUST be incremented**.

#### 🤖 For Android (`a` or `b`):
- Open [app.json](file:///Users/marty/projects/beanpool/apps/native/app.json) and locate `expo.android.versionCode`.
- Increment the number by `1` (e.g. `108` -> `109`).
- **Must be a raw integer (not a string)**.

#### 🍎 For iOS (`i` or `b`):
- Open [app.json](file:///Users/marty/projects/beanpool/apps/native/app.json) and locate `expo.ios.buildNumber`.
- Increment the value by `1` (e.g. `"108"` -> `"109"`).
- **Must be a string containing an integer**.

---

## 🔨 Step 3: Run Local Builds

Navigate to the `apps/native/` directory and execute the build command for your chosen option.

### Option A: Android Only (`a`)
Run the local EAS build command:
```bash
npx eas build --platform android --local --profile production
```
*Note: This command runs locally on your machine, using local Android credentials, and generates a `.aab` file in the `apps/native/` directory.*

### Option I: iOS Only (`i`)
Run the local EAS build command:
```bash
npx eas build --platform ios --local --profile production
```
*Note: This command will run Xcode archiving locally on your Mac. Ensure Xcode is fully updated and you are logged into your Apple Developer account.*

### Option B: Both Platforms (`b`)
Run both builds sequentially:
```bash
npx eas build --platform ios --local --profile production && \
npx eas build --platform android --local --profile production
```

---

## 📦 Step 4: Archive and Copy Builds

Once the builds finish successfully, the compiled binaries need to be moved to your local `/Users/marty/Desktop/builds/` directory for Play Store / App Store Connect upload.

### 1. Ensure the builds directory exists:
```bash
mkdir -p /Users/marty/Desktop/builds
```

### 2. Copy the compiled binaries:

#### 🤖 Android (`.aab`):
Locate the newly generated `.aab` file inside `apps/native/` and copy it. To automatically copy the most recent `.aab` file:
```bash
cp $(ls -t apps/native/build-*.aab | head -n 1) /Users/marty/Desktop/builds/
```

#### 🍎 iOS (`.ipa`):
Locate the newly generated `.ipa` file inside `apps/native/` (or the folder shown at the end of the build command) and copy it:
```bash
cp apps/native/*.ipa /Users/marty/Desktop/builds/ 2>/dev/null || cp $(ls -t apps/native/*.ipa | head -n 1) /Users/marty/Desktop/builds/
```

---

## 🚀 Step 5: Verification & Cleanup

1. Verify that the files exist in your local builds directory:
   ```bash
   ls -la /Users/marty/Desktop/builds/
   ```
2. Commit and push the bumped `app.json` file so the version codes are tracked in git:
   ```bash
   git add apps/native/app.json
   git commit -m "chore(mobile): bump build version numbers"
   git push
   ```
