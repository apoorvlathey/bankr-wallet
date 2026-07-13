import { BANKR_SUPPORTED_CHAIN_IDS } from "../../constants/networks";
import { getStoredResolvedChainById } from "../../lib/chains";
import { resolveActiveDelegate } from "../../utils/delegationResolution";
import { getAccountById } from "../accountStorage";
import type { TransactionParams } from "../bankr/submission";
import type { ERC5792Call } from "../erc5792Types";
import type { Account } from "../types";

export function hasConcreteRecipientAddress(
  to: TransactionParams["to"] | ERC5792Call["to"] | undefined,
): to is string {
  return typeof to === "string" && /^0x[a-fA-F0-9]{40}$/.test(to);
}

export async function eligibilityErrorForCrossDappBatch(
  account: { id: string; type: string; address: string } | null,
  chainId: number,
  chainName: string,
): Promise<string | null> {
  if (!account || account.type === "impersonator") {
    return "View-only accounts cannot use cross-dapp batching";
  }
  if (account.type === "bankr") {
    return BANKR_SUPPORTED_CHAIN_IDS.has(chainId)
      ? null
      : `Chain ${chainName} is not supported for Bankr batching`;
  }
  if (account.type === "privateKey" || account.type === "seedPhrase") {
    const resolved = await getStoredResolvedChainById(chainId);
    if (resolved?.rpcUrl) {
      try {
        const plan = await resolveActiveDelegate({
          accountId: account.id,
          accountAddress: account.address as `0x${string}`,
          chainId,
          rpcUrl: resolved.rpcUrl,
        });
        if (plan.delegate) return null;
      } catch (error) {
        console.warn("[cross-dapp] delegate eligibility probe failed", error);
      }
    }
    return `Chain ${chainName} doesn't support atomic batching for this account — set a custom delegate in Account Settings or switch chains.`;
  }
  return "This account type cannot use cross-dapp batching";
}

export async function resolvePinnedCrossDappAccount(
  pending: {
    accountId?: string;
    accountAddress?: string;
    accountType?: string;
  },
  requestedFrom?: string | null,
): Promise<
  | { ok: true; account: Account }
  | { ok: false; error: string }
> {
  if (!pending.accountId || !pending.accountAddress || !pending.accountType) {
    return { ok: false, error: "Pending request is no longer valid" };
  }
  const account = await getAccountById(pending.accountId);
  if (!account) return { ok: false, error: "Account no longer exists" };
  const lockedAddress = pending.accountAddress.toLowerCase();
  if (
    account.address.toLowerCase() !== lockedAddress ||
    account.type !== pending.accountType
  ) {
    return { ok: false, error: "Pending request is no longer valid" };
  }
  if (requestedFrom && requestedFrom.toLowerCase() !== lockedAddress) {
    return {
      ok: false,
      error: "Request from address does not match the locked account",
    };
  }
  return { ok: true, account };
}
