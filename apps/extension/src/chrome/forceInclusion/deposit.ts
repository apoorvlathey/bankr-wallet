import { createPublicClient } from "viem";
import {
  FORCE_INCLUSION_CHAINS,
  getNativeCurrencySymbol,
} from "@/constants/chainRegistry";
import { estimateFees } from "../feeEstimation";
import type { GasEstimate } from "../gasEstimation";
import { secureHttpTransport } from "../network/rpcClient";
import { fetchNativeCoinGeckoPrice } from "../portfolio/coingecko";
import { getRpcUrl } from "../transactions/rpcConfig";
import { buildL1DepositTxParams } from "./depositParams";
import {
  createL1PublicClient,
  getL1RpcUrl,
  L1_RPC_TIMEOUT,
} from "./l1Client";

export { buildL1DepositTxParams, DEFAULT_L2_GAS } from "./depositParams";
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
  if (info.protocol !== "op-stack") {
    return failedEstimate("Invalid OP Stack force-inclusion route");
  }

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
