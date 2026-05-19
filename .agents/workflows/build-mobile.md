# Mobile Application Build Protocol

This workflow MUST be followed whenever you are asked to generate a mobile build (Android `.aab` or iOS `.ipa`) for BeanPool.

## 1. Pre-Flight Version Bump
Before kicking off any EAS build, you MUST increment the version and build numbers to prevent upload rejections from the Google Play Console and Apple App Store.

Check and update the following files:

### `apps/native/app.json`
- Increment the `version` (e.g., `"1.0.53"` -> `"1.0.54"`).
- Increment the iOS `buildNumber` (e.g., `"74"` -> `"75"`).
- Increment the Android `versionCode` (e.g., `74` -> `75`).

### `apps/native/package.json`
- Increment the `version` to match `app.json` (e.g., `"1.0.53"` -> `"1.0.54"`).

## 2. Execute the Build
Only after confirming the versions are bumped and synchronized, execute the local production build using the `eas` CLI.

Example for Android:
```bash
export ANDROID_HOME=/Users/marty/Library/Android/sdk && cd apps/native && eas build -p android --profile production --local --output ~/Desktop/Builds/beanpool-v<VERSION>_FINAL.aab
```

Example for iOS:
```bash
cd apps/native && eas build -p ios --profile production --local --output ~/Desktop/Builds/beanpool-v<VERSION>_FINAL.ipa
```

## 3. Monitor and Report
- Output the build artifact directly to the `~/Desktop/Builds/` directory so the user can easily find it.
- Monitor the background build command and notify the user when the artifact is ready for store upload.
