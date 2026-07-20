import { encodeFunctionData } from "viem";
import { packSafeSignatures } from "./signatureValidation";
import type { SafeProposalRecord } from "./types";

const EXEC_ABI = [{
  type: "function", name: "execTransaction", stateMutability: "payable",
  inputs: [
    { name: "to", type: "address" }, { name: "value", type: "uint256" },
    { name: "data", type: "bytes" }, { name: "operation", type: "uint8" },
    { name: "safeTxGas", type: "uint256" }, { name: "baseGas", type: "uint256" },
    { name: "gasPrice", type: "uint256" }, { name: "gasToken", type: "address" },
    { name: "refundReceiver", type: "address" }, { name: "signatures", type: "bytes" },
  ], outputs: [{ name: "success", type: "bool" }],
}] as const;

/** Exact outer Safe call shared by confirmation-time gas review and broadcast. */
export function buildSafeExecutionData(proposal: SafeProposalRecord) {
  const tx = proposal.transaction;
  return encodeFunctionData({
    abi: EXEC_ABI,
    functionName: "execTransaction",
    args: [
      tx.to,
      BigInt(tx.value),
      tx.data,
      tx.operation,
      BigInt(tx.safeTxGas),
      BigInt(tx.baseGas),
      BigInt(tx.gasPrice),
      tx.gasToken,
      tx.refundReceiver,
      packSafeSignatures(proposal.confirmations),
    ],
  });
}
