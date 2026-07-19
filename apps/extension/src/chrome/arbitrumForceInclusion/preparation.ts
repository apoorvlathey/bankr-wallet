import {
  concatHex,
  createPublicClient,
  keccak256,
  serializeTransaction,
  size,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { ForceInclusionChainInfo } from "@/constants/chainRegistry";
import { secureHttpTransport } from "../network/rpcClient";
import type { PendingTxRequest } from "../requests/pendingTxStorage";
import { getRpcUrl } from "../transactions/rpcConfig";
import {
  WALLET_SECRET_OPERATION_LOCK_KEY,
  withStorageLock,
} from "../storageLock";
import { L1_RPC_TIMEOUT } from "../forceInclusion/l1Client";

const DUMMY_SIGNATURE = {
  r: `0x${"11".repeat(32)}` as Hex,
  s: `0x${"22".repeat(32)}` as Hex,
  yParity: 0,
} as const;

const NODE_INTERFACE = "0x00000000000000000000000000000000000000C8" as const;
const NODE_INTERFACE_ABI = [
  {
    type: "function",
    name: "gasEstimateComponents",
    inputs: [
      { name: "to", type: "address" },
      { name: "contractCreation", type: "bool" },
      { name: "data", type: "bytes" },
    ],
    outputs: [
      { name: "gasEstimate", type: "uint64" },
      { name: "gasEstimateForL1", type: "uint64" },
      { name: "baseFee", type: "uint256" },
      { name: "l1BaseFeeEstimate", type: "uint256" },
    ],
    stateMutability: "view",
  },
] as const;

function requireArbitrum(info: ForceInclusionChainInfo) {
  if (info.protocol !== "arbitrum" || !info.arbitrumContracts) {
    throw new Error("Invalid Arbitrum delayed-inclusion route");
  }
  return info.arbitrumContracts;
}

async function prepareChildRequest(
  tx: PendingTxRequest["tx"],
  info: ForceInclusionChainInfo,
  address: `0x${string}`,
) {
  const rpcUrl = await getRpcUrl(tx.chainId);
  if (!rpcUrl) throw new Error("No RPC URL for Arbitrum");
  const client = createPublicClient({
    chain: info.viemChain,
    transport: secureHttpTransport(rpcUrl, { timeout: L1_RPC_TIMEOUT }),
  });
  const to = tx.to as `0x${string}` | undefined;
  const data = (tx.data || "0x") as Hex;
  const value = tx.value && tx.value !== "0x0" ? BigInt(tx.value) : 0n;
  const [nonce, fees, components] = await Promise.all([
    client.getTransactionCount({ address, blockTag: "pending" }),
    client.estimateFeesPerGas(),
    client.readContract({
      address: NODE_INTERFACE,
      abi: NODE_INTERFACE_ABI,
      functionName: "gasEstimateComponents",
      args: [to ?? "0x0000000000000000000000000000000000000000", !to, data],
      account: address,
      value,
    } as any) as Promise<readonly [bigint, bigint, bigint, bigint]>,
  ]);
  const [totalGas, l1Gas] = components;
  const executionGas = totalGas > l1Gas ? totalGas - l1Gas : totalGas;
  return {
    chainId: tx.chainId,
    type: "eip1559" as const,
    nonce,
    to,
    data: data === "0x" ? undefined : data,
    value,
    gas: (executionGas * 120n) / 100n,
    maxFeePerGas: fees.maxFeePerGas,
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
  };
}

export async function prepareSignedArbitrumMessage(
  tx: PendingTxRequest["tx"],
  info: ForceInclusionChainInfo,
  privateKey: Hex,
) {
  requireArbitrum(info);
  const account = privateKeyToAccount(privateKey);
  const request = await prepareChildRequest(tx, info, account.address);
  const serialized = await withStorageLock(
    WALLET_SECRET_OPERATION_LOCK_KEY,
    () => account.signTransaction(request as any),
  );
  const messageData = concatHex(["0x04", serialized]);
  return {
    messageData,
    childHash: keccak256(serialized),
  };
}

/** Builds a same-shape payload for an L1 gas estimate without touching a key. */
export async function prepareEstimatedArbitrumMessage(
  tx: PendingTxRequest["tx"],
  info: ForceInclusionChainInfo,
) {
  requireArbitrum(info);
  const request = await prepareChildRequest(
    tx,
    info,
    tx.from as `0x${string}`,
  );
  const serialized = serializeTransaction(request, DUMMY_SIGNATURE);
  return concatHex(["0x04", serialized]);
}

export function assertDelayedMessageSize(messageData: Hex, maxDataSize: bigint) {
  if (BigInt(size(messageData)) > maxDataSize) {
    throw new Error("Transaction is too large for the Arbitrum delayed inbox");
  }
}
