# Attendance Mobile App

This is the React Native (Bare CLI) client for the Attendance platform.

## Features (Phase 1)
- Custom authentication (bcrypt + session tokens)
- Keychain-backed secure storage
- Session validation on startup
- Navigation stack with Login, Reset Password, and Home placeholders

## Prerequisites
- Node.js
- React Native environment (Android Studio / Xcode)
- Connected device or emulator

## Running the App
1. Install dependencies: `npm install`
2. Start the bundler: `npm start`
3. Run on Android: `npm run android`
4. Run on iOS: `npm run ios` (Make sure to run `cd ios && pod install` first)

## Environment
The app uses `.env` for Supabase credentials. Make sure `SUPABASE_URL` and `SUPABASE_ANON_KEY` match your platform instance.

## Local testing without Android Studio

You do not need the full Android Studio IDE installed to test the app locally on a physical device. You only need the Android platform-tools (`adb`). 

**Setup (`adb` only):**
On Ubuntu, you can install just the ADB tools via:
```bash
sudo apt-get install android-tools-adb
```

**Steps to run locally:**
1. Download the latest `app-debug-<sha>` artifact ZIP from the **GitHub Actions** tab and extract `app-debug.apk`.
2. Connect your Android phone via USB (Ensure **Developer Options** and **USB Debugging** are enabled on your device).
3. Install the APK via adb:
   ```bash
   adb install app-debug.apk
   ```
4. Reverse the Metro bundler port so your phone can communicate with your local machine:
   ```bash
   adb reverse tcp:8081 tcp:8081
   ```
5. Start the local Metro bundler:
   ```bash
   npm start
   ```
6. Open the newly installed app on your phone. 

JavaScript and React code changes will now hot-reload instantly. You will only need to download and install a fresh APK from Actions if you install a new package with native code dependencies.
