import { getStoredResolvedChainById } from "@/lib/chains";
import {
  hasDefaultDelegateForChain,
  readOnchainDelegate,
} from "@/utils/delegationResolution";
import { getAccountById } from "../accountStorage";
import type { Account } from "../types";
import { getPendingTxRequestById } from "../requests/pendingTxStorage";
import { getPendingBatchTxRequestById } from "../requests/pendingBatchTxStorage";
import { resolvePinnedAccount } from "../transactions/runtime";
import { WALLETCHAN_OFFICIAL_DELEGATE } from "./constants";
import { getFeeTokenBalanceAtRpc } from "./chainState";
import {
  getFeePaymentTokens,
  getPimlicoFeeTokens,
  type FeePaymentTokenId,
} from "./tokens";

export interface FeePaymentOption {
  id: FeePaymentTokenId;
  symbol: string;
  decimals: number;
  available: boolean;
  unavailableReason?: string;
  oneTimeUpgrade?: boolean;
  balance?: string;
  stablecoin?: boolean;
  logoUrl?: string;
}

export function evaluateTokenFeePaymentEligibility(input: {
  accountType: Account["type"];
  chainId: number;
  hasDeployment: boolean;
  onchainDelegate: `0x${string}` | null;
}): Pick<FeePaymentOption, "available" | "unavailableReason" | "oneTimeUpgrade"> {
  if (input.accountType === "impersonator") {
    return { available: false, unavailableReason: "View-only accounts cannot send transactions" };
  }
  if (input.accountType === "ledger") {
    return {
      available: false,
      unavailableReason: "Ledger accounts don't support token gas payment",
    };
  }
  if (input.hasDeployment) {
    return { available: false, unavailableReason: "Token gas payment doesn't support contract deployment" };
  }
  if (
    input.onchainDelegate &&
    input.onchainDelegate.toLowerCase() !== WALLETCHAN_OFFICIAL_DELEGATE.toLowerCase()
  ) {
    return { available: false, unavailableReason: "Account uses a different smart-account delegate" };
  }
  if (input.onchainDelegate) return { available: true };
  if (input.accountType === "privateKey" || input.accountType === "seedPhrase") {
    return hasDefaultDelegateForChain(input.chainId)
      ? { available: true, oneTimeUpgrade: true }
      : { available: false, unavailableReason: "Smart-account upgrade isn't supported on this chain" };
  }
  return {
    available: false,
    unavailableReason: "Enable WalletChan's smart account before paying with a token",
  };
}

export const evaluateUsdcFeePaymentEligibility = evaluateTokenFeePaymentEligibility;

async function getOptionsForRequest(input: {
  chainId: number;
  account: Account;
  hasDeployment: boolean;
}): Promise<{ success: true; options: FeePaymentOption[] }> {
  const catalog = getFeePaymentTokens(input.chainId);
  const native = catalog.find((candidate) => candidate.kind === "native");
  const options: FeePaymentOption[] = [{
    id: "native",
    symbol: native?.symbol ?? "Native token",
    decimals: native?.decimals ?? 18,
    available: true,
  }];
  const feeTokens = getPimlicoFeeTokens(input.chainId);
  if (feeTokens.length === 0) return { success: true, options };

  let eligibility: ReturnType<typeof evaluateTokenFeePaymentEligibility>;
  let balances: Array<string | undefined> = feeTokens.map(() => undefined);
  if (input.hasDeployment) {
    eligibility = evaluateTokenFeePaymentEligibility({
      accountType: input.account.type,
      chainId: input.chainId,
      hasDeployment: true,
      onchainDelegate: null,
    });
  } else {
    const chain = await getStoredResolvedChainById(input.chainId);
    if (!chain?.rpcUrl) {
      eligibility = { available: false, unavailableReason: "No RPC is configured for this chain" };
    } else {
      const [delegate, tokenBalances] = await Promise.all([
        readOnchainDelegate(
          chain.rpcUrl,
          input.chainId,
          input.account.address as `0x${string}`,
        ),
        Promise.all(
          feeTokens.map((token) =>
            getFeeTokenBalanceAtRpc(
              chain.rpcUrl,
              token.address,
              input.account.address as `0x${string}`,
            ).then(String).catch(() => undefined),
          ),
        ),
      ]);
      balances = tokenBalances;
      eligibility = delegate.ok
        ? evaluateTokenFeePaymentEligibility({
            accountType: input.account.type,
            chainId: input.chainId,
            hasDeployment: false,
            onchainDelegate: delegate.delegate,
          })
        : { available: false, unavailableReason: "Couldn't verify smart-account delegation" };
    }
  }

  feeTokens.forEach((token, index) => {
    options.push({
      id: token.id,
      symbol: token.symbol,
      decimals: token.decimals,
      stablecoin: token.stablecoin,
      logoUrl: token.logoUrl,
      balance: balances[index],
      ...eligibility,
    });
  });
  return { success: true, options };
}

export async function getTransactionFeePaymentOptions(txId: string) {
  const pending = await getPendingTxRequestById(txId);
  if (!pending) return { success: false as const, error: "Transaction request not found" };
  const pinned = await resolvePinnedAccount(pending);
  if (!pinned.ok) return { success: false as const, error: pinned.error };
  return getOptionsForRequest({
    chainId: pending.tx.chainId,
    account: pinned.account,
    hasDeployment: !pending.tx.to,
  });
}

export async function getBatchFeePaymentOptions(bundleId: string) {
  const pending = await getPendingBatchTxRequestById(bundleId);
  if (!pending?.accountId) return { success: false as const, error: "Batch request not found" };
  const account = await getAccountById(pending.accountId);
  if (
    !account ||
    (pending.accountAddress &&
      account.address.toLowerCase() !== pending.accountAddress.toLowerCase())
  ) {
    return { success: false as const, error: "Pending request is no longer valid" };
  }
  return getOptionsForRequest({
    chainId: pending.chainId,
    account,
    hasDeployment: pending.params.calls.some((call) => !call.to),
  });
}
