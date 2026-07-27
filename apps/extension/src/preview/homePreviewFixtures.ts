import type { CustomToken } from "@/chrome/customTokenStorage";
import type { PortfolioResponse } from "@/chrome/portfolio/api";
import type { NetworksInfo } from "@/types";
import { previewAssets } from "./previewAssets";

const PREVIEW_HOME_CHART_SHAPE = [
  42, 44, 47, 45, 43, 49, 54, 52, 58, 61, 59, 55,
  50, 47, 51, 56, 62, 66, 63, 68, 72, 70, 76, 82,
];
const PREVIEW_HOME_CHART_START_VALUE_USD = 1_973.0599332574604;
const PREVIEW_HOME_CHART_END_VALUE_USD = 10_228.54;
const PREVIEW_HOME_CHART_RANGE_MS = 7 * 24 * 60 * 60 * 1_000;

export function createPreviewHomePortfolioSnapshots() {
  const shapeMin = Math.min(...PREVIEW_HOME_CHART_SHAPE);
  const shapeMax = Math.max(...PREVIEW_HOME_CHART_SHAPE);
  const endTimestamp = Date.now();
  return PREVIEW_HOME_CHART_SHAPE.map((value, index, values) => ({
    timestamp:
      endTimestamp -
      PREVIEW_HOME_CHART_RANGE_MS +
      (index / (values.length - 1)) * PREVIEW_HOME_CHART_RANGE_MS,
    totalValueUsd:
      PREVIEW_HOME_CHART_START_VALUE_USD +
      ((value - shapeMin) / (shapeMax - shapeMin)) *
        (PREVIEW_HOME_CHART_END_VALUE_USD -
          PREVIEW_HOME_CHART_START_VALUE_USD),
  }));
}

export function createPreviewHomeNetworks(networks: NetworksInfo): NetworksInfo {
  return Object.fromEntries(
    Object.entries(networks).map(([name, network]) => [
      name,
      {
        ...network,
        hidden: network.chainId !== 1 && network.chainId !== 8453,
      },
    ]),
  );
}

export function createPreviewHomePortfolioResponse(
  base: PortfolioResponse,
  customToken: CustomToken,
): PortfolioResponse {
  return {
    ...base,
    tokens: [
      ...base.tokens,
      {
        symbol: "WCHAN",
        name: "WalletChan",
        contractAddress: customToken.contractAddress,
        chainId: 8453,
        decimals: 18,
        balance: "120.456",
        balanceFormatted: "120.456",
        priceUsd: 0.55,
        valueUsd: 66.2508,
        logoUrl: previewAssets.brand.walletChan,
      },
    ],
    totalValueUsd: base.totalValueUsd + 66.2508,
  };
}
