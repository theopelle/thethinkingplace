#!/bin/sh
# Build the website into site/ (home page, About, Terms, iPhone guide) with the web app in
# site/app/, ready to upload to any static host. The Android app packages site/app/.
set -e
cd "$(dirname "$0")/.."
python3 tools/make_site.py
