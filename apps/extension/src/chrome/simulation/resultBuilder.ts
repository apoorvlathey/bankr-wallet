import type { PublicClient } from "viem";

import {
  buildNativeChange,
  buildPreflightTokenChanges,
  buildUnpricedNativeChange,
} from "./assetChangeNormalization";
import {
  getNativeCurrency,
  resolveNativeCurrency,
} from "./nativeCurrency";
import { getPortfolioPriceMap } from "./portfolioPrices";
import { enrichTokenChanges } from "./tokenEnrichment";
import type {
  RawSimulationResult,
  SimulationResult,
} from "./types";

export async function buildSimulationResult(
  client: PublicClient,
  chainId: number,
  accountAddress: string,
  raw: RawSimulationResult,
): Promise<SimulationResult> {
  // The candidate preflight already returned standard ERC-20 metadata. Paint
  // those deltas immediately and defer logos/prices to retryTokenMetadata so
  // the confirmation UI is not held behind catalog or pricing requests.
  const cachedTokenChanges =
    raw.nftsReceived.length === 0
      ? buildPreflightTokenChanges(chainId, raw.tokens, raw.deltas)
      : null;
  if (cachedTokenChanges) {
    const native = getNativeCurrency(chainId);
    const nativeChange = buildUnpricedNativeChange(raw.ethDelta, native);
    return {
      txSuccess: raw.txSuccess,
      nativeChange,
      tokenChanges: cachedTokenChanges,
      approvalChanges: [],
      approvalDetectionIncomplete: false,
      simulationFailed: false,
      metadataComplete:
        cachedTokenChanges.length === 0 && nativeChange === null,
    };
  }

  const { changes: tokenChanges, metadataComplete } =
    await enrichTokenChanges(
      client,
      chainId,
      raw.tokens,
      raw.deltas,
      accountAddress,
      raw.nftsReceived,
    );
  console.log(
    "[TxSim] Token changes:",
    tokenChanges.length,
    tokenChanges.map((change) => ({
      symbol: change.symbol,
      amount: change.formattedAmount,
      direction: change.direction,
    })),
  );

  const native = await resolveNativeCurrency(chainId);
  let nativePriceUsd: number | null = null;
  if (raw.ethDelta !== 0n) {
    const portfolioPrices = await getPortfolioPriceMap(accountAddress);
    nativePriceUsd = portfolioPrices.get(`${chainId}:native`) ?? null;
    if (nativePriceUsd === null) {
      try {
        const { fetchNativePrice } = await import("../gasEstimation");
        nativePriceUsd = await fetchNativePrice(chainId);
      } catch {
        nativePriceUsd = null;
      }
    }
  }
  const nativeChange = buildNativeChange(
    raw.ethDelta,
    native,
    nativePriceUsd,
  );

  const finalResult: SimulationResult = {
    txSuccess: raw.txSuccess,
    nativeChange,
    tokenChanges,
    approvalChanges: [],
    approvalDetectionIncomplete: false,
    simulationFailed: false,
    metadataComplete,
  };
  console.log("[TxSim] Final result:", {
    txSuccess: raw.txSuccess,
    nativeChange: nativeChange
      ? {
          symbol: nativeChange.symbol,
          amount: nativeChange.formattedAmount,
          direction: nativeChange.direction,
        }
      : null,
    tokenChangesCount: tokenChanges.length,
    metadataComplete,
  });
  return finalResult;
}
