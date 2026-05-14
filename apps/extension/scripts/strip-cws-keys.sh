#!/bin/bash
# Strip `key` from build/manifest.json for Chrome Web Store upload.
# CWS assigns its own extension ID, so `key` must be removed.

MANIFEST="build/manifest.json"

if [ ! -f "$MANIFEST" ]; then
  echo "Error: $MANIFEST not found. Run build first." >&2
  exit 1
fi

node -e "
const fs = require('fs');
const m = JSON.parse(fs.readFileSync('$MANIFEST', 'utf8'));
delete m.key;
fs.writeFileSync('$MANIFEST', JSON.stringify(m, null, 2) + '\n');
console.log('Stripped key from $MANIFEST for CWS upload');
"
