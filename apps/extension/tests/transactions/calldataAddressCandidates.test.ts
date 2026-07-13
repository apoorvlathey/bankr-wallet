import assert from "node:assert/strict";
import test from "node:test";

import {
  extractCalldataAddressCandidates,
  MAX_CALLDATA_ADDRESS_CANDIDATES,
} from "../../src/chrome/calldataAddressCandidates";

const TOKEN_IN = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
const TOKEN_OUT = "0x1234567890abcdef1234567890abcdef12345678";
const RECIPIENT = "0xc00c45fc5e037d84046d2ae40a6d154e32bd89ce";

function abiAddress(address: string): string {
  return `000000000000000000000000${address.slice(2)}`;
}

test("extracts and deduplicates ABI-padded addresses inside nested calldata", () => {
  const calldata = `0xac9650d8${"00".repeat(64)}${abiAddress(TOKEN_IN)}${abiAddress(TOKEN_OUT)}${abiAddress(RECIPIENT)}${abiAddress(TOKEN_OUT)}` as const;

  assert.deepEqual(
    extractCalldataAddressCandidates(calldata, [RECIPIENT]).map((address) =>
      address.toLowerCase(),
    ),
    [TOKEN_IN, TOKEN_OUT],
  );
});

test("ignores zero address and caps hostile candidate lists", () => {
  const words = Array.from({ length: MAX_CALLDATA_ADDRESS_CANDIDATES + 10 }, (_, index) =>
    abiAddress(`0x${(index + 1).toString(16).padStart(40, "0")}`),
  ).join("");
  const calldata = `0x${abiAddress("0x0000000000000000000000000000000000000000")}${words}` as `0x${string}`;

  assert.equal(
    extractCalldataAddressCandidates(calldata).length,
    MAX_CALLDATA_ADDRESS_CANDIDATES,
  );
});
