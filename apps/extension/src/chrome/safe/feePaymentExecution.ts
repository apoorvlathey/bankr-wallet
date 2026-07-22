import { WALLETCHAN_PIMLICO_PROXY_BASE } from "@/constants/externalUrls";
import { getAccountById } from "../accountStorage";
import { getLocalPrivateKeyForAccount } from "../accounts/localKeyResolver";
import { getAuthCeremonyEpoch, isCurrentAuthCeremonyEpoch } from "../authTransition";
import { updateBundleStatus } from "../batch/bundleStatusStorage";
import { BUNDLE_STATUS } from "../erc5792Types";
import { applyReceiptToHistory } from "../forceInclusion/receiptPoller";
import {
  getFeePaymentChainContext,
  getFeeTokenAllowance,
  getFeeTokenBalance,
} from "../feePayment/chainState";
import { signFeePaymentEip7702Authorization } from "../feePayment/authorization";
import { PimlicoClient, PimlicoRpcError } from "../feePayment/pimlicoClient";
import { removePendingUserOperation } from "../feePayment/pendingOperations";
import type { Address, Hex } from "../feePayment/pimlicoTypes";
import {
  consumeFeePaymentQuote,
  feePaymentSafeExecutionCalls,
} from "../feePayment/quotes";
import { assertFeePaymentQuoteChainState } from "../feePayment/quoteValidation";
import { verifyUserOperationReceiptOnchain, type VerifiedUserOperationReceipt } from "../feePayment/receiptValidation";
import { signPreparedUserOperation } from "../feePayment/signing";
import { getPackedUserOperationHash, submitUserOperationRecoverably } from "../feePayment/submission";
import { toBundleReceipt } from "../receiptEnrichment";
import { getPasswordType } from "../sessionCache";
import { updateTxInHistory } from "../txHistoryStorage";
import { writeResultToStorage } from "../transactions/runtime";
import {
  executionContext,
  liveExecutable,
  simulateExecutionEnvelope,
  startSafeExecutionReconciliation,
} from "./execution";
import { enforceSafeExecutionSimulation } from "./executionPolicy";
import { buildSafeExecutionData } from "./executionData";
import {
  buildSafeExecutionExecutor,
  ensureSafeExecutorHistory,
  getSafeExecutorHistoryId,
} from "./executorHistory";
import { notifySafeExecutionResult } from "./notifications";
import {
  claimSafeProposalEffect,
  getSafeProposal,
  releaseSafeProposalEffect,
  updateSafeProposal,
} from "./proposalRepository";
import { settleCompetingSafeProposals } from "./executionSettlement";

const RECEIPT_POLL_INTERVAL_MS = 2_000;
const RECEIPT_POLL_ATTEMPTS = 60;

export async function finalizeSafeFeePaymentReceipt(input: {
  proposalId: string;
  userOperationHash: Hex;
  verified: VerifiedUserOperationReceipt;
}) {
  const proposal = await getSafeProposal(input.proposalId);
  const state = input.verified.success ? "executed" : "failed";
  const alreadyFinalized = !!proposal &&
    proposal.transactionHash?.toLowerCase() === input.verified.txHash.toLowerCase() &&
    proposal.state === state;
  if (!proposal || (
    proposal.userOperationHash?.toLowerCase() !== input.userOperationHash.toLowerCase() &&
    !alreadyFinalized
  )) {
    throw new Error("Safe execution no longer matches this UserOperation");
  }
  const updated = alreadyFinalized
    ? proposal
    : await updateSafeProposal(proposal.id, (record) => {
        if (
          record.userOperationHash?.toLowerCase() !==
          input.userOperationHash.toLowerCase()
        ) {
          if (
            record.transactionHash?.toLowerCase() === input.verified.txHash.toLowerCase() &&
            record.state === state
          ) return record;
          throw new Error("Safe execution changed during receipt finalization");
        }
        return {
          ...record,
          state,
          transactionHash: input.verified.txHash,
          userOperationHash: undefined,
          serializedExecution: undefined,
          executionPreparedAt: undefined,
          effectClaim: undefined,
          error: input.verified.success ? undefined : "Safe execution reverted",
          updatedAt: Date.now(),
        };
      });
  const historyId = getSafeExecutorHistoryId(proposal.id);
  await applyReceiptToHistory(
    historyId,
    input.verified.txHash,
    proposal.chainId,
    { ...input.verified.receipt, status: input.verified.success ? "success" : "reverted" },
  );
  if ((proposal.route.kind === "injected" || proposal.route.kind === "walletConnect") &&
      !proposal.route.detachedAt && proposal.route.requestId) {
    await writeResultToStorage(
      `txResult:${proposal.route.requestId}`,
      input.verified.success
        ? { success: true, txHash: input.verified.txHash }
        : { success: false, error: "Safe execution reverted" },
    );
  }
  if (proposal.route.kind === "erc5792" && proposal.route.bundleId) {
    await updateBundleStatus(proposal.route.bundleId, {
      status: input.verified.success ? BUNDLE_STATUS.CONFIRMED : BUNDLE_STATUS.REVERTED,
      txHash: input.verified.txHash,
      completedAt: Date.now(),
      receipts: [toBundleReceipt(input.verified.receipt)],
      ...(input.verified.success ? {} : { error: "Safe execution reverted" }),
    });
  }
  if (input.verified.success) await settleCompetingSafeProposals(updated);
  if (proposal.confirmations.some((confirmation) => !!confirmation.accountId)) {
    await notifySafeExecutionResult({ proposalId: proposal.id, state });
  }
  await removePendingUserOperation(proposal.id);
  return updated;
}

