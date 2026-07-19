import {
  decodeFunctionResult,
  encodeFunctionData,
  parseAbi,
  type Hex,
} from "viem";
import { fetchRpcResult } from "../network/rpcClient";
import { resolveNftMetadata } from "../nftMetadata";
import type { NftTransferRecord } from "./types";
import type { HistoryNftDisplayMetadata } from "./nftMetadataCache";

const STRING_ABI = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function uri(uint256 tokenId) view returns (string)",
]);

async function readString(
  rpcUrl: string,
  token: string,
  functionName: "name" | "symbol" | "tokenURI" | "uri",
  blockNumber: string | "latest",
  tokenId?: bigint,
  maxChars = 360_000,
): Promise<string | undefined> {
  try {
    const args = tokenId === undefined ? undefined : [tokenId];
    const data = encodeFunctionData({
      abi: STRING_ABI,
      functionName,
      args,
    } as any);
    const raw = await fetchRpcResult(
      rpcUrl,
      "eth_call",
      [
        { to: token, data },
        blockNumber === "latest"
          ? "latest"
          : `0x${BigInt(blockNumber).toString(16)}`,
      ],
      { allowPrivateWithoutOrigin: true },
    );
    if (typeof raw !== "string") return undefined;
    const value = decodeFunctionResult({
      abi: STRING_ABI,
      functionName,
      data: raw as Hex,
    } as any);
    return typeof value === "string" &&
      value.length > 0 &&
      value.length <= maxChars
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}

async function resolveAtBlock(
  transfer: Pick<NftTransferRecord, "token" | "tokenId" | "standard">,
  rpcUrl: string,
  blockTag: string | "latest",
): Promise<HistoryNftDisplayMetadata | null> {
  const tokenId = BigInt(transfer.tokenId);
  const [collectionName, symbol, tokenUri] = await Promise.all([
    readString(rpcUrl, transfer.token, "name", blockTag, undefined, 256),
    readString(rpcUrl, transfer.token, "symbol", blockTag, undefined, 64),
    readString(
      rpcUrl,
      transfer.token,
      transfer.standard === "erc721" ? "tokenURI" : "uri",
      blockTag,
      tokenId,
    ),
  ]);
  if (!collectionName && !symbol && !tokenUri) return null;
  const resolved = tokenUri ? await resolveNftMetadata(tokenUri, tokenId) : null;
  return {
    collectionName,
    symbol,
    name: resolved?.name,
    image: resolved?.image,
    historical: blockTag !== "latest",
  };
}

export async function resolveConfirmedNftTransferMetadata(
  transfer: Pick<NftTransferRecord, "token" | "tokenId" | "standard">,
  rpcUrl: string,
  blockNumber: string,
): Promise<HistoryNftDisplayMetadata> {
  return (
    (await resolveAtBlock(transfer, rpcUrl, blockNumber)) ??
    (await resolveAtBlock(transfer, rpcUrl, "latest")) ?? {
      historical: false,
    }
  );
}
