import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const SIMULATION_ROOT = new URL("../../src/chrome/simulation/", import.meta.url);

async function simulation(path: string): Promise<string> {
  return readFile(new URL(path, SIMULATION_ROOT), "utf8");
}

test("initial and fast-retry simulation paths share token-logo resolution", async () => {
  const fullEnrichment = await simulation("tokenEnrichment.ts");
  const fastRetry = await simulation("metadataRetry.ts");

  assert.match(fullEnrichment, /getCachedTokenLogo\(chainId, address\)/);
  assert.match(fullEnrichment, /const logoUrl = logoUrls\[i\] \|\| undefined/);

  assert.match(fastRetry, /!change\.nft && !change\.logoUrl/);
  assert.match(fastRetry, /getCachedTokenLogo\(chainId, change\.address\)/);
  assert.match(fastRetry, /logoUrl: newLogoUrl/);
});
