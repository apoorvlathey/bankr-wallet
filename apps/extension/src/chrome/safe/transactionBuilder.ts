import { encodeFunctionData, getAddress } from "viem";
import { getCanonicalMultiSendAddress } from "./deploymentRegistry";
import { encodeMultiSendTransactions } from "./multiSend";
import { computeSafeTransactionHash } from "./transactionHash";
import type {
  SafeAddress,
  SafeCall,
  SafeSupportedVersion,
  SafeTransactionData,
} from "./types";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
const MULTISEND_ABI = [{
  type: "function",
  name: "multiSend",
  stateMutability: "payable",
  inputs: [{ name: "transactions", type: "bytes" }],
  outputs: [],
}] as const;

function normalizeCall(call: SafeCall): SafeCall {
  if (call.operation !== 0) throw new Error("Safe delegatecall is not supported");
  if (!/^0x[0-9a-fA-F]*$/.test(call.data) || call.data.length % 2 !== 0) {
    throw new Error("Invalid Safe call data");
  }
  const value = BigInt(call.value);
  if (value < 0n) throw new Error("Invalid Safe call value");
  return {
    to: getAddress(call.to).toLowerCase() as SafeAddress,
    value: value.toString() as `${bigint}`,
    data: call.data.toLowerCase() as `0x${string}`,
    operation: 0,
  };
}

export function buildSafeTransaction(input: {
  chainId: number;
  safeAddress: SafeAddress;
  safeVersion: SafeSupportedVersion;
  nonce: bigint;
  calls: readonly SafeCall[];
}): { calls: SafeCall[]; transaction: SafeTransactionData; safeTxHash: `0x${string}` } {
  if (input.calls.length < 1 || input.calls.length > 100) {
    throw new Error("Invalid Safe call count");
  }
  if (input.nonce < 0n || input.nonce > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Unsupported Safe nonce");
  }
  const calls = input.calls.map(normalizeCall);
  let transaction: SafeTransactionData;
  if (calls.length === 1) {
    transaction = {
      ...calls[0],
      safeTxGas: "0",
      baseGas: "0",
      gasPrice: "0",
      gasToken: ZERO_ADDRESS,
      refundReceiver: ZERO_ADDRESS,
      nonce: Number(input.nonce),
    };
  } else {
    const multiSend = getCanonicalMultiSendAddress(input.chainId, input.safeVersion);
    if (!multiSend) throw new Error("Canonical MultiSend is unavailable on this network");
    transaction = {
      to: multiSend,
      value: "0",
      data: encodeFunctionData({
        abi: MULTISEND_ABI,
        functionName: "multiSend",
        args: [encodeMultiSendTransactions(calls)],
      }),
      operation: 1,
      safeTxGas: "0",
      baseGas: "0",
      gasPrice: "0",
      gasToken: ZERO_ADDRESS,
      refundReceiver: ZERO_ADDRESS,
      nonce: Number(input.nonce),
    };
  }
  return {
    calls,
    transaction,
    safeTxHash: computeSafeTransactionHash({
      chainId: input.chainId,
      safeAddress: input.safeAddress,
      safeVersion: input.safeVersion,
      transaction,
    }),
  };
}

/**
 * Safe Protocol Kit rejection envelope: an empty zero-value call from the
 * Safe to itself using the nonce of the transaction(s) being rejected.
 */
export function buildSafeRejectionTransaction(input: {
  chainId: number;
  safeAddress: SafeAddress;
  safeVersion: SafeSupportedVersion;
  nonce: bigint;
}) {
  return buildSafeTransaction({
    ...input,
    calls: [{
      to: input.safeAddress,
      value: "0",
      data: "0x",
      operation: 0,
    }],
  });
}
