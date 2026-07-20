import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { SafeProposalRecord } from "../../src/chrome/safe/types";
import {
  formatSafeProposalOrigin,
  getSafeProposalRequestOrigin,
} from "../../src/components/SafeApprovals/safeProposalActivityModel";
import { getSafeProposalPresentation } from "../../src/components/SafeApprovals/safeProposalPresentation";
import { sortSafeProposalsByNonceDescending } from "../../src/components/SafeApprovals/safeProposalOrdering";
import { getSafeProposalBlockingNonce } from "../../src/components/SafeApprovals/safeProposalSequence";
import { formatPendingUnlockRequestLabel } from "../../src/components/pendingUnlockRequestLabel";
import {
  canRejectSafeProposal,
  didSafeProposalExecutionConfirm,
  getAvailableSafeOwnerAccounts,
  getDefaultSafeExecutorAccountId,
  getSafeExecutorAccounts,
  getSafeProposalActionKind,
  getSafeProposalDisplayActionKind,
  hasSafeProposalSignatures,
} from "../../src/components/SafeApprovals/safeProposalActionModel";
import type { SafeChainSnapshot } from "../../src/chrome/safe/types";
import type { Account } from "../../src/chrome/types";

const safeActionsUrl = new URL(
  "../../src/components/SafeAccount/SafeQuickActions.tsx",
  import.meta.url,
);
const safeAlertUrl = new URL(
  "../../src/components/SafeAccount/SafeHomeAlert.tsx",
  import.meta.url,
);
const safeRequestsUrl = new URL(
  "../../src/components/SafeApprovals/SafeApprovalsScreen.tsx",
  import.meta.url,
);
const safeRequestRowUrl = new URL(
  "../../src/components/SafeApprovals/SafeProposalRow.tsx",
  import.meta.url,
);
const safeActivityUrl = new URL(
  "../../src/components/SafeApprovals/SafeProposalActivity.tsx",
  import.meta.url,
);
const safeActivityRowUrl = new URL(
  "../../src/components/SafeApprovals/SafeProposalActivityRow.tsx",
  import.meta.url,
);
const activityListUrl = new URL(
  "../../src/components/Activity/ActivityList.tsx",
  import.meta.url,
);
const activityStatusUrl = new URL(
  "../../src/components/Activity/ActivityStatus.tsx",
  import.meta.url,
);
const safeConfirmationUrl = new URL(
  "../../src/components/SafeApprovals/SafeProposalConfirmation.tsx",
  import.meta.url,
);
const safeActionsHookUrl = new URL(
  "../../src/components/SafeApprovals/hooks/useSafeProposalActions.ts",
  import.meta.url,
);
const safeAppSurfacesUrl = new URL(
  "../../src/app/SafeAppSurfaces.tsx",
  import.meta.url,
);
const appUrl = new URL("../../src/App.tsx", import.meta.url);
const safeDecisionSummaryUrl = new URL(
  "../../src/components/SafeApprovals/SafeProposalDecisionSummary.tsx",
  import.meta.url,
);
const safeRequestDetailsUrl = new URL(
  "../../src/components/SafeApprovals/SafeProposalRequestDetails.tsx",
  import.meta.url,
);
const safeFinancialImpactUrl = new URL(
  "../../src/components/SafeApprovals/SafeProposalFinancialImpact.tsx",
  import.meta.url,
);
const safeAdvancedDetailsUrl = new URL(
  "../../src/components/SafeApprovals/SafeProposalAdvancedDetails.tsx",
  import.meta.url,
);
const safeNonceEditorUrl = new URL(
  "../../src/components/SafeApprovals/SafeProposalNonceEditor.tsx",
  import.meta.url,
);
const confirmationScreenUrl = new URL(
  "../../src/components/ui/ConfirmationScreen.tsx",
  import.meta.url,
);
const pendingTxStorageUrl = new URL(
  "../../src/chrome/requests/pendingTxStorage.ts",
  import.meta.url,
);

