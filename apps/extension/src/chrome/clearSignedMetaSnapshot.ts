/**
 * Build a ClearSignedMeta snapshot at tx-submission time so the Activity tab
 * can render a human-readable summary ("Approved 100 USDC to Uniswap V3
 * Router") without re-running the decoders, RPC reads, or eth.sh / ENS lookups
 * on every render.
 *
 * Mirrors what the tx-confirmation surfaces compute live:
 *   - parseApproveCalldata + token metadata lookup                 (approves)
 *   - parseTransferCalldata + token metadata lookup                (transfers)
 *   - chain native currency + recipient address                     (native sends)
 *   - ERC-7730 descriptor match for everything else                 (fallback)
 *
 * eth.sh labels + ENS reverse-resolve the counterparty in all four kinds.
 *
 * Designed to be called fire-and-forget after `addTxToHistory` — see
 * `attachClearSignedMetaToHistory` below. Never throws; returns `null` when
 * nothing could be decoded so the row falls back to the existing functionName.
 */

import { formatUnits } from "viem";

import { parseApproveCalldata } from "@/lib/erc20Approve";
import { parseTransferCalldata } from "@/lib/erc20Transfer";
import { getEthShLabels } from "@/lib/ethShLabelsCache";
import { resolveAddressToName } from "@/lib/ensUtils";
import {
  matchCalldataFormat,
  type MatchedFormat,
} from "@/lib/clearSigning/matchDescriptor";
import { getBuiltinCalldataDescriptor } from "@/lib/clearSigning/builtinDescriptors";
import type { Erc7730Descriptor } from "@/lib/clearSigning/types";

import { resolveTokenMetadata } from "./tokenMetadata";
import { handleGetClearSigningDescriptor } from "./clearSigningHandlers";
import {
  updateTxInHistory,
  type ClearSignedMeta,
} from "./txHistoryStorage";

interface TxLike {
  to?: string;
  data?: string;
  value?: string;
}

/**
 * Resolve eth.sh label + ENS reverse-name for a counterparty in parallel.
 * Both are nullable — either layer may be empty and the snapshot still works.
 */
async function resolveCounterpartyLabels(
  address: string,
  chainId: number,
): Promise<{ label?: string; ens?: string }> {
  const [labels, ens] = await Promise.all([
    getEthShLabels(address, chainId).catch(() => [] as string[]),
    resolveAddressToName(address).catch(() => null),
  ]);
  return {
    label: labels[0],
    ens: ens || undefined,
  };
}

async function buildApproveMeta(
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
    // Revoke (amount === 0) skips the amount slot — the activity row reads
    // "Revoke USDC approval from X" with no numeric to display.
    amount:
      parsed.isInfinite || parsed.isRevoke
        ? undefined
        : formatUnits(parsed.amount, token.decimals),
    isInfinite: parsed.isInfinite,
    isRevoke: parsed.isRevoke,
    tokenSymbol: token.symbol,
    tokenLogo: token.logoUrl ?? null,
    tokenAddress,
    counterparty: parsed.spender,
    counterpartyLabel: counterparty.label,
    counterpartyEns: counterparty.ens,
  };
}

async function buildTransferMeta(
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
    tokenLogo: token.logoUrl ?? null,
    tokenAddress,
    counterparty: parsed.recipient,
    counterpartyLabel: counterparty.label,
    counterpartyEns: counterparty.ens,
  };
}

async function buildNativeSendMeta(
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
    tokenLogo: native.logoUrl ?? null,
    counterparty: to,
    counterpartyLabel: counterparty.label,
    counterpartyEns: counterparty.ens,
  };
}

async function buildErc7730Meta(
  to: string,
  data: string,
  chainId: number,
): Promise<ClearSignedMeta | null> {
  const resolved = await resolveMatchedCalldataDescriptor(to, data, chainId);
  if (!resolved) return null;

  const { descriptor, match } = resolved;
  const intent =
    typeof match.format.intent === "string" ? match.format.intent : undefined;
  const contractName = descriptor.metadata?.contractName;
  // Nothing to display? Don't bother snapshotting a meta entry whose render
  // would degrade to the raw functionName anyway.
  if (!intent && !contractName) return null;

  const counterparty = await resolveCounterpartyLabels(to, chainId);

  return {
    kind: "erc7730",
    counterparty: to,
    counterpartyLabel: counterparty.label,
    counterpartyEns: counterparty.ens,
    intent,
    contractName,
  };
}

async function resolveMatchedCalldataDescriptor(
  to: string,
  data: string,
  chainId: number,
): Promise<{ descriptor: Erc7730Descriptor; match: MatchedFormat } | null> {
  const selector =
    data?.startsWith("0x") && data.length >= 10
      ? data.slice(0, 10).toLowerCase()
      : undefined;

  const resp = await handleGetClearSigningDescriptor({
    type: "GET_CLEAR_SIGNING_DESCRIPTOR",
    chainId,
    address: to,
    kind: "calldata",
    selector,
  }).catch(() => null);

  if (resp?.enabled !== false && resp?.descriptor) {
    const descriptor: Erc7730Descriptor = resp.descriptor;
    const match = matchCalldataFormat(descriptor, data);
    if (match) return { descriptor, match };
  }

  if (resp?.enabled === false) return null;

  const local = getBuiltinCalldataDescriptor(chainId, to, data);
  if (!local) return null;
  const localMatch = matchCalldataFormat(local, data);
  return localMatch ? { descriptor: local, match: localMatch } : null;
}

export async function buildClearSignedMeta(
  tx: TxLike,
  chainId: number,
): Promise<ClearSignedMeta | null> {
  const to = tx.to;
  const data = tx.data || "0x";
  const value = tx.value || "0x0";

  if (!to || !/^0x[a-fA-F0-9]{40}$/.test(to)) return null;

  try {
    // ERC-20 approve and transfer share the canonical 68-byte calldata shape;
    // the parsers return null for anything that doesn't match exactly.
    const approve = await buildApproveMeta(to, data, chainId);
    if (approve) return approve;

    const transfer = await buildTransferMeta(to, data, chainId);
    if (transfer) return transfer;

    // Empty/zero calldata + non-zero value = plain native transfer.
    const isEmptyData = !data || data === "0x" || data === "0x0";
    if (isEmptyData) {
      return await buildNativeSendMeta(to, value, chainId);
    }

    // Anything else: look for an ERC-7730 descriptor that knows this selector.
    return await buildErc7730Meta(to, data, chainId);
  } catch {
    return null;
  }
}

/**
 * Fire-and-forget: build the snapshot and patch the tx-history entry once.
 * Failures are swallowed so a slow eth.sh fetch can't block the tx flow.
 */
export function attachClearSignedMetaToHistory(
  txId: string,
  tx: TxLike,
  chainId: number,
): void {
  buildClearSignedMeta(tx, chainId)
    .then((meta) => {
      if (meta) {
        return updateTxInHistory(txId, { clearSignedMeta: meta });
      }
    })
    .catch(() => {
      // Already swallowed inside buildClearSignedMeta; the .catch here is a
      // belt-and-suspenders against an updateTxInHistory storage error.
    });
}
