#!/bin/sh
# Prepare the iPhone app: build the website, copy the app into ios/, and refuse to go on if a
# preview is on (the same check as make_aab.sh).
#   sh tools/make_ios.sh            # then open ios/App/App.xcodeproj in Xcode, or build for
#   sh tools/make_ios.sh --test     # the Simulator; --test allows the previews (test builds only)
# Before each App Store upload, raise MARKETING_VERSION / CURRENT_PROJECT_VERSION in Xcode.
set -e
cd "$(dirname "$0")/.."
sh tools/make_site.sh
if [ "$1" != "--test" ] && { ! grep -q "const QUESTION_PREVIEW = false;" site/app/app.js || ! grep -q "const LIBRARY_PREVIEW = false;" site/app/app.js; }; then
  echo "A preview (monthly questions or the Library) is on: it belongs in test builds only." >&2
  exit 1
fi
npx cap sync ios
echo "ios/ ready: open ios/App/App.xcodeproj in Xcode."
