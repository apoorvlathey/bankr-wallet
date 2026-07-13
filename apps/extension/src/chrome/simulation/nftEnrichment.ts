import {
  decodeAbiParameters,
  erc20Abi,
  type Address,
  type PublicClient,
} from "viem";

import { resolveNftMetadata } from "../nftMetadata";
import { MULTICALL3_ADDRESS } from "./constants";
import type {
  AssetChange,
  NftStandard,
  RawNftReceived,
} from "./types";

/**
 * Decode the raw bytes returned by an in-simulator tokenURI / uri staticcall
 * into the underlying string. Returns null if the bytes are empty or fail to
 * decode (malformed contracts, non-string returns, etc.).
 */
export function decodeTokenUriRaw(raw: `0x${string}` | undefined): string | null {
  if (!raw || raw === "0x" || raw.length < 130) return null;
  try {
    const [decoded] = decodeAbiParameters([{ type: "string" }], raw);
    return typeof decoded === "string" && decoded.length > 0 ? decoded : null;
  } catch {
    return null;
  }
}
/** ABI for ERC-165 supportsInterface — used to detect NFT contracts */
const ERC165_ABI = [
  {
    type: "function" as const,
    name: "supportsInterface" as const,
    inputs: [{ name: "interfaceId", type: "bytes4" as const }],
    outputs: [{ type: "bool" as const }],
    stateMutability: "view" as const,
  },
] as const;

const ERC721_INTERFACE_ID = "0x80ac58cd";
const ERC1155_INTERFACE_ID = "0xd9b67a26";

/**
 * Detect ERC-721 / ERC-1155 status for the given candidates via a single
 * multicall to `supportsInterface`. Contracts that don't implement ERC-165
 * (or just revert) are returned as `null`.
 */
export async function detectNftStandards(
  client: PublicClient,
  candidates: Address[],
): Promise<Map<string, NftStandard>> {
  const map = new Map<string, NftStandard>();
  if (candidates.length === 0) return map;

  const contracts = candidates.flatMap((addr) => [
    {
      address: addr,
      abi: ERC165_ABI,
      functionName: "supportsInterface" as const,
      args: [ERC721_INTERFACE_ID] as const,
    },
    {
      address: addr,
      abi: ERC165_ABI,
      functionName: "supportsInterface" as const,
      args: [ERC1155_INTERFACE_ID] as const,
    },
  ]);

  try {
    const results = await client.multicall({
      contracts,
      allowFailure: true,
      multicallAddress: MULTICALL3_ADDRESS,
    });
    for (let i = 0; i < candidates.length; i++) {
      const isErc721 =
        results[i * 2]?.status === "success" && results[i * 2].result === true;
      const isErc1155 =
        results[i * 2 + 1]?.status === "success" &&
        results[i * 2 + 1].result === true;
      if (isErc721) {
        map.set(candidates[i].toLowerCase(), "erc721");
      } else if (isErc1155) {
        map.set(candidates[i].toLowerCase(), "erc1155");
      }
    }
  } catch {
    // Multicall failed; treat all as non-NFT.
  }

  return map;
}

/**
 * Build per-NFT AssetChange entries from receiver-hook captures. The
 * tokenURI / uri string was already captured INSIDE the simulator (so it
 * reflects post-tx state for onchain SVG metadata like Uniswap V3/V4
 * positions); we just decode and resolve it here.
 */
export async function enrichReceivedNfts(
  client: PublicClient,
  receivedNfts: RawNftReceived[],
): Promise<AssetChange[]> {
  if (receivedNfts.length === 0) return [];

  // Collection-level metadata (name, symbol) shared across token IDs.
  // Each token is queried once even if multiple ids were minted from it.
  const uniqueTokens = Array.from(
    new Set(receivedNfts.map((n) => n.token.toLowerCase())),
  ) as Address[];

  const collectionContracts = uniqueTokens.flatMap((addr) => [
    { address: addr, abi: erc20Abi, functionName: "name" as const },
    { address: addr, abi: erc20Abi, functionName: "symbol" as const },
  ]);

  const collectionMeta = new Map<string, { name: string; symbol: string }>();
  try {
    const results = await client.multicall({
      contracts: collectionContracts,
      allowFailure: true,
      multicallAddress: MULTICALL3_ADDRESS,
    });
    for (let i = 0; i < uniqueTokens.length; i++) {
      const nameRes = results[i * 2];
      const symRes = results[i * 2 + 1];
      collectionMeta.set(uniqueTokens[i].toLowerCase(), {
        name:
          nameRes?.status === "success" && typeof nameRes.result === "string"
            ? nameRes.result
            : "",
        symbol:
          symRes?.status === "success" && typeof symRes.result === "string"
            ? symRes.result
            : "",
      });
    }
  } catch {
    // ignore — fall back to address fragments
  }

  // Decode the in-simulator tokenURI bytes and resolve metadata in parallel.
  // data: URIs resolve synchronously; ipfs:/https: get a 5s fetch each.
  const decodedUris = receivedNfts.map((n) => decodeTokenUriRaw(n.tokenUriRaw));
  const metadataResults = await Promise.all(
    decodedUris.map((uri, i) =>
      uri ? resolveNftMetadata(uri, receivedNfts[i].tokenId) : Promise.resolve(null),
    ),
  );

  return receivedNfts.map((n, i) => {
    const standard: NftStandard = n.standard === 1 ? "erc721" : "erc1155";
    const collection = collectionMeta.get(n.token.toLowerCase());
    const symbol =
      collection?.symbol ||
      `${n.token.slice(0, 6)}...${n.token.slice(-4)}`;
    const name = collection?.name || "";
    const metadata = metadataResults[i] ?? undefined;
    // If we got a usable tokenURI but couldn't reach the IPFS/HTTPS gateway
    // yet, leave the entry in `loading` so the retry loop tries again. If
    // the URI itself was empty (contract has no tokenURI/uri or reverted),
    // there's nothing to retry — mark as done.
    const hasUri = decodedUris[i] !== null;
    const metadataLoading = hasUri && !metadata;

    return {
      address: n.token,
      symbol,
      name,
      decimals: 0,
      logoUrl: undefined,
      rawDelta: n.amount.toString(),
      formattedAmount: n.amount.toString(),
      valueUsd: null,
      direction: "in" as const,
      nft: {
        standard,
        tokenId: n.tokenId.toString(),
        amount: n.amount.toString(),
        tokenUri: decodedUris[i] ?? undefined,
        metadata,
        metadataLoading,
      },
    };
  });
}
