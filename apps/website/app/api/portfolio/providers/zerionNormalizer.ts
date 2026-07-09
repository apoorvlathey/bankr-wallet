import {
  DefiAsset,
  DefiPosition,
  PortfolioToken,
  formatBalance,
  normalizeContractAddress,
} from "./types";
import type {
  ZerionFungibleInfo,
  ZerionImplementation,
  ZerionPosition,
  ZerionQuantity,
} from "./zerionTypes";

export function normalizeZerionPositions(
  positions: ZerionPosition[],
  chainIds: Map<string, number>,
): { tokens: PortfolioToken[]; defiPositions: DefiPosition[] } {
  const tokens: PortfolioToken[] = [];
  const defiPositionsByKey = new Map<string, DefiPosition>();

  for (const position of positions) {
    const positionType = position.attributes?.position_type || "wallet";
    if (positionType === "wallet") {
      const token = toPortfolioToken(position, chainIds);
      if (token) tokens.push(token);
    } else {
      addDefiPosition(position, chainIds, defiPositionsByKey);
    }
  }

  return {
    tokens,
    defiPositions: Array.from(defiPositionsByKey.values()).map(
      finalizeDefiPosition,
    ),
  };
}

function toPortfolioToken(
  position: ZerionPosition,
  chainIds: Map<string, number>,
): PortfolioToken | null {
  const attrs = position.attributes;
  const chainSlug = getChainSlug(position);
  const chainId = chainSlug ? chainIds.get(chainSlug) : undefined;
  if (!attrs || !chainSlug || !chainId) return null;

  const fungible = attrs.fungible_info;
  const impl = getImplementationForChain(fungible, chainSlug);
  const symbol = fungible?.symbol || attrs.name || "???";
  const name = fungible?.name || attrs.name || symbol || "Unknown";
  const balance = getQuantityNumber(attrs.quantity);
  const valueUsd = getFiniteNumber(attrs.value);
  if (balance === 0 && valueUsd === 0) return null;

  const priceUsd =
    getFiniteNumber(attrs.price) || getFiniteNumber(fungible?.market_data?.price);

  return {
    symbol,
    name,
    contractAddress: normalizeContractAddress(impl?.address),
    chainId,
    decimals: getDecimals(attrs.quantity, impl),
    balance: getQuantityString(attrs.quantity),
    balanceFormatted: formatBalance(balance),
    priceUsd,
    valueUsd,
    logoUrl: fungible?.icon?.url || undefined,
  };
}

function addDefiPosition(
  position: ZerionPosition,
  chainIds: Map<string, number>,
  positions: Map<string, DefiPosition>,
): void {
  const attrs = position.attributes;
  const chainSlug = getChainSlug(position);
  const chainId = chainSlug ? chainIds.get(chainSlug) : undefined;
  if (!attrs || !chainSlug || !chainId) return;

  const asset = toDefiAsset(position, chainSlug, chainId);
  if (!asset) return;

  const dappId = position.relationships?.dapp?.data?.id || "";
  const protocol =
    attrs.application_metadata?.name || attrs.protocol || dappId || "DeFi";
  const groupId = attrs.group_id || attrs.parent || position.id;
  const key = `${chainId}:${dappId || protocol}:${groupId}`;
  const type = attrs.protocol_module || attrs.position_type || "position";
  const entry =
    positions.get(key) ||
    {
      protocol,
      protocolLogo: attrs.application_metadata?.icon?.url || undefined,
      chainId,
      type,
      name: attrs.name || type,
      valueUsd: 0,
      siteUrl: attrs.application_metadata?.url || undefined,
      assets: [],
      rewardAssets: [],
    };

  if (attrs.position_type === "reward" || type.toLowerCase().includes("reward")) {
    entry.rewardAssets.push(asset);
  } else {
    entry.assets.push(asset);
  }
  entry.valueUsd += asset.valueUsd;
  positions.set(key, entry);
}

function finalizeDefiPosition(position: DefiPosition): DefiPosition {
  const assets = [...position.assets];
  const rewardAssets = [...position.rewardAssets];
  const allAssets = [...assets, ...rewardAssets];
  const symbols = Array.from(
    new Set(allAssets.map((asset) => asset.symbol).filter(Boolean)),
  );

  return {
    ...position,
    name:
      allAssets.length > 1 && symbols.length > 1
        ? symbols.join(" / ")
        : position.name,
    assets,
    rewardAssets,
  };
}

function toDefiAsset(
  position: ZerionPosition,
  chainSlug: string,
  chainId: number,
): DefiAsset | null {
  const attrs = position.attributes;
  const fungible = attrs?.fungible_info;
  if (!attrs) return null;

  const impl = getImplementationForChain(fungible, chainSlug);
  const balance = getQuantityNumber(attrs.quantity);
  const valueUsd = getFiniteNumber(attrs.value);
  if (balance === 0 && valueUsd === 0) return null;

  const symbol = fungible?.symbol || attrs.name || "???";
  const name = fungible?.name || attrs.name || symbol || "Unknown";

  return {
    symbol,
    name,
    contractAddress: normalizeContractAddress(impl?.address),
    chainId,
    balance: getQuantityString(attrs.quantity),
    balanceFormatted: formatBalance(balance),
    valueUsd,
    logoUrl: fungible?.icon?.url || undefined,
  };
}

function getChainSlug(position: ZerionPosition): string | null {
  return position.relationships?.chain?.data?.id || null;
}

function getImplementationForChain(
  fungible: ZerionFungibleInfo | null | undefined,
  chainSlug: string,
): ZerionImplementation | undefined {
  const implementations = fungible?.implementations || [];
  return (
    implementations.find((impl) => impl.chain_id === chainSlug) ||
    (implementations.length === 1 ? implementations[0] : undefined)
  );
}

function getDecimals(
  quantity: ZerionQuantity | null | undefined,
  impl: ZerionImplementation | undefined,
): number {
  return (
    (typeof impl?.decimals === "number" ? impl.decimals : undefined) ??
    (typeof quantity?.decimals === "number" ? quantity.decimals : undefined) ??
    18
  );
}

function getQuantityNumber(quantity: ZerionQuantity | null | undefined): number {
  if (typeof quantity?.float === "number" && Number.isFinite(quantity.float)) {
    return quantity.float;
  }
  const numeric = parseFloat(quantity?.numeric || "0");
  return Number.isFinite(numeric) ? numeric : 0;
}

function getQuantityString(quantity: ZerionQuantity | null | undefined): string {
  if (quantity?.numeric) return quantity.numeric;
  return getQuantityNumber(quantity).toString();
}

function getFiniteNumber(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
