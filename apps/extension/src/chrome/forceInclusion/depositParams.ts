import { createPublicClient, encodeFunctionData } from "viem";
import type { ForceInclusionChainInfo } from "@/constants/chainRegistry";
import type { TransactionParams } from "../bankr/client";
import { secureHttpTransport } from "../network/rpcClient";
import type { PendingTxRequest } from "../requests/pendingTxStorage";
import { getRpcUrl } from "../transactions/rpcConfig";
import { L1_RPC_TIMEOUT } from "./l1Client";

export const DEFAULT_L2_GAS = 8_000_000n;

const PORTAL_DEPOSIT_ABI = [
  {
    type: "function",
    name: "depositTransaction",
    inputs: [
      { name: "_to", type: "address" },
      { name: "_value", type: "uint256" },
      { name: "_gasLimit", type: "uint64" },
      { name: "_isCreation", type: "bool" },
      { name: "_data", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "payable",
  },
] as const;

export async function buildL1DepositTxParams(
  l2Tx: PendingTxRequest["tx"],
  info: ForceInclusionChainInfo,
  l2GasOverride?: bigint,
): Promise<TransactionParams> {
  if (info.protocol !== "op-stack") {
    throw new Error("Invalid OP Stack force-inclusion route");
  }
  const from = l2Tx.from as `0x${string}`;
  const value = l2Tx.value && l2Tx.value !== "0x0" ? BigInt(l2Tx.value) : 0n;
  const l2To = l2Tx.to as `0x${string}` | undefined;
  const l2Data = (l2Tx.data && l2Tx.data !== "0x" ? l2Tx.data : "0x") as `0x${string}`;
  let l2Gas = l2GasOverride ?? DEFAULT_L2_GAS;

  if (l2GasOverride === undefined) {
    const l2RpcUrl = await getRpcUrl(l2Tx.chainId);
    if (l2RpcUrl) {
      const l2Client = createPublicClient({
        chain: info.viemChain,
        transport: secureHttpTransport(l2RpcUrl, { timeout: L1_RPC_TIMEOUT }),
      });
      try {
        const estimated = await l2Client.estimateGas({
          account: from,
          to: l2To,
          value,
          data: l2Data !== "0x" ? l2Data : undefined,
        });
        l2Gas = (estimated * 120n) / 100n;
      } catch {
        // Preserve the conservative default when L2 estimation is unavailable.
      }
    }
  }

  const portalContracts = (info.viemChain.contracts as any)?.portal;
  if (!portalContracts) throw new Error("No portal contract for this chain");
  const portal = Object.values(portalContracts)[0] as { address: string };
  if (!portal?.address) throw new Error("Could not resolve portal contract address");

  return {
    from: l2Tx.from,
    to: portal.address,
    data: encodeFunctionData({
      abi: PORTAL_DEPOSIT_ABI,
      functionName: "depositTransaction",
      args: [
        l2To ?? "0x0000000000000000000000000000000000000000",
        value,
        l2Gas,
        !l2To,
        l2Data,
      ],
    }),
    // The outer L1 value stays zero: the reviewed value is spent from L2.
    value: "0x0",
    chainId: info.l1ChainId,
  };
}
