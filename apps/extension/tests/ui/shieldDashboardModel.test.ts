import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  SHIELDED_ETH_CHAIN_ID,
  SHIELDED_ETH_IS_TESTNET,
  SHIELDED_ETH_NETWORK_NAME,
} from "../../src/components/Shield/model/shieldedAsset";
import { unshieldStatusCopy } from "../../src/components/Shield/model/shieldActivity";

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

test("production-facing Shield surfaces do not pin Sepolia copy or chain IDs", async () => {
  const sources = await Promise.all([
    "../../src/lib/privacyShieldLifecycle.ts",
    "../../src/components/Activity/ActivityList.tsx",
    "../../src/components/Activity/UnshieldActivityItem.tsx",
    "../../src/components/Shield/UnshieldDetailScreen.tsx",
    "../../src/components/Settings/PrivacyRecovery/PrivacyRecoverySettings.tsx",
    "../../src/components/Settings/PrivacyRecovery/RecoveryImportScreen.tsx",
    "../../src/chrome/background/privacyRecoveryRouter.ts",
    "../../src/preview/previewChrome.ts",
    "../../src/preview/completedTransactionFixture.ts",
    "../../src/preview/shieldFixtures.ts",
  ].map((path) => readFile(new URL(path, import.meta.url), "utf8")));
  const source = sources.join("\n");

  assert.doesNotMatch(source, /Sepolia|11_155_111|11155111|sepolia\.etherscan\.io/);
  assert.match(source, /SHIELDED_ETH_NETWORK_NAME/);
  assert.match(source, /SHIELDED_ETH_CHAIN_ID/);
  assert.match(source, /PRIVACY_POOLS_DEPLOYMENT\.chainName/);
});