function safeProposal(): SafeProposalRecord {
  return {
    version: 1,
    id: "request-1",
    chainId: 8453,
    safeAccountId: "safe-1",
    safeAddress: "0x3a11e7c2ccd1af51c1edd664800af20d21ee5d34",
    safeTxHash: `0x${"ab".repeat(32)}`,
    safeVersion: "1.4.1",
    safeConfigEpoch: "epoch-1",
    verifiedAtBlock: "1",
    calls: [{
      to: "0xb06a64615842cba9b3bdb7e6f726f3a5bd20dac2",
      value: "1000000000000000",
      data: "0x",
      operation: 0,
    }],
    transaction: {
      to: "0xb06a64615842cba9b3bdb7e6f726f3a5bd20dac2",
      value: "1000000000000000",
      data: "0x",
      operation: 0,
      safeTxGas: "0",
      baseGas: "0",
      gasPrice: "0",
      gasToken: "0x0000000000000000000000000000000000000000",
      refundReceiver: "0x0000000000000000000000000000000000000000",
      nonce: 2,
    },
    state: "readyToExecute",
    confirmations: [{
      ownerAddress: "0xb06a64615842cba9b3bdb7e6f726f3a5bd20dac2",
      signature: `0x${"cd".repeat(65)}`,
      createdAt: 1_000,
    }],
    route: {
      kind: "wallet",
      origin: JSON.stringify({ url: "https://app.safe.global/", name: "" }),
    },
    createdAt: 1_000,
    updatedAt: 2_000,
  };
}

function safeSnapshot(): SafeChainSnapshot {
  return {
    chainId: 8453,
    verifiedAtBlock: "1",
    configEpoch: "epoch-1",
    singleton: "0x1111111111111111111111111111111111111111",
    version: "1.4.1",
    owners: [
      "0xb06a64615842cba9b3bdb7e6f726f3a5bd20dac2",
      "0x2222222222222222222222222222222222222222",
      "0x3333333333333333333333333333333333333333",
    ],
    contractOwners: [],
    threshold: 2,
    nonce: "2",
    modules: [],
    guard: "0x0000000000000000000000000000000000000000",
    fallbackHandler: "0x0000000000000000000000000000000000000000",
    transactionService: "supported",
    capability: "quorumAvailable",
  };
}

const accounts: Account[] = [
  { id: "unrelated", type: "privateKey", address: "0x4444444444444444444444444444444444444444", createdAt: 1 },
  { id: "bankr-owner", type: "bankr", address: "0xb06a64615842cba9b3bdb7e6f726f3a5bd20dac2", createdAt: 2 },
  { id: "seed-owner", type: "seedPhrase", address: "0x2222222222222222222222222222222222222222", seedGroupId: "seed", derivationIndex: 0, createdAt: 3 },
  { id: "pk-owner", type: "privateKey", address: "0x3333333333333333333333333333333333333333", createdAt: 4 },
  { id: "watch", type: "impersonator", address: "0x5555555555555555555555555555555555555555", createdAt: 5 },
  { id: "safe", type: "safe", address: "0x6666666666666666666666666666666666666666", createdAt: 6 },
];

test("Safe home reuses only the canonical wallet actions", async () => {
  const source = await readFile(safeActionsUrl, "utf8");

  assert.equal(
    source.match(/<HomeQuickActions\b/g)?.length,
    1,
    "Safe home must render the shared Send / Swap / Shield / More component",
  );
  assert.doesNotMatch(
    source,
    /label="(?:Send|Swap|Shield|More)"/,
    "Safe home must not recreate the standard action buttons",
  );
  assert.doesNotMatch(source, /label="Approvals"/);
  assert.doesNotMatch(source, /label="Security"/);
  assert.match(source, /swap: actionDisabledReason \|\| undefined/);
  assert.doesNotMatch(source, /Safe swaps are not available yet/);
  assert.match(source, /shield: "Shield is not available for Safe accounts yet"/);
});

