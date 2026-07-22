/** Wallet-UI transport for bounded Privacy Pools setup and operation state. */

import { formatEther } from "viem";

import { ensurePrivacyIdentityInitialized } from "../privacy/identity";
import { quotePrivacyShield } from "../privacy/deposit/quote";
import {
  preparePrivacyShieldReview,
  PrivacyShieldReviewError,
  type PrivacyShieldReviewErrorCode,
} from "../privacy/deposit/prepare";
import {
  PrivacyShieldQuoteError,
  type PrivacyShieldQuoteErrorCode,
} from "../privacy/deposit/quotePolicy";
import { runPrivacyShieldReadinessCheck } from "../privacy/readiness";
import {
  preparePrivacyShieldOperation,
  PrivacyShieldOperationError,
  type PrivacyShieldOperationErrorCode,
} from "../privacy/operations/prepare";
import {
  queuePrivacyShieldConfirmation,
  PrivacyShieldSubmissionError,
  type PrivacyShieldSubmissionErrorCode,
} from "../privacy/operations/submission";
import { listPrivacyShieldOperationSummaries } from "../privacy/operations/repository";
import type { AccountType } from "../types";
import { syncPrivacyDepositEvents } from "../privacy/events/sync";
import { matchPrivacyShieldOperationsFromEvents } from "../privacy/events/match";
import {
  materializeIndexedPrivacyShieldCommitments,
  reconcileKnownPrivacyCommitmentsWithActiveIdentity,
  refreshPrivacyAspEligibility,
} from "../privacy/asp/eligibility";
import { refreshPrivacyCommitmentEligibility } from "../privacy/asp/commitmentEligibility";
import { readPrivacyCommitmentPortfolio } from "../privacy/commitments/portfolio";
import { readPrivacyPortfolioSeries } from "../privacy/portfolioHistory/repository";
import {
  preparePrivacyUnshieldQuote,
  PrivacyUnshieldPrepareError,
} from "../privacy/withdrawals/prepare";
import { executePrivacyUnshield } from "../privacy/withdrawals/execute";
import { listPrivacyUnshields } from "../privacy/withdrawals/repository";
import { resumePrivacyUnshieldTracking } from "../privacy/withdrawals/lifecycle";
import type { StoredPrivacyUnshieldV1 } from "../privacy/withdrawals/types";
import {
  preparePrivacyDirectUnshield,
  PrivacyDirectUnshieldError,
} from "../privacy/withdrawals/direct";
import {
  queuePrivacyDirectUnshieldConfirmation,
  rollbackPreparedPrivacyDirectUnshield,
} from "../privacy/withdrawals/directConfirmation";
import {
  previewPrivacyRagequits,
  preparePrivacyRagequit,
  preparePrivacyRagequitBatch,
  rollbackPreparedPrivacyRagequitBatch,
  PrivacyRagequitPrepareError,
} from "../privacy/ragequit/prepare";
import {
  queuePrivacyRagequitBatchConfirmation,
  queuePrivacyRagequitConfirmation,
} from "../privacy/ragequit/submission";
import { listPrivacyRagequits } from "../privacy/ragequit/repository";
import {
  resumePrivacyRagequitTracking,
} from "../privacy/ragequit/lifecycle";
import { privacyRagequitPublicSummary } from "../privacy/ragequit/types";
import { runPrivacyProverFixedSelfTest } from "../privacy/prover/coordinator";
import { PRIVACY_POOLS_DEPLOYMENT } from "../privacy/deployment/manifest";

export const BACKGROUND_PRIVACY_MESSAGE_TYPES = [
  "privacyEnsureInitialized",
  "privacyRunShieldReadinessCheck",
  "privacyRunProverSelfTest",
  "privacyQuoteShield",
  "privacyPrepareShieldReview",
  "privacyPrepareShield",
  "privacyListShieldOperations",
  "privacySyncShield",
  "privacyPrepareUnshieldQuote",
  "privacyExecuteUnshield",
  "privacyPrepareDirectUnshield",
  "privacyPreviewRagequit",
  "privacyPrepareRagequit",
  "privacyPrepareRagequitBatch",
] as const;

export type BackgroundPrivacyRouteResult =
  | { handled: false }
  | { handled: true; keepChannelOpen: boolean };

