import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const EXTENSION_ROOT = new URL("../../", import.meta.url);

async function source(path: string): Promise<string> {
  return readFile(new URL(path, EXTENSION_ROOT), "utf8");
}

const BANNER_MODULES: Record<string, number> = {
  "src/chrome/ensBrowsing/banner/types.ts": 60,
  "src/chrome/ensBrowsing/banner/pageState.ts": 90,
  "src/chrome/ensBrowsing/banner/transport.ts": 90,
  "src/chrome/ensBrowsing/banner/contentUpdates.ts": 50,
  "src/chrome/ensBrowsing/banner/addressField.ts": 160,
  "src/chrome/ensBrowsing/banner/styles.ts": 170,
  "src/chrome/ensBrowsing/banner/layout.ts": 30,
  "src/chrome/ensBrowsing/banner/view.ts": 150,
  "src/chrome/ensBrowsing/banner/bookmarkActions.ts": 90,
  "src/chrome/ensBrowsing/banner/menuActions.ts": 110,
  "src/chrome/ensBrowsing/banner/controller.ts": 120,
};

test("ENS banner keeps the Vite entrypoint thin and manifest output stable", async () => {
  const entrypoint = await source("src/chrome/ensBanner.ts");
  assert.ok(entrypoint.split("\n").length <= 10);
  assert.match(entrypoint, /from ["']\.\/ensBrowsing\/banner\/controller["']/);
  assert.match(entrypoint, /initializeEnsBanner\(\)/);
  assert.doesNotMatch(entrypoint, /\b(?:chrome|document|location|history)\b/);

  const viteConfig = await source("vite.config.ensBanner.ts");
  assert.match(viteConfig, /src\/chrome\/ensBanner\.ts/);
  assert.match(viteConfig, /entryFileNames: ["']ens-banner\.js["']/);
  const manifest = await source("public/manifest.json");
  assert.match(manifest, /["']?static\/js\/ens-banner\.js["']?/);
});

test("ENS banner modules remain small and cannot import background policy", async () => {
  for (const [path, maximum] of Object.entries(BANNER_MODULES)) {
    const text = await source(path);
    assert.ok(text.split("\n").length <= maximum, path);
    assert.doesNotMatch(
      text,
      /from ["']\.\.\/(?:handlers|messageRoutes|navigation|resolver|nameResolvers|erc4804Resolver)["']/,
      path,
    );
    assert.doesNotMatch(text, /\b(?:eval|Function|fetch)\s*\(/, path);
  }
});

test("page parsing, actions, rendering, and runtime transport stay separated", async () => {
  const parser = await source("src/chrome/ensBrowsing/banner/pageState.ts");
  assert.doesNotMatch(parser, /chrome\.runtime|sendMessage|innerHTML/);

  const controller = await source("src/chrome/ensBrowsing/banner/controller.ts");
  assert.doesNotMatch(controller, /chrome\.runtime|sendMessage|innerHTML/);
  for (const dependency of [
    "addressField",
    "bookmarkActions",
    "contentUpdates",
    "menuActions",
    "pageState",
    "transport",
    "view",
  ]) {
    assert.match(controller, new RegExp(`from ["']\\./${dependency}["']`));
  }

  const menu = await source("src/chrome/ensBrowsing/banner/menuActions.ts");
  assert.doesNotMatch(menu, /chrome\.runtime|sendMessage/);
  assert.match(menu, /openGatewayWithBypass\(url\)/);

  const transport = await source("src/chrome/ensBrowsing/banner/transport.ts");
  const outboundTypes = [...transport.matchAll(/type: ["'](ens-[^"']+)["']/g)]
    .map((match) => match[1])
    .sort();
  assert.deepEqual(outboundTypes, [
    "ens-cache-metadata",
    "ens-get-tab-ctx",
    "ens-get-theme-tokens",
    "ens-open-on-gateway",
  ]);

  const updates = await source("src/chrome/ensBrowsing/banner/contentUpdates.ts");
  assert.match(updates, /record\.type !== ["']ens-content-updated["']/);
  assert.match(updates, /typeof record\.gatewayUrl === ["']string["']/);
});
