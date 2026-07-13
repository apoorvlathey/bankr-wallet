import { erc20Abi, formatUnits, type Address } from "viem";

import {
  resolveNftMetadata,
  type NftMetadata,
} from "../nftMetadata";
import { getCachedTokenList, fetchTokenPrice } from "../swapApi";
import { KNOWN_TOKEN_LOGOS } from "../tokenLogoConstants";
import { formatAmount } from "./assetChangeNormalization";
import { getSimulationClient } from "./client";
import { MULTICALL3_ADDRESS } from "./constants";
import { getPortfolioPriceMap } from "./portfolioPrices";
import type {
  AssetChange,
  TokenMetadataResult,
} from "./types";

// ---------------------------------------------------------------------------
// Metadata retry — called by the UI when initial metadata fetch was incomplete
// ---------------------------------------------------------------------------

export async function retryTokenMetadata(
  chainId: number,
  tokenChanges: AssetChange[],
  accountAddress: string,
  nativeChange?: AssetChange | null,
): Promise<TokenMetadataResult> {
  // Retry conditions:
  //   - Symbol still looks like an address fragment
  //   - USD value missing for non-NFT entries
  //   - NFT image not yet resolved (metadataLoading)
  const needsRetry = tokenChanges.filter((c) => {
    if (c.symbol.includes("...")) return true;
    if (c.nft) return !!c.nft.metadataLoading;
    return c.valueUsd === null;
  });
  const nativeNeedsPrice = !!nativeChange && nativeChange.valueUsd === null;
  if (needsRetry.length === 0 && !nativeNeedsPrice) {
    return { tokenChanges, nativeChange };
  }

  const client = await getSimulationClient(chainId);
  if (!client) return { tokenChanges, nativeChange };

  // Retry NFT metadata using the URI captured during the original simulation.
  // Re-querying tokenURI/uri here would return CURRENT state, not the post-tx
  // state we want for onchain SVG metadata. The captured URI is correct.
  const nftRetries = needsRetry.filter(
    (c) =>
      c.nft?.metadataLoading &&
      c.nft.tokenId !== null &&
      typeof c.nft.tokenUri === "string" &&
      c.nft.tokenUri.length > 0,
  );
  const nftMetaUpdates = new Map<string, NftMetadata | null>();
  if (nftRetries.length > 0) {
    const metas = await Promise.all(
      nftRetries.map((c) =>
        resolveNftMetadata(c.nft!.tokenUri!, BigInt(c.nft!.tokenId!)),
      ),
    );
    nftRetries.forEach((c, i) => {
      nftMetaUpdates.set(`${c.address.toLowerCase()}:${c.nft!.tokenId}`, metas[i]);
    });
  }

  // 1. Try token list again (may have been cached since first attempt).
  //    NFT rows skip token-list lookup entirely — they're never in there.
  const tokenList = await getCachedTokenList(chainId);
  const tokenListMap = new Map<string, { name: string; symbol: string; decimals: number; logoURI: string }>();
  for (const t of tokenList) {
    tokenListMap.set(t.address.toLowerCase(), t);
  }

  // 2. Identify tokens still needing onchain metadata (ERC-20s only)
  const onchainNeeded = needsRetry.filter(
    (c) => !c.nft && c.symbol.includes("...") && !tokenListMap.has(c.address.toLowerCase()),
  );

  const onchainMeta = new Map<string, { name: string; symbol: string; decimals: number }>();
  if (onchainNeeded.length > 0) {
    const contracts = onchainNeeded.flatMap((c) => [
      { address: c.address as Address, abi: erc20Abi, functionName: "name" as const },
      { address: c.address as Address, abi: erc20Abi, functionName: "symbol" as const },
      { address: c.address as Address, abi: erc20Abi, functionName: "decimals" as const },
    ]);

    try {
      const results = await client.multicall({
        contracts,
        allowFailure: true,
        multicallAddress: MULTICALL3_ADDRESS,
      });
      for (let j = 0; j < onchainNeeded.length; j++) {
        const addr = onchainNeeded[j].address.toLowerCase();
        const nameRes = results[j * 3];
        const symRes = results[j * 3 + 1];
        const decRes = results[j * 3 + 2];

        onchainMeta.set(addr, {
          name: nameRes?.status === "success" && typeof nameRes.result === "string" ? nameRes.result : "",
          symbol: symRes?.status === "success" && typeof symRes.result === "string" ? symRes.result : onchainNeeded[j].symbol,
          decimals: decRes?.status === "success" && typeof decRes.result === "number" ? decRes.result : onchainNeeded[j].decimals,
        });
      }
    } catch {
      // Still failing, keep existing values
    }
  }

  // 3. Retry prices for tokens missing USD value. The local portfolio cache
  // wins; the remote token-price endpoint is called only for cache misses.
  const priceNeeded = needsRetry.filter((c) => !c.nft && c.valueUsd === null);
  const priceMap = new Map<string, number>();
  if (priceNeeded.length > 0) {
    const portfolioPrices = await getPortfolioPriceMap(accountAddress);
    const remoteNeeded: AssetChange[] = [];
    for (const change of priceNeeded) {
      const cached = portfolioPrices.get(
        `${chainId}:${change.address.toLowerCase()}`,
      );
      if (cached) priceMap.set(change.address.toLowerCase(), cached);
      else remoteNeeded.push(change);
    }
    const remotePrices = await Promise.all(
      remoteNeeded.map((change) =>
        fetchTokenPrice(chainId, change.address).catch(() => 0),
      ),
    );
    remoteNeeded.forEach((change, index) => {
      if (remotePrices[index] > 0) {
        priceMap.set(change.address.toLowerCase(), remotePrices[index]);
      }
    });
  }

  // 4. Merge updates into existing token changes
  const updated = tokenChanges.map((c) => {
    const addr = c.address.toLowerCase();

    // NFT path: only metadata may have changed.
    if (c.nft) {
      if (!c.nft.metadataLoading || c.nft.tokenId === null) return c;
      const key = `${addr}:${c.nft.tokenId}`;
      if (!nftMetaUpdates.has(key)) return c;
      const meta = nftMetaUpdates.get(key);
      return {
        ...c,
        nft: {
          ...c.nft,
          metadata: meta ?? undefined,
          // Stop trying after one explicit attempt — even a `null` result
          // means the URI was unreachable, retrying won't help.
          metadataLoading: false,
        },
      };
    }

    const listEntry = tokenListMap.get(addr);
    const onchain = onchainMeta.get(addr);
    const newPrice = priceMap.get(addr);

    if (!listEntry && !onchain && newPrice === undefined) return c;

    const newSymbol = listEntry?.symbol ?? onchain?.symbol ?? c.symbol;
    const newName = listEntry?.name ?? onchain?.name ?? c.name;
    const newDecimals = listEntry?.decimals ?? onchain?.decimals ?? c.decimals;
    const newLogoUrl = listEntry?.logoURI || KNOWN_TOKEN_LOGOS[addr] || c.logoUrl;

    // Recompute formatted amount if decimals changed
    let formattedAmount = c.formattedAmount;
    let valueUsd = c.valueUsd;
    if (newDecimals !== c.decimals) {
      const delta = BigInt(c.rawDelta);
      const abs = delta < 0n ? -delta : delta;
      const amount = parseFloat(formatUnits(abs, newDecimals));
      formattedAmount = formatAmount(amount);
      const price = newPrice ?? (c.valueUsd !== null && parseFloat(c.formattedAmount) > 0
        ? c.valueUsd / parseFloat(c.formattedAmount)
        : undefined);
      valueUsd = price ? amount * price : null;
    } else if (newPrice !== undefined) {
      const delta = BigInt(c.rawDelta);
      const abs = delta < 0n ? -delta : delta;
      const amount = parseFloat(formatUnits(abs, newDecimals));
      valueUsd = amount * newPrice;
    }

    return {
      ...c,
      symbol: newSymbol,
      name: newName,
      decimals: newDecimals,
      logoUrl: newLogoUrl,
      formattedAmount,
      valueUsd,
    };
  });

  let updatedNativeChange = nativeChange;
  if (nativeNeedsPrice && nativeChange) {
    const portfolioPrices = await getPortfolioPriceMap(accountAddress);
    let nativePrice = portfolioPrices.get(`${chainId}:native`) ?? null;
    if (nativePrice === null) {
      try {
        const { fetchNativePrice } = await import("../gasEstimation");
        nativePrice = await fetchNativePrice(chainId);
      } catch {
        nativePrice = null;
      }
    }
    if (nativePrice !== null) {
      const amount = parseFloat(
        formatUnits(
          BigInt(nativeChange.rawDelta) < 0n
            ? -BigInt(nativeChange.rawDelta)
            : BigInt(nativeChange.rawDelta),
          nativeChange.decimals,
        ),
      );
      updatedNativeChange = {
        ...nativeChange,
        valueUsd: amount * nativePrice,
      };
    }
  }

  return { tokenChanges: updated, nativeChange: updatedNativeChange };
}
