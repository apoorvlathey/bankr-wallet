/**
 * Octav portfolio provider.
 *
 * Currently NOT wired into the active provider chain in route.ts. Kept here so
 * we can re-enable Octav by importing this file and adding `octavProvider` to
 * the `PROVIDERS` array. Octav is the only provider in our chain that returns
 * DeFi positions natively — when it's active, the route should prefer it.
 *
 * Env: OCTAV_API_KEY, optional OCTAV_API_URL (defaults to https://api.octav.fi).
 */
import { OCTAV_NAME_TO_CHAIN_ID } from "../chains";

// Octav historically returned a few alternative chain spellings. Extend the
// canonical map (sourced from chains.ts) with these aliases.
const OCTAV_CHAIN_LOOKUP: Record<string, number> = {
  ...OCTAV_NAME_TO_CHAIN_ID,
  eth: 1,
  matic: 137,
};
import {
  DefiAsset,
  DefiPosition,
  PortfolioProvider,
  PortfolioToken,
  ProviderResult,
  formatBalance,
  normalizeContractAddress,
} from "./types";

interface OctavAsset {
  name: string;
  symbol: string;
  balance: string;
  price: string;
  value: string;
  contract?: string;
  decimal?: string;
  imgSmall?: string;
  imgLarge?: string;
}

interface OctavSubPosition {
  name: string;
  value: string;
  siteUrl?: string;
  assets?: OctavAsset[];
  supplyAssets?: OctavAsset[];
  borrowAssets?: OctavAsset[];
  rewardAssets?: OctavAsset[];
}

interface OctavPositionType {
  name: string;
  value: string;
  assets?: OctavAsset[];
  protocolPositions?: OctavSubPosition[];
}

interface OctavChain {
  name: string;
  value: string;
  protocolPositions?: Record<string, OctavPositionType>;
}

interface OctavProtocol {
  name: string;
  value: string;
  imgSmall?: string;
  imgLarge?: string;
  chains?: Record<string, OctavChain>;
}

interface OctavPortfolio {
  networth?: string;
  assetByProtocols?: Record<string, OctavProtocol>;
}

export const octavProvider: PortfolioProvider = {
  name: "octav",

  isConfigured() {
    return !!process.env.OCTAV_API_KEY;
  },

  async fetch(address, chainIds): Promise<ProviderResult> {
    const apiKey = process.env.OCTAV_API_KEY!;
    const baseUrl = process.env.OCTAV_API_URL || "https://api.octav.fi";

    const params = new URLSearchParams({
      addresses: address,
      includeImages: "true",
    });
    const res = await fetch(`${baseUrl}/v1/portfolio?${params.toString()}`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      next: { revalidate: 60 },
    });

    if (!res.ok) throw new Error(`Octav ${res.status}`);

    const json = await res.json();
    const portfolio: OctavPortfolio = Array.isArray(json) ? json[0] : json;

    const allowed = new Set(chainIds);
    const tokenMap = new Map<string, PortfolioToken>();
    const defiPositions: DefiPosition[] = [];
    const totalValueUsd = parseFloat(portfolio?.networth || "0");

    if (portfolio?.assetByProtocols) {
      for (const [protoKey, proto] of Object.entries(portfolio.assetByProtocols)) {
        if (!proto.chains) continue;
        const isWallet = protoKey.toLowerCase() === "wallet";

        for (const [chainKey, chain] of Object.entries(proto.chains)) {
          const chainId = OCTAV_CHAIN_LOOKUP[chainKey?.toLowerCase()];
          if (!chainId || !allowed.has(chainId)) continue;
          if (!chain.protocolPositions) continue;

          for (const [posKey, pos] of Object.entries(chain.protocolPositions)) {
            if (isWallet) {
              collectAssets(pos.assets, chainId, tokenMap);
            } else {
              if (pos.assets?.length) {
                const topAssets = toDefiAssets(pos.assets, chainId);
                if (topAssets.length > 0) {
                  defiPositions.push({
                    protocol: proto.name || protoKey,
                    protocolLogo: proto.imgSmall || proto.imgLarge || undefined,
                    chainId,
                    type: posKey,
                    name: pos.name || posKey,
                    valueUsd: topAssets.reduce((s, a) => s + a.valueUsd, 0),
                    assets: topAssets,
                    rewardAssets: [],
                  });
                }
              }
              if (pos.protocolPositions) {
                for (const subPos of pos.protocolPositions) {
                  const assets = toDefiAssets(
                    [...(subPos.assets || []), ...(subPos.supplyAssets || [])],
                    chainId
                  );
                  const rewardAssets = toDefiAssets(subPos.rewardAssets, chainId);
                  const posValueUsd =
                    assets.reduce((s, a) => s + a.valueUsd, 0) +
                    rewardAssets.reduce((s, a) => s + a.valueUsd, 0);
                  if (assets.length === 0 && rewardAssets.length === 0) continue;
                  defiPositions.push({
                    protocol: proto.name || protoKey,
                    protocolLogo: proto.imgSmall || proto.imgLarge || undefined,
                    chainId,
                    type: posKey,
                    name: subPos.name || pos.name || posKey,
                    valueUsd: posValueUsd,
                    siteUrl: subPos.siteUrl || undefined,
                    assets,
                    rewardAssets,
                  });
                }
              }
            }
          }
        }
      }
    }

    return {
      tokens: Array.from(tokenMap.values()),
      defiPositions,
      totalValueUsd: isNaN(totalValueUsd) ? undefined : totalValueUsd,
    };
  },
};

