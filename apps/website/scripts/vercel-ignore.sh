#!/usr/bin/env bash
# Vercel ignoreCommand. Exit 0 = skip build, exit 1 = build.
# Diff against the previously deployed SHA so multi-commit pushes (e.g.
# website + extension in the same push) don't accidentally skip the website
# build when the latest commit happens to be extension-only.
set +e
cd "$(git rev-parse --show-toplevel)" || exit 1
[ -n "$VERCEL_GIT_PREVIOUS_SHA" ] || exit 1
git fetch origin "$VERCEL_GIT_PREVIOUS_SHA" --depth=1 || exit 1
git diff --quiet "$VERCEL_GIT_PREVIOUS_SHA" HEAD -- \
  apps/website/ \
  packages/shared/ \
  packages/wchan-swap/ \
  packages/contract-addresses/ \
  pnpm-lock.yaml