type Dependencies = {
  ensurePrivacyIdentityInitialized: typeof ensurePrivacyIdentityInitialized;
  runPrivacyShieldReadinessCheck: typeof runPrivacyShieldReadinessCheck;
  runPrivacyProverFixedSelfTest: typeof runPrivacyProverFixedSelfTest;
  quotePrivacyShield: typeof quotePrivacyShield;
  preparePrivacyShieldReview: typeof preparePrivacyShieldReview;
  preparePrivacyShieldOperation: typeof preparePrivacyShieldOperation;
  queuePrivacyShieldConfirmation: typeof queuePrivacyShieldConfirmation;
  listPrivacyShieldOperationSummaries: typeof listPrivacyShieldOperationSummaries;
  syncPrivacyDepositEvents: typeof syncPrivacyDepositEvents;
  matchPrivacyShieldOperationsFromEvents: typeof matchPrivacyShieldOperationsFromEvents;
  refreshPrivacyAspEligibility: typeof refreshPrivacyAspEligibility;
  materializeIndexedPrivacyShieldCommitments: typeof materializeIndexedPrivacyShieldCommitments;
  reconcileKnownPrivacyCommitmentsWithActiveIdentity:
    typeof reconcileKnownPrivacyCommitmentsWithActiveIdentity;
  refreshPrivacyCommitmentEligibility: typeof refreshPrivacyCommitmentEligibility;
  readPrivacyCommitmentPortfolio: typeof readPrivacyCommitmentPortfolio;
  readPrivacyPortfolioSeries: typeof readPrivacyPortfolioSeries;
  preparePrivacyUnshieldQuote: typeof preparePrivacyUnshieldQuote;
  executePrivacyUnshield: typeof executePrivacyUnshield;
  preparePrivacyDirectUnshield: typeof preparePrivacyDirectUnshield;
  queuePrivacyDirectUnshieldConfirmation: typeof queuePrivacyDirectUnshieldConfirmation;
  rollbackPreparedPrivacyDirectUnshield: typeof rollbackPreparedPrivacyDirectUnshield;
  listPrivacyUnshields: typeof listPrivacyUnshields;
  resumePrivacyUnshieldTracking: typeof resumePrivacyUnshieldTracking;
  previewPrivacyRagequits: typeof previewPrivacyRagequits;
  preparePrivacyRagequit: typeof preparePrivacyRagequit;
  preparePrivacyRagequitBatch: typeof preparePrivacyRagequitBatch;
  rollbackPreparedPrivacyRagequitBatch: typeof rollbackPreparedPrivacyRagequitBatch;
  queuePrivacyRagequitConfirmation: typeof queuePrivacyRagequitConfirmation;
  queuePrivacyRagequitBatchConfirmation: typeof queuePrivacyRagequitBatchConfirmation;
  listPrivacyRagequits: typeof listPrivacyRagequits;
  resumePrivacyRagequitTracking: typeof resumePrivacyRagequitTracking;
  warnPrivacyReadinessFailure: (code: string) => void;
  warnPrivacyQuoteFailure: (code: string) => void;
  warnPrivacyReviewFailure: (code: string) => void;
  warnPrivacyOperationFailure: (code: string) => void;
  warnPrivacyRecoveryFailure: (code: string) => void;
  warnPrivacyEventSyncFailure: (surface: "portfolio") => void;
};

const productionDependencies: Dependencies = {
  ensurePrivacyIdentityInitialized,
  runPrivacyShieldReadinessCheck,
  runPrivacyProverFixedSelfTest,
  quotePrivacyShield,
  preparePrivacyShieldReview,
  preparePrivacyShieldOperation,
  queuePrivacyShieldConfirmation,
  listPrivacyShieldOperationSummaries,
  syncPrivacyDepositEvents,
  matchPrivacyShieldOperationsFromEvents,
  refreshPrivacyAspEligibility,
  materializeIndexedPrivacyShieldCommitments,
  reconcileKnownPrivacyCommitmentsWithActiveIdentity,
  refreshPrivacyCommitmentEligibility,
  readPrivacyCommitmentPortfolio,
  readPrivacyPortfolioSeries,
  preparePrivacyUnshieldQuote,
  executePrivacyUnshield,
  preparePrivacyDirectUnshield,
  queuePrivacyDirectUnshieldConfirmation,
  rollbackPreparedPrivacyDirectUnshield,
  listPrivacyUnshields,
  resumePrivacyUnshieldTracking,
  previewPrivacyRagequits,
  preparePrivacyRagequit,
  preparePrivacyRagequitBatch,
  rollbackPreparedPrivacyRagequitBatch,
  queuePrivacyRagequitConfirmation,
  queuePrivacyRagequitBatchConfirmation,
  listPrivacyRagequits,
  resumePrivacyRagequitTracking,
  warnPrivacyReadinessFailure: (code) =>
    console.warn("[privacy-shield] readiness check failed", code),
  warnPrivacyQuoteFailure: (code) =>
    console.warn("[privacy-shield] quote failed", code),
  warnPrivacyReviewFailure: (code) =>
    console.warn("[privacy-shield] review preparation failed", code),
  warnPrivacyOperationFailure: (code) =>
    console.warn("[privacy-shield] operation preparation failed", code),
  warnPrivacyRecoveryFailure: (code) =>
    console.warn("[privacy-shield] public recovery preparation failed", code),
  warnPrivacyEventSyncFailure: (surface) =>
    console.warn("[privacy-shield] event sync deferred", surface),
};

async function reconcilePrivacyCommitmentEventsBestEffort(
  dependencies: Pick<
    Dependencies,
    "syncPrivacyDepositEvents" |
      "matchPrivacyShieldOperationsFromEvents" |
      "reconcileKnownPrivacyCommitmentsWithActiveIdentity" |
      "warnPrivacyEventSyncFailure"
  >,
  surface: "portfolio",
) {
  let sync;
  try {
    sync = await dependencies.syncPrivacyDepositEvents();
  } catch {
    dependencies.warnPrivacyEventSyncFailure(surface);
    return null;
  }
  await dependencies.matchPrivacyShieldOperationsFromEvents();
  if (sync.status === "current") {
    await dependencies.reconcileKnownPrivacyCommitmentsWithActiveIdentity();
  }
  return sync;
}

function isExactRequest(message: unknown, type: string): boolean {
  return (
    typeof message === "object" &&
    message !== null &&
    !Array.isArray(message) &&
    Object.keys(message).length === 1 &&
    (message as { type?: unknown }).type === type
  );
}

