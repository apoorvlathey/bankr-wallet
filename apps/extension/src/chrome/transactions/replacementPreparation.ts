import { estimateGas } from "../gasEstimation";
import { fetchRpcResult } from "../network/rpcClient";
import { getAccountById, findNonImpersonatorAccountByAddress } from "../accountStorage";
import { pinnedTxRequest } from "../requests/pinnedRequest";
import {
  getPendingTxRequests,
  savePendingTxRequest,
  type PinnedTxRequest,
  type TransactionReplacementMeta,
} from "../requests/pendingTxStorage";
import { withStorageLock } from "../storageLock";
import { getTxById } from "../txHistoryStorage";
import type { Account } from "../types";
import { getRpcUrl } from "./rpcConfig";
import {
  parseLatestNonce,
  parseReplacementSourceTransaction,
  recommendReplacementFees,
} from "./replacementPolicy";

const REPLACEMENT_PREPARATION_LOCK = "operation:transaction-replacement";

export type TransactionReplacementKind = "speedUp" | "cancel";
export type TransactionReplacementPreparationResult =
  | { success: true; txRequest: PinnedTxRequest }
  | { success: false; error: string };

function validKind(value: unknown): value is TransactionReplacementKind {
  return value === "speedUp" || value === "cancel";
}

async function resolveHistoryAccount(tx: Awaited<ReturnType<typeof getTxById>>) {
  if (!tx) return null;
  const account = tx.accountId
    ? await getAccountById(tx.accountId)
    : await findNonImpersonatorAccountByAddress(tx.tx.from);
  if (!account) return null;
  if (
    account.address.toLowerCase() !== tx.tx.from.toLowerCase() ||
    (tx.accountType && account.type !== tx.accountType)
  ) {
    return null;
  }
  return account;
}

function replacementEligibilityError(
  tx: NonNullable<Awaited<ReturnType<typeof getTxById>>>,
  account: Account | null,
): string | null {
  if (tx.status !== "pending" || !tx.txHash) {
    return "Only a pending transaction can be replaced";
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(tx.txHash)) {
    return "Pending transaction hash is invalid";
  }
  if (tx.replacedByTxId) return "A newer replacement already exists";
  if (
    tx.forceInclusionMeta ||
    tx.userOperationHash ||
    tx.feePaymentToken ||
    tx.erc20FeePayment
  ) {
    return "This transaction submission type cannot be replaced";
  }
  if (!account) return "The transaction account is no longer available";
  if (
    account.type !== "privateKey" &&
    account.type !== "seedPhrase" &&
    account.type !== "ledger"
  ) {
    return "Speed Up and Cancel require a local or Ledger account";
  }
  return null;
}

function replacementTransaction(
  source: ReturnType<typeof parseReplacementSourceTransaction>,
  account: Account,
  kind: TransactionReplacementKind,
  fees: ReturnType<typeof recommendReplacementFees>,
) {
  return {
    from: account.address,
    to: kind === "cancel" ? account.address : source.to,
    data: kind === "cancel" ? "0x" : source.data,
    value: kind === "cancel" ? "0x0" : source.value,
    chainId: source.chainId,
    nonce: source.nonce,
    ...(kind === "speedUp" ? { gas: source.gas } : {}),
    maxFeePerGas: fees.maxFeePerGas,
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
  };
}

