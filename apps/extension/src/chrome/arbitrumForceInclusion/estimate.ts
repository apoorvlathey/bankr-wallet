import { createPublicClient } from "viem";
import {
  FORCE_INCLUSION_CHAINS,
  getNativeCurrencySymbol,
} from "@/constants/chainRegistry";
import type { GasEstimate } from "../gasEstimation";
import { estimateFees } from "../feeEstimation";
import { secureHttpTransport } from "../network/rpcClient";
import { fetchNativeCoinGeckoPrice } from "../portfolio/coingecko";
import { getRpcUrl } from "../transactions/rpcConfig";
import {
  createL1PublicClient,
  getL1RpcUrl,
  L1_RPC_TIMEOUT,
} from "../forceInclusion/l1Client";
import { evaluateForceInclusionBalances } from "../forceInclusion/deposit";
import { ARBITRUM_INBOX_ABI, encodeDelayedMessage } from "./contracts";
import {
  assertDelayedMessageSize,
  prepareEstimatedArbitrumMessage,
} from "./preparation";

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
export async function estimateArbitrumForceInclusionGas(
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
  if (info?.protocol !== "arbitrum" || !info.arbitrumContracts) {
    return failedEstimate("Chain does not support Arbitrum delayed inclusion");
  }
  try {
    const l1Client = createL1PublicClient(await getL1RpcUrl(info.l1ChainId));
    const childTx = {
      from: accountAddress,
      to: tx.to || "0x0000000000000000000000000000000000000000",
      data: tx.data || "0x",
      value: tx.value || "0x0",
      chainId: tx.chainId,
    };
    const messageData = await prepareEstimatedArbitrumMessage(childTx, info);
    const maxDataSize = await l1Client.readContract({
      address: info.arbitrumContracts.inbox,
      abi: ARBITRUM_INBOX_ABI,
      functionName: "maxDataSize",
    });
    assertDelayedMessageSize(messageData, maxDataSize);
    const calldata = encodeDelayedMessage(messageData);
    const from = accountAddress as `0x${string}`;
    const l2RpcUrl = await getRpcUrl(tx.chainId);
    const l2Client = l2RpcUrl
      ? createPublicClient({
          chain: info.viemChain,
          transport: secureHttpTransport(l2RpcUrl, { timeout: L1_RPC_TIMEOUT }),
        })
      : null;
    const value = tx.value && tx.value !== "0x0" ? BigInt(tx.value) : 0n;
    const [gas, fees, balance, l2Balance, price, symbol] = await Promise.all([
      l1Client.estimateGas({
        account: from,
        to: info.arbitrumContracts.inbox,
        data: calldata,
        value: 0n,
      }).catch(() => null),
      estimateFees(l1Client, info.l1ChainId).catch(() => null),
      l1Client.getBalance({ address: from }).catch(() => 0n),
      l2Client?.getBalance({ address: from }).catch(() => null) ?? Promise.resolve(null),
      fetchNativeCoinGeckoPrice(info.l1ChainId),
      getNativeCurrencySymbol(info.l1ChainId),
    ]);
    const gasLimit = gas ? (gas * 120n) / 100n : 1_000_000n;
    const maxFeePerGas = fees?.maxFeePerGas ?? 0n;
    const estimatedCostWei = gasLimit * maxFeePerGas;
    const balances = evaluateForceInclusionBalances({
      l1Balance: balance,
      l1GasCost: estimatedCostWei,
      l2Balance,
      l2TransactionValue: value,
    });
    return {
      gasLimit: gasLimit.toString(),
      maxFeePerGas: maxFeePerGas.toString(),
      maxPriorityFeePerGas: (fees?.maxPriorityFeePerGas ?? 0n).toString(),
      baseFee: (fees?.baseFee ?? 0n).toString(),
      estimatedCostWei: estimatedCostWei.toString(),
      nativePriceUsd: price,
      nativeCurrencySymbol: symbol,
      accountBalance: balance.toString(),
      insufficientBalance:
        balances.insufficientGasBalance || balances.insufficientTransactionValueBalance,
      insufficientGasBalance: balances.insufficientGasBalance,
      insufficientTransactionValueBalance: balances.insufficientTransactionValueBalance,
      ...(l2Balance !== null ? { transactionValueBalance: l2Balance.toString() } : {}),
      transactionValueChainName: info.viemChain.name,
      gasBalanceChainName: info.l1ChainName,
      estimationFailed: false,
      dappProvidedGas: false,
    };
  } catch (error: any) {
    return failedEstimate(
      error?.shortMessage || error?.message || "Force inclusion gas estimation failed",
    );
  }
}
