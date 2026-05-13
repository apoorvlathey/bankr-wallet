#!/usr/bin/env node
// Post-build manifest swap for the Firefox build.
//
// Vite copies `public/manifest.json` (the Chrome manifest) into the build
// output. For the Firefox build, this script overwrites the resulting
// `manifest.json` with the Firefox variant kept at
// `apps/extension/manifest.firefox.json` (deliberately stored OUTSIDE
// public/ so it never leaks into the Chrome build).
//
// Invoke with the build directory as the only argument:
//   node scripts/swap-manifest.mjs build-firefox

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cwd, exit } from "node:process";

const buildDir = process.argv[2];
if (!buildDir) {
  console.error("swap-manifest: missing build dir argument");
  exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const extensionRoot = resolve(here, "..");
const firefoxManifest = resolve(extensionRoot, "manifest.firefox.json");
const targetManifest = resolve(cwd(), buildDir, "manifest.json");

if (!existsSync(firefoxManifest)) {
  console.error(`swap-manifest: ${firefoxManifest} not found`);
  exit(1);
}

if (!existsSync(targetManifest)) {
  console.error(`swap-manifest: ${targetManifest} not found (was build run?)`);
  exit(1);
}

writeFileSync(targetManifest, readFileSync(firefoxManifest, "utf8"));
console.log(`swap-manifest: ${buildDir}/manifest.json now = Firefox variant`);
