import {
  ZERION_API_BASE,
  fetchZerionJson,
  normalizeZerionNextUrl,
} from "./zerionClient";
import type { ZerionChainsResponse } from "./zerionTypes";

const MAX_CHAIN_PAGES = 50;
const CHAIN_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const STATIC_ZERION_CHAIN_IDS: Record<string, number> = {
  ethereum: 1,
  mainnet: 1,
  optimism: 10,
  bsc: 56,
  "binance-smart-chain": 56,
  gnosis: 100,
  unichain: 130,
  polygon: 137,
  monad: 143,
  sonic: 146,
  fantom: 250,
  zksync: 324,
  "zksync-era": 324,
  world: 480,
  hyperevm: 999,
  abstract: 2741,
  mantle: 5000,
  megaeth: 4326,
  base: 8453,
  plasma: 9745,
  mode: 34443,
  celo: 42220,
  arbitrum: 42161,
  avalanche: 43114,
  ink: 57073,
  linea: 59144,
  berachain: 80094,
  blast: 81457,
  scroll: 534352,
  zora: 7777777,
};

let chainCache:
  | {
      fetchedAt: number;
      chainIds: Map<string, number>;
    }
  | null = null;

export async function fetchZerionChainIds(
  apiKey: string,
): Promise<Map<string, number>> {
  const now = Date.now();
  if (chainCache && now - chainCache.fetchedAt < CHAIN_CACHE_TTL_MS) {
    return chainCache.chainIds;
  }

  const chainIds = new Map<string, number>(
    Object.entries(STATIC_ZERION_CHAIN_IDS),
  );

  try {
    let url: string | null = `${ZERION_API_BASE}/chains/`;
    for (let page = 0; url && page < MAX_CHAIN_PAGES; page += 1) {
      const data = await fetchZerionJson<ZerionChainsResponse>(url, apiKey, 3600);
      for (const chain of data.data || []) {
        const parsed = parseExternalChainId(chain.attributes?.external_id);
        if (parsed) chainIds.set(chain.id, parsed);
      }
      url = normalizeZerionNextUrl(data.links?.next);
    }
  } catch (err) {
    console.warn("[portfolio:zerion] chain metadata fetch failed:", err);
  }

  chainCache = { fetchedAt: now, chainIds };
  return chainIds;
}

function parseExternalChainId(
  value: string | number | null | undefined,
): number | null {
  if (typeof value === "number") return isUsableChainId(value) ? value : null;
  if (!value) return null;

  const trimmed = value.trim().toLowerCase();
  const eip155 = trimmed.match(/^eip155:(\d+)$/);
  if (eip155) {
    const parsed = Number(eip155[1]);
    return isUsableChainId(parsed) ? parsed : null;
  }

  if (/^\d+$/.test(trimmed)) {
    const parsed = Number(trimmed);
    return isUsableChainId(parsed) ? parsed : null;
  }

  if (/^0x[0-9a-f]+$/.test(trimmed)) {
    const parsed = Number.parseInt(trimmed, 16);
    return isUsableChainId(parsed) ? parsed : null;
  }

  return null;
}

function isUsableChainId(value: number): boolean {
  return Number.isInteger(value) && value > 0 && value <= Number.MAX_SAFE_INTEGER;
}