test("the Safe approval banner is the single approvals entry point", async () => {
  const [source, countHook, pendingTxStorage] = await Promise.all([
    readFile(safeAlertUrl, "utf8"),
    readFile(new URL("../../src/components/SafeAccount/usePendingSafeProposalCount.ts", import.meta.url), "utf8"),
    readFile(pendingTxStorageUrl, "utf8"),
  ]);

  assert.match(source, /Pending Safe Requests/);
  assert.match(source, /pendingCount\} pending request/);
  assert.match(source, /bg="accent\.highlight"/);
  assert.match(source, /whiteSpace="nowrap"/);
  assert.match(source, /as="button"/);
  assert.match(source, /aria-label="View pending Safe requests"/);
  assert.match(source, /usePendingSafeProposalCount\(safeAccountId\)/);
  assert.match(countHook, /type: "syncSafeRequests", accountId: safeAccountId/);
  assert.match(countHook, /isPendingSafeProposal\(proposal\)/);
  assert.match(pendingTxStorage, /safeProposals\.filter\(isPendingSafeProposal\)/);
  assert.doesNotMatch(source, /<Button/);
  assert.match(source, />\s*View\s*</);
  assert.doesNotMatch(source, />\s*Approvals\s*</);
  assert.doesNotMatch(source, /ready to execute/);
});

