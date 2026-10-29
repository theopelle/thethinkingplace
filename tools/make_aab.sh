#!/bin/sh
# Build the signed app bundle for Google Play: the-thinking-place.aab in the project folder.
#   sh tools/make_aab.sh
# Needs the upload key and android/keystore.properties (see NEXT_STEPS.md, "Release build").
# Before each new upload, raise versionCode in android/app/build.gradle.
set -e
cd "$(dirname "$0")/.."
if [ ! -f android/keystore.properties ]; then
  echo "android/keystore.properties is missing: create the upload key first (NEXT_STEPS.md, Release build)." >&2
  exit 1
fi
export JAVA_HOME="${JAVA_HOME:-$(ls -d "$HOME"/Library/Java/JavaVirtualMachines/jdk-21*/Contents/Home | head -1)}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
sh tools/make_site.sh
if ! grep -q "const QUESTION_PREVIEW = false;" site/app/app.js; then
  echo "The monthly-question preview is on: it belongs in test APKs only." >&2
  exit 1
fi
npx cap sync android
(cd android && ./gradlew --quiet bundleRelease)
cp android/app/build/outputs/bundle/release/app-release.aab the-thinking-place.aab
echo "the-thinking-place.aab ready: $(du -h the-thinking-place.aab | cut -f1)"
