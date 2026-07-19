import { WALLETCHAN_PIMLICO_PROXY_BASE } from "@/constants/externalUrls";
import { getAccountById } from "../accountStorage";
import { handleBatchFailure } from "../batch/batchFailure";
import { processingBundleIds } from "../batch/batchExecutionRuntime";
import { updateBundleStatus } from "../batch/bundleStatusStorage";
import { BUNDLE_STATUS, type PendingBatchTxRequest } from "../erc5792Types";
import { toBundleReceipt } from "../receiptEnrichment";
import { enforcePendingRequestAuthorizationAtConfirmation } from "../requests/pendingRequestLifecycle";
import {
  guardPendingRequestEffectLease,
  type PendingRequestEffectLease,
} from "../requests/pendingRequestResolution";
import { addTxToHistory, updateTxInHistory } from "../txHistoryStorage";
import { writeResultToStorage } from "../transactions/runtime";
import { signFeePaymentEip7702Authorization } from "./authorization";
import {
  getFeePaymentChainContext,
  getFeeTokenAllowance,
  getFeeTokenBalance,
} from "./chainState";
import { PimlicoClient } from "./pimlicoClient";
import { removePendingUserOperation } from "./pendingOperations";
import type { Address, Hex } from "./pimlicoTypes";
import { signPreparedUserOperation, type FeePaymentSigner } from "./signing";
import { submitUserOperationRecoverably } from "./submission";
import { encodeMetaMaskDeleGatorCalls } from "./userOperation";
import type { PreparedFeePaymentQuote } from "./quotes";
import { assertFeePaymentQuoteChainState } from "./quoteValidation";
import { verifyUserOperationReceiptOnchain } from "./receiptValidation";

function callsFromBatch(pending: PendingBatchTxRequest) {
  return pending.params.calls.map((call, index) => {
    if (!call.to || !/^0x[0-9a-fA-F]{40}$/.test(call.to)) {
      throw new Error(`Call ${index + 1} is a contract deployment`);
    }
    return {
      to: call.to as Address,
      data: (call.data ?? "0x") as Hex,
      value: BigInt(call.value ?? "0x0"),
    };
  });
}

