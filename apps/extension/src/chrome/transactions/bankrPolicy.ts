import { FORCE_INCLUSION_CHAINS } from "@/constants/chainRegistry";
import { BANKR_SUPPORTED_CHAIN_IDS, CHAIN_NAMES } from "../../constants/networks";
import type { PendingTxRequest } from "../requests/pendingTxStorage";
import { resolvePinnedAccount } from "./runtime";

export function bankrPrivacyConfirmationError(
  pending: PendingTxRequest,
): string | null {
  return pending.privacyShieldMeta || pending.privacyRagequitMeta
    ? "Bankr cannot submit Privacy Pools transactions on Sepolia"
    : null;
}

export async function validatePinnedBankrTransaction(
  pending: PendingTxRequest,
): Promise<
  | { ok: true; account: Extract<Awaited<ReturnType<typeof resolvePinnedAccount>>, { ok: true }>["account"] & { type: "bankr" } }
  | { ok: false; error: string }
> {
  const pinned = await resolvePinnedAccount(pending);
  if (!pinned.ok) return pinned;
  if (pinned.account.type !== "bankr") {
    return { ok: false, error: "Pending request is no longer valid" };
  }
  if (
    typeof pending.tx.from === "string" &&
    pending.tx.from.length > 0 &&
    pending.tx.from.toLowerCase() !== pinned.account.address.toLowerCase()
  ) {
    return {
      ok: false,
      error: "Transaction 'from' does not match active account",
    };
  }
  return { ok: true, account: pinned.account };
}

export function validateBankrTransactionChain(
  chainId: number,
  forceInclusion?: boolean,
): { ok: true } | { ok: false; error: string } {
  if (forceInclusion) {
    const info = FORCE_INCLUSION_CHAINS.get(chainId);
    if (!info) {
      return { ok: false, error: "Chain does not support force inclusion" };
    }
    if (info.protocol !== "op-stack") {
      return {
        ok: false,
        error: "Arbitrum force inclusion requires a Private Key or Seed Phrase account",
      };
    }
    if (!BANKR_SUPPORTED_CHAIN_IDS.has(info.l1ChainId)) {
      return {
        ok: false,
        error:
          "Force inclusion via Bankr requires an L1 chain supported by the Bankr API. Use a Private Key or Seed Phrase account to force-include on testnets.",
      };
    }
    return { ok: true };
  }
  if (!BANKR_SUPPORTED_CHAIN_IDS.has(chainId)) {
    return {
      ok: false,
      error: `Chain ${CHAIN_NAMES[chainId] || chainId} is not supported for Bankr API accounts`,
    };
  }
  return { ok: true };
}
