/**
 * Pure ERC-7821 batch encoding policy.
 *
 * This module deliberately has no storage, session, transport, or signing
 * dependencies. It is the final defense against malformed values and nested
 * self-calls before a batch reaches either the Bankr or local-signing paths.
 */

import { encodeAbiParameters, encodeFunctionData } from "viem";

import type { ERC5792Call } from "../erc5792Types";
import { normalizeTransactionValue } from "../transactionValidation";

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

// ERC-7821 plain single-batch mode (no opData). Spec quote:
//   "If `opData` is empty, `executionData` is simply `abi.encode(calls)`."
//   "0x010000000000000000…: Single batch. Does not support optional `opData`."
//
// We always send executionData = abi.encode(Call[]) (no opData), so the
// matching mode is the plain variant. The previous magic-bit variant
// (`0x01…7821_0001…`) advertised opData support but we never appended any
// opData bytes — Solady's ERC7821 was permissive enough to accept that, but
// stricter implementers (Uniswap Calibur) reject it via strict-equality
// checks on the mode bytes. Plain mode is the universal subset accepted by
// every conforming implementation including MetaMask's EIP7702StatelessDeleGator
// and Calibur. Auth model: with opData empty, the spec mandates "the
// implementation SHOULD require that `msg.sender == address(this)`" — our
// EIP-7702 self-call (tx.to = EOA, msg.sender inside execute = EOA = self)
// satisfies that for every conforming delegator.
const ERC7821_BATCH_MODE =
  "0x0100000000000000000000000000000000000000000000000000000000000000" as `0x${string}`;

function normalizeCallValueOrThrow(
  value: unknown,
  callIndex: number,
): `0x${string}` {
  const normalized = normalizeTransactionValue(value);
  if (!normalized.ok) {
    throw new Error(
      `Call ${callIndex + 1} value is invalid: ${normalized.error}`,
    );
  }
  return normalized.value as `0x${string}`;
}

export function normalizeBatchCallValues(
  calls: ERC5792Call[],
): { ok: true; calls: ERC5792Call[] } | { ok: false; error: string } {
  try {
    return {
      ok: true,
      calls: calls.map((call, index) => ({
        ...call,
        value: normalizeCallValueOrThrow(call.value, index),
      })),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Encode ERC-5792 calls into one ERC-7821 transaction.
 *
 * The output target remains the wallet EOA for both Bankr and EIP-7702 local
 * signing. The outer value is the sum of call values; EIP-7702 callers remove
 * that redundant self-transfer with `omitOuterValueForEip7702`.
 */
export function encodeBatchCalls(
  calls: ERC5792Call[],
  walletAddress: string,
): { to: string; data: string; value: string } {
  // Defense-in-depth against ERC-7821 self-recursion through self-calls.
  //
  // The exploit: an outer batch contains `{ to: EOA, data: <encoded
  // execute(mode, hostileBatch)> }`. Because the EOA is delegated, that
  // self-call dispatches to the delegate's execute() with msg.sender == EOA
  // == address(this), which passes the spec-mandated auth check, and the
  // hostile inner batch runs. The smuggle needs *payload*: a no-op
  // self-call (empty data, zero value) just hits the delegate's fallback,
  // which on conforming implementations does nothing — and wagmi-driven
  // 7702 onboarding flows (7702beat's "Upgrade Account") rely on that
  // pattern to nudge the wallet into the authorization path.
  //
  // We deliberately do NOT reject calls to address(0). The ERC-7821 spec
  // permits ("MAY") executors to substitute `Call.to == 0x0` with
  // `address(this)`, but the MM EIP7702StatelessDeleGator we ship as our
  // default — and most other audited 7821 impls — do NOT substitute.
  // A call to 0x0 onchain is a no-op (no code at the zero address).
  // Rejecting it preemptively broke legitimate flows (counterfactual
  // transfers, 7702-nudge patterns that use 0x0 instead of self) while
  // protecting against a class of attack that's only theoretical on the
  // delegates we actually use. Users see the full call list in the
  // confirmation UI; an inner call to 0x0 with hostile-looking data is as
  // visible as any other call.
  const eoaLower = walletAddress.toLowerCase();
  for (let i = 0; i < calls.length; i++) {
    if (!calls[i].to) {
      throw new Error(
        `Call ${i + 1} has no recipient address — contract deployments cannot be encoded in a batch`,
      );
    }
    const to = (calls[i].to ?? "").toLowerCase();
    if (to !== eoaLower) continue;
    const data = calls[i].data ?? "0x";
    const valueHex = normalizeCallValueOrThrow(calls[i].value, i);
    const hasData = data !== "0x" && data !== "0x0" && data.length > 2;
    const hasValue =
      valueHex !== "0x" && valueHex !== "0x0" && BigInt(valueHex) > 0n;
    if (hasData || hasValue) {
      throw new Error(
        `Call ${i + 1} targets your own account with payload — rejected to prevent ERC-7821 self-recursion (an inner execute() call would re-enter with auth bypassed)`,
      );
    }
  }

  const encodedCalls = calls.map((call, index) => ({
    to: call.to as `0x${string}`,
    value: BigInt(normalizeCallValueOrThrow(call.value, index)),
    data: (call.data || "0x") as `0x${string}`,
  }));

  const totalValue = encodedCalls.reduce((sum, call) => sum + call.value, 0n);
  const executionData = encodeAbiParameters(
    [
      {
        type: "tuple[]",
        components: [
          { type: "address", name: "to" },
          { type: "uint256", name: "value" },
          { type: "bytes", name: "data" },
        ],
      },
    ],
    [encodedCalls],
  );
  const calldata = encodeFunctionData({
    abi: ERC7821_ABI,
    functionName: "execute",
    args: [ERC7821_BATCH_MODE, executionData],
  });

  return {
    to: walletAddress,
    data: calldata,
    value: totalValue > 0n ? `0x${totalValue.toString(16)}` : "0x0",
  };
}

/** Remove the redundant native self-transfer from an EIP-7702 outer call. */
export function omitOuterValueForEip7702(
  batchTx: { to: string; data: string; value: string },
): { to: string; data: string; value: string } {
  return { ...batchTx, value: "0x0" };
}
