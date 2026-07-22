import { WALLETCHAN_PIMLICO_PROXY_BASE } from "@/constants/externalUrls";
import { getAccountById } from "../accountStorage";
import { applyReceiptToHistory } from "../forceInclusion/receiptPoller";
import type { PendingTxRequest } from "../requests/pendingTxStorage";
import {
  enforcePendingRequestAuthorizationAtConfirmation,
} from "../requests/pendingRequestLifecycle";
import {
  guardPendingRequestEffectLease,
  type PendingRequestEffectLease,
} from "../requests/pendingRequestResolution";
import { addTxToHistory, updateTxInHistory } from "../txHistoryStorage";
import type { Account } from "../types";
import { writeResultToStorage } from "../transactions/runtime";
import { processingTxIds } from "../transactions/runtime";
import {
  getFeePaymentChainContext,
  getFeeTokenAllowance,
  getFeeTokenBalance,
} from "./chainState";
import { signFeePaymentEip7702Authorization } from "./authorization";
import { PimlicoClient } from "./pimlicoClient";
import { removePendingUserOperation } from "./pendingOperations";
import type { Address, Hex } from "./pimlicoTypes";
import { signPreparedUserOperation, type FeePaymentSigner } from "./signing";
import { submitUserOperationRecoverably } from "./submission";
import { verifyUserOperationReceiptOnchain } from "./receiptValidation";
import type { PreparedFeePaymentQuote } from "./quotes";
import { assertFeePaymentQuoteChainState } from "./quoteValidation";

const RECEIPT_POLL_INTERVAL_MS = 2_000;
const RECEIPT_POLL_ATTEMPTS = 60;

export async function pollFeePaymentReceipt(
  txId: string,
  chainId: number,
  sender: Address,
  userOperationHash: Hex,
): Promise<boolean> {
  const client = new PimlicoClient(
    `${WALLETCHAN_PIMLICO_PROXY_BASE}/${chainId}`,
    chainId,
  );
  for (let attempt = 0; attempt < RECEIPT_POLL_ATTEMPTS; attempt += 1) {
    const receipt = await client.getUserOperationReceipt(userOperationHash);
    if (receipt) {
      const verified = await verifyUserOperationReceiptOnchain({
        chainId,
        sender,
        userOperationHash,
        bundlerReceipt: receipt,
      });
      if (!verified) {
        await new Promise((resolve) => setTimeout(resolve, RECEIPT_POLL_INTERVAL_MS));
        continue;
      }
      if (verified.success) {
        await applyReceiptToHistory(
          txId,
          verified.txHash,
          chainId,
          verified.receipt,
          { feePaymentPaymaster: verified.paymaster },
        );
        await writeResultToStorage(`txResult:${txId}`, {
          success: true,
          txHash: verified.txHash,
        });
      } else {
        await applyReceiptToHistory(
          txId,
          verified.txHash,
          chainId,
          { ...verified.receipt, status: "reverted" },
          { feePaymentPaymaster: verified.paymaster },
        );
        await writeResultToStorage(`txResult:${txId}`, {
          success: false,
          error: "Transaction reverted",
        });
      }
      await removePendingUserOperation(txId);
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, RECEIPT_POLL_INTERVAL_MS));
  }
  return false;
}

export async function processUsdcTransactionInBackground(input: {
  txId: string;
  pending: PendingTxRequest;
  signer: FeePaymentSigner;
  functionName?: string;
  effectLease?: PendingRequestEffectLease;
  quote?: PreparedFeePaymentQuote;
}): Promise<void> {
  const { txId, pending, signer, functionName, effectLease, quote } = input;
  const effectGuard = guardPendingRequestEffectLease(effectLease);
  try {
    const sender = signer.account.address as Address;
    const chainId = pending.tx.chainId;
    if (!quote || quote.chainId !== chainId) {
      throw new Error("A current fee-token quote is required");
    }
    const token = quote.token;

    await addTxToHistory({
      id: txId,
      status: "processing",
      tx: pending.tx,
      origin: pending.origin,
      favicon: pending.favicon,
      chainName: pending.chainName,
      chainId,
      createdAt: pending.timestamp,
      accountType: signer.account.type,
      functionName,
      accountId: pending.accountId,
      erc20FeePayment: { token: token.address.toLowerCase() },
    });

    const context = await getFeePaymentChainContext(chainId, sender);
    assertFeePaymentQuoteChainState(quote, context);
    let eip7702Auth;
    if (context.needsAuthorization) {
      if (!signer.privateKey || context.eoaNonce === null) {
        throw new Error(
          "This account must first enable WalletChan's smart-account delegation",
        );
      }
      eip7702Auth = await signFeePaymentEip7702Authorization(
        signer.privateKey,
        {
          chainId,
          currentEoaNonce: context.eoaNonce,
          rpcUrl: context.chain.rpcUrl,
          customChainMeta: context.chain.isCustom
            ? {
                name: context.chain.name,
                nativeCurrency: context.chain.nativeCurrency,
                explorer: context.chain.explorer || undefined,
              }
            : undefined,
        },
      );
    }

    const client = new PimlicoClient(
      `${WALLETCHAN_PIMLICO_PROXY_BASE}/${chainId}`,
      chainId,
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
    const balance = await getFeeTokenBalance(context.client, token.address, sender);
    if (balance < quote.prepared.maximumTokenCost) {
      throw new Error(`Insufficient ${token.symbol} balance for the maximum gas charge`);
    }
    const userOperation = {
      ...quote.prepared.userOperation,
      ...(eip7702Auth ? { eip7702Auth } : { eip7702Auth: undefined }),
    };

    const latest = pending.accountId
      ? await getAccountById(pending.accountId)
      : null;
    if (!latest || !sameAccount(latest, signer.account)) {
      throw new Error("Pending request account is no longer available");
    }
    const authorization =
      await enforcePendingRequestAuthorizationAtConfirmation(
        "transaction",
        pending,
      );
    if (!authorization.authorized) throw new Error(authorization.error);

    effectGuard.beginEffect();
    const signature = await signPreparedUserOperation(
      signer,
      userOperation,
      chainId,
    );
    effectGuard.settleEffect();
    const submission = await submitUserOperationRecoverably({
      client,
      record: {
        version: 1,
        family: "transaction",
        txId,
        sender,
        chainId,
      },
      userOperation: { ...userOperation, signature },
      beforeBroadcast: effectGuard.beginEffect,
    });
    if (!submission.outcomeUnknown) effectGuard.settleEffect();
    await updateTxInHistory(txId, {
      status: "pending",
      userOperationHash: submission.userOperationHash,
      erc20FeePayment: { token: token.address.toLowerCase() },
      ...(submission.outcomeUnknown ? { broadcastUncertain: true } : {}),
    });
    void pollFeePaymentReceipt(
      txId,
      chainId,
      sender,
      submission.userOperationHash,
    ).then((finalized) => {
      if (finalized && submission.outcomeUnknown) {
        effectGuard.settleEffect();
        effectGuard.releaseIfSafe();
      }
    }).catch((error) =>
      console.warn("[fee-payment] receipt polling paused", error),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Token gas payment failed";
    await updateTxInHistory(txId, { status: "failed", error: message });
    await writeResultToStorage(`txResult:${txId}`, {
      success: false,
      error: message,
    });
  } finally {
    effectGuard.releaseIfSafe();
    processingTxIds.delete(txId);
  }
}

function sameAccount(left: Account, right: Account): boolean {
  return (
    left.id === right.id &&
    left.type === right.type &&
    left.address.toLowerCase() === right.address.toLowerCase()
  );
}
