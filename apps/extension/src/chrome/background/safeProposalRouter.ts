import { approveSafeProposalWithOwner } from "../safe/ownerAuthorization";
import { estimateSafeExecution, executeSafeProposal, reconcileSafeExecution } from "../safe/execution";
import { publishSafeProposalConfirmations, reconcileSafeProposal, retryAmbiguousSafePublication } from "../safe/publication";
import { getSafeProposal, getSafeProposals } from "../safe/proposalRepository";
import { appendApprovalRevokeToSafeProposal, appendApprovalRevokesToSafeProposal, authorizeSafeProposalRoute, cancelSafeProposal, changeSafeProposalNonce, createReviewedSafeProposal, detachSafeProposalRoute, hideSafeProposal } from "../safe/proposalLifecycle";
import { startSafeProposalRejection } from "../safe/proposalRejection";
import { requireSafeFeature } from "../safe/featurePolicy";
import { syncSafeAccount } from "../safe/sync";

export const BACKGROUND_SAFE_PROPOSAL_MESSAGE_TYPES = [
  "getSafeProposals", "getSafeProposal", "syncSafeRequests", "createSafeProposal",
  "approveSafeProposal", "publishSafeProposal", "cancelSafeProposal",
  "startSafeProposalRejection",
  "hideSafeProposal", "detachSafeProposalRoute", "reconcileSafeProposal",
  "changeSafeProposalNonce",
  "appendApprovalRevokeToSafeProposal",
  "retrySafePublication",
  "estimateSafeExecution", "executeSafeProposal", "reconcileSafeExecution",
] as const;

export type SafeProposalRouteResult = { handled: false } | { handled: true; keepChannelOpen: boolean };

function run(work: Promise<unknown>, sendResponse: (value: any) => void) {
  void work.then((result) => sendResponse({ success: true, result })).catch((error) => sendResponse({ success: false, error: error instanceof Error ? error.message : "Safe proposal operation failed" }));
}

function gated(
  feature: "proposalInbox" | "sendProposal" | "executeProposal",
  operation: () => Promise<unknown>,
): Promise<unknown> {
  try {
    requireSafeFeature(feature);
    return operation();
  } catch (error) {
    return Promise.reject(error);
  }
}

export function routeBackgroundSafeProposalMessage(
  message: any,
  _sender: chrome.runtime.MessageSender,
  sendResponse: (value?: any) => void,
): SafeProposalRouteResult {
  let work: Promise<unknown> | null = null;
  switch (message?.type) {
    case "getSafeProposals": work = gated("proposalInbox", getSafeProposals); break;
    case "getSafeProposal": work = gated("proposalInbox", () => getSafeProposal(message.proposalId)); break;
    case "syncSafeRequests": work = gated("proposalInbox", async () => {
      await syncSafeAccount(message.accountId);
      return getSafeProposals();
    }); break;
    case "createSafeProposal": work = gated("sendProposal", () => createReviewedSafeProposal({ safeAccountId: message.safeAccountId, chainId: message.chainId, calls: message.calls, route: message.route })); break;
    case "changeSafeProposalNonce": work = gated("sendProposal", () => changeSafeProposalNonce({ proposalId: message.proposalId, nonce: message.nonce })); break;
    case "appendApprovalRevokeToSafeProposal": work = gated(
      "sendProposal",
      () =>
        Array.isArray(message.approvals)
          ? appendApprovalRevokesToSafeProposal({
              proposalId: message.proposalId,
              targets: message.approvals,
            })
          : appendApprovalRevokeToSafeProposal({
              proposalId: message.proposalId,
              tokenAddress: message.tokenAddress,
              spender: message.spender,
            }),
    ); break;
    case "approveSafeProposal": work = gated("sendProposal", async () => {
      const proposal = await approveSafeProposalWithOwner({
        proposalId: message.proposalId,
        ownerAccountId: message.ownerAccountId,
      });
      await authorizeSafeProposalRoute(proposal);
      return proposal;
    }); break;
    case "publishSafeProposal": work = gated("sendProposal", () => publishSafeProposalConfirmations(message.proposalId)); break;
    case "cancelSafeProposal": work = gated("sendProposal", () => cancelSafeProposal(message.proposalId)); break;
    case "startSafeProposalRejection": work = gated("sendProposal", () => startSafeProposalRejection(message.proposalId)); break;
    case "hideSafeProposal": work = gated("proposalInbox", () => hideSafeProposal(message.proposalId)); break;
    case "detachSafeProposalRoute": work = gated("proposalInbox", () => detachSafeProposalRoute(message.proposalId)); break;
    case "reconcileSafeProposal": work = gated("proposalInbox", () => reconcileSafeProposal(message.proposalId)); break;
    case "retrySafePublication": work = gated("sendProposal", () => retryAmbiguousSafePublication(message.proposalId)); break;
    case "estimateSafeExecution": work = gated("executeProposal", () => estimateSafeExecution({ proposalId: message.proposalId, executorAccountId: message.executorAccountId })); break;
    case "executeSafeProposal": work = gated("executeProposal", () => executeSafeProposal({
      proposalId: message.proposalId,
      executorAccountId: message.executorAccountId,
      gasOverrides: message.gasOverrides,
      allowSimulationFailure: message.allowSimulationFailure,
      feePaymentToken: message.feePaymentToken === "token" ? "token" : "native",
      feePaymentQuoteId: typeof message.feePaymentQuoteId === "string"
        ? message.feePaymentQuoteId
        : undefined,
    })); break;
    case "reconcileSafeExecution": work = gated("executeProposal", () => reconcileSafeExecution(message.proposalId)); break;
    default: return { handled: false };
  }
  run(work, sendResponse);
  return { handled: true, keepChannelOpen: true };
}
