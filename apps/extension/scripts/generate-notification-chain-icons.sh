#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
extension_dir="$(cd "$script_dir/.." && pwd)"
source_dir="$extension_dir/public/chainIcons"
output_dir="$extension_dir/public/notificationChainIcons"

mkdir -p "$output_dir"

if command -v sips >/dev/null 2>&1; then
  rasterize() {
    sips -s format png -z 128 128 "$1" --out "$2" >/dev/null
  }
elif command -v magick >/dev/null 2>&1; then
  rasterize() {
    magick -background none "$1" -resize 128x128! "$2"
  }
elif command -v rsvg-convert >/dev/null 2>&1; then
  rasterize() {
    rsvg-convert --width 128 --height 128 "$1" --output "$2"
  }
else
  echo "Install sips, ImageMagick, or rsvg-convert to generate notification icons." >&2
  exit 1
fi

for source_icon in "$source_dir"/*.svg; do
  icon_name="$(basename "$source_icon" .svg)"
  rasterize "$source_icon" "$output_dir/$icon_name.png"
done

echo "Generated notification-safe chain icons in $output_dir"
