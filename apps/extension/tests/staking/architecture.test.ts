import assert from "node:assert/strict";
import test from "node:test";
import {
  getWchanStakingState as facadeRead,
  parseWchanVaultApy as facadeParseApy,
} from "../../src/chrome/staking";
import { getWchanStakingState as domainRead } from "../../src/chrome/staking/contractReads";
import { parseWchanVaultApy as domainParseApy } from "../../src/chrome/staking/vaultMetrics";

test("staking facade preserves the focused read implementation", () => {
  assert.equal(facadeRead, domainRead);
  assert.equal(facadeParseApy, domainParseApy);
});

test("vault APY accepts the website projection and rejects unbounded values", () => {
  assert.deepEqual(facadeParseApy({ totalApy: 12.5, wchanApy: 8, wethApy: 4.5 }), {
    totalApy: 12.5,
    wchanApy: 8,
    wethApy: 4.5,
  });
  assert.throws(
    () => facadeParseApy({ totalApy: Infinity, wchanApy: 8, wethApy: 4.5 }),
    /Vault APY response is invalid/u,
  );
});

test("staking reads reject an invalid owner before RPC resolution", async () => {
  await assert.rejects(
    facadeRead({ owner: "not-an-address" }),
    /valid staking account address/u,
  );
});

test("staking reads reject an unbounded preview before RPC resolution", async () => {
  await assert.rejects(
    facadeRead({
      owner: "0x1111111111111111111111111111111111111111",
      previewAmount: "1".repeat(81),
    }),
    /Invalid staking preview amount/u,
  );
});
