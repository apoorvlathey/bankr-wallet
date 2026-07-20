import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  SHIELDED_ETH_CHAIN_ID,
  SHIELDED_ETH_IS_TESTNET,
  SHIELDED_ETH_NETWORK_NAME,
} from "../../src/components/Shield/model/shieldedAsset";

test("direct development imports label Shield as Sepolia testnet ETH", () => {
  assert.equal(SHIELDED_ETH_CHAIN_ID, 11_155_111);
  assert.equal(SHIELDED_ETH_NETWORK_NAME, "Sepolia");
  assert.equal(SHIELDED_ETH_IS_TESTNET, true);
});

test("Shielded ETH row derives network copy and badge visibility from the build profile", async () => {
  const source = await readFile(
    new URL("../../src/components/Portfolio/Holdings/ShieldedEthRow.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /SHIELDED_ETH_IS_TESTNET &&/);
  assert.match(source, /Privacy Pools · \{SHIELDED_ETH_NETWORK_NAME\}/);
  assert.match(source, /Move \$\{SHIELDED_ETH_NETWORK_NAME\} ETH/);
  assert.doesNotMatch(source, /Privacy Pools · Sepolia|Move Sepolia ETH/);
});

test("Shield opens amount entry without a blocking proof-readiness check", async () => {
  const source = await readFile(
    new URL("../../src/components/Shield/ShieldScreen.tsx", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(source, /privacyRunShieldReadinessCheck/);
  assert.doesNotMatch(source, /useShieldReadinessCheck/);
  assert.match(source, /useShieldQuote\(\{ account: sourceAccount, enabled: true \}\)/);
  assert.doesNotMatch(source, /PrivateSendReview|UnshieldAmountPanel|role="tablist"/);
});

test("Private home exposes Shield, Unshield, and Send as separate entry screens", async () => {
  const [actionsSource, routerSource, dashboardSource, withdrawalSource] = await Promise.all([
    readFile(
      new URL("../../src/components/PrivateHomeActions.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../src/components/Shield/PrivacyActionScreen.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../src/components/Shield/ShieldDashboard.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../src/components/Shield/PrivateWithdrawalScreen.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(actionsSource, /id: "shield"[\s\S]*id: "unshield"[\s\S]*id: "send"/);
  assert.match(actionsSource, /HomeUnshieldIcon/);
  assert.match(routerSource, /mode === "shield"/);
  assert.match(routerSource, /<PrivateWithdrawalScreen[\s\S]*intent=\{mode\}/);
  assert.doesNotMatch(dashboardSource, /role="tablist"|onTabChange/);
  assert.match(withdrawalSource, /intent === "unshield" \? account\?\.address/);
});

test("Unshield keeps the inverse asset form and folds public exit into that route", async () => {
  const [amountSource, screenSource, recoverySource] = await Promise.all([
    readFile(
      new URL("../../src/components/Shield/UnshieldAmountPanel.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../src/components/Shield/PrivateWithdrawalScreen.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../src/components/Shield/PublicRecoveryPanel.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(amountSource, /<ShieldSourceCard[\s\S]*?shielded[\s\S]*?<ShieldDirectionMarker[\s\S]*?<ShieldDestinationCard/);
  assert.match(amountSource, /usesPublicExit[\s\S]*?Original deposit account/);
  assert.doesNotMatch(amountSource, /Public exit · links directly to this deposit/);
  assert.doesNotMatch(amountSource, /Nothing ready yet|Still checking/);
  assert.match(screenSource, /publicExitIsPrimary[\s\S]*?Withdraw publicly/);
  assert.match(screenSource, /actionNotice=\{publicExitIsPrimary[\s\S]*?justifyContent="center"[\s\S]*?Recover funds back to original address \(public transaction\)/);
  assert.match(screenSource, /waitingForAsp[\s\S]*?status\.warning\.tint[\s\S]*?Compliance check pending\. You can still recover this deposit to its original account\./);
  assert.match(screenSource, /isDisabled=\{!publicExitAcknowledged \|\| publicRecovery\.status === "queued"\}/);
  assert.match(recoverySource, /borderTopWidth="1px"/);
  assert.doesNotMatch(recoverySource, /borderRadius="lg"/);
});

test("Shield activity refreshes after transaction updates without reopening the screen", async () => {
  const source = await readFile(
    new URL("../../src/components/Shield/hooks/useShieldOperations.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /message\.type !== "txHistoryUpdated"/);
  assert.match(source, /CONFIRMATION_REFRESH_DELAY_MS = 350/);
  assert.match(source, /ACTIVE_SYNC_INTERVAL_MS = 10_000/);
  assert.match(source, /ASP_SYNC_INTERVAL_MS = 120_000/);
  assert.match(source, /await chrome\.runtime\.sendMessage\(\{ type: "privacySyncShield" \}\)/);
});

test("Shield amount tracks slider movement live while quoting only the settled value", async () => {
  const [quoteSource, cardSource] = await Promise.all([
    readFile(
      new URL("../../src/components/Shield/hooks/useShieldQuote.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../src/components/Shield/ShieldAssetCards.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(quoteSource, /status: "loading",\s*quote: current\.quote/);
  assert.match(quoteSource, /status: "failed",\s*quote: current\.quote/);
  assert.match(cardSource, /const \[dragValue, setDragValue\]/);
  assert.match(cardSource, /const displayedAmount = dragValue === null/);
  assert.match(cardSource, /value=\{displayedAmount\}/);
  assert.match(cardSource, /onChangeEnd=\{\(value\) => \{/);
  assert.match(
    cardSource.match(/onChangeEnd=\{\(value\) => \{([\s\S]*?)\n\s*\}\}/)?.[1] ?? "",
    /setPercentage/,
  );
  assert.doesNotMatch(
    cardSource.match(/onChange=\{\(value\) => \{([\s\S]*?)\n\s*\}\}/)?.[1] ?? "",
    /setPercentage/,
  );
});

test("Shield deposit form stays concise and does not repeat the private balance", async () => {
  const [dashboardSource, pickerSource, amountSource, cardsSource] = await Promise.all([
    readFile(
      new URL("../../src/components/Shield/ShieldDashboard.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../src/components/Shield/ShieldSourceAccountPicker.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../src/components/Shield/ShieldAmountPanel.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../src/components/Shield/ShieldAssetCards.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(pickerSource, />\s*Deposit from\s*</);
  assert.doesNotMatch(pickerSource, />\s*Pay with\s*</);
  assert.doesNotMatch(amountSource, /Available after the network-fee reserve/);
  assert.doesNotMatch(dashboardSource, /confirmedBalanceWei|readyBalanceWei|pendingBalanceWei/);
  assert.match(cardsSource, /minH="48px"/);
  assert.doesNotMatch(cardsSource, /minH="58px"/);
});

test("Shield details and Activity use the same durable lifecycle projection", async () => {
  const [statusSource, detailSource, mediaSource] = await Promise.all([
    readFile(
      new URL("../../src/components/TransactionDetails/StatusHeader.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../src/components/TransactionDetails/PrivacyShieldLifecycleSummary.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../src/components/Activity/ActivityMedia.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(statusSource, /getPrivacyShieldActivityState/);
  assert.match(detailSource, /getShieldOperationProgress/);
  assert.match(mediaSource, /<PrivacyShieldIcon/);
  assert.match(mediaSource, /isShieldActivityTransaction\(tx\)/);
});
