import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const COMPONENT_ROOT = new URL("../../src/components/", import.meta.url);

async function component(path: string): Promise<string> {
  return readFile(new URL(path, COMPONENT_ROOT), "utf8");
}

test("browser search and transaction progress reuse the Midnight dot pulse", async () => {
  const loader = await component("MidnightDotPulseLoader.tsx");
  const loaderCss = await component("MidnightDotPulseLoader.css");
  const shapes = await component("Chat/ShapesLoader.tsx");
  const suggestions = await component(
    "Dapp3Browser/DappDirectorySuggestions.tsx",
  );

  assert.equal(
    (loader.match(/midnight-dot-pulse-loader__dot/g) ?? []).length,
    3,
  );
  assert.match(shapes, /<MidnightDotPulseLoader size=\{size\}/);
  assert.match(suggestions, /<MidnightDotPulseLoader size="6px"/);
  assert.match(loaderCss, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(suggestions, /search-loading-dot/);
});
