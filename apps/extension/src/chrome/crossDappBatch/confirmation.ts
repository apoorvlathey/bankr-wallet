import { encodeBatchCalls, omitOuterValueForEip7702 } from "../batch/batchTxEncoding";
import type { TransactionParams } from "../bankr/submission";
import type { ERC5792Call } from "../erc5792Types";
import type { GasEstimate } from "../gasEstimation";
import { addTxToHistory } from "../txHistoryStorage";
import {
  eligibilityErrorForCrossDappBatch,
  hasConcreteRecipientAddress,
  resolvePinnedCrossDappAccount,
} from "./accountPolicy";
import { shipCrossDappBatchBankr } from "./bankr";
import {
  createCrossDappBatchFanOut,
  publishCrossDappBatchShipResult,
} from "./completion";
import { enforceCrossDappBatchAuthorizationAtConfirmation } from "./lifecycle";
import { shipCrossDappBatchLocal } from "./local";
import {
  beginCrossDappBatchProcessing,
  finishCrossDappBatchProcessing,
} from "./runtime";
import { getCrossDappBatch } from "./storage";
import type { CrossDappBatchShipResult } from "./types";
import { executeCrossDappBatchWithFeeToken } from "./feePayment";

export async function handleConfirmCrossDappBatch(
  password: string,
  precomputedGasEstimates?: GasEstimate[],
  feePaymentToken: "native" | "token" = "native",
  feePaymentQuoteId?: string,
): Promise<{ success: boolean; error?: string; txHash?: string }> {
  if (!beginCrossDappBatchProcessing()) {
    return { success: false, error: "Batch already being processed" };
  }
  try {
    const batch = await getCrossDappBatch();
    if (!batch || batch.entries.length === 0) {
      return { success: false, error: "No batch to confirm" };
    }
    const pinned = await resolvePinnedCrossDappAccount(
      {
        accountId: batch.accountId,
        accountAddress: batch.fromAddress,
        accountType: batch.accountType,
      },
      batch.fromAddress,
    );
    if (!pinned.ok) return { success: false, error: pinned.error };
    const batchAccount = pinned.account;
    const eligibilityError = await eligibilityErrorForCrossDappBatch(
      batchAccount,
      batch.chainId,
      batch.chainName,
    );
    if (eligibilityError) return { success: false, error: eligibilityError };
    if (
      batch.entries.some(
        (entry) => !hasConcreteRecipientAddress(entry.tx.to),
      )
    ) {
      return {
        success: false,
        error: "Contract deployment transactions cannot be confirmed as a batch",
      };
    }
    if (feePaymentToken === "token") {
      if (
        batchAccount.type !== "bankr" &&
        batchAccount.type !== "privateKey" &&
        batchAccount.type !== "seedPhrase"
      ) {
        return {
          success: false,
          error: "This account cannot pay cross-dapp batch gas with a token",
        };
      }
      return executeCrossDappBatchWithFeeToken({
        batch,
        account: batchAccount,
        password,
        feePaymentQuoteId,
      });
    }

    const calls: ERC5792Call[] = batch.entries.map((entry) => ({
      to: entry.tx.to as `0x${string}`,
      value: (entry.tx.value ?? "0x0") as `0x${string}`,
      data: (entry.tx.data ?? "0x") as `0x${string}`,
    }));
    const encoded = encodeBatchCalls(calls, batch.fromAddress);
    const outerBatchTx =
      batch.accountType === "bankr"
        ? encoded
        : omitOuterValueForEip7702(encoded);
    const tx: TransactionParams = {
      from: batch.fromAddress,
      to: outerBatchTx.to,
      data: outerBatchTx.data,
      value: outerBatchTx.value,
      chainId: batch.chainId,
    };
    const historyId = `cross-dapp-batch-${Date.now()}`;
    await addTxToHistory({
      id: historyId,
      status: "processing",
      tx,
      origin: "Cross-Dapp Batch",
      favicon: null,
      chainName: batch.chainName,
      chainId: batch.chainId,
      createdAt: Date.now(),
      accountType: batch.accountType,
      functionName: `${calls.length} call${calls.length === 1 ? "" : "s"}`,
      batchCallOrigins: batch.entries.map((entry) => ({
        origin: entry.origin,
        favicon: entry.favicon,
      })),
    });

    let ship: CrossDappBatchShipResult;
    if (batch.accountType === "bankr") {
      ship = await shipCrossDappBatchBankr(batch, tx, password);
    } else {
      ship = await shipCrossDappBatchLocal({
        accountId: batchAccount.id,
        accountAddress: batchAccount.address as `0x${string}`,
        accountType: batch.accountType,
        chainId: batch.chainId,
        encoded: outerBatchTx,
        password,
        precomputedGasEstimates,
        authorizeBeforeEffect: () =>
          enforceCrossDappBatchAuthorizationAtConfirmation(batch),
      });
    }
    return publishCrossDappBatchShipResult({
      historyId,
      callCount: calls.length,
      batch,
      ship,
      fanOut: createCrossDappBatchFanOut(batch),
    });
  } finally {
    finishCrossDappBatchProcessing();
  }
}