interface PrivacyAmountMessage {
  type: "privacyQuoteShield" | "privacyPrepareShieldReview";
  accountId: string;
  accountAddress: string;
  accountType: AccountType;
  amount: string;
  grossAmountWei?: string;
}

interface PrivacyPrepareOperationMessage {
  type: "privacyPrepareShield";
  requestId: string;
  accountId: string;
  accountAddress: string;
  accountType: AccountType;
  amount: string;
  grossAmountWei: string;
}

interface PrivacyPrepareUnshieldMessage {
  type: "privacyPrepareUnshieldQuote";
  requestId: string;
  amountWei: string;
  recipient: string;
}

interface PrivacyExecuteUnshieldMessage {
  type: "privacyExecuteUnshield";
  operationId: string;
}

interface PrivacyPrepareDirectUnshieldMessage {
  type: "privacyPrepareDirectUnshield";
  requestId: string;
  amountWei: string;
  recipient: string;
  accountId: string;
  accountAddress: string;
  accountType: "bankr" | "privateKey" | "seedPhrase";
}

interface PrivacyPrepareRagequitMessage {
  type: "privacyPrepareRagequit";
  requestId: string;
  accountId: string;
  accountAddress: string;
  accountType: "bankr" | "privateKey" | "seedPhrase";
  commitmentId: string;
  sourceOperationId: string | null;
  expectedAmountWei: string;
}

interface PrivacyPrepareRagequitBatchMessage {
  type: "privacyPrepareRagequitBatch";
  requestId: string;
  selections: Array<Omit<PrivacyPrepareRagequitMessage, "type" | "requestId">>;
}

interface PrivacyPreviewRagequitMessage {
  type: "privacyPreviewRagequit";
  preferredOperationId: string | null;
}

function isPrivacyPrepareUnshieldMessage(
  message: unknown,
): message is PrivacyPrepareUnshieldMessage {
  if (typeof message !== "object" || message === null || Array.isArray(message)) return false;
  const value = message as Record<string, unknown>;
  return Object.keys(value).length === 4 &&
    value.type === "privacyPrepareUnshieldQuote" &&
    typeof value.requestId === "string" &&
    typeof value.amountWei === "string" &&
    typeof value.recipient === "string";
}

function isPrivacyExecuteUnshieldMessage(
  message: unknown,
): message is PrivacyExecuteUnshieldMessage {
  if (typeof message !== "object" || message === null || Array.isArray(message)) return false;
  const value = message as Record<string, unknown>;
  return Object.keys(value).length === 2 &&
    value.type === "privacyExecuteUnshield" &&
    typeof value.operationId === "string";
}

function isPrivacyPrepareDirectUnshieldMessage(
  message: unknown,
): message is PrivacyPrepareDirectUnshieldMessage {
  if (typeof message !== "object" || message === null || Array.isArray(message)) return false;
  const value = message as Record<string, unknown>;
  return Object.keys(value).length === 7 &&
    value.type === "privacyPrepareDirectUnshield" &&
    typeof value.requestId === "string" && typeof value.amountWei === "string" &&
    typeof value.recipient === "string" && typeof value.accountId === "string" &&
    typeof value.accountAddress === "string" &&
    (value.accountType === "bankr" || value.accountType === "privateKey" || value.accountType === "seedPhrase");
}

function isPrivacyPrepareRagequitMessage(
  message: unknown,
): message is PrivacyPrepareRagequitMessage {
  if (typeof message !== "object" || message === null || Array.isArray(message)) return false;
  const value = message as Record<string, unknown>;
  return Object.keys(value).length === 8 &&
    value.type === "privacyPrepareRagequit" &&
    typeof value.requestId === "string" &&
    typeof value.accountId === "string" &&
    typeof value.accountAddress === "string" &&
    (value.accountType === "bankr" || value.accountType === "privateKey" ||
      value.accountType === "seedPhrase") &&
    typeof value.commitmentId === "string" &&
    (value.sourceOperationId === null || typeof value.sourceOperationId === "string") &&
    typeof value.expectedAmountWei === "string";
}

function isPrivacyPrepareRagequitBatchMessage(
  message: unknown,
): message is PrivacyPrepareRagequitBatchMessage {
  if (typeof message !== "object" || message === null || Array.isArray(message)) return false;
  const value = message as Record<string, unknown>;
  if (
    Object.keys(value).length !== 3 ||
    value.type !== "privacyPrepareRagequitBatch" ||
    typeof value.requestId !== "string" ||
    !Array.isArray(value.selections) ||
    value.selections.length < 2 ||
    value.selections.length > 8
  ) return false;
  return value.selections.every((selection) => {
    if (typeof selection !== "object" || selection === null || Array.isArray(selection)) {
      return false;
    }
    const item = selection as Record<string, unknown>;
    return Object.keys(item).length === 6 &&
      typeof item.accountId === "string" &&
      typeof item.accountAddress === "string" &&
      (item.accountType === "bankr" || item.accountType === "privateKey" ||
        item.accountType === "seedPhrase") &&
      typeof item.commitmentId === "string" &&
      (item.sourceOperationId === null || typeof item.sourceOperationId === "string") &&
      typeof item.expectedAmountWei === "string";
  });
}

function isPrivacyPreviewRagequitMessage(
  message: unknown,
): message is PrivacyPreviewRagequitMessage {
  if (typeof message !== "object" || message === null || Array.isArray(message)) return false;
  const value = message as Record<string, unknown>;
  return Object.keys(value).length === 2 &&
    value.type === "privacyPreviewRagequit" &&
    (value.preferredOperationId === null ||
      typeof value.preferredOperationId === "string");
}

