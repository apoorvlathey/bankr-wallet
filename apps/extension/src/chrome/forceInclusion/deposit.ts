import { createPublicClient, encodeFunctionData } from "viem";
import {
  FORCE_INCLUSION_CHAINS,
  getNativeCurrencySymbol,
  type ForceInclusionChainInfo,
} from "@/constants/chainRegistry";
import type { TransactionParams } from "../bankr/client";
import { estimateFees } from "../feeEstimation";
import type { GasEstimate } from "../gasEstimation";
import { secureHttpTransport } from "../network/rpcClient";
import { fetchNativeCoinGeckoPrice } from "../portfolio/coingecko";
import type { PendingTxRequest } from "../requests/pendingTxStorage";
import { getRpcUrl } from "../transactions/rpcConfig";
import {
  createL1PublicClient,
  getL1RpcUrl,
  L1_RPC_TIMEOUT,
} from "./l1Client";

export const DEFAULT_L2_GAS = 8_000_000n;
/**
 * Force execution spends the reviewed transaction value from the sender's
 * existing L2 balance. The L1 portal call therefore carries no ETH to mint;
 * the L1 account pays only the portal transaction's gas.
 */
export const FORCE_INCLUSION_L1_CALL_VALUE = 0n;

export function evaluateForceInclusionBalances(args: {
  l1Balance: bigint;
  l1GasCost: bigint;
  l2Balance: bigint | null;
  l2TransactionValue: bigint;
}): {
  insufficientGasBalance: boolean;
  insufficientTransactionValueBalance: boolean;
} {
  return {
    insufficientGasBalance: args.l1Balance < args.l1GasCost,
    // A failed balance read must not be presented as a known zero balance.
    // The L2 simulation remains the fallback signal when the read is unavailable.
    insufficientTransactionValueBalance:
      args.l2Balance !== null &&
      args.l2Balance < args.l2TransactionValue,
  };
}

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

export async function estimateForceInclusionGas(
  tx: {
    from: string;
    to?: string;
    data?: string;
    value?: string;
    chainId: number;
  },
  accountAddress: string,
): Promise<GasEstimate> {
  const info = FORCE_INCLUSION_CHAINS.get(tx.chainId);
  if (!info) return failedEstimate("Chain does not support force inclusion");

  try {
    const l1RpcUrl = await getL1RpcUrl(info.l1ChainId);
    const l1Client = createL1PublicClient(l1RpcUrl);
    const from = accountAddress as `0x${string}`;
    const value = tx.value && tx.value !== "0x0" ? BigInt(tx.value) : 0n;
    const l1TxParams = await buildL1DepositTxParams(
      {
        from: accountAddress,
        to: tx.to || "0x0000000000000000000000000000000000000000",
        data: tx.data || "0x",
        value: tx.value || "0x0",
        chainId: tx.chainId,
      },
      info,
    );
    const l2RpcUrl = await getRpcUrl(tx.chainId);
    const l2Client = l2RpcUrl
      ? createPublicClient({
          chain: info.viemChain,
          transport: secureHttpTransport(l2RpcUrl, {
            timeout: L1_RPC_TIMEOUT,
          }),
        })
      : null;
    const [gas, fees, balance, l2Balance, price, symbol] = await Promise.all([
      l1Client
        .estimateGas({
          account: from,
          to: l1TxParams.to as `0x${string}`,
          data: l1TxParams.data as `0x${string}`,
          value: FORCE_INCLUSION_L1_CALL_VALUE,
        })
        .catch(() => null),
      estimateFees(l1Client, info.l1ChainId).catch(() => null),
      l1Client.getBalance({ address: from }).catch(() => 0n),
      l2Client?.getBalance({ address: from }).catch(() => null) ??
        Promise.resolve(null),
      fetchNativeCoinGeckoPrice(info.l1ChainId),
      getNativeCurrencySymbol(info.l1ChainId),
    ]);
    const gasLimit = gas ? (gas * 120n) / 100n : 1_000_000n;
    const maxFeePerGas = fees?.maxFeePerGas ?? 0n;
    const maxPriorityFeePerGas = fees?.maxPriorityFeePerGas ?? 0n;
    const baseFee = fees?.baseFee ?? 0n;
    const estimatedCostWei = gasLimit * maxFeePerGas;
    const balanceStatus = evaluateForceInclusionBalances({
      l1Balance: balance,
      l1GasCost: estimatedCostWei,
      l2Balance,
      l2TransactionValue: value,
    });
    return {
      gasLimit: gasLimit.toString(),
      maxFeePerGas: maxFeePerGas.toString(),
      maxPriorityFeePerGas: maxPriorityFeePerGas.toString(),
      baseFee: baseFee.toString(),
      estimatedCostWei: estimatedCostWei.toString(),
      nativePriceUsd: price,
      nativeCurrencySymbol: symbol,
      accountBalance: balance.toString(),
      insufficientBalance:
        balanceStatus.insufficientGasBalance ||
        balanceStatus.insufficientTransactionValueBalance,
      insufficientGasBalance: balanceStatus.insufficientGasBalance,
      insufficientTransactionValueBalance:
        balanceStatus.insufficientTransactionValueBalance,
      ...(l2Balance !== null
        ? { transactionValueBalance: l2Balance.toString() }
        : {}),
      transactionValueChainName: info.viemChain.name,
      gasBalanceChainName: info.l1ChainName,
      estimationFailed: false,
      dappProvidedGas: false,
    };
  } catch (error: any) {
    return failedEstimate(
      error?.shortMessage ||
        error?.message ||
        "Force inclusion gas estimation failed",
    );
  }
}

function failedEstimate(error: string): GasEstimate {
  return {
    gasLimit: "0",
    maxFeePerGas: "0",
    maxPriorityFeePerGas: "0",
    baseFee: "0",
    estimatedCostWei: "0",
    nativePriceUsd: null,
    nativeCurrencySymbol: "ETH",
    accountBalance: "0",
    insufficientBalance: false,
    estimationFailed: true,
    estimationError: error,
    dappProvidedGas: false,
  };
}

export async function buildL1DepositTxParams(
  l2Tx: PendingTxRequest["tx"],
  info: ForceInclusionChainInfo,
  l2GasOverride?: bigint,
): Promise<TransactionParams> {
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
    // `msg.value` becomes the deposit's L2 `mint`. Force execution must not
    // bridge fresh ETH: `_value` above spends the sender's existing L2 ETH,
    // while this outer L1 value remains zero so L1 ETH pays gas only.
    value: "0x0",
    chainId: info.l1ChainId,
  };
}
