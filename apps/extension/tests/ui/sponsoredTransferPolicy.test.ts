import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  isSponsoredBaseUsdcCandidate,
  shouldUseSponsoredTransfer,
  SPONSORED_BASE_USDC_SENDS_ENABLED,
} from "../../src/components/Transfer/model/sponsoredTransferPolicy";
import type { TransferAccountType } from "../../src/components/Transfer/types";

const baseUsdc = {
  chainId: 8453,
  contractAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
};

test("Base USDC sponsorship is disabled for every signing wallet type", () => {
  assert.equal(SPONSORED_BASE_USDC_SENDS_ENABLED, false);
  const isCandidate = isSponsoredBaseUsdcCandidate(baseUsdc);
  assert.equal(isCandidate, false);

  for (const accountType of [
    "bankr",
    "privateKey",
    "seedPhrase",
  ] satisfies TransferAccountType[]) {
    assert.equal(
      shouldUseSponsoredTransfer({
        isCandidate,
        premiumStatus: {
          isPremium: true,
          sponsoredTransfersEnabled: true,
        },
        accountType,
      }),
      false,
      `${accountType} must use the standard ERC-20 path`,
    );
  }
});

test("a disabled sponsored flow falls through to normal transfer intake", async () => {
  const source = await readFile(
    new URL(
      "../../src/components/Transfer/hooks/useTransferSubmission.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const sponsoredBranch = source.indexOf("if (sponsored.isSponsoredFlow)");
  const normalBranch = source.indexOf(
    "await initiateNormalTransfer(isContractDeployment)",
    sponsoredBranch,
  );

  assert.ok(sponsoredBranch >= 0);
  assert.ok(normalBranch > sponsoredBranch);
  assert.match(source, /type: "initiateTransfer"/u);
  assert.match(
    source,
    /buildTransferTx\([\s\S]*?contractAddress: token\.contractAddress/u,
  );
});
