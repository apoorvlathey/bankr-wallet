import assert from "node:assert/strict";
import test from "node:test";

import { existingAddChainNeedsApproval } from "../../src/chrome/provider/contentBridge/accountChainRoutes";

test("only hidden existing chains enter the add-chain approval flow", () => {
  const networksInfo = {
    Visible: { chainId: 1, rpcUrl: "https://visible.example" },
    Hidden: {
      chainId: 84532,
      rpcUrl: "https://hidden.example",
      hidden: true,
    },
  };

  assert.equal(existingAddChainNeedsApproval(1, networksInfo), false);
  assert.equal(existingAddChainNeedsApproval(84532, networksInfo), true);
  assert.equal(existingAddChainNeedsApproval(999999, networksInfo), false);
});
