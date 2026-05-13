#!/bin/bash

# Generate icon sizes from walletchan-icon.png
# Uses sips (macOS built-in) for image resizing

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SOURCE_ICON="$PROJECT_ROOT/public/walletchan-icon.png"
ICONS_DIR="$PROJECT_ROOT/public/icons"

# Icon sizes needed for Chrome extension
SIZES=(16 48 128)

if [ ! -f "$SOURCE_ICON" ]; then
    echo "Error: Source icon not found at $SOURCE_ICON"
    exit 1
fi

mkdir -p "$ICONS_DIR"

for size in "${SIZES[@]}"; do
    output="$ICONS_DIR/icon${size}.png"
    echo "Generating ${size}x${size} icon..."
    sips -z $size $size "$SOURCE_ICON" --out "$output" > /dev/null
done

echo "Done! Icons generated in $ICONS_DIR"
ls -la "$ICONS_DIR"

# Note: the EIP-6963 wallet icon (walletchan-animated.gif) is shipped as a
# static asset in public/ (copied to build/ + build-firefox/ by Vite) and
# served via chrome.runtime.getURL() at runtime — see inject.ts (sets a
# data-attribute on the inpage <script>) and impersonator.ts (reads from
# document.currentScript at module init). We no longer base64-inline the
# GIF into inpage.js because AMO rejects any bundled file larger than 5MB.
