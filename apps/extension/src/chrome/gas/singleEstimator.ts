import type { Address, StateOverride } from "viem";
import { getNativeCurrencySymbol } from "@/constants/chainRegistry";
import { convertLegacyGasPriceToEip1559 } from "../gasFeeNormalization";
import { estimateFees } from "./feeEstimator";
import { fetchNativePrice, getGasClient } from "./client";
import {
  bumpGasForEip7702Auth,
  DEFAULT_GAS_BUFFER_PCT,
  GAS_CHAIN_BY_ID,
  serializeFeeTiers,
} from "./singlePolicy";
import type { GasEstimate } from "./types";

export async function estimateGas(
  tx: {
    from: string;
    to?: string;
    data?: string;
    value?: string;
    chainId: number;
    gas?: string;
    gasPrice?: string;
    maxFeePerGas?: string;
    maxPriorityFeePerGas?: string;
  },
  accountAddress: string,
  options?: {
    eip7702Delegate?: `0x${string}`;
    eip7702AuthCount?: number;
  },
): Promise<GasEstimate> {
  const [client, nativeCurrencySymbol] = await Promise.all([
    getGasClient(tx.chainId),
    getNativeCurrencySymbol(tx.chainId),
  ]);
  if (!client) {
    return {
      gasLimit: "0",
      maxFeePerGas: "0",
      maxPriorityFeePerGas: "0",
      baseFee: "0",
      estimatedCostWei: "0",
      nativePriceUsd: null,
      nativeCurrencySymbol,
      accountBalance: "0",
      insufficientBalance: false,
      estimationFailed: true,
      estimationError: "No RPC URL configured for this chain",
      dappProvidedGas: false,
    };
  }

  const from = accountAddress as Address;
  const to = tx.to ? (tx.to as Address) : undefined;
  const value = tx.value && tx.value !== "0x0" ? BigInt(tx.value) : 0n;
  const data =
    tx.data && tx.data !== "0x"
      ? (tx.data as `0x${string}`)
      : undefined;
  const chain = GAS_CHAIN_BY_ID.get(tx.chainId);
  const dappGas =
    !chain?.usesNonStandardGasModel && tx.gas ? BigInt(tx.gas) : null;
  const dappMaxFee = tx.maxFeePerGas ? BigInt(tx.maxFeePerGas) : null;
  const dappPriorityFee = tx.maxPriorityFeePerGas
    ? BigInt(tx.maxPriorityFeePerGas)
    : null;
  const dappGasPrice = tx.gasPrice ? BigInt(tx.gasPrice) : null;
  const dappProvidedGas = !!(
    dappGas ||
    dappMaxFee ||
    dappPriorityFee ||
    dappGasPrice
  );
  const dappGasInvalid =
    dappProvidedGas &&
    ((dappMaxFee !== null && dappMaxFee === 0n) ||
      (dappPriorityFee !== null && dappPriorityFee === 0n) ||
      (dappGasPrice !== null && dappGasPrice === 0n));

  const delegateCodePromise: Promise<`0x${string}` | undefined> =
    options?.eip7702Delegate
      ? client
          .getCode({ address: options.eip7702Delegate })
          .then((code) => (code && code !== "0x" ? code : undefined))
          .catch(() => undefined)
      : Promise.resolve(undefined);
  let gasLimit = 0n;
  let estimationFailed = false;
  let estimationError: string | undefined;
  let estimationErrorFull: string | undefined;
  const [delegateCode, fees, balance, nativePriceUsd] = await Promise.all([
    delegateCodePromise,
    estimateFees(client, tx.chainId).catch(() => null),
    client.getBalance({ address: from }).catch(() => 0n),
    fetchNativePrice(tx.chainId),
  ]);
  const stateOverride: StateOverride | undefined = delegateCode
    ? [{ address: from, code: delegateCode }]
    : undefined;

  if (dappGas) {
    gasLimit = dappGas;
  } else {
    try {
      const gas = await client.estimateGas({
        account: from,
        to,
        value,
        data,
        ...(stateOverride ? { stateOverride } : {}),
      });
      const bufferPct = chain?.gasBufferPct ?? DEFAULT_GAS_BUFFER_PCT;
      gasLimit =
        bufferPct === 0 ? gas : (gas * BigInt(100 + bufferPct)) / 100n;
    } catch (error: any) {
      estimationFailed = true;
      const fullMessage = error.message || "Gas estimation failed";
      estimationError = error.shortMessage || fullMessage;
      estimationErrorFull = fullMessage;
      gasLimit = 200_000n;
      if (options?.eip7702Delegate) {
        console.warn("[estimateGas:7702] failed", {
          from,
          to,
          delegate: options.eip7702Delegate,
          value: value.toString(),
          dataLen: data?.length ?? 0,
          err: error?.shortMessage || error?.message,
        });
      }
    }
  }
  if (
    options?.eip7702AuthCount &&
    options.eip7702AuthCount > 0 &&
    gasLimit > 0n
  ) {
    gasLimit = bumpGasForEip7702Auth(
      tx.chainId,
      gasLimit,
      options.eip7702AuthCount,
    );
  }

  const baseFee = fees?.baseFee ?? 0n;
  let maxFeePerGas: bigint;
  let maxPriorityFeePerGas: bigint;
  if (dappMaxFee) {
    maxFeePerGas = dappMaxFee;
    maxPriorityFeePerGas =
      dappPriorityFee ?? fees?.maxPriorityFeePerGas ?? 0n;
  } else if (dappGasPrice) {
    const converted = convertLegacyGasPriceToEip1559(dappGasPrice, baseFee);
    maxFeePerGas = converted.maxFeePerGas;
    maxPriorityFeePerGas = converted.maxPriorityFeePerGas;
  } else {
    maxFeePerGas = fees?.maxFeePerGas ?? 0n;
    maxPriorityFeePerGas = fees?.maxPriorityFeePerGas ?? 0n;
  }
  const estimatedCostWei = gasLimit * maxFeePerGas;
  return {
    gasLimit: gasLimit.toString(),
    maxFeePerGas: maxFeePerGas.toString(),
    maxPriorityFeePerGas: maxPriorityFeePerGas.toString(),
    baseFee: baseFee.toString(),
    estimatedCostWei: estimatedCostWei.toString(),
    nativePriceUsd,
    nativeCurrencySymbol,
    accountBalance: balance.toString(),
    insufficientBalance: balance < estimatedCostWei + value,
    tiers: serializeFeeTiers(fees),
    predictedNextBaseFee: fees?.predictedNextBaseFee?.toString(),
    estimationFailed,
    estimationError,
    estimationErrorFull,
    dappProvidedGas,
    dappGasInvalid,
  };
}
