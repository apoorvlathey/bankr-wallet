import assert from "node:assert/strict";
import test from "node:test";

import {
  getChainIdConflict,
  hasChainNameConflict,
} from "../../src/components/Settings/addChainModel";

const networksInfo = {
  "Base Sepolia": {
    chainId: 84532,
    rpcUrl: "https://base-sepolia.drpc.org",
    hidden: true,
  },
  Ethereum: { chainId: 1, rpcUrl: "https://eth.drpc.org" },
};

test("a dapp approval may target its existing hidden chain", () => {
  assert.equal(getChainIdConflict(networksInfo, "84532", 84532), "");
  assert.equal(
    hasChainNameConflict(networksInfo, "Base Sepolia", 84532, 84532),
    false,
  );
});

test("manual additions and edited dapp chain IDs still reject duplicates", () => {
  assert.match(getChainIdConflict(networksInfo, "84532"), /already exists/);
  assert.match(getChainIdConflict(networksInfo, "1", 84532), /already exists/);
  assert.equal(
    hasChainNameConflict(networksInfo, "Base Sepolia", 84532),
    true,
  );
});
