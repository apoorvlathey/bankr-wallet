import {
  erc20Abi,
  formatUnits,
  type Address,
  type PublicClient,
} from "viem";

import { getPreflightTokenMetadata } from "../erc20CandidatePreflight";
import {
  fetchTokenPrice,
  getCachedTokenList,
  getCachedTokenLogo,
} from "../swapApi";
import { KNOWN_TOKEN_LOGOS } from "../tokenLogoConstants";
import { formatAmount } from "./assetChangeNormalization";
import { MULTICALL3_ADDRESS } from "./constants";
import { detectNftStandards, enrichReceivedNfts } from "./nftEnrichment";
import { getPortfolioPriceMap } from "./portfolioPrices";
import type {
  AssetChange,
  NftStandard,
  RawNftReceived,
} from "./types";

export async function enrichTokenChanges(
  client: PublicClient,
  chainId: number,
  tokens: Address[],
  deltas: bigint[],
  accountAddress: string,
  receivedNfts: RawNftReceived[] = [],
): Promise<{ changes: AssetChange[]; metadataComplete: boolean }> {
  if (tokens.length === 0 && receivedNfts.length === 0) {
    return { changes: [], metadataComplete: true };
  }

  // 1. Load token list for this chain (cached 24h) — primary metadata source
  const tokenList = await getCachedTokenList(chainId);
  const tokenListMap = new Map<string, { name: string; symbol: string; decimals: number; logoURI: string }>();
  for (const t of tokenList) {
    tokenListMap.set(t.address.toLowerCase(), t);
  }

  const onchainMeta = new Map<string, { name: string; symbol: string; decimals: number }>();

  // 2. Reuse metadata fetched by the calldata-candidate preflight. Only tokens
  // absent from both the token list and this short-lived cache need another
  // onchain metadata request after simulation.
  const unknownIndices: number[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const addressKey = tokens[i].toLowerCase();
    const preflightMetadata = getPreflightTokenMetadata(chainId, tokens[i]);
    if (preflightMetadata) onchainMeta.set(addressKey, preflightMetadata);
    if (!tokenListMap.has(addressKey) && !preflightMetadata) {
      unknownIndices.push(i);
    }
  }

  // 2b. Detect which unknown tokens are actually NFT contracts so we can
  //     keep `decimals = 0`, skip price fetches, and tag the row.
  //     Tokens already in the swap token list are guaranteed to be ERC-20s.
  const nftStandards =
    unknownIndices.length > 0
      ? await detectNftStandards(
          client,
          unknownIndices.map((idx) => tokens[idx]),
        )
      : new Map<string, NftStandard>();

  // 3. Onchain multicall for unknown ERC-20s only: name(), symbol(), decimals().
  //    NFTs use a separate (lighter) lookup path below since they have no decimals.
  let metadataComplete = true;
  const erc20Unknown = unknownIndices.filter(
    (idx) => !nftStandards.has(tokens[idx].toLowerCase()),
  );
  const nftUnknown = unknownIndices.filter((idx) =>
    nftStandards.has(tokens[idx].toLowerCase()),
  );

  if (erc20Unknown.length > 0) {
    const contracts = erc20Unknown.flatMap((idx) => [
      { address: tokens[idx], abi: erc20Abi, functionName: "name" as const },
      { address: tokens[idx], abi: erc20Abi, functionName: "symbol" as const },
      { address: tokens[idx], abi: erc20Abi, functionName: "decimals" as const },
    ]);

    try {
      const results = await client.multicall({
        contracts,
        allowFailure: true,
        multicallAddress: MULTICALL3_ADDRESS,
      });
      for (let j = 0; j < erc20Unknown.length; j++) {
        const idx = erc20Unknown[j];
        const nameResult = results[j * 3];
        const symbolResult = results[j * 3 + 1];
        const decimalsResult = results[j * 3 + 2];

        const name =
          nameResult?.status === "success" && typeof nameResult.result === "string"
            ? nameResult.result
            : "";
        const symbol =
          symbolResult?.status === "success" && typeof symbolResult.result === "string"
            ? symbolResult.result
            : `${tokens[idx].slice(0, 6)}...${tokens[idx].slice(-4)}`;
        const decimals =
          decimalsResult?.status === "success" && typeof decimalsResult.result === "number"
            ? decimalsResult.result
            : 18;

        // If symbol still looks like an address, metadata is incomplete
        if (symbol.includes("...")) metadataComplete = false;

        onchainMeta.set(tokens[idx].toLowerCase(), { name, symbol, decimals });
      }
    } catch {
      // Multicall failed entirely — mark as incomplete for retry
      metadataComplete = false;
      for (const idx of erc20Unknown) {
        onchainMeta.set(tokens[idx].toLowerCase(), {
          name: "",
          symbol: `${tokens[idx].slice(0, 6)}...${tokens[idx].slice(-4)}`,
          decimals: 18,
        });
      }
    }
  }

  // 3b. NFT collection metadata for unknown NFT contracts (name + symbol only,
  //     no decimals — those are forced to 0).
  if (nftUnknown.length > 0) {
    const contracts = nftUnknown.flatMap((idx) => [
      { address: tokens[idx], abi: erc20Abi, functionName: "name" as const },
      { address: tokens[idx], abi: erc20Abi, functionName: "symbol" as const },
    ]);
    try {
      const results = await client.multicall({
        contracts,
        allowFailure: true,
        multicallAddress: MULTICALL3_ADDRESS,
      });
      for (let j = 0; j < nftUnknown.length; j++) {
        const idx = nftUnknown[j];
        const nameRes = results[j * 2];
        const symRes = results[j * 2 + 1];
        onchainMeta.set(tokens[idx].toLowerCase(), {
          name:
            nameRes?.status === "success" && typeof nameRes.result === "string"
              ? nameRes.result
              : "",
          symbol:
            symRes?.status === "success" && typeof symRes.result === "string"
              ? symRes.result
              : `${tokens[idx].slice(0, 6)}...${tokens[idx].slice(-4)}`,
          decimals: 0,
        });
      }
    } catch {
      metadataComplete = false;
      for (const idx of nftUnknown) {
        onchainMeta.set(tokens[idx].toLowerCase(), {
          name: "",
          symbol: `${tokens[idx].slice(0, 6)}...${tokens[idx].slice(-4)}`,
          decimals: 0,
        });
      }
    }
  }

  // 4. Prefer the extension's reset-aware portfolio cache. Only tokens absent
  // from that cache hit the remote token-price endpoint.
  const portfolioPrices = await getPortfolioPriceMap(accountAddress);
  const pricePromises = tokens.map((addr) => {
    if (nftStandards.has(addr.toLowerCase())) return Promise.resolve(0);
    const cached = portfolioPrices.get(`${chainId}:${addr.toLowerCase()}`);
    return cached
      ? Promise.resolve(cached)
      : fetchTokenPrice(chainId, addr).catch(() => 0);
  });
  let prices: number[];
  try {
    prices = await Promise.all(pricePromises);
  } catch {
    prices = tokens.map(() => 0);
    metadataComplete = false;
  }

  // Resolve logos absent from the primary catalog through the same cached
  // per-address fallback used by confirmed transaction details. NFT contracts
  // deliberately skip the ERC-20-only MetaMask asset namespace.
  const logoUrls = await Promise.all(
    tokens.map((address) => {
      const addressKey = address.toLowerCase();
      if (nftStandards.has(addressKey)) return Promise.resolve<string | null>(null);
      const known =
        tokenListMap.get(addressKey)?.logoURI || KNOWN_TOKEN_LOGOS[addressKey];
      return known
        ? Promise.resolve(known)
        : getCachedTokenLogo(chainId, address).catch(() => null);
    }),
  );

  // 5. Index received NFTs so we can suppress balanceOf-derived rows that
  //    are already covered by detailed receiver-hook entries (avoids
  //    duplicate "+1 UNI-V3-POS" alongside the per-tokenId rows).
  const receivedNftCountByContract = new Map<string, number>();
  for (const n of receivedNfts) {
    const key = n.token.toLowerCase();
    receivedNftCountByContract.set(key, (receivedNftCountByContract.get(key) ?? 0) + 1);
  }

  // 6. Build AssetChange entries for balanceOf-tracked tokens
  const changes: AssetChange[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const addr = tokens[i].toLowerCase();
    const listEntry = tokenListMap.get(addr);
    const onchain = onchainMeta.get(addr);
    const nftStandard = nftStandards.get(addr);

    const symbol = listEntry?.symbol ?? onchain?.symbol ?? `${tokens[i].slice(0, 6)}...${tokens[i].slice(-4)}`;
    const name = listEntry?.name ?? onchain?.name ?? "";
    // Force decimals = 0 for NFTs even if a (non-standard) decimals() exists.
    const decimals = nftStandard ? 0 : (listEntry?.decimals ?? onchain?.decimals ?? 18);
    const logoUrl = logoUrls[i] || undefined;

    const delta = deltas[i];

    if (nftStandard) {
      // Skip the generic count row when the receiver-hook captured every
      // received tokenId for this collection. The detailed per-id rows from
      // enrichReceivedNfts() will be appended afterwards.
      if (delta > 0n) {
        const captured = BigInt(receivedNftCountByContract.get(addr) ?? 0);
        if (captured >= delta) continue;
      }

      const abs = delta < 0n ? -delta : delta;
      changes.push({
        address: tokens[i],
        symbol,
        name,
        decimals: 0,
        logoUrl,
        rawDelta: delta.toString(),
        formattedAmount: abs.toString(),
        valueUsd: null,
        direction: delta > 0n ? "in" : "out",
        nft: {
          standard: nftStandard,
          tokenId: null,
          amount: abs.toString(),
        },
      });
      continue;
    }

    const abs = delta < 0n ? -delta : delta;
    const amount = parseFloat(formatUnits(abs, decimals));
    const priceUsd = prices[i];

    changes.push({
      address: tokens[i],
      symbol,
      name,
      decimals,
      logoUrl,
      rawDelta: delta.toString(),
      formattedAmount: formatAmount(amount),
      valueUsd: priceUsd > 0 ? amount * priceUsd : null,
      direction: delta > 0n ? "in" : "out",
    });
  }

  // 7. Per-tokenId rows from receiver-hook captures (with image metadata).
  if (receivedNfts.length > 0) {
    const detailed = await enrichReceivedNfts(client, receivedNfts);
    if (detailed.some((c) => c.nft?.metadataLoading)) {
      // Mark incomplete so the UI retries metadata resolution.
      metadataComplete = false;
    }
    changes.push(...detailed);
  }

  return { changes, metadataComplete };
}
