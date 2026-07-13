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
CHANGELOG="$REPO_ROOT/CHANGELOG.md"

# Ensure working tree is clean, including untracked files. `git diff` alone
# ignores untracked source/assets that would be omitted from the release commit
# while still being present in a developer's local build.
if [[ -n "$(git -C "$REPO_ROOT" status --porcelain)" ]]; then
  echo "Error: working tree is not clean. Commit or stash changes first."
  exit 1
fi

# Ensure CHANGELOG exists and has a non-empty [Unreleased] section.
# Run /changelog in Claude Code to populate it from the diff since the last tag.
if [[ ! -f "$CHANGELOG" ]]; then
  echo "Error: CHANGELOG.md not found at repo root."
  exit 1
fi
node -e "
const fs = require('fs');
const md = fs.readFileSync('$CHANGELOG', 'utf8');
const m = md.match(/## \[Unreleased\]\s*\n([\s\S]*?)(?=\n## \[)/);
if (!m) { console.error('Error: missing ## [Unreleased] section in CHANGELOG.md'); process.exit(1); }
const body = m[1].trim();
if (!body || /^_Nothing yet\._$/i.test(body)) {
  console.error('Error: ## [Unreleased] is empty. Run /changelog in Claude Code to populate it before releasing.');
  process.exit(1);
}
"

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

# 3. Promote [Unreleased] → [NEW_VERSION] in CHANGELOG.md, refresh compare links.
TODAY=$(date -u +%Y-%m-%d)
node -e "
const fs = require('fs');
const path = '$CHANGELOG';
const current = '$CURRENT_VERSION';
const next = '$NEW_VERSION';
const today = '$TODAY';
const repo = 'https://github.com/apoorvlathey/walletchan';
let md = fs.readFileSync(path, 'utf8');

// Promote Unreleased section
md = md.replace(
  /## \[Unreleased\]\s*\n([\s\S]*?)(?=\n## \[)/,
  (_, body) => \`## [Unreleased]\n\n_Nothing yet._\n\n## [\${next}] - \${today}\n\n\${body.trim()}\n\n\`
);

// Refresh compare links at bottom: replace Unreleased link target + insert new version line.
md = md.replace(
  /^\[Unreleased\]:.*$/m,
  \`[Unreleased]: \${repo}/compare/v\${next}...HEAD\`
);
md = md.replace(
  /^\[Unreleased\]:.*$/m,
  match => \`\${match}\n[\${next}]: \${repo}/compare/v\${current}...v\${next}\`
);

fs.writeFileSync(path, md);
"
echo "Promoted [Unreleased] → [$NEW_VERSION] in CHANGELOG.md"

# 4. Commit from repo root (so git paths resolve correctly)
cd "$REPO_ROOT"
git add apps/extension/package.json apps/extension/public/manifest.json apps/extension/manifest.firefox.json CHANGELOG.md
git commit --no-gpg-sign -m "chore: release v$NEW_VERSION"

# 5. Tag and push
git tag "v$NEW_VERSION"
git push origin master --tags

echo ""
echo "Released v$NEW_VERSION"
echo "GitHub Actions will build and publish the release."
