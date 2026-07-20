import assert from "node:assert/strict";
import test from "node:test";
import {
  isRequestSigningAccount,
  type ProviderRequestAccount,
} from "../../src/chrome/requests/pinnedRequest";
import { isSigningAccount as isWalletConnectSigningAccount } from "../../src/chrome/walletConnect/sessionPolicy";
import {
  isSafeFeatureEnabled,
  requireSafeFeature,
} from "../../src/chrome/safe/featurePolicy";
import type { Account } from "../../src/chrome/types";

const safeAccount: Account = {
  id: "safe-1",
  type: "safe",
  address: "0x1111111111111111111111111111111111111111",
  displayName: "Treasury",
  createdAt: 1,
};

test("Safe is not an EOA/API signing account", () => {
  assert.equal(isRequestSigningAccount(safeAccount), false);
  assert.equal(isWalletConnectSigningAccount(safeAccount), false);
  // @ts-expect-error Safe requests stay out of legacy provider persistence.
  const _providerAccount: ProviderRequestAccount = safeAccount;
  assert.equal(_providerAccount.type, "safe");
});

test("complete Safe rollout enables integrated surfaces and denies v1 exclusions", () => {
  assert.equal(isSafeFeatureEnabled("accountSelection"), true);
  assert.equal(isSafeFeatureEnabled("portfolio"), true);
  assert.equal(isSafeFeatureEnabled("receive"), true);
  assert.equal(isSafeFeatureEnabled("security"), true);

  for (const feature of [
    "proposalInbox",
    "sendProposal",
    "executeProposal",
    "injectedDapp",
    "walletConnect",
    "erc5792",
    "swap",
  ] as const) {
    assert.equal(isSafeFeatureEnabled(feature), true, feature);
    assert.doesNotThrow(() => requireSafeFeature(feature));
  }

  for (const feature of [
    "messageSigning",
    "bridge",
    "shield",
    "delegatedPermissions",
    "sponsoredTransfer",
    "forceInclusion",
  ] as const) {
    assert.equal(isSafeFeatureEnabled(feature), false, feature);
    assert.throws(() => requireSafeFeature(feature));
  }
});