test("the locked wallet includes unresolved Safe proposals in its request notice", async () => {
  const [unlockScreen, countHook] = await Promise.all([
    readFile(new URL("../../src/components/UnlockScreen.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/SafeAccount/usePendingSafeProposalCount.ts", import.meta.url), "utf8"),
  ]);

  assert.match(unlockScreen, /const pendingSafeCount = usePendingSafeProposalCount\(\)/);
  assert.match(unlockScreen, /pendingPermissionCount \+ pendingSafeCount/);
  assert.match(countHook, /type: "getSafeProposals"/);
  assert.match(countHook, /message\.type === "safeProposalsUpdated"/);
  assert.match(countHook, /if \(safeAccountId\) \{/);
  assert.equal(formatPendingUnlockRequestLabel(0, 0), undefined);
  assert.equal(formatPendingUnlockRequestLabel(1, 1), "1 Pending Safe Request");
  assert.equal(formatPendingUnlockRequestLabel(2, 2), "2 Pending Safe Requests");
  assert.equal(formatPendingUnlockRequestLabel(2, 1), "2 Pending Requests");
});

test("Safe service JSON origins become compact activity labels", () => {
  assert.equal(
    formatSafeProposalOrigin('{"url":"https://app.safe.global/","name":""}'),
    "app.safe.global",
  );
  assert.equal(formatSafeProposalOrigin("https://app.uniswap.org/swap"), "app.uniswap.org");
  assert.equal(formatSafeProposalOrigin(undefined), "WalletChan");
  assert.equal(formatSafeProposalOrigin("{broken"), "Safe app");
});

test("Safe request review preserves a real origin for shared dapp identity", () => {
  assert.equal(
    getSafeProposalRequestOrigin('{"url":"https://app.safe.global/","name":""}'),
    "https://app.safe.global/",
  );
  assert.equal(
    getSafeProposalRequestOrigin('{"origin":"https://app.uniswap.org/swap"}'),
    "https://app.uniswap.org/swap",
  );
  assert.equal(getSafeProposalRequestOrigin('{"name":"Safe app"}'), "Safe app");
  assert.equal(getSafeProposalRequestOrigin(undefined), "WalletChan");
});

test("Safe requests use the account identity and shared list grammar", async () => {
  const [source, row] = await Promise.all([
    readFile(safeRequestsUrl, "utf8"),
    readFile(safeRequestRowUrl, "utf8"),
  ]);

  assert.match(source, /Safe Requests/);
  assert.match(source, /<SafeIcon/);
  assert.match(source, /<AccountSettingsIdentity/);
  assert.match(source, /<ListSurface aria-label="Safe requests">/);
  assert.match(source, /<SafeProposalRow/);
  assert.match(source, /Reload Safe requests/);
  assert.match(source, /type: "syncSafeRequests"/);
  assert.match(source, /buildActivityAddressLabels/);
  assert.match(source, /sortSafeProposalsByNonceDescending/);
  assert.match(source, /proposals\.filter\(isPendingSafeProposal\)/);
  assert.match(source, /pendingProposals\.length === 0/);
  assert.match(source, /pendingProposals\.map\(\(item\) =>/);
  assert.match(source, /No pending Safe requests\./);
  assert.match(source, /const proposal = proposals\.find/);
  assert.doesNotMatch(source, /\{proposals\.map\(\(item\) =>/);
  assert.doesNotMatch(source, /No Safe requests yet\./);
  assert.match(row, /Nonce\{" "\}/);
  assert.match(row, /<Text as="span" color="fg\.primary">\s*#\{proposal\.transaction\.nonce\}/);
  assert.doesNotMatch(row, /Nonce #\{proposal\.transaction\.nonce\}/);
  assert.doesNotMatch(row, /#\{position\}/);
  assert.doesNotMatch(row, /position="absolute"/);
  assert.match(row, /direction="column" w="full" gap=\{2\}/);
  assert.doesNotMatch(source, />New proposal</);
  assert.doesNotMatch(source, /`Call \$\{short\(/);
});

test("Safe requests sort by descending nonce with stable same-nonce grouping", () => {
  const base = safeProposal();
  const proposals: SafeProposalRecord[] = [
    {
      ...base,
      id: "nonce-3-old",
      state: "executed",
      transaction: { ...base.transaction, nonce: 3 },
      createdAt: 1_000,
    },
    {
      ...base,
      id: "nonce-5",
      transaction: { ...base.transaction, nonce: 5 },
      createdAt: 1_000,
    },
    {
      ...base,
      id: "nonce-2",
      state: "cancelled",
      transaction: { ...base.transaction, nonce: 2 },
      createdAt: 1_000,
    },
    {
      ...base,
      id: "nonce-4",
      state: "executed",
      transaction: { ...base.transaction, nonce: 4 },
      createdAt: 1_000,
    },
    {
      ...base,
      id: "nonce-3-new",
      state: "replaced",
      transaction: { ...base.transaction, nonce: 3 },
      createdAt: 2_000,
    },
  ];

  assert.deepEqual(
    sortSafeProposalsByNonceDescending(proposals).map((proposal) => proposal.id),
    ["nonce-5", "nonce-4", "nonce-3-new", "nonce-3-old", "nonce-2"],
  );
  assert.deepEqual(
    proposals.map((proposal) => proposal.id),
    ["nonce-3-old", "nonce-5", "nonce-2", "nonce-4", "nonce-3-new"],
    "sorting must not mutate background response order",
  );
});

test("Safe Activity reuses the Warm Midnight transaction ledger grammar", async () => {
  const [activity, row, standardActivity, activityStatus] = await Promise.all([
    readFile(safeActivityUrl, "utf8"),
    readFile(safeActivityRowUrl, "utf8"),
    readFile(activityListUrl, "utf8"),
    readFile(activityStatusUrl, "utf8"),
  ]);

  assert.match(activity, /sortSafeProposalsByNonceDescending/);
  assert.match(activity, /groupActivityByDate/);
  assert.match(activity, /<ActivityDateHeader label=\{group\.label\} \/>/);
  assert.match(activity, /<ListSurface aria-label="Safe proposal activity">/);
  assert.match(standardActivity, /<ActivityDateHeader label=\{group\.label\} \/>/);
  assert.doesNotMatch(activity, /Safe proposal activity<\/Text>|<Badge|PRIORITY/);
  assert.doesNotMatch(activity, /Nonce .* conflict|variant="secondary"/);

  assert.match(row, /<ListItem\s+interactive\s+as="button"/);
  assert.match(row, /<ActivityStatusLabel/);
  assert.match(row, /getSafeProposalPresentation/);
  assert.match(row, /formatTimeAgo/);
  assert.match(row, /Nonce\{" "\}/);
  assert.match(row, /<Box as="span" color="fg\.primary">\s*#\{proposal\.transaction\.nonce\}/);
  assert.match(row, /isReadyToExecute = proposal\.state === "readyToExecute"/);
  assert.match(row, /w=\{isReadyToExecute \? "calc\(100% - 8px\)" : "full"\}/);
  assert.match(row, /mx=\{isReadyToExecute \? 1 : 0\}/);
  assert.match(row, /px=\{isReadyToExecute \? 2\.5 : 3\}/);
  assert.match(row, /bg=\{isReadyToExecute \? "status\.warning\.tint" : undefined\}/);
  assert.match(row, /status-warning-border/);
  assert.match(row, /tone=\{isReadyToExecute \? "warning" : presentation\.statusTone\}/);
  assert.match(row, /icon=\{isReadyToExecute \? "hourglass" : undefined\}/);
  assert.match(row, /tokens\.colorMode === "dark"/);
  assert.match(row, /"status\.success\.bg"/);
  assert.match(activityStatus, /function HourglassIcon/);
  assert.doesNotMatch(row, /<Badge|variant="secondary"/);
});

test("Safe request review uses the standard confirmation grammar without password fields", async () => {
  const [screen, actions, decision, details, financialImpact] = await Promise.all([
    readFile(safeConfirmationUrl, "utf8"),
    readFile(safeActionsHookUrl, "utf8"),
    readFile(safeDecisionSummaryUrl, "utf8"),
    readFile(safeRequestDetailsUrl, "utf8"),
    readFile(safeFinancialImpactUrl, "utf8"),
  ]);

  assert.match(screen, /<ConfirmationScreen/);
  assert.match(screen, /backLabel = "Back to requests"/);
  assert.match(screen, />\{backLabel\}<\/Button>/);
  assert.match(screen, /"Reject transaction" : "Transaction request"/);
  assert.match(screen, /<RequestIdentity/);
  assert.match(screen, /<EstimatedChangesHeading/);
  assert.match(screen, /<SafeProposalFinancialImpact/);
  assert.match(screen, /executionRequest=\{executionRequest\}/);
  assert.match(financialImpact, /safeExecutionRequest=\{executionRequest \?\? undefined\}/);
  assert.match(actions, /type: "startSafeProposalRejection"/);
  assert.match(screen, /chainId: proposal\.chainId/);
  assert.match(screen, /variant=\{requiresOnchainRejection \? "danger" : "secondary"\}/);
  assert.match(screen, /"Reject onchain" : "Reject"/);
  assert.match(actions, /onOpenProposal\(response\.result\.proposal\.id\)/);
  assert.match(screen, /Confirming onchain…/);
  assert.match(screen, /primaryActionKind/);
  assert.match(actions, /getSafeProposalDisplayActionKind\(actionKind, operation\)/);
  assert.match(screen, /operation === "approve" \|\| operation === "execute"/);
  assert.match(screen, /"Sign offchain"/);
  assert.match(actions, /setNotice\("Signed offchain\."\)/);
  assert.doesNotMatch(screen, /Approve & share/);
  assert.doesNotMatch(actions, /Approval added and shared/);
  assert.match(screen, /useSafeExecutionRefresh/);
  assert.doesNotMatch(screen, />\s*Reconcile status\s*</);
  assert.doesNotMatch(screen, /Transaction submitted\. WalletChan is confirming/);
  assert.doesNotMatch(screen, /type: "hideSafeProposal"/);
  assert.match(decision, /Signing with/);
  assert.match(decision, /Execute with/);
  assert.match(decision, /<GasEstimateDisplay/);
  assert.match(decision, /Choose execution account/);
  assert.match(decision, /safeOwnerAccountIds\.has\(account\.id\)/);
  assert.match(decision, />\s*Owner\s*</);
  assert.match(details, /<Divider borderColor="border\.subtle" opacity=\{1\} \/>/);
  assert.match(screen, /contextHeaderAction=\{<SafeProposalStatusPill proposal=\{proposal\} \/>\}/);
  assert.match(details, /export function SafeProposalStatusPill/);
  assert.match(details, /<SuccessStatusPill label="Signed" \/>/);
  assert.match(details, /"Ready to reject"[\s\S]*: "Ready to execute"/);
  assert.match(details, /Reject pending transaction #\{proposal\.transaction\.nonce\}/);
  assert.match(details, /proposal\.state === "draft" \? "warning" : undefined/);
  assert.match(details, /isSafeExecutionRpcWarning/);
  assert.match(details, /status\.warning\.bg/);
  assert.match(details, /aria-live="polite"/);
  assert.match(details, /status === "Available" \? "warning" : undefined/);
  assert.match(details, /<Text color="fg\.secondary" fontSize="sm">\s*Reject pending transaction/);
  assert.match(financialImpact, /<Text color="fg\.secondary" fontSize="sm">\s*No Safe asset changes/);
  assert.doesNotMatch(details, /This onchain Safe transaction consumes nonce/);
  assert.doesNotMatch(financialImpact, /The selected executor pays only the network fee/);
  assert.match(details, /variant="success"/);
  assert.match(details, /<CheckIcon/);
  assert.match(details, />\s*Signers\s*</);
  assert.match(details, /\{proposal\.confirmations\.length\}\/\{snapshot\.threshold\} signed/);
  assert.match(details, /fontVariantNumeric: "tabular-nums"/);
  assert.doesNotMatch(details, /approvals\s*<\/Text>/);
  assert.doesNotMatch(screen, /type="password"|Executor password|Password for this approval/);
  assert.doesNotMatch(decision, /type="password"|Executor password|Password for this approval/);
});

test("terminal Safe Activity details cannot inherit live request behavior", async () => {
  const [screen, details, advanced, confirmationScreen] = await Promise.all([
    readFile(safeConfirmationUrl, "utf8"),
    readFile(safeRequestDetailsUrl, "utf8"),
    readFile(safeAdvancedDetailsUrl, "utf8"),
    readFile(confirmationScreenUrl, "utf8"),
  ]);

  assert.match(screen, /const isRequestView = isPendingSafeProposal\(proposal\)/);
  assert.match(screen, /: "Transaction details"/);
  assert.match(screen, /financialImpact=\{isRequestView \?/);
  assert.match(screen, /financialImpactTitle=\{isRequestView \?/);
  assert.match(screen, /contextTitle=\{isRequestView \? "Request details" : "Safe transaction"\}/);
  assert.match(screen, /actionSummary=\{isRequestView \?/);
  assert.match(screen, /rejectAction=\{isRequestView && canReject \?/);
  assert.match(screen, /readOnly=\{!isRequestView\}/);

  assert.match(details, /showRequestLifecycle &&\s*\(proposal\.route\.kind/);
  assert.match(details, /showRequestLifecycle && simulationReverted/);
  assert.match(details, /showRequestLifecycle && notice/);
  assert.match(details, /proposal\.state === "readyToExecute" \|\| proposal\.state === "executed"/);
  assert.match(details, /proposal\.state === "executed"\s*\? "Executed"/);
  assert.match(details, /proposal\.state === "failed" \|\|/);

  assert.match(advanced, /const canDetach = !readOnly &&/);
  assert.match(advanced, /!readOnly && proposal\.state === "ambiguous"/);
  assert.match(advanced, /!readOnly && proposal\.state !== "ambiguous" && hasUnpublishedApproval/);
  assert.match(advanced, />\s*Hide from Activity\s*</);

  assert.match(confirmationScreen, /confirmAction\?: ReactNode/);
  assert.match(confirmationScreen, /\{confirmAction && \(/);
});

test("Safe primary actions remain stable through intermediate storage states", () => {
  assert.equal(getSafeProposalDisplayActionKind(null, "approve"), "approve");
  assert.equal(getSafeProposalDisplayActionKind(null, "execute"), "execute");
  assert.equal(getSafeProposalDisplayActionKind("execute", "reject"), "execute");
  assert.equal(getSafeProposalDisplayActionKind(null, null), null);
});

test("Safe execution can explicitly proceed after a simulated revert", async () => {
  const [screen, hook] = await Promise.all([
    readFile(safeConfirmationUrl, "utf8"),
    readFile(safeActionsHookUrl, "utf8"),
  ]);

  assert.match(screen, /simulationFailed=\{shouldConfirmSimulationFailure\(\{/);
  assert.match(screen, /allowSimulationFailure: simulationReverted/);
  assert.doesNotMatch(screen, /simulationReverted\s*\?\s*"The reviewed Safe transaction reverted/);
  assert.match(hook, /allowSimulationFailure: options\?\.allowSimulationFailure === true/);
});

test("Safe request completion routes only on a same-proposal executed transition", async () => {
  const [requestsScreen, appSurfaces, app] = await Promise.all([
    readFile(safeRequestsUrl, "utf8"),
    readFile(safeAppSurfacesUrl, "utf8"),
    readFile(appUrl, "utf8"),
  ]);
  const ready = safeProposal();
  const executed = { ...ready, state: "executed" as const };

  assert.equal(didSafeProposalExecutionConfirm(ready, executed), true);
  assert.equal(didSafeProposalExecutionConfirm(null, executed), false);
  assert.equal(didSafeProposalExecutionConfirm(executed, executed), false);
  assert.equal(
    didSafeProposalExecutionConfirm(ready, { ...executed, id: "another-request" }),
    false,
  );
  assert.match(requestsScreen, /didSafeProposalExecutionConfirm\(previous, current\)/);
  assert.match(requestsScreen, /onExecutionConfirmed\(\)/);
  assert.match(appSurfaces, /onExecutionConfirmed=\{onExecutionConfirmed\}/);
  assert.match(app, /safeProposalEntryPoint === "activity"/);
  assert.match(app, /onProposalBack=\{returnToActivity \? leaveSafeApprovals : undefined\}/);
  assert.match(app, /openSafeApprovals\(proposalId, "activity"\)/);
  assert.match(app, /setActivityTabTrigger\(\(current\) => current \+ 1\)/);
  assert.match(appSurfaces, /onProposalBack=\{onProposalBack\}/);
  assert.match(requestsScreen, /onBack=\{onProposalBack \?\? \(\(\) => setSelected\(null\)\)\}/);
  assert.match(requestsScreen, /backLabel=\{onProposalBack \? "Back to Activity" : undefined\}/);
});

test("Safe execution defaults to a local owner and permits another local account", () => {
  const executors = getSafeExecutorAccounts(accounts);

  assert.deepEqual(executors.map((account) => account.id), [
    "unrelated",
    "seed-owner",
    "pk-owner",
  ]);
  assert.equal(
    getDefaultSafeExecutorAccountId(executors, safeSnapshot()),
    "seed-owner",
    "a local Safe owner wins over an earlier unrelated executor",
  );
});

test("Safe approval candidates cover Bankr, private-key, and seed owners only", () => {
  const proposal = safeProposal();
  const candidates = getAvailableSafeOwnerAccounts(accounts, safeSnapshot(), proposal);

  assert.deepEqual(candidates.map((account) => account.id), ["seed-owner", "pk-owner"]);
  assert.equal(getSafeProposalActionKind({ ...proposal, state: "awaitingApprovals" }, candidates), "approve");
  assert.equal(getSafeProposalActionKind(proposal, candidates), "execute");
  assert.equal(getSafeProposalActionKind({
    ...proposal,
    transactionHash: `0x${"55".repeat(32)}`,
  }, candidates), null);
  assert.equal(getSafeProposalActionKind({
    ...proposal,
    serializedExecution: `0x${"66".repeat(64)}`,
  }, candidates), null);
  assert.equal(getSafeProposalActionKind({ ...proposal, state: "blocked" }, candidates), null);
  assert.equal(canRejectSafeProposal(proposal), true);
  assert.equal(hasSafeProposalSignatures(proposal), true);
  assert.equal(canRejectSafeProposal({ ...proposal, purpose: "rejection" }), false);
});

test("Safe request rows describe the action and approval state", () => {
  const presentation = getSafeProposalPresentation(safeProposal(), {
    nativeSymbol: "ETH",
    nativeDecimals: 18,
    threshold: 1,
    addressLabels: new Map([
      ["0xb06a64615842cba9b3bdb7e6f726f3a5bd20dac2", "Signer account"],
    ]),
  });

  assert.equal(presentation.intent, "Send 0.001 ETH");
  assert.equal(presentation.context, "To Signer account");
  assert.equal(presentation.status, "Ready to execute");
  assert.equal(presentation.statusTone, "success");
});

test("Safe rejection rows describe the onchain nonce replacement", () => {
  const proposal = safeProposal();
  const presentation = getSafeProposalPresentation({
    ...proposal,
    purpose: "rejection",
    calls: [{
      to: proposal.safeAddress,
      value: "0",
      data: "0x",
      operation: 0,
    }],
    transaction: {
      ...proposal.transaction,
      to: proposal.safeAddress,
      value: "0",
      data: "0x",
      operation: 0,
    },
  }, { threshold: 1 });

  assert.equal(presentation.intent, "Reject transaction");
  assert.equal(presentation.context, "Safe nonce 2");
  assert.equal(presentation.status, "Ready to execute");
});

test("future Safe requests name the visible request that must execute first", () => {
  const first = safeProposal();
  const blocked: SafeProposalRecord = {
    ...first,
    id: "request-2",
    safeTxHash: `0x${"ef".repeat(32)}`,
    transaction: { ...first.transaction, nonce: 3 },
    state: "blocked",
    confirmations: [],
    error: "Future Safe nonce 3; executable nonce is 2",
  };
  const blockedByNonce = getSafeProposalBlockingNonce(blocked, [first, blocked]);
  const presentation = getSafeProposalPresentation(blocked, {
    nativeSymbol: "ETH",
    nativeDecimals: 18,
    threshold: 1,
    blockedByNonce,
  });

  assert.equal(blockedByNonce, 2);
  assert.equal(presentation.status, "Blocked · Execute nonce #2 first");
  assert.equal(presentation.statusTone, "error");
});

test("Safe advanced details exposes inline nonce editing only before signing", async () => {
  const source = await readFile(safeAdvancedDetailsUrl, "utf8");
  const editor = await readFile(safeNonceEditorUrl, "utf8");
  const hook = await readFile(safeActionsHookUrl, "utf8");

  assert.match(editor, /aria-label="Edit Safe nonce"/);
  assert.match(editor, /aria-label="Cancel Safe nonce edit"/);
  assert.match(editor, /aria-label="Confirm Safe nonce"/);
  assert.match(editor, /isDisabled=\{!!nonceError\}/);
  assert.doesNotMatch(editor, /unchanged/);
  assert.match(source, /disclosureRef\.current\.scrollIntoView/);
  assert.match(source, /isUnsignedSafeNonceEditable\(proposal\)/);
  assert.match(hook, /type: "changeSafeProposalNonce"/);
  assert.match(hook, /onOpenProposal\(response\.result\.id\)/);
});

test("configuration-blocked Safe requests do not claim a nonce dependency", () => {
  const blocked: SafeProposalRecord = {
    ...safeProposal(),
    state: "blocked",
    error: "Safe configuration changed; create and review a new proposal",
  };

  assert.equal(
    getSafeProposalBlockingNonce(blocked, [safeProposal(), blocked]),
    undefined,
  );
});