export async function reconcileSafeFeePaymentExecution(proposalId: string) {
  const proposal = await getSafeProposal(proposalId);
  if (!proposal?.userOperationHash || !proposal.executor) {
    throw new Error("Safe fee-token execution is not pending");
  }
  const client = new PimlicoClient(
    `${WALLETCHAN_PIMLICO_PROXY_BASE}/${proposal.chainId}`,
    proposal.chainId,
  );
  const receipt = await client.getUserOperationReceipt(proposal.userOperationHash);
  if (!receipt) return proposal;
  const verified = await verifyUserOperationReceiptOnchain({
    chainId: proposal.chainId,
    sender: proposal.executor.address as Address,
    userOperationHash: proposal.userOperationHash,
    bundlerReceipt: receipt,
  });
  return verified
    ? finalizeSafeFeePaymentReceipt({
        proposalId,
        userOperationHash: proposal.userOperationHash,
        verified,
      })
    : proposal;
}

async function pollSafeFeePaymentReceipt(proposalId: string): Promise<void> {
  for (let attempt = 0; attempt < RECEIPT_POLL_ATTEMPTS; attempt += 1) {
    const proposal = await reconcileSafeFeePaymentExecution(proposalId);
    if (!proposal.userOperationHash) return;
    await new Promise((resolve) => setTimeout(resolve, RECEIPT_POLL_INTERVAL_MS));
  }
}

