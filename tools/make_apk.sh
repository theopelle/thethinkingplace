#!/bin/sh
# Build the Android app as an installable APK: the-thinking-place.apk in the project folder.
#   sh tools/make_apk.sh
# Needs Node (for Capacitor), Java 21 and the Android SDK (see NEXT_STEPS.md).
set -e
cd "$(dirname "$0")/.."
export JAVA_HOME="${JAVA_HOME:-$(ls -d "$HOME"/Library/Java/JavaVirtualMachines/jdk-21*/Contents/Home | head -1)}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
sh tools/make_site.sh
# Test APKs only: show draft monthly questions (and the next one on Today at once) and draft
# Library pages. Never in the Play bundle (make_aab.sh checks).
sed -i '' -e 's/const QUESTION_PREVIEW = false;/const QUESTION_PREVIEW = true;/' -e 's/const LIBRARY_PREVIEW = false;/const LIBRARY_PREVIEW = true;/' site/app/app.js
grep -q "const QUESTION_PREVIEW = true;" site/app/app.js
grep -q "const LIBRARY_PREVIEW = true;" site/app/app.js
npx cap sync android
(cd android && ./gradlew --quiet assembleDebug)
cp android/app/build/outputs/apk/debug/app-debug.apk the-thinking-place.apk
echo "the-thinking-place.apk ready: $(du -h the-thinking-place.apk | cut -f1)"
