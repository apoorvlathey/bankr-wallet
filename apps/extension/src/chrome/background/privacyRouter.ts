/** Wallet-UI transport for bounded Privacy Pools setup and operation state. */

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
  refreshPrivacyAspEligibility,
} from "../privacy/asp/eligibility";
import { refreshPrivacyCommitmentEligibility } from "../privacy/asp/commitmentEligibility";
import { readPrivacyCommitmentPortfolio } from "../privacy/commitments/portfolio";
import {
  preparePrivacyUnshieldQuote,
  PrivacyUnshieldPrepareError,
} from "../privacy/withdrawals/prepare";
import { executePrivacyUnshield } from "../privacy/withdrawals/execute";
import { listPrivacyUnshields } from "../privacy/withdrawals/repository";
import { resumePrivacyUnshieldTracking } from "../privacy/withdrawals/lifecycle";
import type { StoredPrivacyUnshieldV1 } from "../privacy/withdrawals/types";
import {
  preparePrivacyRagequit,
  PrivacyRagequitPrepareError,
} from "../privacy/ragequit/prepare";
import { queuePrivacyRagequitConfirmation } from "../privacy/ragequit/submission";
import { listPrivacyRagequits } from "../privacy/ragequit/repository";
import {
  resumePrivacyRagequitTracking,
} from "../privacy/ragequit/lifecycle";
import { privacyRagequitPublicSummary } from "../privacy/ragequit/types";
import { runPrivacyProverFixedSelfTest } from "../privacy/prover/coordinator";

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
  "privacyPrepareRagequit",
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
  refreshPrivacyCommitmentEligibility: typeof refreshPrivacyCommitmentEligibility;
  readPrivacyCommitmentPortfolio: typeof readPrivacyCommitmentPortfolio;
  preparePrivacyUnshieldQuote: typeof preparePrivacyUnshieldQuote;
  executePrivacyUnshield: typeof executePrivacyUnshield;
  listPrivacyUnshields: typeof listPrivacyUnshields;
  resumePrivacyUnshieldTracking: typeof resumePrivacyUnshieldTracking;
  preparePrivacyRagequit: typeof preparePrivacyRagequit;
  queuePrivacyRagequitConfirmation: typeof queuePrivacyRagequitConfirmation;
  listPrivacyRagequits: typeof listPrivacyRagequits;
  resumePrivacyRagequitTracking: typeof resumePrivacyRagequitTracking;
  warnPrivacyReadinessFailure: (code: string) => void;
  warnPrivacyQuoteFailure: (code: string) => void;
  warnPrivacyReviewFailure: (code: string) => void;
  warnPrivacyOperationFailure: (code: string) => void;
  warnPrivacyRecoveryFailure: (code: string) => void;
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
  refreshPrivacyCommitmentEligibility,
  readPrivacyCommitmentPortfolio,
  preparePrivacyUnshieldQuote,
  executePrivacyUnshield,
  listPrivacyUnshields,
  resumePrivacyUnshieldTracking,
  preparePrivacyRagequit,
  queuePrivacyRagequitConfirmation,
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
};

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
}

