import { pinnedBatchTxRequest } from "../../requests/pinnedRequest";
import { beginPendingRequestEffectLease } from "../../requests/pendingRequestResolution";
import { resolveActiveDelegate } from "../../../utils/delegationResolution";
import {
  resolveLocalSwapPrivateKey,
  resolveLockedSwapAccount,
  resolveSwapChain,
  validateLockedSwapTransactions,
} from "./accountPolicy";
import { selectSwapHistoryEntry } from "./historyMetadata";
import type {
  SwapAccountLock,
  SwapExecutionResult,
  SwapGasOverride,
  SwapTxEntry,
} from "./types";

interface AtomicSwapArgs {
  originalTransactions: SwapTxEntry[];
  chainId: number;
  chainName: string;
  accountLock?: SwapAccountLock;
  gasOverrides?: SwapGasOverride;
}

/** Submit a reviewed PK/seed swap as one EIP-7702 + ERC-7821 transaction. */
export async function handleExecuteSwapAtomicPK(
  args: AtomicSwapArgs,
): Promise<SwapExecutionResult> {
  const {
    originalTransactions,
    chainId,
    chainName,
    accountLock,
    gasOverrides,
  } = args;
  if (originalTransactions.length === 0) {
    return { success: false, error: "No transactions provided" };
  }

  const locked = await resolveLockedSwapAccount(accountLock);
  if (!locked.ok) return { success: false, error: locked.error };
  const validation = validateLockedSwapTransactions(
    originalTransactions,
    locked.account.address,
    chainId,
  );
  if (!validation.ok) return { success: false, error: validation.error };
  const account = locked.account;
  if (account.type !== "privateKey" && account.type !== "seedPhrase") {
    return {
      success: false,
      error: "Atomic-7702 swap requires a PK or Seed Phrase account",
    };
  }

  const privateKey = await resolveLocalSwapPrivateKey(account);
  if (!privateKey) return { success: false, error: "Wallet must be unlocked" };
  const { rpcUrl } = await resolveSwapChain(chainId);
  if (!rpcUrl) {
    return { success: false, error: "Chain has no RPC URL configured" };
  }

  const resolution = await resolveActiveDelegate({
    accountId: account.id,
    accountAddress: account.address as `0x${string}`,
    chainId,
    rpcUrl,
  });
  if (!resolution.delegate) {
    return {
      success: false,
      error:
        "No EIP-7702 delegate available for this account on this chain. Configure a custom delegate in Account Settings or switch chains.",
    };
  }

  const calls = originalTransactions.map((transaction) => ({
    to: (transaction.tx.to ??
      "0x0000000000000000000000000000000000000000") as `0x${string}`,
    data: (transaction.tx.data ?? "0x") as `0x${string}`,
    value: (transaction.tx.value ?? "0x0") as `0x${string}`,
  }));
  const swapMeta = originalTransactions.find(
    (transaction) => transaction.swapMeta,
  )?.swapMeta;
  const bridge = originalTransactions.find(
    (transaction) => transaction.bridge,
  )?.bridge;
  const mainEntry = selectSwapHistoryEntry(originalTransactions);
  const functionNames = originalTransactions
    .map((transaction) => transaction.functionName || transaction.origin)
    .filter(Boolean) as string[];

  const bundleId = crypto.randomUUID();
  const pending = pinnedBatchTxRequest(account, {
    id: bundleId,
    params: {
      version: "1.0",
      chainId: `0x${chainId.toString(16)}` as `0x${string}`,
      from: account.address as `0x${string}`,
      calls,
    },
    origin: mainEntry?.origin ?? "swap",
    favicon: mainEntry?.favicon ?? originalTransactions[0]?.favicon ?? null,
    chainName,
    chainId,
    timestamp: Date.now(),
    trustedInternal: true,
  });
  const precomputedGasEstimates = gasOverrides
    ? [
        {
          gasLimit: gasOverrides.gasLimit,
          maxFeePerGas: gasOverrides.maxFeePerGas,
          maxPriorityFeePerGas: gasOverrides.maxPriorityFeePerGas,
          baseFee: "0",
          estimatedCostWei: "0",
          nativePriceUsd: null,
          nativeCurrencySymbol: "",
          accountBalance: "0",
          insufficientBalance: false,
          estimationFailed: false,
          dappProvidedGas: false,
        },
      ]
    : undefined;
  const effectLease = beginPendingRequestEffectLease(
    "internalOperation",
    bundleId,
  );
  if (!effectLease) {
    return { success: false, error: "Wallet reset is in progress" };
  }

  // Keep this edge lazy: batchTxHandlers consumes the stable txHandlers
  // facade, so a static import would create an initialization cycle.
  const { processBatchTransactionAtomic7702InBackground } = await import(
    "../../batchTxHandlers"
  );
  void processBatchTransactionAtomic7702InBackground(
    bundleId,
    pending,
    { id: account.id, address: account.address, type: account.type },
    privateKey,
    resolution.delegate,
    resolution.needsAuthorization,
    functionNames.length ? functionNames : undefined,
    precomputedGasEstimates,
    { swapMeta, bridge },
    effectLease,
  );
  return { success: true, txIds: [bundleId] };
}
