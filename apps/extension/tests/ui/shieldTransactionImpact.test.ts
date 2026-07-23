import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { getShieldedReceiveAmountWei } from "../../src/lib/privacyShieldLifecycle";

test("Shield transaction details expose only completed private balance credits", () => {
  assert.equal(
    getShieldedReceiveAmountWei("private_ready", "2255000000000000"),
    "2255000000000000",
  );
  assert.equal(
    getShieldedReceiveAmountWei("asp_approved", "2255000000000000"),
    "2255000000000000",
  );
  assert.equal(
    getShieldedReceiveAmountWei("awaiting_asp", "2255000000000000"),
    null,
  );
  assert.equal(
    getShieldedReceiveAmountWei("ragequit_recovered", "2255000000000000"),
    null,
  );
  assert.equal(getShieldedReceiveAmountWei("private_ready", "0"), null);
  assert.equal(getShieldedReceiveAmountWei("private_ready", "-1"), null);
  assert.equal(getShieldedReceiveAmountWei("private_ready", "1.5"), null);
});

test("Shield transaction impact renders the private credit in the receive group", async () => {
  const [impactSource, cardSource] = await Promise.all([
    readFile(
      new URL(
        "../../src/components/TransactionDetails/TransactionImpact.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../src/components/TransactionDetails/AssetChangesCard.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.match(impactSource, /getShieldedReceiveAmountWei/);
  assert.match(impactSource, /tx\.privacyShieldMeta\.shieldedAmountWei/);
  assert.match(impactSource, /<ShieldedEthReceiveRow/);
  assert.match(impactSource, /SHIELDED_ETH_LOGO_URL/);
  assert.match(impactSource, />\s*Shielded ETH\s*</);
  assert.match(impactSource, /color="chart\.positive"/);
  assert.match(cardSource, /additionalReceive/);
  assert.match(
    cardSource,
    /<DirectionHeader direction="receive" \/>[\s\S]*?\{additionalReceive\}/,
  );
});
