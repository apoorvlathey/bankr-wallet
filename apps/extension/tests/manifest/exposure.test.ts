import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("web-accessible resources expose only the provider and navigable ENS pages", async () => {
  const manifest = JSON.parse(
    await readFile(
      new URL("../../public/manifest.json", import.meta.url),
      "utf8",
    ),
  ) as {
    permissions?: string[];
    web_accessible_resources?: Array<{ resources?: string[] }>;
  };

  assert.ok(manifest.permissions?.includes("favicon"));

  const exposed = new Set(
    (manifest.web_accessible_resources ?? []).flatMap(
      (entry) => entry.resources ?? [],
    ),
  );
  assert.ok(exposed.has("static/js/inpage.js"));
  for (const page of [
    "browse.html",
    "interstitial.html",
    "ens-error.html",
    "setup-kubo.html",
  ]) {
    assert.ok(exposed.has(page));
  }
  for (const script of [
    "static/js/browse.js",
    "static/js/interstitial.js",
    "static/js/ens-error.js",
    "static/js/setup-kubo.js",
  ]) {
    assert.equal(
      exposed.has(script),
      false,
      `${script} loads from an extension page and must not be exposed to sites`,
    );
  }
});
