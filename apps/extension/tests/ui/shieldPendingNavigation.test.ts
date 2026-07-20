import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import type { PendingTxRequest } from "../../src/chrome/requests/pendingTxStorage";
import { PRIVACY_POOLS_DEPLOYMENT } from "../../src/chrome/privacy/deployment/manifest";
import { findPendingShieldConfirmation } from "../../src/components/Shield/model/pendingShield";

function pending(
  id: string,
  accountType: "bankr" | "privateKey" | "seedPhrase" | "impersonator",
  privacy = true,
): PendingTxRequest {
  return {
    id,
    tx: {
      from: "0x1111111111111111111111111111111111111111",
      to: PRIVACY_POOLS_DEPLOYMENT.contracts.entrypointProxy.address,
      value: "0x1",
      data: "0x",
      chainId: PRIVACY_POOLS_DEPLOYMENT.chainId,
    },
    origin: "WalletChan Shield",
    favicon: null,
    chainName: "Ethereum",
    timestamp: 1,
    accountId: `${accountType}-1`,
    accountAddress: "0x1111111111111111111111111111111111111111",
    accountType,
    trustedInternal: true,
    ...(privacy
      ? { privacyShieldMeta: { version: 1 as const, operationId: id } }
      : {}),
  };
}

test("Shield entry resumes the newest exact pending confirmation for every signing wallet type", () => {
  for (const [index, type] of (["bankr", "privateKey", "seedPhrase"] as const).entries()) {
    const suffix = (index + 1).toString().padStart(12, "0");
    const older = pending(`00000000-0000-4000-8000-${suffix}`, type);
    const newer = pending(`10000000-0000-4000-8000-${suffix}`, type);
    assert.equal(
      findPendingShieldConfirmation([older, pending("ordinary", type, false), newer]),
      newer,
    );
  }
});

test("Shield entry rejects malformed, untrusted, and view-only pending records", () => {
  const malformed = pending("00000000-0000-4000-8000-000000000001", "privateKey");
  malformed.privacyShieldMeta = { version: 1, operationId: "different" };
  const untrusted = pending("00000000-0000-4000-8000-000000000002", "seedPhrase");
  delete untrusted.trustedInternal;
  const viewOnly = pending("00000000-0000-4000-8000-000000000003", "impersonator");
  const wrongProfile = pending("00000000-0000-4000-8000-000000000004", "bankr");
  wrongProfile.tx.chainId = PRIVACY_POOLS_DEPLOYMENT.chainId + 1;
  assert.equal(
    findPendingShieldConfirmation([malformed, untrusted, viewOnly, wrongProfile]),
    null,
  );
});

test("the app reopens a pending Shield confirmation before mounting the amount screen", async () => {
  const source = await readFile(
    new URL("../../src/App.tsx", import.meta.url),
    "utf8",
  );
  const entry = source.match(
    /const openPrivacyAction = \(mode:[\s\S]*?\n\s*};/,
  )?.[0] ?? "";
  assert.match(entry, /findPendingShieldConfirmation\(pendingRequests\)/);
  assert.match(entry, /setSelectedTxRequest\(pendingShield\)/);
  assert.match(entry, /setView\("txConfirm"\)/);
  assert.ok(
    entry.indexOf('setView("txConfirm")') < entry.indexOf('setView("shield")'),
  );
  assert.match(
    source,
    /newPendingTxRequest[\s\S]*?setPendingRequests\(\(current\) => current\.some/,
  );
});