function collectAssets(
  assets: OctavAsset[] | undefined,
  chainId: number,
  tokenMap: Map<string, PortfolioToken>
) {
  if (!assets) return;
  for (const asset of assets) {
    const valueUsd = parseFloat(asset.value || "0");
    const balance = parseFloat(asset.balance || "0");
    const priceUsd = parseFloat(asset.price || "0");
    if (balance === 0 && valueUsd === 0) continue;

    const key = `${asset.symbol}-${chainId}`;
    const existing = tokenMap.get(key);
    if (existing) {
      const existingBal = parseFloat(existing.balance);
      const newBal = existingBal + balance;
      existing.balance = newBal.toString();
      existing.balanceFormatted = formatBalance(newBal);
      existing.valueUsd += valueUsd;
    } else {
      tokenMap.set(key, {
        symbol: asset.symbol || "???",
        name: asset.name || asset.symbol || "Unknown",
        contractAddress: normalizeContractAddress(asset.contract),
        chainId,
        decimals: asset.decimal ? parseInt(asset.decimal, 10) : 18,
        balance: asset.balance || "0",
        balanceFormatted: formatBalance(balance),
        priceUsd,
        valueUsd,
        logoUrl: asset.imgSmall || asset.imgLarge || undefined,
      });
    }
  }
}

function toDefiAssets(
  assets: OctavAsset[] | undefined,
  chainId: number
): DefiAsset[] {
  if (!assets) return [];
  const result: DefiAsset[] = [];
  for (const asset of assets) {
    const balance = parseFloat(asset.balance || "0");
    const valueUsd = parseFloat(asset.value || "0");
    if (balance === 0 && valueUsd === 0) continue;
    let logoUrl = asset.imgSmall || asset.imgLarge || undefined;
    if (logoUrl?.includes("NoImageAvailable")) logoUrl = undefined;
    result.push({
      symbol: asset.symbol || "???",
      name: asset.name || asset.symbol || "Unknown",
      contractAddress: normalizeContractAddress(asset.contract),
      chainId,
      balance: asset.balance || "0",
      balanceFormatted: formatBalance(balance),
      valueUsd,
      logoUrl,
    });
  }
  return result;
}
