import { BANKR_SUPPORTED_CHAIN_IDS } from "../../../constants/networks";
import { bindPendingBankrCredential } from "../../bankr/credentialBinding";
import { attachClearSignedMetaToHistory } from "../../clearSignedMetaSnapshot";
import { getNextNonce } from "../../forceInclusion/nonceManager";
import type { PinnedTxRequest } from "../../requests/pendingTxStorage";
import { pinnedTxRequest } from "../../requests/pinnedRequest";
import {
  addTxToHistory,
  updateTxInHistory,
  type SwapMeta,
} from "../../txHistoryStorage";
import type {
  BankrAccount,
  PrivateKeyAccount,
  SeedPhraseAccount,
} from "../../types";
import { getUnlockedBankrApiKey } from "../bankrSession";
import { getRpcUrl } from "../rpcConfig";
import {
  resolveLocalSwapPrivateKey,
  resolveLockedSwapAccount,
  resolveSwapChain,
  validateLockedSwapTransactions,
} from "./accountPolicy";
import { processSwapTxBankr } from "./bankrLeg";
import { broadcastSwapTxLocal } from "./localBroadcast";
import { executeImpersonatedSwap } from "./impersonated";
import { executeLedgerSwap } from "./ledgerDirect";
import type {
  SwapAccountLock,
  SwapExecutionResult,
  SwapGasOverride,
  SwapTxEntry,
} from "./types";

/** Execute a reviewed swap sequence against its pinned account and chain. */
export async function handleExecuteSwapDirect(
  transactions: SwapTxEntry[],
  chainName: string,
  gasEstimates?: SwapGasOverride[],
  accountLock?: SwapAccountLock,
  policy: { allowImpersonator: boolean } = { allowImpersonator: true },
): Promise<SwapExecutionResult> {
  if (transactions.length === 0) {
    return { success: false, error: "No transactions provided" };
  }

  const chainId = transactions[0].tx.chainId;
  const locked = await resolveLockedSwapAccount(accountLock);
  if (!locked.ok) return { success: false, error: locked.error };
  const validation = validateLockedSwapTransactions(
    transactions,
    locked.account.address,
    chainId,
  );
  if (!validation.ok) return { success: false, error: validation.error };

  // Preserve the legacy configured-chain gate for every wallet type.
  if (!(await getRpcUrl(chainId))) {
    return { success: false, error: `Chain ${chainId} not configured` };
  }

  const account = locked.account;
  if (account.type === "impersonator") {
    if (!policy.allowImpersonator) {
      return { success: false, error: "View-only accounts cannot execute staking transactions" };
    }
    return executeImpersonatedSwap(
      transactions,
      chainName,
      account,
      gasEstimates,
    );
  }
  if (account.type === "bankr") {
    if (!BANKR_SUPPORTED_CHAIN_IDS.has(chainId)) {
      return {
        success: false,
        error: "Chain not supported for Bankr API accounts",
      };
    }
    const apiKey = await getUnlockedBankrApiKey();
    if (!apiKey) return { success: false, error: "Wallet must be unlocked" };
    return executeBankrSwap(
      transactions,
      chainName,
      account,
      apiKey,
    );
  }

  if (account.type === "ledger") {
    return executeLedgerSwap(transactions, chainName, account, gasEstimates);
  }

  if (account.type !== "privateKey" && account.type !== "seedPhrase") {
    return { success: false, error: "Unsupported account type" };
  }
  const privateKey = await resolveLocalSwapPrivateKey(account);
  if (!privateKey) return { success: false, error: "Wallet must be unlocked" };

  const { rpcUrl, customChainMeta } = await resolveSwapChain(chainId);
  const prepared = await prepareLocalSwap(
    transactions,
    chainName,
    account,
    chainId,
    gasEstimates,
  );

  for (let index = 0; index < prepared.length; index += 1) {
    const item = prepared[index];
    const result = await broadcastSwapTxLocal(
      item.txId,
      item.pending,
      account,
      privateKey,
      item.nonce,
      rpcUrl,
      customChainMeta,
      gasEstimates?.[index],
    );
    if (!result.success) {
      await failPreparedTail(
        prepared.slice(index + 1),
        "Skipped because an earlier swap transaction failed to broadcast",
      );
      return {
        success: index > 0,
        txIds: prepared.map(({ txId }) => txId),
        error: `Transaction ${index + 1}/${prepared.length} failed to broadcast: ${
          result.error || "Unknown error"
        }`,
      };
    }
    if (result.broadcastUncertain) {
      await failPreparedTail(
        prepared.slice(index + 1),
        "Skipped because the previous transaction's broadcast is still unconfirmed",
      );
      return { success: true, txIds: prepared.map(({ txId }) => txId) };
    }
  }

  return { success: true, txIds: prepared.map(({ txId }) => txId) };
}

