import assert from "node:assert/strict";
import test from "node:test";

import {
  getPreflightTokenMetadata,
  preflightAssetCandidates,
} from "../../src/chrome/erc20CandidatePreflight";

const ACCOUNT = "0x00000000000000000000000000000000000000aa";
const ERC20 = "0x0000000000000000000000000000000000000001";
const NON_TOKEN = "0x0000000000000000000000000000000000000002";
const ERC1155 = "0x0000000000000000000000000000000000000003";
const MULTICALL = "0xca11bde05977b3631167028862be2a173976ca11";

test("preflight keeps asset contracts, filters noise, and caches ERC-20 metadata", async () => {
  const client = {
    async multicall() {
      return [
        { status: "success", result: 10n },
        { status: "success", result: "Bankr" },
        { status: "success", result: "BNKR" },
        { status: "success", result: 18 },
        { status: "success", result: false },
        { status: "failure", error: new Error("not a token") },
        { status: "failure", error: new Error("not a token") },
        { status: "failure", error: new Error("not a token") },
        { status: "failure", error: new Error("not a token") },
        { status: "failure", error: new Error("not a token") },
        { status: "failure", error: new Error("wrong balanceOf overload") },
        { status: "success", result: "Collectible" },
        { status: "success", result: "NFT" },
        { status: "failure", error: new Error("no decimals") },
        { status: "success", result: true },
      ];
    },
  };

  const candidates = await preflightAssetCandidates(
    client as any,
    4663,
    ACCOUNT,
    [ERC20, NON_TOKEN, ERC1155],
    MULTICALL,
  );

  assert.deepEqual(candidates, [ERC20, ERC1155]);
  assert.deepEqual(getPreflightTokenMetadata(4663, ERC20), {
    name: "Bankr",
    symbol: "BNKR",
    decimals: 18,
  });
  assert.equal(getPreflightTokenMetadata(4663, ERC1155), null);
});

test("preflight fails open when Multicall3 is unavailable", async () => {
  const client = { multicall: async () => { throw new Error("unsupported"); } };
  assert.deepEqual(
    await preflightAssetCandidates(
      client as any,
      4663,
      ACCOUNT,
      [ERC20, NON_TOKEN],
      MULTICALL,
    ),
    [ERC20, NON_TOKEN],
  );
});
