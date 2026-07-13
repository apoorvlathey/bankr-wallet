import { createPublicClient, type Address } from "viem";
import {
  CHAIN_REGISTRY,
  getNativeCurrencySymbol,
} from "@/constants/chainRegistry";
import { secureHttpTransport } from "../network/rpcClient";
import { getRpcUrl } from "../transactions/rpcConfig";
import { estimateFees } from "./feeEstimator";
import { fetchNativePrice } from "./client";
import { tryBatchGasInjection } from "./batchInjection";
import { estimateIndividualWithFallback } from "./batchFallback";
import {
  buildBatchEstimates,
  makeFailedBatchEstimate,
  type BatchEstimateContext,
} from "./batchResult";
import { tryEthSimulateV1 } from "./batchSimulation";
import { serializeFeeTiers } from "./singlePolicy";
import type { BatchGasCall, GasEstimate } from "./types";

const RPC_TIMEOUT = 15_000;
const CHAIN_BY_ID = new Map(
  CHAIN_REGISTRY.map((chain) => [chain.chainId, chain]),
);

export async function estimateBatchGasSequential(
  calls: BatchGasCall[],
  fromAddress: string,
  chainId: number,
): Promise<GasEstimate[]> {
  const rpcUrl = await getRpcUrl(chainId);
  if (!rpcUrl) {
    return Promise.all(
      calls.map(() =>
        makeFailedBatchEstimate(chainId, "No RPC URL configured"),
      ),
    );
  }
  try {
    console.log(
      `[batchGas] chainId=${chainId} rpcHost=${new URL(rpcUrl).host} calls=${calls.length}`,
    );
  } catch {
    // RPC-host logging is diagnostic only.
  }
  const client = createPublicClient({
    transport: secureHttpTransport(rpcUrl, {
      timeout: RPC_TIMEOUT,
      retryCount: 1,
    }),
  });
  const [fees, balance, nativePriceUsd, nativeCurrencySymbol] =
    await Promise.all([
      estimateFees(client, chainId).catch(() => null),
      client
        .getBalance({ address: fromAddress as Address })
        .catch(() => 0n),
      fetchNativePrice(chainId),
      getNativeCurrencySymbol(chainId),
    ]);
  const context: BatchEstimateContext = {
    maxFeePerGas: fees?.maxFeePerGas ?? 0n,
    maxPriorityFeePerGas: fees?.maxPriorityFeePerGas ?? 0n,
    baseFee: fees?.baseFee ?? 0n,
    balance,
    nativePriceUsd,
    nativeCurrencySymbol,
    tiers: serializeFeeTiers(fees),
    predictedNextBaseFee: fees?.predictedNextBaseFee?.toString(),
  };

  const nonStandardGas =
    CHAIN_BY_ID.get(chainId)?.usesNonStandardGasModel;
  if (!nonStandardGas) {
    const simulated = await tryEthSimulateV1(
      calls,
      fromAddress,
      chainId,
      rpcUrl,
    );
    if (simulated) return buildBatchEstimates(simulated, context);
    const injected = await tryBatchGasInjection(
      calls,
      fromAddress,
      chainId,
      rpcUrl,
    );
    if (injected) return buildBatchEstimates(injected, context);
  }

  console.log(
    "[batchGas] Falling back to individual estimation with generous buffer",
  );
  return buildBatchEstimates(
    await estimateIndividualWithFallback(calls, fromAddress, client),
    context,
  );
}
