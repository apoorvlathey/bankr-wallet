import type { TokenMetadata } from "./catalogTypes";

export async function resolveCustomNativePricesBatch(
  requests: Array<{
    chainId: number;
    chainName: string;
    nativeCurrencyName: string;
    symbol: string;
  }>,
): Promise<Map<number, { priceUsd: number; logoUrl?: string }>> {
  if (requests.length === 0) return new Map();

  try {
    const response = await new Promise<{
      success: boolean;
      data?: { priceUsd: number; logoUrl?: string }[];
    }>((resolve) => {
      chrome.runtime.sendMessage(
        { type: "resolveCoinGeckoNativeAssets", requests },
        resolve,
      );
    });
    if (!response?.success || !response.data) return new Map();
    return new Map(
      requests.map((request, index) => [
        request.chainId,
        response.data?.[index] || { priceUsd: 0 },
      ]),
    );
  } catch {
    return new Map();
  }
}

export async function resolveErc20PricesBatch(
  requests: { chainId: number; contractAddress: string }[],
): Promise<Map<string, number>> {
  if (requests.length === 0) return new Map();
  try {
    const response = await new Promise<{
      success: boolean;
      data?: { chainId: number; contractAddress: string; priceUsd: number }[];
    }>((resolve) => {
      chrome.runtime.sendMessage(
        { type: "resolveCoinGeckoErc20Prices", requests },
        resolve,
      );
    });
    if (!response?.success || !response.data) return new Map();
    return new Map(
      response.data.map((entry) => [
        `${entry.chainId}-${entry.contractAddress.toLowerCase()}`,
        entry.priceUsd,
      ]),
    );
  } catch {
    return new Map();
  }
}

export async function resolveTokenMetadataBatch(
  requests: { chainId: number; contractAddress: string }[],
): Promise<Map<string, TokenMetadata>> {
  if (requests.length === 0) return new Map();
  const entries = await Promise.all(
    requests.map(
      (request) =>
        new Promise<[string, TokenMetadata | null]>((resolve) => {
          const address = request.contractAddress.toLowerCase();
          chrome.runtime.sendMessage(
            {
              type: "resolveTokenMetadata",
              chainId: request.chainId,
              tokenAddress: address,
              includeBungeeTokens: false,
            },
            (response) => {
              resolve([
                `${request.chainId}-${address}`,
                response?.success ? response.data ?? null : null,
              ]);
            },
          );
        }),
    ),
  );
  return new Map(
    entries.filter(
      (entry): entry is [string, TokenMetadata] => entry[1] !== null,
    ),
  );
}
