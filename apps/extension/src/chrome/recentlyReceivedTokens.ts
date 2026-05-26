/**
 * Recently-received tokens cache.
 *
 * Every time a confirmed tx delivers an ERC-20 to the sender (via
 * `assetChangesExtractor`), we record the (chainId, address) here so the
 * portfolio loader can inject the token into the catalog before the upstream
 * portfolio API has had time to re-index. The on-chain balance pass and
 * Coingecko backfill then fill in the live balance, price, and logo.
 *
 * Entries auto-expire after 5 minutes — by then the portfolio API has caught
 * up and the synthetic stub is redundant. Pruning is opportunistic (lazy
 * inside `getRecentReceivedTokens` so the writer never has to be careful).
 */

const KEY = "recentlyReceivedTokens";
const TTL_MS = 5 * 60 * 1000;

export interface RecentReceivedTokenEntry {
  chainId: number;
  /** Lowercased contract address. */
  contractAddress: string;
  addedAt: number;
  /** Metadata snapshot from the centralized token metadata resolver. */
  name?: string;
  symbol?: string;
  decimals?: number;
  logoUrl?: string;
}

type Bag = Record<string, RecentReceivedTokenEntry>;

function entryKey(chainId: number, contractAddress: string): string {
  return `${chainId}-${contractAddress.toLowerCase()}`;
}

async function readBag(): Promise<Bag> {
  const stored = await chrome.storage.local.get(KEY);
  return (stored[KEY] as Bag | undefined) ?? {};
}

async function writeBag(bag: Bag): Promise<void> {
  await chrome.storage.local.set({ [KEY]: bag });
}

export async function addReceivedToken(
  chainId: number,
  contractAddress: string,
  meta?: { name?: string; symbol?: string; decimals?: number; logoUrl?: string },
): Promise<void> {
  if (!/^0x[a-fA-F0-9]{40}$/.test(contractAddress)) return;
  const addr = contractAddress.toLowerCase();
  const bag = await readBag();
  bag[entryKey(chainId, addr)] = {
    chainId,
    contractAddress: addr,
    addedAt: Date.now(),
    name: meta?.name,
    symbol: meta?.symbol,
    decimals: meta?.decimals,
    logoUrl: meta?.logoUrl,
  };
  await writeBag(bag);
}

export async function getRecentReceivedTokens(): Promise<RecentReceivedTokenEntry[]> {
  const bag = await readBag();
  const now = Date.now();
  const live: RecentReceivedTokenEntry[] = [];
  let changed = false;
  for (const [key, entry] of Object.entries(bag)) {
    if (now - entry.addedAt < TTL_MS) {
      live.push(entry);
    } else {
      delete bag[key];
      changed = true;
    }
  }
  if (changed) await writeBag(bag);
  return live;
}
