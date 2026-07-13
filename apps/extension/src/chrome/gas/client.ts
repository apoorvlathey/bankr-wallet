import { createPublicClient, type Address, type PublicClient } from "viem";
import { getStoredResolvedChainById } from "@/lib/chains";
import { secureHttpTransport } from "../network/rpcClient";
import {
  fetchNativeCoinGeckoPrice,
  resolveCoinGeckoNativeAssetsBatch,
} from "../portfolio/coingecko";
import { getRpcUrl } from "../transactions/rpcConfig";

const RPC_TIMEOUT = 10_000;
const clientCache = new Map<number, { rpcUrl: string; client: PublicClient }>();

export async function getGasClient(
  chainId: number,
): Promise<PublicClient | null> {
  const rpcUrl = await getRpcUrl(chainId);
  if (!rpcUrl) return null;
  const cached = clientCache.get(chainId);
  if (cached?.rpcUrl === rpcUrl) return cached.client;
  const client = createPublicClient({
    transport: secureHttpTransport(rpcUrl, {
      timeout: RPC_TIMEOUT,
      retryCount: 1,
    }),
  });
  clientCache.set(chainId, { rpcUrl, client });
  return client;
}

export async function fetchNativePrice(
  chainId: number,
): Promise<number | null> {
  const registryPrice = await fetchNativeCoinGeckoPrice(chainId);
  if (registryPrice !== null) return registryPrice;
  const chain = await getStoredResolvedChainById(chainId);
  if (!chain) return null;
  const [resolved] = await resolveCoinGeckoNativeAssetsBatch([
    {
      chainId,
      chainName: chain.name,
      nativeCurrencyName: chain.nativeCurrency.name,
      symbol: chain.nativeCurrency.symbol,
    },
  ]);
  return resolved?.priceUsd ? resolved.priceUsd : null;
}

export async function estimateGasLimitWithBuffer(
  tx: {
    from: string;
    to: string;
    data?: string;
    value?: string;
    chainId: number;
  },
  bufferPct: number,
): Promise<bigint | null> {
  const client = await getGasClient(tx.chainId);
  if (!client) return null;
  const value =
    tx.value && tx.value !== "0x0" && tx.value !== "0"
      ? BigInt(tx.value)
      : 0n;
  const data =
    tx.data && tx.data !== "0x"
      ? (tx.data as `0x${string}`)
      : undefined;
  try {
    const raw = await client.estimateGas({
      account: tx.from as Address,
      to: tx.to as Address,
      value,
      data,
    });
    return (raw * BigInt(100 + bufferPct)) / 100n;
  } catch {
    return null;
  }
}