test("Shield opens amount entry without a blocking proof-readiness check", async () => {
  const [source, unshieldSource] = await Promise.all([
    readFile(
      new URL("../../src/components/Shield/ShieldScreen.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../src/components/Shield/PrivateWithdrawalScreen.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.doesNotMatch(source, /privacyRunShieldReadinessCheck/);
  assert.doesNotMatch(source, /useShieldReadinessCheck/);
  assert.match(
    source,
    /useShieldQuote\(\{[\s\S]*?account: sourceAccount,[\s\S]*?enabled: dashboardInitialization\.status === "ready",[\s\S]*?priceUsd: activity\.series\.priceUsd/,
  );
  assert.match(source, /onUnlockRequired/);
  assert.doesNotMatch(
    source,
    /portfolio\.status === "locked"/,
    "a cold aggregate is not a wallet-auth verdict",
  );
  assert.doesNotMatch(unshieldSource, /portfolio\.status === "locked"/);
  assert.doesNotMatch(source, /UnshieldReview|UnshieldAmountPanel|role="tablist"/);
});

test("Shield activity reads lifecycle broadcasts and continues bounded event backfills", async () => {
  const source = await readFile(
    new URL(
      "../../src/components/Shield/hooks/useShieldOperations.ts",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(
    source,
    /confirmationTimer = setTimeout\([\s\S]*?void load\(\)\.catch[\s\S]*?if \(running\)/,
  );
  assert.match(source, /const PARTIAL_EVENT_SYNC_INTERVAL_MS = 1_000/);
  assert.match(source, /isPartialPrivacyEventSync\(syncResponse\)/);
  assert.match(
    source,
    /nextDelay === null[\s\S]*?PARTIAL_EVENT_SYNC_INTERVAL_MS[\s\S]*?Math\.min\(nextDelay, PARTIAL_EVENT_SYNC_INTERVAL_MS\)/,
  );
});

test("Private home exposes three actions with direct deposits and no Settings duplicate", async () => {
  const [actionsSource, appSource, routerSource, statusSource, dashboardSource, withdrawalSource] = await Promise.all([
    readFile(
      new URL("../../src/components/PrivateHomeActions.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../../src/App.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../../src/components/Shield/PrivacyActionScreen.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../src/components/Shield/PublicRecoveryStatusScreen.tsx", import.meta.url),
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

  assert.match(
    actionsSource,
    /id: "shield"[\s\S]*id: "unshield"[\s\S]*id: "deposits"/,
  );
  assert.doesNotMatch(actionsSource, /id: "send"|HomeSendIcon|onSend|id: "settings"|onSettings/);
  assert.match(actionsSource, /templateColumns="repeat\(3, minmax\(0, 1fr\)\)"/);
  assert.match(
    actionsSource,
    /w=\{\{ base: "100%", sm: "75%" \}\}[\s\S]*maxW="465px"[\s\S]*mx="auto"/,
  );
  assert.match(actionsSource, /HomeUnshieldIcon/);
  assert.match(actionsSource, /id: "deposits", label: "Deposits"/);
  assert.match(actionsSource, /mutedIcon=\{action\.id === "deposits"\}/);
  assert.match(appSource, /onDeposits=\{\(\) => openPrivacyAction\("status"\)\}/);
  assert.doesNotMatch(appSource, /onPrivacySettings=/);
  assert.match(routerSource, /mode === "shield"/);
  assert.match(routerSource, /mode === "status"/);
  assert.match(
    routerSource,
    /export type PrivacyActionMode = "shield" \| "unshield" \| "status"/,
  );
  assert.match(routerSource, /<PublicRecoveryStatusScreen/);
  assert.match(statusSource, /recovery\.inspect\(null\)/);
  assert.match(statusSource, /<PublicRecoveryReviewScreen/);
  assert.match(statusSource, /recovery\.prepare\(signer, previews\)/);
  assert.match(routerSource, /<PrivateWithdrawalScreen/);
  assert.doesNotMatch(routerSource, /intent=\{mode\}|"send"/);
  assert.match(routerSource, /unshieldTarget=\{unshieldTarget\}/);
  assert.doesNotMatch(dashboardSource, /role="tablist"|onTabChange/);
  assert.match(withdrawalSource, /initialRecipient: ""/);
  assert.doesNotMatch(withdrawalSource, /initialRecipient:[^\n]*account\?\.address/);
  assert.match(withdrawalSource, /getUnshieldCopy\(\)/);
  assert.match(withdrawalSource, /initialAmount: getUnshieldPrefillAmount\(unshieldTarget\)/);
  assert.match(withdrawalSource, /preferredOperationId: unshieldTarget\?\.operationId \?\? null/);
  assert.match(withdrawalSource, /isDisabled=\{!canReview\}/);
  assert.doesNotMatch(withdrawalSource, />\s*Shield ETH\s*</);
});

test("Unshield consumes one route copy without stale private-Send language", async () => {
  const [amountSource, reviewSource, hookSource, recoverySource, publicReviewSource] = await Promise.all([
    readFile(
      new URL("../../src/components/Shield/UnshieldAmountPanel.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../src/components/Shield/UnshieldReview.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../src/components/Shield/hooks/useUnshield.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../src/components/Shield/PublicRecoveryPanel.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../src/components/Shield/PublicRecoveryReviewScreen.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(amountSource, /getUnshieldCopy\(\)/);
  assert.match(reviewSource, /getUnshieldCopy\(\)/);
  assert.doesNotMatch(amountSource, /Receive in|Recipient gets/);
  assert.doesNotMatch(reviewSource, /You unshield|You send privately|Recipient gets|Send privately/);
  assert.doesNotMatch(hookSource, /Unshield quote|Unshield didn.t complete/);
  assert.match(recoverySource, /Review exit/);
  assert.match(publicReviewSource, /Withdraw selected deposit/);
  assert.doesNotMatch(recoverySource, /Exit publicly/);
});

test("Unshield separates amount and destination entry from quote review", async () => {
  const [amountSource, screenSource, recoverySource, reviewSource, publicReviewSource, identitySource, methodSource] = await Promise.all([
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
    readFile(
      new URL("../../src/components/Shield/UnshieldReview.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../src/components/Shield/PublicRecoveryReviewScreen.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../src/components/Shield/PublicRecoveryAccountIdentity.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../src/components/Shield/WithdrawalMethodSheet.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(amountSource, /<ShieldSourceCard[\s\S]*?shielded[\s\S]*?<ShieldDirectionMarker[\s\S]*?<RecipientSection/);
  assert.match(amountSource, /label=\{copy\.recipientLabel\}/);
  assert.match(amountSource, /chooserLabel=\{copy\.recipientChooserLabel\}/);
  assert.match(amountSource, /Withdrawal method shown in review/);
  assert.doesNotMatch(amountSource, /ShieldDestinationCard|Relay fee too high|Quoted fee/);
  assert.match(reviewSource, /copy\.sourceAmountLabel/);
  assert.match(reviewSource, /copy\.outcomeAmountLabel/);
  assert.doesNotMatch(reviewSource, /financialImpact=/);
  assert.match(reviewSource, /label="Quoted relay fee"/);
  assert.match(reviewSource, /errorDetail=\{warning/);
  assert.match(reviewSource, /warning \? "status\.error\.fg" : "fg\.secondary"/);
  assert.match(reviewSource, /formatShieldUsdValue\(relayFeeWei, nativePriceUsd\)/);
  assert.match(reviewSource, /label="Withdrawal method"/);
  assert.match(reviewSource, /display="inline-flex"[\s\S]*?alignItems="center"/);
  assert.match(reviewSource, /Receiver pays gas/);
  assert.match(reviewSource, /Private relay/);
  assert.match(methodSource, /title="Withdrawal method"/);
  assert.match(methodSource, /label: "Public withdraw"/);
  assert.match(methodSource, /icon: <RadioTowerIcon \/>/);
  assert.match(methodSource, /icon: <FuelIcon \/>/);
  assert.match(methodSource, /icon: <ShieldOffIcon \/>/);
  assert.match(methodSource, /Ragequit · exits whole deposit/);
  assert.match(methodSource, /Withdrawal · can be partial/);
  assert.match(screenSource, /recipientPublicWithdrawalOffer/);
  assert.match(screenSource, /allowPrivateReady: true/);
  assert.match(screenSource, /publicWithdrawAvailable=\{recipientCanPublicWithdraw\}/);
  assert.match(screenSource, /setReviewRequested\(true\)[\s\S]*?withdrawal\.quote\(\)/);
  assert.match(screenSource, /reviewRequested && !authRequired/);
  assert.match(amountSource, /usesPublicExit[\s\S]*?Original deposit account/);
  assert.doesNotMatch(amountSource, /Public exit · links directly to this deposit/);
  assert.doesNotMatch(amountSource, /Nothing ready yet|Still checking/);
  assert.match(screenSource, /publicExitIsPrimary[\s\S]*?Review public exit/);
  assert.match(
    screenSource,
    /activity\.portfolio\.maxPrivateSendWei === 0n \|\| unshieldTarget/,
  );
  assert.match(screenSource, /publicRecovery\.inspect\(unshieldTarget\?\.operationId \?\? null\)/);
  assert.match(screenSource, /publicRecovery\.previews\.length > 0[\s\S]*?<PublicRecoveryReviewScreen/);
  assert.match(publicReviewSource, /Available deposits/);
  assert.match(publicReviewSource, /groups\.map/);
  assert.match(publicReviewSource, /<Checkbox/);
  assert.equal(
    publicReviewSource.match(/variant="commitment"/g)?.length,
    3,
    "group, deposit, and acknowledgement checkboxes must use the amber commitment state",
  );
  assert.match(publicReviewSource, /Select whole deposits from one account/);
  assert.match(publicReviewSource, /They’ll exit in one public transaction/);
  assert.match(publicReviewSource, /Clear the other account to select/);
  assert.match(publicReviewSource, /I understand this exit is public/);
  assert.match(publicReviewSource, /Withdraw selected deposit/);
  assert.match(identitySource, /<AccountAvatar/);
  assert.match(identitySource, /blo\(address/);
  assert.match(screenSource, /getDisplayName\(depositAccount\)/);
  assert.doesNotMatch(screenSource, /Use deposit account/);
  assert.match(recoverySource, /bg="surface\.sunken"/);
  assert.match(recoverySource, /borderWidth="1px"/);
  assert.doesNotMatch(recoverySource, /ExternalLinkIcon/);
});

test("Unshield distinguishes aggregate ready balance from one-commitment maximum", async () => {
  const amountSource = await readFile(
    new URL("../../src/components/Shield/UnshieldAmountPanel.tsx", import.meta.url),
    "utf8",
  );

  assert.match(amountSource, /Total ready/);
  assert.match(amountSource, /Max per withdrawal/);
  assert.match(amountSource, /\{formatShieldWei\(availableWei\)\} ETH/);
  assert.match(amountSource, /one private commitment at a time/);
  assert.match(amountSource, /withdraw again for the rest/);
  assert.doesNotMatch(amountSource, /withdraw up to .* at a time/);
});

test("over-cap relay quotes integrate the error state and public exit into review decisions", async () => {
  const [
    amountSource,
    reviewSource,
    detailRowSource,
    recoverySource,
    screenSource,
  ] = await Promise.all([
    readFile(
      new URL("../../src/components/Shield/UnshieldAmountPanel.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../src/components/Shield/UnshieldReview.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../src/components/Shield/UnshieldDetailRow.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../src/components/Shield/PublicRecoveryPanel.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../src/components/Shield/PrivateWithdrawalScreen.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.doesNotMatch(amountSource, /Relay fee too high|Quoted fee/);
  assert.match(reviewSource, /label="Quoted relay fee"/);
  assert.match(reviewSource, /Above \$\{SHIELDED_ETH_NETWORK_NAME\}'s/);
  assert.match(reviewSource, /errorDetail=\{warning/);
  assert.doesNotMatch(reviewSource, /warningDetail=\{warning/);
  assert.match(
    detailRowSource,
    /bg=\{errorDetail \? "status\.error\.bg" : undefined\}/,
  );
  assert.match(detailRowSource, /color="status\.error\.fg"/);
  assert.doesNotMatch(detailRowSource, /status\.warning/);
  assert.match(reviewSource, /formatRelayFeePercentage\(warning\.maxFeeBPS\)/);
  assert.match(reviewSource, /formatShieldWei\(relayFeeWei!\)\} ETH \(\{relayFeeUsd/);
  assert.doesNotMatch(reviewSource, /Skip the relay/);
  assert.match(reviewSource, /loadingText="Generating proof…"/);
  assert.match(reviewSource, />\s*Review\s*<\/Button>/);
  assert.doesNotMatch(reviewSource, /advancedDetails=/);
  assert.match(reviewSource, /isQuoting \? \([\s\S]*?<Button variant="brand" isLoading loadingText="Checking relay…"/);
  assert.match(reviewSource, /warning \? \([\s\S]*?<Button variant="brand" onClick=\{controller\.quote\}>[\s\S]*?Check relay again/);
  assert.match(recoverySource, /Public exit available/);
  assert.match(recoverySource, /bg="surface\.sunken"/);
  assert.match(screenSource, /hasReviewPublicExit/);
  assert.match(screenSource, /recoveryPanel=\{hasReviewPublicExit/);
  assert.match(screenSource, /privateRelayUnavailable = withdrawal\.state\.status === "fee-warning"/);
  assert.match(screenSource, /withdrawal\.state\.status === "error" && withdrawal\.state\.operation === null/);
  assert.doesNotMatch(screenSource, /scrollIntoView|didAutoScrollForFeeWarning/);
});

test("Unshield groups an animated quote expiry directly beneath the relay fee", async () => {
  const [reviewSource, expirySource] = await Promise.all([
    readFile(new URL("../../src/components/Shield/UnshieldReview.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/Shield/AnimatedQuoteExpiry.tsx", import.meta.url), "utf8"),
  ]);

  const feeIndex = reviewSource.indexOf('label="Quoted relay fee"');
  const expiryIndex = reviewSource.indexOf('label="Quote expires"');
  const networkIndex = reviewSource.indexOf('label="Network"');

  assert.ok(feeIndex >= 0);
  assert.ok(expiryIndex > feeIndex);
  assert.ok(networkIndex > expiryIndex);
  assert.match(reviewSource, /<AnimatedQuoteExpiry milliseconds=\{operation\.expiresAt - now\} \/>/);
  assert.match(expirySource, /import NumberFlow, \{ NumberFlowGroup \}/);
  assert.match(expirySource, /trend: -1 as const/);
  assert.match(expirySource, /minimumIntegerDigits: 2/);
  assert.match(expirySource, /role="timer" aria-label=\{label\} aria-live="off"/);
});

test("Unshield automatically refreshes each expired relay quote once", async () => {
  const [reviewSource, refreshHookSource] = await Promise.all([
    readFile(new URL("../../src/components/Shield/UnshieldReview.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/Shield/hooks/useAutoRefreshUnshieldQuote.ts", import.meta.url), "utf8"),
  ]);

  assert.match(reviewSource, /useAutoRefreshUnshieldQuote\(\{/);
  assert.match(reviewSource, /enabled: method === "relay" && controller\.state\.status === "quoted"/);
  assert.match(refreshHookSource, /const refreshedQuoteKeyRef = useRef<string \| null>\(null\)/);
  assert.match(refreshHookSource, /const quoteKey = `\$\{operation\.id\}:\$\{operation\.expiresAt\}`/);
  assert.match(refreshHookSource, /window\.setTimeout\(refreshExpiredQuote, millisecondsUntilExpiry\)/);
  assert.match(refreshHookSource, /void refreshQuote\(\)/);
  assert.match(reviewSource, /loadingText="Refreshing quote…"/);
  assert.doesNotMatch(reviewSource, />\s*Refresh quote\s*</);
});

test("relayed Unshield submission opens Private Activity without a terminal Done state", async () => {
  const [hookSource, operationsSource, reviewSource, screenSource, appSource] = await Promise.all([
    readFile(new URL("../../src/components/Shield/hooks/useUnshield.ts", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/Shield/hooks/useShieldOperations.ts", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/Shield/UnshieldReview.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/Shield/PrivateWithdrawalScreen.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/App.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(hookSource, /setState\(\{ status: "submitted", operation, error: null \}\);[\s\S]*?onSubmitted\?\.\(operation\)/);
  assert.match(screenSource, /recordWithdrawal\(operation\)[\s\S]*?onUnshieldSubmitted\?\.\(operation\)/);
  assert.match(screenSource, /onSubmitted: handleUnshieldSubmitted/);
  assert.match(operationsSource, /recordWithdrawal[\s\S]*?writeRendererMemoryCache/);
  assert.match(operationsSource, /nextSyncDelay\(snapshot\.operations, snapshot\.withdrawals\)/);
  assert.match(appSource, /onUnshieldSubmitted=\{\(\) => \{[\s\S]*?openPrivateActivity\(\);[\s\S]*?setView\("main"\)/);
  assert.doesNotMatch(reviewSource, /onClick=\{onBack\}>Done/);
  assert.match(reviewSource, /loadingText="Opening activity…"/);
});

test("receiver-paid Unshield enters Private Activity and keeps the normal transaction lifecycle", async () => {
  const [
    directHookSource,
    operationsSource,
    screenSource,
    activitySource,
    itemSource,
  ] = await Promise.all([
    readFile(new URL("../../src/components/Shield/hooks/useDirectUnshield.ts", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/Shield/hooks/useShieldOperations.ts", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/Shield/PrivateWithdrawalScreen.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/Activity/ActivityList.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/Activity/UnshieldActivityItem.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(directHookSource, /setState\(\{ status: "queued", operation, error: null \}\);[\s\S]*?onQueued\?\.\(operation\)/);
  assert.match(screenSource, /onQueued: recordWithdrawal/);
  assert.match(activitySource, /"awaiting_wallet_confirmation"/);
  assert.match(
    activitySource,
    /isTransactionVisibleInActivityScope\(tx, scope\)/,
  );
  assert.match(operationsSource, /operation\.state === "awaiting_wallet_confirmation"/);
  assert.match(activitySource, /addressLabels=\{addressLabels\}/);
  assert.match(itemSource, /getLiveActivityAddressLabel\(operation\.recipient, addressLabels\)/);
  assert.match(itemSource, /SHIELDED_ETH_EXPLORER_URL/);
  assert.equal(
    unshieldStatusCopy("awaiting_wallet_confirmation", "direct"),
    "Waiting for wallet confirmation",
  );
  assert.equal(unshieldStatusCopy("submission_unknown", "direct"), "Processing");
  assert.equal(unshieldStatusCopy("submitted", "direct"), `Confirming on ${SHIELDED_ETH_NETWORK_NAME}`);
  assert.equal(
    unshieldStatusCopy("failed_recoverable", "direct", "submission-failed"),
    "Transaction was not submitted",
  );
});

test("Unshield activity opens a live full-screen transaction detail route", async () => {
  const [activitySource, privateHomeSource, detailSource, transferSource, routeSource, appSource] = await Promise.all([
    readFile(new URL("../../src/components/Activity/ActivityList.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/app/home/PrivatePortfolioHome.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/Shield/UnshieldDetailScreen.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/Shield/UnshieldTransferSummary.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/app/screens/TransactionDetailRoute.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/App.tsx", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(activitySource, /UnshieldDetailModal|selectedUnshield/);
  assert.match(activitySource, /onSelectUnshield\?\.\(entry\.operation\)/);
  assert.match(privateHomeSource, /onSelectUnshield=\{onUnshieldTransactionClick\}/);
  assert.match(detailSource, /presentation="screen"/);
  assert.match(detailSource, /title="Transaction details"/);
  assert.match(detailSource, /useShieldOperations\(\)/);
  assert.match(detailSource, /<RequestIdentity/);
  assert.match(detailSource, /title="Balance changes"/);
  assert.match(detailSource, /<UnshieldTransferSummary/);
  assert.match(detailSource, /nativePriceUsd=\{series\.priceUsd\}/);
  assert.match(detailSource, /title="Transaction summary"/);
  assert.match(detailSource, /label="Relay fee"/);
  assert.doesNotMatch(detailSource, /label="Recipient receives"/);
  assert.doesNotMatch(detailSource, /presentation="modal"|<Modal/);
  assert.match(transferSource, /From private balance/);
  assert.match(transferSource, /Receiver gets/);
  assert.match(transferSource, /To address/);
  assert.match(transferSource, /address=\{operation\.recipient\}/);
  assert.doesNotMatch(
    transferSource,
    />\s*\{operation\.recipient\}\s*<\/Text>/,
    "the address popover remains the single destination disclosure",
  );
  assert.match(transferSource, /const valueUsd = formatShieldUsdValue\(amountWei, nativePriceUsd\)/);
  assert.equal(
    transferSource.match(/<TransferAmount/g)?.length,
    2,
    "both the private debit and recipient credit must show ETH and USD",
  );
  assert.match(transferSource, /tone="chart\.negative"/);
  assert.match(transferSource, /tone="chart\.positive"/);
  assert.match(appSource, /view === "txDetail" && \(selectedUnshieldOperation \|\| selectedCompletedTx\)/);
  assert.match(routeSource, /unshieldOperation \? \([\s\S]*?<UnshieldDetailScreen/);
});

test("completed Unshield operations use the standard confirmed status", () => {
  assert.equal(unshieldStatusCopy("private_balance_updated"), "Confirmed");
});

test("Unshield shows renderer-only USD equivalents on entry and review", async () => {
  const [amountSource, reviewSource, cardSource, screenSource] = await Promise.all([
    readFile(new URL("../../src/components/Shield/UnshieldAmountPanel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/Shield/UnshieldReview.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/Shield/ShieldAssetCards.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/Shield/PrivateWithdrawalScreen.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(amountSource, /formatShieldUsdValue\(inputAmountWei, nativePriceUsd\)/);
  assert.match(amountSource, /conversionLabel=\{inputAmountUsd\}/);
  assert.match(cardSource, /<ShieldAmountConversion/);
  assert.match(reviewSource, /sourceAmountUsd/);
  assert.match(reviewSource, /recipientAmountUsd/);
  assert.match(screenSource, /nativePriceUsd=\{activity\.series\.priceUsd\}/);
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
  const [dashboardSource, pickerSource, amountSource, cardsSource, conversionSource] = await Promise.all([
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
    readFile(
      new URL("../../src/components/Shield/ShieldAmountConversion.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(pickerSource, />\s*Deposit from\s*</);
  assert.doesNotMatch(pickerSource, />\s*Pay with\s*</);
  assert.doesNotMatch(pickerSource, /SHIELDED_ETH_NETWORK_NAME|Ethereum|Sepolia/);
  assert.doesNotMatch(amountSource, /Available after the network-fee reserve/);
  assert.doesNotMatch(amountSource, /Net of the/);
  assert.match(amountSource, /% protocol fee/);
  assert.doesNotMatch(dashboardSource, /confirmedBalanceWei|readyBalanceWei|pendingBalanceWei/);
  assert.match(cardsSource, /minH="48px"/);
  assert.doesNotMatch(cardsSource, /minH="58px"/);
  assert.match(amountSource, /errorPlacement="external"/);
  assert.match(amountSource, /amountWei=\{quote\.inputAmountWei \?\? 0n\}/);
  assert.doesNotMatch(amountSource, /amountWei=\{quote\.validation\.amountWei/);
  assert.match(amountSource, /scrollIntoView\(\{ block: "nearest" \}\)/);
  assert.match(amountSource, /onToggleAmountMode=\{quote\.hasPrice \? quote\.toggleAmountMode : undefined\}/);
  assert.match(conversionSource, /Enter amount in USD/);
  assert.match(conversionSource, /InputRightElement/);
  assert.match(cardsSource, /import LoadingDots from "@\/components\/LoadingDots"/);
  assert.match(cardsSource, /isLoading \? \([\s\S]*?<LoadingDots \/>/);
  assert.match(amountSource, /isLoading=\{quote\.state\.status === "loading"\}/);
  assert.doesNotMatch(amountSource, /Updating quote|<Spinner/);
  const routeMetadataIndex = amountSource.indexOf("Privacy Pools ·");
  const externalErrorIndex = amountSource.indexOf('id={errorId}');
  assert.ok(routeMetadataIndex >= 0);
  assert.ok(externalErrorIndex > routeMetadataIndex);
});

test("Shield review presents the chosen amount and total wallet debit without a redundant fee row", async () => {
  const [source, reviewHook, operationHook, complianceInfo] = await Promise.all([
    readFile(
      new URL(
        "../../src/components/TransactionConfirmation/TransactionSummary.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../src/components/Shield/hooks/useShieldReview.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../src/components/Shield/hooks/useShieldOperation.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../src/components/Shield/ShieldComplianceInfoPopover.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.match(source, /Total from \{SHIELDED_ETH_NETWORK_NAME\} wallet/);
  assert.match(source, />Amount to shield</);
  assert.doesNotMatch(source, /Protocol fee|added on top/);
  assert.match(source, /privacyShieldNetAmountWei\(amountWei, feeBPS\)/);
  assert.match(source, />Est\. time</);
  assert.match(source, />1 hr</);
  assert.match(source, /<ShieldComplianceInfoPopover/);
  assert.match(source, /<InfoOutlineIcon/);
  assert.match(
    complianceInfo,
    /Checks usually finish within 1 hour, but some can take longer\./,
  );
  assert.match(complianceInfo, /You can exit anytime\./);
  assert.match(complianceInfo, /privacy-pools-logo\.svg/);
  assert.match(
    reviewHook,
    /grossAmountWei: quote\.state\.quote\.amountWei\.toString\(\)/,
  );
  assert.match(
    operationHook,
    /grossAmountWei: quote\.state\.quote\.amountWei\.toString\(\)/,
  );
});

test("Shield details and Activity use elapsed compliance progress without step copy", async () => {
  const [
    statusSource,
    detailSource,
    itemSource,
    mediaSource,
    progressSource,
    elapsedSource,
    pendingActionSource,
    detailSectionSource,
    controllerSource,
    screenSource,
    appSource,
  ] = await Promise.all([
    readFile(
      new URL("../../src/components/TransactionDetails/StatusHeader.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../src/components/TransactionDetails/PrivacyShieldLifecycleSummary.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../src/components/Activity/ActivityItem.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../src/components/Activity/ActivityMedia.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../src/components/Shield/ShieldComplianceProgress.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../src/components/Shield/ShieldComplianceElapsedTime.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../../src/components/TransactionDetails/PrivacyShieldPendingAction.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../src/components/TransactionDetails/PrivacyShieldDetailSection.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../src/components/TransactionDetails/TxDetailController.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../src/components/TransactionDetails/TxDetailScreen.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("../../src/App.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(statusSource, /getPrivacyShieldActivityState/);
  assert.match(statusSource, /getPrivacyTransactionIdentity/);
  assert.match(statusSource, /<PrivacyShieldIcon/);
  assert.match(statusSource, /labelOverride=\{privacyIdentity\?\.label\}/);
  assert.match(statusSource, /Compliance check/);
  assert.match(statusSource, /<ShieldComplianceInfoPopover/);
  assert.match(detailSource, /getShieldOperationProgress/);
  assert.match(detailSource, /<ShieldComplianceProgress/);
  assert.match(detailSource, /<ShieldComplianceInfoPopover/);
  assert.match(detailSource, /<PrivacyPoolsLogo/);
  assert.match(detailSource, /\? "Privacy Pools" : "Shield status"/);
  assert.match(detailSource, /available to Unshield or Send\./);
  assert.match(detailSource, /<ShieldComplianceElapsedTime/);
  assert.doesNotMatch(detailSource, /SimpleGrid|SHIELD_PROGRESS_STEPS|Step \$\{/);
  assert.match(
    itemSource,
    /compliancePending \? \([\s\S]*?<ActivityStatus[\s\S]*?\) : \(/,
  );
  assert.match(itemSource, /<ShieldComplianceProgress/);
  assert.match(progressSource, /getShieldComplianceProgressPercent/);
  assert.match(progressSource, /15_000/);
  assert.match(elapsedSource, /NumberFlow/);
  assert.match(elapsedSource, /NumberFlowGroup/);
  assert.match(mediaSource, /<PrivacyShieldIcon/);
  assert.match(mediaSource, /isShieldActivityTransaction\(tx\)/);
  assert.match(pendingActionSource, /Cancel Shielding and Withdraw\?/);
  assert.match(
    detailSectionSource,
    /onUnshield && isPrivacyShieldPublicRecoveryAvailable\(meta\.state\)/,
  );
  assert.match(controllerSource, /<PrivacyShieldDetailSection/);
  assert.match(screenSource, /onUnshield=\{onUnshield\}/);
  assert.match(appSource, /openPrivacyAction\("unshield"\)/);
  assert.match(
    appSource,
    /openPrivacyAction\("unshield", selectedCompletedTx\?\.privacyShieldMeta \?\? null\)/,
  );
});
