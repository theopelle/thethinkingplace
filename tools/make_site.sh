#!/bin/sh
# Assemble the files the app needs into reflect/site/, ready to upload to any static host
# (for example by dragging the folder onto https://app.netlify.com/drop).
set -e
cd "$(dirname "$0")/.."
rm -rf site && mkdir site
cp index.html style.css app.js sw.js manifest.webmanifest entries.json glossary.json \
   icon.svg icon-180.png icon-192.png icon-512.png site/
echo "site/ ready: $(ls site | wc -l | tr -d ' ') files, $(du -sh site | cut -f1)"
