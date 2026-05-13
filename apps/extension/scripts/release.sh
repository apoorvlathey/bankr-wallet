#!/bin/bash
# Release script for WalletChan extension
# Usage: bash scripts/release.sh <patch|minor|major>
#
# Handles the monorepo correctly: bumps version in package.json,
# syncs to public/manifest.json (Chrome) and manifest.firefox.json (Firefox),
# commits all three files, tags, and pushes.

set -euo pipefail

BUMP_TYPE="${1:-}"
if [[ "$BUMP_TYPE" != "patch" && "$BUMP_TYPE" != "minor" && "$BUMP_TYPE" != "major" ]]; then
  echo "Usage: bash scripts/release.sh <patch|minor|major>"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EXT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$EXT_DIR/../.." && pwd)"

# Ensure working tree is clean
if ! git -C "$REPO_ROOT" diff --quiet || ! git -C "$REPO_ROOT" diff --cached --quiet; then
  echo "Error: working tree is not clean. Commit or stash changes first."
  exit 1
fi

# Read current version
CURRENT_VERSION=$(node -p "require('$EXT_DIR/package.json').version")

# Compute new version
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"
case "$BUMP_TYPE" in
  patch) PATCH=$((PATCH + 1)) ;;
  minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
  major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
esac
NEW_VERSION="$MAJOR.$MINOR.$PATCH"

echo "Bumping version: $CURRENT_VERSION → $NEW_VERSION"

# 1. Update package.json
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('$EXT_DIR/package.json', 'utf8'));
pkg.version = '$NEW_VERSION';
fs.writeFileSync('$EXT_DIR/package.json', JSON.stringify(pkg, null, 2) + '\n');
"

# 2. Sync to manifest.json (Chrome) and manifest.firefox.json (Firefox)
node -e "
const fs = require('fs');
for (const path of ['$EXT_DIR/public/manifest.json', '$EXT_DIR/manifest.firefox.json']) {
  const manifest = JSON.parse(fs.readFileSync(path, 'utf8'));
  manifest.version = '$NEW_VERSION';
  fs.writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n');
}
"

echo "Synced version $NEW_VERSION to manifest.json (Chrome) and manifest.firefox.json (Firefox)"

# 3. Commit from repo root (so git paths resolve correctly)
cd "$REPO_ROOT"
git add apps/extension/package.json apps/extension/public/manifest.json apps/extension/manifest.firefox.json
git commit --no-gpg-sign -m "chore: release v$NEW_VERSION"

# 4. Tag and push
git tag "v$NEW_VERSION"
git push origin master --tags

echo ""
echo "Released v$NEW_VERSION"
echo "GitHub Actions will build and publish the release."