function isPrivacyAmountMessage(
  message: unknown,
  type: PrivacyAmountMessage["type"],
): message is PrivacyAmountMessage {
  if (typeof message !== "object" || message === null || Array.isArray(message)) {
    return false;
  }
  const value = message as Record<string, unknown>;
  const isReview = type === "privacyPrepareShieldReview";
  return (
    Object.keys(value).length === (isReview ? 6 : 5) &&
    value.type === type &&
    typeof value.accountId === "string" &&
    typeof value.accountAddress === "string" &&
    (value.accountType === "bankr" ||
      value.accountType === "privateKey" ||
      value.accountType === "seedPhrase" ||
      value.accountType === "impersonator") &&
    typeof value.amount === "string" &&
    (isReview
      ? typeof value.grossAmountWei === "string"
      : value.grossAmountWei === undefined)
  );
}

function isPrivacyPrepareOperationMessage(
  message: unknown,
): message is PrivacyPrepareOperationMessage {
  if (typeof message !== "object" || message === null || Array.isArray(message)) {
    return false;
  }
  const value = message as Record<string, unknown>;
  return (
    Object.keys(value).length === 7 &&
    value.type === "privacyPrepareShield" &&
    typeof value.requestId === "string" &&
    typeof value.accountId === "string" &&
    typeof value.accountAddress === "string" &&
    (value.accountType === "bankr" ||
      value.accountType === "privateKey" ||
      value.accountType === "seedPhrase" ||
      value.accountType === "impersonator") &&
    typeof value.amount === "string" &&
    typeof value.grossAmountWei === "string"
  );
}

type PrivacyReviewFailureCode =
  | PrivacyShieldQuoteErrorCode
  | PrivacyShieldReviewErrorCode;

type PrivacyOperationFailureCode =
  | PrivacyShieldQuoteErrorCode
  | PrivacyShieldOperationErrorCode
  | PrivacyShieldSubmissionErrorCode;

function privacyOperationFailure(error: unknown): {
  success: false;
  code: PrivacyOperationFailureCode;
  error: string;
} {
  const code: PrivacyOperationFailureCode =
    error instanceof PrivacyShieldQuoteError ||
    error instanceof PrivacyShieldOperationError ||
    error instanceof PrivacyShieldSubmissionError
      ? error.code
      : "operation-unavailable";
  const messages: Record<PrivacyOperationFailureCode, string> = {
    "invalid-request": "Invalid request",
    "account-unavailable": "Switch accounts and try again.",
    "view-only-account": "View-only accounts can’t Shield.",
    "invalid-amount": "Enter a valid ETH amount.",
    "amount-below-minimum":
      `Minimum amount to shield is ${formatEther(PRIVACY_POOLS_DEPLOYMENT.assetConfig.minimumDepositAmount)} ETH. The protocol fee is added on top.`,
    "quote-unavailable": "Quote unavailable. Try again.",
    "auth-required": "Unlock with your main password or biometrics and try again.",
    "recovery-unavailable": "Shield recovery needs attention before you continue.",
    "insufficient-funds":
      `Not enough ${PRIVACY_POOLS_DEPLOYMENT.chainName} ETH for this amount and gas.`,
    "operation-unavailable": "Couldn’t save this Shield operation. Try again.",
    "bankr-testnet-unsupported":
      `Bankr doesn’t support ${PRIVACY_POOLS_DEPLOYMENT.chainName} transactions in this build.`,
  };
  return { success: false, code, error: messages[code] };
}

function publicOperationSummary(operation: Awaited<
  ReturnType<typeof preparePrivacyShieldOperation>
>) {
  return {
    id: operation.id,
    revision: operation.revision,
    state: operation.state,
    createdAt: operation.createdAt,
    chainId: operation.chainId,
    accountId: operation.accountId,
    accountAddress: operation.accountAddress,
    accountType: operation.accountType,
    amountWei: operation.amountWei,
    protocolFeeWei: operation.protocolFeeWei,
    shieldedAmountWei: operation.shieldedAmountWei,
    gasReserveWei: operation.gasReserveWei,
    totalRequiredWei: operation.totalRequiredWei,
    destinationAddress: operation.destinationAddress,
    poolAddress: operation.poolAddress,
    txHash: operation.txHash,
    blockNumber: operation.blockNumber,
    errorCode: operation.errorCode,
  };
}

function publicUnshieldSummary(operation: StoredPrivacyUnshieldV1) {
  const base = {
    id: operation.summary.id,
    state: operation.tracking.state,
    revision: operation.tracking.revision,
    createdAt: operation.summary.createdAt,
    updatedAt: operation.tracking.updatedAt,
    chainId: operation.summary.chainId,
    amountWei: operation.summary.amountWei,
    netRecipientAmountWei: operation.summary.netRecipientAmountWei,
    relayFeeWei: operation.summary.relayFeeWei,
    feeBPS: operation.summary.feeBPS,
    recipient: operation.summary.recipient,
    relayerName: operation.summary.relayerName,
    expiresAt: operation.summary.expiresAt,
    recipientMatchesDepositor: operation.summary.recipientMatchesDepositor,
    txHash: operation.tracking.txHash,
    blockNumber: operation.tracking.blockNumber,
    errorCode: operation.tracking.errorCode,
  };
  return operation.summary.method === "direct"
    ? {
        ...base,
        method: "direct" as const,
        accountId: operation.summary.accountId,
        accountAddress: operation.summary.accountAddress,
        accountType: operation.summary.accountType,
        gasLimit: operation.summary.gasLimit,
        maxFeePerGas: operation.summary.maxFeePerGas,
        gasFeeEstimateWei: operation.summary.gasFeeEstimateWei,
      }
    : { ...base, method: "relay" as const };
}

