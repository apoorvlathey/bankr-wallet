import { formatUnits } from "viem";
import { parseApproveCalldata } from "@/lib/erc20Approve";
import { parseTransferCalldata } from "@/lib/erc20Transfer";
import { resolveTokenMetadata } from "../tokens/tokenMetadata";
import type { ClearSignedMeta } from "../history/types";
import { resolveCounterpartyLabels } from "./counterparty";

export async function buildApproveMeta(
  tokenAddress: string,
  data: string,
  chainId: number,
): Promise<ClearSignedMeta | null> {
  const parsed = parseApproveCalldata(data);
  if (!parsed) return null;
  const [token, counterparty] = await Promise.all([
    resolveTokenMetadata(chainId, tokenAddress).catch(() => null),
    resolveCounterpartyLabels(parsed.spender, chainId),
  ]);
  if (!token?.symbol || token.decimals === undefined) return null;

  return {
    kind: "approve",
    amount:
      parsed.isInfinite || parsed.isRevoke
        ? undefined
        : formatUnits(parsed.amount, token.decimals),
    isInfinite: parsed.isInfinite,
    isRevoke: parsed.isRevoke,
    tokenSymbol: token.symbol,
    tokenDecimals: token.decimals,
    tokenLogo: token.logoUrl ?? null,
    tokenAddress,
    counterparty: parsed.spender,
    counterpartyLabel: counterparty.label,
    counterpartyEns: counterparty.ens,
  };
}

export async function buildTransferMeta(
  tokenAddress: string,
  data: string,
  chainId: number,
): Promise<ClearSignedMeta | null> {
  const parsed = parseTransferCalldata(data);
  if (!parsed) return null;
  const [token, counterparty] = await Promise.all([
    resolveTokenMetadata(chainId, tokenAddress).catch(() => null),
    resolveCounterpartyLabels(parsed.recipient, chainId),
  ]);
  if (!token?.symbol || token.decimals === undefined) return null;

  return {
    kind: "transfer",
    amount: formatUnits(parsed.amount, token.decimals),
    tokenSymbol: token.symbol,
    tokenDecimals: token.decimals,
    tokenLogo: token.logoUrl ?? null,
    tokenAddress,
    counterparty: parsed.recipient,
    counterpartyLabel: counterparty.label,
    counterpartyEns: counterparty.ens,
  };
}

export async function buildNativeSendMeta(
  to: string,
  value: string,
  chainId: number,
): Promise<ClearSignedMeta | null> {
  let amountWei: bigint;
  try {
    amountWei = BigInt(value);
  } catch {
    return null;
  }
  if (amountWei === 0n) return null;

  const [native, counterparty] = await Promise.all([
    resolveTokenMetadata(chainId, "native").catch(() => null),
    resolveCounterpartyLabels(to, chainId),
  ]);
  if (!native?.symbol || native.decimals === undefined) return null;
  return {
    kind: "nativeSend",
    amount: formatUnits(amountWei, native.decimals),
    tokenSymbol: native.symbol,
    tokenDecimals: native.decimals,
    tokenLogo: native.logoUrl ?? null,
    counterparty: to,
    counterpartyLabel: counterparty.label,
    counterpartyEns: counterparty.ens,
  };
}
