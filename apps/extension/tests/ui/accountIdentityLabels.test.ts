import assert from "node:assert/strict";
import test from "node:test";

import type { Account } from "../../src/chrome/types";
import { getAccountSettingsTypeLabel } from "../../src/components/accountIdentityLabels";

test("account settings badges keep every wallet type distinct", () => {
  assert.equal(
    getAccountSettingsTypeLabel({ type: "bankr" } as Account),
    "Bankr",
  );
  assert.equal(
    getAccountSettingsTypeLabel({ type: "privateKey" } as Account),
    "Private Key",
  );
  assert.equal(
    getAccountSettingsTypeLabel({
      type: "seedPhrase",
      derivationIndex: 2,
    } as Account),
    "Seed · #2",
  );
  assert.equal(
    getAccountSettingsTypeLabel({ type: "ledger" } as Account),
    "Ledger",
  );
  assert.equal(
    getAccountSettingsTypeLabel({ type: "impersonator" } as Account),
    "View-Only",
  );
});