async function pollBatchReceipt(
  bundleId: string,
  pending: PendingBatchTxRequest,
  sender: Address,
  userOperationHash: Hex,
): Promise<boolean> {
  const client = new PimlicoClient(
    `${WALLETCHAN_PIMLICO_PROXY_BASE}/${pending.chainId}`,
    pending.chainId,
  );
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const receipt = await client.getUserOperationReceipt(userOperationHash);
    if (receipt) {
      const verified = await verifyUserOperationReceiptOnchain({
        chainId: pending.chainId,
        sender,
        userOperationHash,
        bundlerReceipt: receipt,
      });
      if (!verified) {
        await new Promise((resolve) => setTimeout(resolve, 2_000));
        continue;
      }
      if (verified.success) {
        await updateBundleStatus(bundleId, {
          status: BUNDLE_STATUS.CONFIRMED,
          atomic: true,
          txHash: verified.txHash,
          receipts: [toBundleReceipt(verified.receipt)],
          completedAt: Date.now(),
        });
        await updateTxInHistory(bundleId, {
          status: "success",
          txHash: verified.txHash,
          completedAt: Date.now(),
        });
        await writeResultToStorage(`batchTxResult:${bundleId}`, {
          success: true,
          txHash: verified.txHash,
        });
      } else {
        await updateBundleStatus(bundleId, {
          status: BUNDLE_STATUS.REVERTED,
          atomic: true,
          txHash: verified.txHash,
          receipts: [toBundleReceipt(verified.receipt)],
          completedAt: Date.now(),
          error: "UserOperation reverted",
        });
        await updateTxInHistory(bundleId, {
          status: "failed",
          txHash: verified.txHash,
          error: "UserOperation reverted",
          completedAt: Date.now(),
        });
        await writeResultToStorage(`batchTxResult:${bundleId}`, {
          success: false,
          error: "Batch transaction reverted",
        });
      }
      await removePendingUserOperation(bundleId);
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  return false;
}

export async function processUsdcBatchInBackground(input: {
  bundleId: string;
  pending: PendingBatchTxRequest;
  signer: FeePaymentSigner;
  functionNames?: string[];
  effectLease?: PendingRequestEffectLease;
  quote?: PreparedFeePaymentQuote;
}): Promise<void> {
  const { bundleId, pending, signer, functionNames, effectLease, quote } = input;
  const effectGuard = guardPendingRequestEffectLease(effectLease);
  try {
    const sender = signer.account.address as Address;
    if (!quote || quote.chainId !== pending.chainId) {
      throw new Error("A current fee-token quote is required");
    }
    const token = quote.token;
    const calls = callsFromBatch(pending);
    const displayName = functionNames?.length
      ? `Batch: ${functionNames.join(", ")}`
      : `Batch (${calls.length} calls)`;
    await addTxToHistory({
      id: bundleId,
      status: "processing",
      tx: {
        from: sender,
        to: sender,
        data: encodeMetaMaskDeleGatorCalls(sender, calls),
        value: "0x0",
        chainId: pending.chainId,
      },
      origin: pending.origin,
      favicon: pending.favicon,
      chainName: pending.chainName,
      chainId: pending.chainId,
      createdAt: pending.timestamp,
      accountType: signer.account.type,
      accountId: pending.accountId,
      functionName: displayName,
      feePaymentToken: token.symbol,
    });

    const context = await getFeePaymentChainContext(pending.chainId, sender);
    assertFeePaymentQuoteChainState(quote, context);
    let eip7702Auth;
    if (context.needsAuthorization) {
      if (!signer.privateKey || context.eoaNonce === null) {
        throw new Error("Enable WalletChan's smart account before paying with a token");
      }
      eip7702Auth = await signFeePaymentEip7702Authorization(signer.privateKey, {
        chainId: pending.chainId,
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
    const client = new PimlicoClient(
      `${WALLETCHAN_PIMLICO_PROXY_BASE}/${pending.chainId}`,
      pending.chainId,
    );
    if (!quote.prepared.approvalAdded) {
      const allowance = await getFeeTokenAllowance(
        context.client,
        token.address,
        sender,
        quote.prepared.quote.paymaster,
      );
      if (allowance < quote.prepared.maximumTokenCost) {
        throw new Error(`${token.symbol} allowance changed; refresh the gas quote`);
      }
    }
    if ((await getFeeTokenBalance(context.client, token.address, sender)) < quote.prepared.maximumTokenCost) {
      throw new Error(`Insufficient ${token.symbol} balance for the maximum gas charge`);
    }
    const userOperation = {
      ...quote.prepared.userOperation,
      ...(eip7702Auth ? { eip7702Auth } : { eip7702Auth: undefined }),
    };
    const latest = pending.accountId ? await getAccountById(pending.accountId) : null;
    if (!latest || latest.id !== signer.account.id || latest.address.toLowerCase() !== sender.toLowerCase()) {
      throw new Error("Pending request account is no longer available");
    }
    const authorization = await enforcePendingRequestAuthorizationAtConfirmation(
      "batchTransaction",
      pending,
    );
    if (!authorization.authorized) throw new Error(authorization.error);

    effectGuard.beginEffect();
    const signature = await signPreparedUserOperation(
      signer,
      userOperation,
      pending.chainId,
    );
    effectGuard.settleEffect();
    const submission = await submitUserOperationRecoverably({
      client,
      record: {
        version: 1,
        family: "batchTransaction",
        txId: bundleId,
        sender,
        chainId: pending.chainId,
      },
      userOperation: { ...userOperation, signature },
      beforeBroadcast: effectGuard.beginEffect,
    });
    if (!submission.outcomeUnknown) effectGuard.settleEffect();
    await updateBundleStatus(bundleId, { status: BUNDLE_STATUS.PENDING, atomic: true });
    await updateTxInHistory(bundleId, {
      status: "pending",
      userOperationHash: submission.userOperationHash,
      ...(submission.outcomeUnknown ? { broadcastUncertain: true } : {}),
    });
    void pollBatchReceipt(
      bundleId,
      pending,
      sender,
      submission.userOperationHash,
    ).then((finalized) => {
      if (finalized && submission.outcomeUnknown) {
        effectGuard.settleEffect();
        effectGuard.releaseIfSafe();
      }
    }).catch((error) =>
      console.warn("[fee-payment] batch receipt polling paused", error),
    );
  } catch (error) {
    await handleBatchFailure(
      bundleId,
      pending,
      error instanceof Error ? error.message : "Token gas payment failed",
    );
  } finally {
    effectGuard.releaseIfSafe();
    processingBundleIds.delete(bundleId);
  }
}