function privacyReviewFailure(error: unknown): {
  success: false;
  code: PrivacyReviewFailureCode;
  error: string;
} {
  const code: PrivacyReviewFailureCode =
    error instanceof PrivacyShieldQuoteError ||
    error instanceof PrivacyShieldReviewError
      ? error.code
      : "review-unavailable";
  const messages: Record<PrivacyReviewFailureCode, string> = {
    "invalid-request": "Invalid request",
    "account-unavailable": "Switch accounts and try again.",
    "view-only-account": "View-only accounts can’t Shield.",
    "invalid-amount": "Enter a valid ETH amount.",
    "amount-below-minimum":
      `Minimum amount to shield is ${formatEther(PRIVACY_POOLS_DEPLOYMENT.assetConfig.minimumDepositAmount)} ETH. The protocol fee is added on top.`,
    "quote-unavailable": "Quote unavailable. Try again.",
    "auth-required": "Unlock with your main password or biometrics and try again.",
    "recovery-unavailable": "Shield recovery needs attention before you continue.",
    "insufficient-funds":
      `Not enough ${PRIVACY_POOLS_DEPLOYMENT.chainName} ETH for this amount and gas.`,
    "review-unavailable": "Review unavailable. Try again.",
  };
  return { success: false, code, error: messages[code] };
}

function privacyQuoteFailure(error: unknown): {
  success: false;
  code: PrivacyShieldQuoteErrorCode;
  error: string;
} {
  const code =
    error instanceof PrivacyShieldQuoteError
      ? error.code
      : "quote-unavailable";
  const messages: Record<PrivacyShieldQuoteErrorCode, string> = {
    "invalid-request": "Invalid request",
    "account-unavailable": "Switch accounts and try again.",
    "view-only-account": "View-only accounts can’t Shield.",
    "invalid-amount": "Enter a valid ETH amount.",
    "amount-below-minimum":
      `Minimum amount to shield is ${formatEther(PRIVACY_POOLS_DEPLOYMENT.assetConfig.minimumDepositAmount)} ETH. The protocol fee is added on top.`,
    "quote-unavailable": "Quote unavailable. Try again.",
  };
  return { success: false, code, error: messages[code] };
}

