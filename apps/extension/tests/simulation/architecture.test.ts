import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const CHROME_ROOT = new URL("../../src/chrome/", import.meta.url);

async function source(path: string): Promise<string> {
  return readFile(new URL(path, CHROME_ROOT), "utf8");
}

test("txSimulation remains the stable coordinator for extracted modules", async () => {
  const coordinator = await source("txSimulation.ts");
  assert.match(coordinator, /from "\.\/simulation\/stateOverrides"/);
  assert.match(coordinator, /from "\.\/simulation\/ethSimulateLogs"/);
  assert.match(coordinator, /from "\.\/simulation\/types"/);
  assert.match(
    coordinator,
    /export type \{[\s\S]*SimulationResult[\s\S]*\} from "\.\/simulation\/types"/,
  );
  assert.doesNotMatch(coordinator, /function safeHexToBigInt/);
  assert.doesNotMatch(coordinator, /const PROXY_SLOTS/);
});

test("focused simulation modules do not depend on coordinator or authority domains", async () => {
  for (const path of [
    "simulation/types.ts",
    "simulation/constants.ts",
    "simulation/stateOverrides.ts",
    "simulation/ethSimulateLogs.ts",
  ]) {
    const moduleSource = await source(path);
    assert.ok(moduleSource.split("\n").length <= 400, `${path} exceeds 400 lines`);
    assert.doesNotMatch(moduleSource, /from ["']\.\.\/txSimulation["']/);
    assert.doesNotMatch(moduleSource, /background|sessionCache|authHandlers/);
    assert.doesNotMatch(moduleSource, /localSigner|walletConnect|bankrApi/);
    assert.doesNotMatch(moduleSource, /chrome\.storage/);
  }
});