interface PrivacyPrepareOperationMessage {
  type: "privacyPrepareShield";
  requestId: string;
  accountId: string;
  accountAddress: string;
  accountType: AccountType;
  amount: string;
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

interface PrivacyPrepareRagequitMessage {
  type: "privacyPrepareRagequit";
  requestId: string;
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

function isPrivacyPrepareRagequitMessage(
  message: unknown,
): message is PrivacyPrepareRagequitMessage {
  if (typeof message !== "object" || message === null || Array.isArray(message)) return false;
  const value = message as Record<string, unknown>;
  return Object.keys(value).length === 2 &&
    value.type === "privacyPrepareRagequit" &&
    typeof value.requestId === "string";
}

function isPrivacyAmountMessage(
  message: unknown,
  type: PrivacyAmountMessage["type"],
): message is PrivacyAmountMessage {
  if (typeof message !== "object" || message === null || Array.isArray(message)) {
    return false;
  }
  const value = message as Record<string, unknown>;
  return (
    Object.keys(value).length === 5 &&
    value.type === type &&
    typeof value.accountId === "string" &&
    typeof value.accountAddress === "string" &&
    (value.accountType === "bankr" ||
      value.accountType === "privateKey" ||
      value.accountType === "seedPhrase" ||
      value.accountType === "impersonator") &&
    typeof value.amount === "string"
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
    Object.keys(value).length === 6 &&
    value.type === "privacyPrepareShield" &&
    typeof value.requestId === "string" &&
    typeof value.accountId === "string" &&
    typeof value.accountAddress === "string" &&
    (value.accountType === "bankr" ||
      value.accountType === "privateKey" ||
      value.accountType === "seedPhrase" ||
      value.accountType === "impersonator") &&
    typeof value.amount === "string"
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
    "amount-below-minimum": "Minimum is 0.001 ETH.",
    "quote-unavailable": "Quote unavailable. Try again.",
    "auth-required": "Unlock with your main password or biometrics and try again.",
    "recovery-unavailable": "Shield recovery needs attention before you continue.",
    "insufficient-funds": "Not enough Sepolia ETH for this amount and gas.",
    "operation-unavailable": "Couldn’t save this Shield operation. Try again.",
    "bankr-testnet-unsupported":
      "Bankr doesn’t support Sepolia transactions. Use a Private Key or Seed Phrase test account.",
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
  return {
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
    "amount-below-minimum": "Minimum is 0.001 ETH.",
    "quote-unavailable": "Quote unavailable. Try again.",
    "auth-required": "Unlock with your main password or biometrics and try again.",
    "recovery-unavailable": "Shield recovery needs attention before you continue.",
    "insufficient-funds": "Not enough Sepolia ETH for this amount and gas.",
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
    "amount-below-minimum": "Minimum is 0.001 ETH.",
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
          .then(([operations, portfolio, withdrawals, recoveries]) =>
            sendResponse({
              success: true,
              operations: operations.map(publicOperationSummary),
              portfolio,
              withdrawals: withdrawals.map(publicUnshieldSummary),
              recoveries: recoveries
                .map(privacyRagequitPublicSummary)
                .filter((recovery) => recovery.state !== "wallet_rejected"),
            }),
          )
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
          .syncPrivacyDepositEvents()
          .then(async (sync) => {
            await dependencies.matchPrivacyShieldOperationsFromEvents();
            await dependencies.materializeIndexedPrivacyShieldCommitments();
            const eligibility = await dependencies.refreshPrivacyAspEligibility();
            const commitments = await dependencies.refreshPrivacyCommitmentEligibility();
            await dependencies.resumePrivacyUnshieldTracking();
            await dependencies.resumePrivacyRagequitTracking();
            sendResponse({
              success: true,
              sync: {
                status: sync.status,
                lastSyncAt: sync.lastSyncAt,
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
          const messages = {
            "invalid-request": "Enter a valid amount and recipient.",
            "auth-required": "Unlock with your main password or biometrics and try again.",
            "balance-unavailable": "No single ready Shield balance can cover that amount.",
            "quote-unavailable": "No valid Sepolia relayer quote is available.",
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
          .catch((error: unknown) => sendResponse({
            success: false,
            code: error instanceof Error ? error.message : "operation-unavailable",
            error: error instanceof Error && error.message === "quote-expired"
              ? "The relayer quote expired. Request a new quote."
              : "Unshield didn’t complete. Your private balance is still tracked.",
          }));
        return { handled: true, keepChannelOpen: true };
      }
      case "privacyPrepareRagequit": {
        if (!isPrivacyPrepareRagequitMessage(message)) {
          sendResponse({ success: false, code: "invalid-request", error: "Invalid request" });
          return { handled: true, keepChannelOpen: false };
        }
        dependencies.materializeIndexedPrivacyShieldCommitments()
          .then(() => dependencies.preparePrivacyRagequit(message.requestId))
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
              "account-unavailable": "Switch to the original deposit account and try again.",
              "bankr-testnet-unsupported": "Bankr doesn’t support Sepolia transactions.",
              "recovery-unavailable": "No public recovery is available for this account.",
              "proof-failed": "Couldn’t prepare the recovery proof. Try again.",
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