export async function executeSafeProposalWithFeeToken(input: {
  proposalId: string;
  executorAccountId: string;
  feePaymentQuoteId?: string;
  allowSimulationFailure?: unknown;
}) {
  const { proposal, account } = await executionContext(
    input.proposalId,
    input.executorAccountId,
  );
  const calls = feePaymentSafeExecutionCalls({
    safeAddress: proposal.safeAddress,
    executionData: buildSafeExecutionData(proposal),
  });
  const quote = consumeFeePaymentQuote({
    quoteId: input.feePaymentQuoteId ?? "",
    family: "safeExecution",
    requestId: proposal.id,
    account,
    calls,
  });
  const claim = await claimSafeProposalEffect(proposal.id, { kind: "execute" });
  const claimId = claim.effectClaim!.claimId;
  let preparedForBroadcast = false;
  try {
    const key = await getLocalPrivateKeyForAccount(account.id, "");
    if (!key || !getPasswordType()) throw new Error("Wallet is locked; unlock it and try again");
    const authEpoch = getAuthCeremonyEpoch();
    await liveExecutable(proposal);
    const context = await getFeePaymentChainContext(
      proposal.chainId,
      account.address as Address,
    );
    assertFeePaymentQuoteChainState(quote, context);
    let eip7702Auth;
    if (context.needsAuthorization) {
      if (context.eoaNonce === null) throw new Error("Smart-account authorization nonce is unavailable");
      eip7702Auth = await signFeePaymentEip7702Authorization(key, {
        chainId: proposal.chainId,
        currentEoaNonce: context.eoaNonce,
        rpcUrl: context.chain.rpcUrl,
        customChainMeta: context.chain.isCustom
          ? {
              name: context.chain.name,
              nativeCurrency: context.chain.nativeCurrency,
              explorer: context.chain.explorer || undefined,
            }
          : undefined,
      });
    }
    if (!quote.prepared.approvalAdded) {
      const allowance = await getFeeTokenAllowance(
        context.client,
        quote.token.address,
        account.address as Address,
        quote.prepared.quote.paymaster,
      );
      if (allowance < quote.prepared.maximumTokenCost) {
        throw new Error(`${quote.token.symbol} allowance changed; refresh the gas quote`);
      }
    }
    if ((await getFeeTokenBalance(
      context.client,
      quote.token.address,
      account.address as Address,
    )) < quote.prepared.maximumTokenCost) {
      throw new Error(`Insufficient ${quote.token.symbol} balance for the maximum gas charge`);
    }
    const userOperation = {
      ...quote.prepared.userOperation,
      ...(eip7702Auth ? { eip7702Auth } : { eip7702Auth: undefined }),
    };
    const signature = await signPreparedUserOperation(
      { account, privateKey: key },
      userOperation,
      proposal.chainId,
    );
    const signedUserOperation = { ...userOperation, signature };
    const userOperationHash = getPackedUserOperationHash(
      signedUserOperation,
      proposal.chainId,
    );
    const client = new PimlicoClient(
      `${WALLETCHAN_PIMLICO_PROXY_BASE}/${proposal.chainId}`,
      proposal.chainId,
    );
    const submission = await submitUserOperationRecoverably({
      client,
      record: {
        version: 1,
        family: "safeExecution",
        txId: proposal.id,
        sender: account.address as Address,
        chainId: proposal.chainId,
      },
      userOperation: signedUserOperation,
      beforeBroadcast: async () => {
        if (!isCurrentAuthCeremonyEpoch(authEpoch) || !getPasswordType()) {
          throw new Error("Authentication state changed; unlock and try again");
        }
        const [currentAccount, currentProposal] = await Promise.all([
          getAccountById(account.id),
          getSafeProposal(proposal.id),
        ]);
        if (!currentAccount || currentAccount.type !== account.type ||
            currentAccount.address.toLowerCase() !== account.address.toLowerCase()) {
          throw new Error("Executor account changed");
        }
        if (currentProposal?.effectClaim?.claimId !== claimId) {
          throw new Error("Safe execution claim changed");
        }
        await liveExecutable(proposal);
        await enforceSafeExecutionSimulation(async () => {
          await simulateExecutionEnvelope(
            proposal,
            account.address,
            context.chain.rpcUrl,
          );
        }, input.allowSimulationFailure);
        const preparedAt = Date.now();
        const prepared = await updateSafeProposal(proposal.id, (record) => ({
          ...record,
          state: "ambiguous",
          userOperationHash,
          executionPreparedAt: preparedAt,
          executor: buildSafeExecutionExecutor({
            accountId: account.id,
            accountType: account.type,
            address: account.address.toLowerCase() as `0x${string}`,
          }, undefined, preparedAt, quote.token.symbol),
          error: "Execution is crossing the broadcast boundary",
          updatedAt: preparedAt,
        }));
        await ensureSafeExecutorHistory(prepared, true);
        preparedForBroadcast = true;
      },
    });
    const updated = await releaseSafeProposalEffect(proposal.id, claimId, {
      state: submission.outcomeUnknown ? "ambiguous" : "executing",
      userOperationHash,
      error: submission.outcomeUnknown
        ? "Execution broadcast outcome is being reconciled"
        : undefined,
    });
    await updateTxInHistory(getSafeExecutorHistoryId(proposal.id), {
      status: "pending",
      userOperationHash,
      feePaymentToken: quote.token.symbol,
      broadcastUncertain: submission.outcomeUnknown,
    });
    startSafeExecutionReconciliation(updated.id);
    void pollSafeFeePaymentReceipt(updated.id).catch((error) => {
      console.warn("[safe] fee-token receipt polling paused", error);
    });
    return updated;
  } catch (error) {
    const current = await getSafeProposal(proposal.id).catch(() => null);
    const definitelyNotBroadcast =
      !preparedForBroadcast ||
      (error instanceof PimlicoRpcError && error.definitive);
    const recovered = await releaseSafeProposalEffect(
      proposal.id,
      claimId,
      current?.userOperationHash && !definitelyNotBroadcast
        ? {
            state: "ambiguous",
            userOperationHash: current.userOperationHash,
            executionPreparedAt: current.executionPreparedAt,
            executor: current.executor,
            error: "Execution broadcast outcome is being reconciled",
          }
        : {
            state: "readyToExecute",
            userOperationHash: undefined,
            executionPreparedAt: undefined,
            executor: undefined,
            error: error instanceof Error ? error.message : "Safe execution failed",
          },
    ).catch(() => null);
    if (recovered?.userOperationHash) startSafeExecutionReconciliation(recovered.id);
    throw error;
  }
}