export function createBackgroundPrivacyMessageRouter(
  overrides: Partial<Dependencies> = {},
): (
  message: any,
  sendResponse: (response?: any) => void,
) => BackgroundPrivacyRouteResult {
  const dependencies = { ...productionDependencies, ...overrides };

  return (message, sendResponse) => {
    switch (message?.type) {
      case "privacyEnsureInitialized": {
        if (!isExactRequest(message, "privacyEnsureInitialized")) {
          sendResponse({ success: false, error: "Invalid request" });
          return { handled: true, keepChannelOpen: false };
        }
        dependencies
          .ensurePrivacyIdentityInitialized()
          .then(sendResponse)
          .catch(() =>
            sendResponse({
              success: false,
              status: "action-required",
              code: "recovery-required",
              error: "Shield recovery needs attention before you continue.",
            }),
          );
        return { handled: true, keepChannelOpen: true };
      }
      case "privacyRunShieldReadinessCheck": {
        if (!isExactRequest(message, "privacyRunShieldReadinessCheck")) {
          sendResponse({ success: false, error: "Invalid request" });
          return { handled: true, keepChannelOpen: false };
        }
        dependencies
          .runPrivacyShieldReadinessCheck()
          .then(() => sendResponse({ success: true, status: "ready" }))
          .catch((error: unknown) => {
            dependencies.warnPrivacyReadinessFailure(
              error instanceof Error ? error.message : "unknown",
            );
            sendResponse({
              success: false,
              status: "failed",
              error: "Shield check failed. Try again.",
            });
          });
        return { handled: true, keepChannelOpen: true };
      }
      case "privacyRunProverSelfTest": {
        if (!isExactRequest(message, "privacyRunProverSelfTest")) {
          sendResponse({ success: false, error: "Invalid request" });
          return { handled: true, keepChannelOpen: false };
        }
        dependencies.runPrivacyProverFixedSelfTest()
          .then((result) => sendResponse({
            success: true,
            status: "ready",
            commitmentMs: result.commitmentMs,
            withdrawalMs: result.withdrawalMs,
            totalMs: result.totalMs,
          }))
          .catch((error: unknown) => {
            dependencies.warnPrivacyReadinessFailure(
              error instanceof Error ? error.message : "unknown",
            );
            sendResponse({
              success: false,
              error: "Packaged Shield proof check failed.",
            });
          });
        return { handled: true, keepChannelOpen: true };
      }
      case "privacyQuoteShield": {
        if (!isPrivacyAmountMessage(message, "privacyQuoteShield")) {
          sendResponse({
            success: false,
            code: "invalid-request",
            error: "Invalid request",
          });
          return { handled: true, keepChannelOpen: false };
        }
        dependencies
          .quotePrivacyShield({
            accountId: message.accountId,
            accountAddress: message.accountAddress,
            accountType: message.accountType,
            amount: message.amount,
          })
          .then((quote) => sendResponse({ success: true, quote }))
          .catch((error: unknown) => {
            const failure = privacyQuoteFailure(error);
            dependencies.warnPrivacyQuoteFailure(failure.code);
            sendResponse(failure);
          });
        return { handled: true, keepChannelOpen: true };
      }
      case "privacyPrepareShieldReview": {
        if (!isPrivacyAmountMessage(message, "privacyPrepareShieldReview")) {
          sendResponse({
            success: false,
            code: "invalid-request",
            error: "Invalid request",
          });
          return { handled: true, keepChannelOpen: false };
        }
        dependencies
          .preparePrivacyShieldReview({
            accountId: message.accountId,
            accountAddress: message.accountAddress,
            accountType: message.accountType,
            amount: message.amount,
            grossAmountWei: message.grossAmountWei,
          })
          .then((prepared) =>
            sendResponse({
              success: true,
              status: "ready",
              review: {
                chainId: prepared.intent.chainId,
                accountId: prepared.accountId,
                accountAddress: prepared.intent.sourceAddress,
                accountType: prepared.accountType,
                amountWei: prepared.intent.valueWei.toString(),
                protocolFeeWei: prepared.intent.protocolFeeWei.toString(),
                shieldedAmountWei: prepared.intent.shieldedAmountWei.toString(),
                destinationAddress: prepared.intent.destinationAddress,
              },
            }),
          )
          .catch((error: unknown) => {
            const failure = privacyReviewFailure(error);
            dependencies.warnPrivacyReviewFailure(failure.code);
            sendResponse(failure);
          });
        return { handled: true, keepChannelOpen: true };
      }
      case "privacyPrepareShield": {
        if (!isPrivacyPrepareOperationMessage(message)) {
          sendResponse({
            success: false,
            code: "invalid-request",
            error: "Invalid request",
          });
          return { handled: true, keepChannelOpen: false };
        }
        dependencies
          .preparePrivacyShieldOperation({
            requestId: message.requestId,
            accountId: message.accountId,
            accountAddress: message.accountAddress,
            accountType: message.accountType,
            amount: message.amount,
            grossAmountWei: message.grossAmountWei,
          })
          .then((operation) =>
            dependencies.queuePrivacyShieldConfirmation(operation.id),
          )
          .then((operation) =>
            sendResponse({
              success: true,
              status: operation.state,
              operation: publicOperationSummary(operation),
            }),
          )
          .catch((error: unknown) => {
            const failure = privacyOperationFailure(error);
            dependencies.warnPrivacyOperationFailure(failure.code);
            sendResponse(failure);
          });
        return { handled: true, keepChannelOpen: true };
      }
      case "privacyListShieldOperations": {
        if (!isExactRequest(message, "privacyListShieldOperations")) {
          sendResponse({ success: false, error: "Invalid request" });
          return { handled: true, keepChannelOpen: false };
        }
        Promise.all([
          dependencies.listPrivacyShieldOperationSummaries(),
          dependencies.readPrivacyCommitmentPortfolio(),
          dependencies.listPrivacyUnshields(),
          dependencies.listPrivacyRagequits(),
        ])
          .then(async ([operations, portfolio, withdrawals, recoveries]) => {
            const series = await dependencies
              .readPrivacyPortfolioSeries(portfolio.readyBalanceWei)
              .catch(() => ({ priceUsd: null, totalValueUsd: null, snapshots: [] }));
            sendResponse({
              success: true,
              operations: operations.map(publicOperationSummary),
              portfolio,
              series,
              withdrawals: withdrawals.map(publicUnshieldSummary),
              recoveries: recoveries
                .map(privacyRagequitPublicSummary)
                .filter((recovery) => recovery.state !== "wallet_rejected"),
            });
          })
          .catch(() =>
            sendResponse({
              success: false,
              error: "Shield activity unavailable. Try again.",
            }),
          );
        return { handled: true, keepChannelOpen: true };
      }
      case "privacySyncShield": {
        if (!isExactRequest(message, "privacySyncShield")) {
          sendResponse({ success: false, error: "Invalid request" });
          return { handled: true, keepChannelOpen: false };
        }
        dependencies
          .materializeIndexedPrivacyShieldCommitments()
          .then(async () => {
            // Receipt recovery must never be blocked by ASP or event refresh.
            await dependencies.resumePrivacyUnshieldTracking();
            await dependencies.resumePrivacyRagequitTracking();

            const operations = await dependencies.listPrivacyShieldOperationSummaries();
            const eventRecoveryRequired = operations.some((operation) =>
              operation.state === "awaiting_event"
            );
            const sync = eventRecoveryRequired
              ? await reconcilePrivacyCommitmentEventsBestEffort(
                  dependencies,
                  "portfolio",
                )
              : null;
            await dependencies.materializeIndexedPrivacyShieldCommitments();
            await dependencies.resumePrivacyUnshieldTracking();
            await dependencies.resumePrivacyRagequitTracking();
            const eligibility = await dependencies.refreshPrivacyAspEligibility();
            const commitments = await dependencies.refreshPrivacyCommitmentEligibility();
            sendResponse({
              success: true,
              sync: {
                status: sync?.status ?? (eventRecoveryRequired ? "unavailable" : "idle"),
                lastSyncAt: sync?.lastSyncAt ?? 0,
                eligibility: eligibility.status === "unavailable" ||
                    commitments.status === "unavailable"
                  ? "unavailable"
                  : eligibility.status === "current" ||
                    commitments.status === "current"
                  ? "current"
                  : eligibility.status === "locked" || commitments.status === "locked"
                    ? "locked"
                    : "idle",
              },
            });
          })
          .catch(() =>
            sendResponse({
              success: false,
              error: "Shield sync unavailable. Try again later.",
            }),
          );
        return { handled: true, keepChannelOpen: true };
      }
      case "privacyPrepareUnshieldQuote": {
        if (!isPrivacyPrepareUnshieldMessage(message)) {
          sendResponse({ success: false, code: "invalid-request", error: "Invalid request" });
          return { handled: true, keepChannelOpen: false };
        }
        dependencies.preparePrivacyUnshieldQuote({
          requestId: message.requestId,
          amountWei: message.amountWei,
          recipient: message.recipient,
        }).then((operation) => sendResponse({
          success: true,
          operation: publicUnshieldSummary(operation),
        })).catch((error: unknown) => {
          const code = error instanceof PrivacyUnshieldPrepareError
            ? error.code
            : "operation-unavailable";
          if (code === "relay-fee-cap-exceeded") {
            const warning = error instanceof PrivacyUnshieldPrepareError
              ? error.feeCapWarning
              : null;
            if (warning) {
              sendResponse({
                success: false,
                code,
                warning: {
                  kind: "relay-fee-cap-exceeded",
                  relayerName: warning.relayerName,
                  quotedFeeBPS: warning.quotedFeeBPS,
                  maxFeeBPS: warning.maxFeeBPS,
                },
              });
              return;
            }
            sendResponse({
              success: false,
              code: "quote-unavailable",
              error: "The relay quote could not be used.",
            });
            return;
          }
          const messages = {
            "invalid-request": "Enter a valid amount and recipient.",
            "auth-required": "Unlock with your main password or biometrics and try again.",
            "balance-unavailable": "No single ready Shield balance can cover that amount.",
            "balance-syncing": "Your private balance is still syncing. Try again shortly.",
            "quote-unavailable":
              `No valid ${PRIVACY_POOLS_DEPLOYMENT.chainName} relayer quote is available.`,
            "operation-unavailable": "Unshield is unavailable. Try again.",
          } as const;
          sendResponse({ success: false, code, error: messages[code] });
        });
        return { handled: true, keepChannelOpen: true };
      }
      case "privacyExecuteUnshield": {
        if (!isPrivacyExecuteUnshieldMessage(message)) {
          sendResponse({ success: false, code: "invalid-request", error: "Invalid request" });
          return { handled: true, keepChannelOpen: false };
        }
        dependencies.executePrivacyUnshield(message.operationId)
          .then((operation) => sendResponse({
            success: true,
            operation: publicUnshieldSummary(operation),
          }))
          .catch((error: unknown) => {
            const rawCode = error instanceof Error
              ? error.message
              : "operation-unavailable";
            const code = rawCode === "privacy-master-authorization-required"
              ? "auth-required"
              : rawCode;
            sendResponse({
              success: false,
              code,
              error: code === "auth-required"
                ? "Unlock with your main password or biometrics and try again."
                : code === "quote-expired"
                  ? "The relayer quote expired. Request a new quote."
                  : "Unshield didn’t complete. Your private balance is still tracked.",
            });
          });
        return { handled: true, keepChannelOpen: true };
      }
      case "privacyPrepareDirectUnshield": {
        if (!isPrivacyPrepareDirectUnshieldMessage(message)) {
          sendResponse({ success: false, code: "invalid-request", error: "Invalid request" });
          return { handled: true, keepChannelOpen: false };
        }
        let preparedOperationId: string | null = null;
        dependencies.preparePrivacyDirectUnshield({
          requestId: message.requestId,
          amountWei: message.amountWei,
          recipient: message.recipient,
          accountId: message.accountId,
          accountAddress: message.accountAddress,
          accountType: message.accountType,
        }).then((operation) => {
          preparedOperationId = operation.summary.id;
          return dependencies.queuePrivacyDirectUnshieldConfirmation(operation.summary.id);
        }
        ).then((operation) => sendResponse({
          success: true,
          operation: publicUnshieldSummary(operation),
        })).catch(async (error: unknown) => {
          if (preparedOperationId) {
            await dependencies.rollbackPreparedPrivacyDirectUnshield(
              preparedOperationId,
            ).catch(() => undefined);
          }
          const code = error instanceof PrivacyDirectUnshieldError
            ? error.code
            : error instanceof Error && error.message === "auth-required"
              ? "auth-required"
              : "operation-unavailable";
          const messages = {
            "invalid-request": "Choose a WalletChan receiving account.",
            "auth-required": "Unlock with your main password or biometrics and try again.",
            "account-unavailable": "The receiving account is no longer available.",
            "bankr-testnet-unsupported":
              `Bankr doesn’t support ${PRIVACY_POOLS_DEPLOYMENT.chainName} transactions in this build.`,
            "balance-unavailable": "No single ready Shield balance can cover that amount.",
            "balance-syncing": "Your private balance is still syncing. Try again shortly.",
            "insufficient-gas": `The receiving account needs more ${PRIVACY_POOLS_DEPLOYMENT.chainName} ETH for gas.`,
            "proof-failed": "Couldn’t prepare the receiver-paid withdrawal proof.",
            "operation-unavailable": "Receiver-paid withdrawal is unavailable. Try again.",
          } as const;
          sendResponse({ success: false, code, error: messages[code] });
        });
        return { handled: true, keepChannelOpen: true };
      }
      case "privacyPreviewRagequit": {
        if (!isPrivacyPreviewRagequitMessage(message)) {
          sendResponse({ success: false, code: "invalid-request", error: "Invalid request" });
          return { handled: true, keepChannelOpen: false };
        }
        dependencies.materializeIndexedPrivacyShieldCommitments()
          .then(() => dependencies.previewPrivacyRagequits(message.preferredOperationId))
          .then((previews) => sendResponse({ success: true, previews }))
          .catch((error: unknown) => {
            const code = error instanceof PrivacyRagequitPrepareError
              ? error.code
              : "recovery-unavailable";
            const messages = {
              "invalid-request": "Invalid recovery request.",
              "auth-required": "Unlock with your main password or biometrics and try again.",
              "account-unavailable": "The original deposit account is unavailable.",
              "bankr-testnet-unsupported":
                `Bankr doesn’t support ${PRIVACY_POOLS_DEPLOYMENT.chainName} transactions in this build.`,
              "balance-syncing": "Your private balance is still syncing. Try again shortly.",
              "recovery-unavailable": "No public recovery is available for this deposit.",
              "proof-failed": "Couldn’t inspect this public recovery.",
            } as const;
            console.warn("[privacy-shield] public recovery preview failed", code);
            sendResponse({ success: false, code, error: messages[code] });
          });
        return { handled: true, keepChannelOpen: true };
      }
      case "privacyPrepareRagequit": {
        if (!isPrivacyPrepareRagequitMessage(message)) {
          sendResponse({ success: false, code: "invalid-request", error: "Invalid request" });
          return { handled: true, keepChannelOpen: false };
        }
        dependencies.materializeIndexedPrivacyShieldCommitments()
          .then(() => dependencies.preparePrivacyRagequit(message.requestId, {
            accountId: message.accountId,
            accountAddress: message.accountAddress,
            accountType: message.accountType,
            commitmentId: message.commitmentId,
            sourceOperationId: message.sourceOperationId,
            expectedAmountWei: message.expectedAmountWei,
          }))
          .then((operation) =>
            dependencies.queuePrivacyRagequitConfirmation(operation.summary.id),
          )
          .then((operation) => sendResponse({ success: true, operation }))
          .catch((error: unknown) => {
            const code = error instanceof PrivacyRagequitPrepareError
              ? error.code
              : error instanceof Error && error.message === "auth-required"
                ? "auth-required"
                : "recovery-unavailable";
            const messages = {
              "invalid-request": "Invalid recovery request.",
              "auth-required": "Unlock with your main password or biometrics and try again.",
              "account-unavailable": "Choose the original deposit account and try again.",
              "bankr-testnet-unsupported":
                `Bankr doesn’t support ${PRIVACY_POOLS_DEPLOYMENT.chainName} transactions in this build.`,
              "balance-syncing": "Your private balance is still syncing. Try again shortly.",
              "recovery-unavailable": "No public recovery is available for this account.",
              "proof-failed": "Couldn’t prepare the recovery proof. Try again.",
            } as const;
            dependencies.warnPrivacyRecoveryFailure(code);
            sendResponse({ success: false, code, error: messages[code] });
          });
        return { handled: true, keepChannelOpen: true };
      }
      case "privacyPrepareRagequitBatch": {
        if (!isPrivacyPrepareRagequitBatchMessage(message)) {
          sendResponse({ success: false, code: "invalid-request", error: "Invalid request" });
          return { handled: true, keepChannelOpen: false };
        }
        dependencies.materializeIndexedPrivacyShieldCommitments()
          .then(() => dependencies.preparePrivacyRagequitBatch(
            message.requestId,
            message.selections,
          ))
          .then(async (batch) => {
            try {
              const operations = await dependencies.queuePrivacyRagequitBatchConfirmation(
                batch.batchId,
                batch.operations.map((operation) => operation.summary.id),
              );
              return { operations };
            } catch (error) {
              await dependencies.rollbackPreparedPrivacyRagequitBatch(batch.operations);
              throw error;
            }
          })
          .then(({ operations }) => sendResponse({ success: true, operations }))
          .catch((error: unknown) => {
            const code = error instanceof PrivacyRagequitPrepareError
              ? error.code
              : error instanceof Error && error.message === "auth-required"
                ? "auth-required"
                : "recovery-unavailable";
            const messages = {
              "invalid-request": "Choose deposits from one original account.",
              "auth-required": "Unlock with your main password or biometrics and try again.",
              "account-unavailable": "The original deposit account is unavailable.",
              "bankr-testnet-unsupported":
                `Bankr doesn’t support ${PRIVACY_POOLS_DEPLOYMENT.chainName} transactions in this build.`,
              "balance-syncing": "Your private balance is still syncing. Try again shortly.",
              "recovery-unavailable": "This atomic public exit is no longer available.",
              "proof-failed": "Couldn’t prepare every recovery proof. Try again.",
            } as const;
            dependencies.warnPrivacyRecoveryFailure(code);
            sendResponse({ success: false, code, error: messages[code] });
          });
        return { handled: true, keepChannelOpen: true };
      }
      default:
        return { handled: false };
    }
  };
}
