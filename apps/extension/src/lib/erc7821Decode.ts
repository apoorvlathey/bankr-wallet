/**
 * Decode an ERC-7821 `execute(bytes32 mode, bytes executionData)` calldata
 * blob back into the original per-call list.
 *
 * Used by the tx-detail modal to render the per-call clear-signing view
 * for atomic batches (Bankr ERC-7821 + EIP-7702 PK/SP), where the on-chain
 * tx is a self-call (to == from) whose calldata is the opaque ERC-7821
 * wrapper. Avoids persisting `calls[]` redundantly in tx history.
 *
 * Returns null if the input isn't a recognizable ERC-7821 batch execute.
 */

import { decodeFunctionData, decodeAbiParameters, type Hex } from "viem";
import type { ERC5792Call } from "@/chrome/erc5792Types";

const ERC7821_EXECUTE_SELECTOR = "0xe9ae5c53";

const ERC7821_ABI = [
  {
    inputs: [
      { name: "mode", type: "bytes32" },
      { name: "executionData", type: "bytes" },
    ],
    name: "execute",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
] as const;

// ERC-7821 single-batch modes (byte 0 == 0x01). Two shapes ship per spec:
//   - Plain:   0x010000…000000 — single batch, no opData. What our own
//              encodeBatchCalls() produces (locked in by the encoding-policy
//              decision in _docs/7702.md → "ERC-7821 encoding policy").
//   - OpData:  0x01000000000078210001…00<XX> — same single-batch mode but
//              with the 7821 magic + 0x0001 version pinned at bytes 6-9 and
//              an opData flag at byte 31. We never *emit* this, but other
//              wallets / earlier WalletChan versions may have produced it,
//              and history rows can still contain such txs.
// We accept either as long as the leading byte is 0x01.
function isBatchExecutionMode(mode: string): boolean {
  if (!mode || mode.length !== 66) return false;
  if (!mode.startsWith("0x01")) return false;
  const inner = mode.slice(4).toLowerCase();
  // Plain mode: all middle bytes zero, opData flag (last byte) zero.
  if (/^0+$/.test(inner)) return true;
  // OpData variant: 7821 magic at bytes 6-7, 0001 version at 8-9.
  return mode.slice(14, 18) === "7821" && mode.slice(18, 22) === "0001";
}

type DecodedCall = { to: `0x${string}`; value: bigint; data: `0x${string}` };

function toCalls(calls: readonly DecodedCall[]): ERC5792Call[] {
  return calls.map((c) => ({
    to: c.to,
    value: (c.value > 0n
      ? `0x${c.value.toString(16)}`
      : "0x0") as `0x${string}`,
    data: c.data,
  }));
}

const CALLS_TUPLE_TYPE = {
  type: "tuple[]",
  components: [
    { type: "address", name: "to" },
    { type: "uint256", name: "value" },
    { type: "bytes", name: "data" },
  ],
} as const;

export function decodeErc7821Batch(
  data: string | undefined | null,
): ERC5792Call[] | null {
  if (!data || !data.startsWith(ERC7821_EXECUTE_SELECTOR)) return null;
  try {
    const decoded = decodeFunctionData({
      abi: ERC7821_ABI,
      data: data as Hex,
    });
    if (decoded.functionName !== "execute") return null;
    const [mode, executionData] = decoded.args as [Hex, Hex];
    if (!isBatchExecutionMode(mode)) return null;

    const hasOpData = mode.endsWith("01");
    if (hasOpData) {
      const [batchCalls] = decodeAbiParameters(
        [CALLS_TUPLE_TYPE, { type: "bytes", name: "opData" }],
        executionData,
      ) as readonly [readonly DecodedCall[], Hex];
      return toCalls(batchCalls);
    }
    const [batchCalls] = decodeAbiParameters(
      [CALLS_TUPLE_TYPE],
      executionData,
    ) as readonly [readonly DecodedCall[]];
    return toCalls(batchCalls);
  } catch {
    return null;
  }
}

/**
 * Heuristic check that a tx looks like an ERC-7821 self-batch (atomic 7702 or
 * Bankr atomic). Returns true when `to === from` and `data` starts with the
 * ERC-7821 execute selector. Cheap to call — does not decode.
 */
export function looksLikeErc7821SelfBatch(tx: {
  from?: string;
  to?: string | null;
  data?: string;
}): boolean {
  if (!tx.from || !tx.to || !tx.data) return false;
  if (tx.from.toLowerCase() !== tx.to.toLowerCase()) return false;
  return tx.data.startsWith(ERC7821_EXECUTE_SELECTOR);
}