/** Build a pinned review request from configured-RPC data; never broadcasts. */
export async function prepareTransactionReplacement(
  txId: unknown,
  kindValue: unknown,
): Promise<TransactionReplacementPreparationResult> {
  if (typeof txId !== "string" || !txId || !validKind(kindValue)) {
    return { success: false, error: "Invalid transaction replacement request" };
  }
  try {
    return await withStorageLock(REPLACEMENT_PREPARATION_LOCK, async () => {
      const history = await getTxById(txId);
      if (!history) return { success: false, error: "Transaction not found" };
      const account = await resolveHistoryAccount(history);
      const eligibilityError = replacementEligibilityError(history, account);
      if (eligibilityError || !account || !history.txHash) {
        return { success: false, error: eligibilityError! };
      }
      const rpcUrl = await getRpcUrl(history.chainId);
      if (!rpcUrl) {
        return { success: false, error: "No RPC URL configured for this chain" };
      }
      const [rawTransaction, receipt, latestNonceValue] = await Promise.all([
        fetchRpcResult(rpcUrl, "eth_getTransactionByHash", [history.txHash], {
          allowPrivateWithoutOrigin: true,
        }),
        fetchRpcResult(rpcUrl, "eth_getTransactionReceipt", [history.txHash], {
          allowPrivateWithoutOrigin: true,
        }),
        fetchRpcResult(
          rpcUrl,
          "eth_getTransactionCount",
          [account.address, "latest"],
          { allowPrivateWithoutOrigin: true },
        ),
      ]);
      if (receipt) {
        return { success: false, error: "Transaction is already included in a block" };
      }
      const source = parseReplacementSourceTransaction(rawTransaction, {
        txHash: history.txHash,
        from: account.address,
        chainId: history.chainId,
      });
      const latestNonce = parseLatestNonce(latestNonceValue);
      if (source.nonce < latestNonce) {
        return { success: false, error: "Transaction is no longer pending" };
      }
      if (source.nonce > latestNonce) {
        return {
          success: false,
          error: `Replace the oldest pending transaction first (nonce ${latestNonce})`,
        };
      }
      const initialTx = replacementTransaction(
        source,
        account,
        kindValue,
        recommendReplacementFees(source),
      );
      const estimate = await estimateGas(
        { ...initialTx, to: initialTx.to ?? undefined },
        account.address,
      ).catch(() => null);
      const fast = estimate?.tiers?.fast;
      const fees = recommendReplacementFees(source, {
        fastMaxFeePerGas: fast?.maxFeePerGas,
        fastMaxPriorityFeePerGas: fast?.maxPriorityFeePerGas,
        predictedNextBaseFee: estimate?.predictedNextBaseFee,
      });
      const replacement: TransactionReplacementMeta = {
        kind: kindValue,
        originalTxId: history.id,
        originalTxHash: history.txHash,
        ...(kindValue === "speedUp" && history.functionName
          ? { originalFunctionName: history.functionName }
          : {}),
        nonce: source.nonce,
        minimumMaxFeePerGas: fees.minimumMaxFeePerGas,
        minimumMaxPriorityFeePerGas: fees.minimumMaxPriorityFeePerGas,
      };
      const pending = await getPendingTxRequests();
      if (pending.some((request) => request.replacement?.originalTxId === history.id)) {
        return { success: false, error: "A replacement is already waiting for review" };
      }
      const freshHistory = await getTxById(history.id);
      if (freshHistory?.status !== "pending" || freshHistory.txHash !== history.txHash) {
        return { success: false, error: "Transaction status changed. Reopen activity." };
      }
      if (
        account.type !== "privateKey" &&
        account.type !== "seedPhrase" &&
        account.type !== "ledger"
      ) {
        return { success: false, error: "Transaction account cannot be replaced" };
      }
      const request = pinnedTxRequest(account, {
        id: crypto.randomUUID(),
        tx: replacementTransaction(source, account, kindValue, fees),
        origin: kindValue === "cancel" ? "WalletChan" : history.origin,
        favicon:
          kindValue === "cancel" ? "/walletchan-icon.png" : history.favicon,
        chainName: history.chainName,
        timestamp: Date.now(),
        trustedInternal: true,
        replacement,
      });
      await savePendingTxRequest(request);
      chrome.runtime
        .sendMessage({ type: "newPendingTxRequest", txRequest: request })
        .catch(() => undefined);
      return { success: true, txRequest: request };
    });
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Could not prepare replacement",
    };
  }
}
