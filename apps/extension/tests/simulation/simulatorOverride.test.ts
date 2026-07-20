import assert from "node:assert/strict";
import test from "node:test";
import { type Address } from "viem";

import { buildIsolatedSimulatorOverride } from "../../src/chrome/simulation/simulatorOverride";
import { SIMULATOR_BYTECODE } from "../../src/chrome/simulation/simulatorContract";

const SENDER: Address = "0x1111111111111111111111111111111111111111";
const ZERO_WORD = `0x${"00".repeat(32)}`;

test("simulator injection replaces contract storage before using slot zero", () => {
  assert.deepEqual(buildIsolatedSimulatorOverride(SENDER, 123n), {
    address: SENDER,
    code: SIMULATOR_BYTECODE,
    balance: 123n,
    state: [{ slot: ZERO_WORD, value: ZERO_WORD }],
  });
});

test("storage isolation is independent of wallet signing capability", () => {
  for (const walletType of [
    "bankr",
    "privateKey",
    "seedPhrase",
    "impersonator",
    "safe",
  ]) {
    const override = buildIsolatedSimulatorOverride(SENDER);
    assert.equal(override.state?.[0]?.value, ZERO_WORD, walletType);
    assert.equal("stateDiff" in override, false, walletType);
  }
});