async function executeBankrSwap(
  transactions: SwapTxEntry[],
  chainName: string,
  account: BankrAccount,
  apiKey: string,
): Promise<SwapExecutionResult> {
  const txIds: string[] = [];
  for (const entry of transactions) {
    const txId = crypto.randomUUID();
    txIds.push(txId);
    const pending = await bindPendingBankrCredential(
      pinnedTxRequest(account, {
        id: txId,
        tx: entry.tx,
        origin: entry.origin,
        favicon: entry.favicon,
        chainName,
        timestamp: Date.now(),
        trustedInternal: true,
      }),
    );
    const leg = await processSwapTxBankr(
      txId,
      pending,
      apiKey,
      entry.functionName,
      entry.swapMeta,
      entry.bridge,
    );
    if (leg.kind === "accepted") continue;

    const attemptedLegCount = txIds.length;
    const skippedError =
      leg.kind === "ambiguous"
        ? "Skipped because the previous Bankr submission outcome is unknown"
        : "Skipped because an earlier Bankr transaction failed";
    for (const skipped of transactions.slice(txIds.length)) {
      const skippedId = crypto.randomUUID();
      txIds.push(skippedId);
      const skippedPending = pinnedTxRequest(account, {
        id: skippedId,
        tx: skipped.tx,
        origin: skipped.origin,
        favicon: skipped.favicon,
        chainName,
        timestamp: Date.now(),
        trustedInternal: true,
      });
      await addTxToHistory({
        id: skippedId,
        status: "failed",
        tx: skippedPending.tx,
        origin: skippedPending.origin,
        favicon: skippedPending.favicon,
        chainName,
        chainId: skippedPending.tx.chainId,
        createdAt: skippedPending.timestamp,
        accountType: "bankr",
        functionName: skipped.functionName,
        swapMeta: skipped.swapMeta,
        bridge: skipped.bridge,
        error: skippedError,
        completedAt: Date.now(),
      });
    }
    return {
      success: leg.kind === "ambiguous" || attemptedLegCount > 1,
      txIds,
      error: leg.error,
    };
  }
  return { success: true, txIds };
}

interface PreparedLocalSwap {
  txId: string;
  pending: PinnedTxRequest;
  nonce: number;
  functionName?: string;
  swapMeta?: SwapMeta;
}

async function prepareLocalSwap(
  transactions: SwapTxEntry[],
  chainName: string,
  account: PrivateKeyAccount | SeedPhraseAccount,
  chainId: number,
  gasEstimates?: SwapGasOverride[],
): Promise<PreparedLocalSwap[]> {
  const prepared: PreparedLocalSwap[] = [];
  const fromAddress = transactions[0].tx.from;

  for (let index = 0; index < transactions.length; index += 1) {
    const entry = transactions[index];
    const txId = crypto.randomUUID();
    const nonce = await getNextNonce(fromAddress, chainId);
    const pending = pinnedTxRequest(account, {
      id: txId,
      tx: entry.tx,
      origin: entry.origin,
      favicon: entry.favicon,
      chainName,
      timestamp: Date.now(),
    });
    const gasOverride = gasEstimates?.[index];
    const txForHistory = gasOverride
      ? {
          ...entry.tx,
          gas: gasOverride.gasLimit,
          maxFeePerGas: gasOverride.maxFeePerGas,
          maxPriorityFeePerGas: gasOverride.maxPriorityFeePerGas,
          gasPrice: undefined,
        }
      : entry.tx;
    await addTxToHistory({
      id: txId,
      status: "processing",
      tx: txForHistory,
      origin: entry.origin,
      favicon: entry.favicon,
      chainName,
      chainId,
      createdAt: pending.timestamp,
      accountType: account.type,
      functionName: entry.functionName,
      swapMeta: entry.swapMeta,
      bridge: entry.bridge,
    });
    attachClearSignedMetaToHistory(
      txId,
      { ...entry.tx, to: entry.tx.to ?? undefined },
      chainId,
    );
    prepared.push({
      txId,
      pending,
      nonce,
      functionName: entry.functionName,
      swapMeta: entry.swapMeta,
    });
  }
  return prepared;
}

async function failPreparedTail(
  tail: PreparedLocalSwap[],
  error: string,
): Promise<void> {
  for (const skipped of tail) {
    await updateTxInHistory(skipped.txId, {
      status: "failed",
      error,
      completedAt: Date.now(),
    });
  }
}
