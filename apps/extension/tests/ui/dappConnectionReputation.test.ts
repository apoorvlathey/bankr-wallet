import assert from "node:assert/strict";
import test from "node:test";
import { buildDappReputationPresentation } from "../../src/components/DappConnection/reputationPresentation";

test("renders exact source-aware connection reputation copy", () => {
  assert.deepEqual(
    buildDappReputationPresentation({
      status: "recognized",
      source: "defillama",
      name: "Uniswap",
    }),
    {
      tone: "success",
      title: "Listed on DeFiLlama",
      requiresAcknowledgement: false,
    },
  );
  assert.deepEqual(
    buildDappReputationPresentation({
      status: "danger",
      source: "metamask",
    }),
    {
      tone: "error",
      title: "Reported phishing site",
      description:
        "This domain appears on our phishing blocklist. Connecting may put your assets at risk.",
      requiresAcknowledgement: true,
    },
  );
  assert.match(
    buildDappReputationPresentation({
      status: "unverified",
      reason: "check-unavailable",
    }).title,
    /couldn't verify/u,
  );
});
