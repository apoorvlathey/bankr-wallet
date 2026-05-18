// Per-contract cache for ERC-4804 (Tier 2b) resolutions. Lets us skip the
// Kubo `add` round-trip when the onchain HTML body hasn't changed since the
// last visit. Keyed by contract address; stores the sha256 of the response
// body and the resulting CID.
//
// Ported from dapp3 `src/lib/web3url-cache.ts`. Renamed storage key
// `web3UrlCache` → `ensWeb3UrlCache` to avoid collisions; budgets are
// hard-coded (settings UI for them is deferred — see plan §3 Open Question).

export type Web3CacheEntry = {
  contractAddress: `0x${string}`;
  contentHash: string;
  cid: string;
  bodyLen: number;
  lastAccess: number;
  // ENS name that produced this entry — first-write-wins. Cosmetic only.
  ensName?: string;
};

const KEY = "ensWeb3UrlCache";

type CacheMap = Record<string, Web3CacheEntry>;

async function readMap(): Promise<CacheMap> {
  const raw = await chrome.storage.local.get(KEY);
  return (raw[KEY] as CacheMap | undefined) ?? {};
}

async function writeMap(map: CacheMap): Promise<void> {
  await chrome.storage.local.set({ [KEY]: map });
}

function normaliseAddr(address: string): string {
  return address.toLowerCase();
}

export async function getWeb3CacheEntry(
  address: string,
): Promise<Web3CacheEntry | null> {
  const map = await readMap();
  return map[normaliseAddr(address)] ?? null;
}

export async function setWeb3CacheEntry(entry: Web3CacheEntry): Promise<void> {
  const map = await readMap();
  map[normaliseAddr(entry.contractAddress)] = {
    ...entry,
    contractAddress: normaliseAddr(entry.contractAddress) as `0x${string}`,
  };
  await writeMap(map);
}

export async function bumpWeb3LastAccess(address: string): Promise<void> {
  const map = await readMap();
  const key = normaliseAddr(address);
  const entry = map[key];
  if (!entry) return;
  entry.lastAccess = Date.now();
  await writeMap(map);
}

export async function listWeb3Entries(): Promise<Web3CacheEntry[]> {
  const map = await readMap();
  return Object.values(map).sort((a, b) => b.lastAccess - a.lastAccess);
}

export async function removeWeb3CacheEntry(
  address: string,
): Promise<Web3CacheEntry | null> {
  const map = await readMap();
  const key = normaliseAddr(address);
  const entry = map[key];
  if (!entry) return null;
  delete map[key];
  await writeMap(map);
  return entry;
}

export type EvictionPlan = {
  toEvict: Web3CacheEntry[];
  remainingBytes: number;
  remainingCount: number;
};

export async function planEviction(
  newEntryBytes: number,
  budgets: { sizeCapBytes: number; entryBudget: number },
): Promise<EvictionPlan> {
  const map = await readMap();
  const all = Object.values(map).sort((a, b) => a.lastAccess - b.lastAccess);
  let totalBytes = all.reduce((acc, e) => acc + e.bodyLen, 0) + newEntryBytes;
  let totalCount = all.length + 1;
  const toEvict: Web3CacheEntry[] = [];
  for (const entry of all) {
    if (
      totalBytes <= budgets.sizeCapBytes &&
      totalCount <= budgets.entryBudget
    ) {
      break;
    }
    toEvict.push(entry);
    totalBytes -= entry.bodyLen;
    totalCount -= 1;
  }
  return {
    toEvict,
    remainingBytes: totalBytes,
    remainingCount: totalCount,
  };
}

export const DEFAULT_WEB3_SIZE_CAP_BYTES = 50 * 1024 * 1024; // 50 MB
export const DEFAULT_WEB3_ENTRY_BUDGET = 200;

export async function getWeb3Budgets(): Promise<{
  sizeCapBytes: number;
  entryBudget: number;
}> {
  // Hard-coded for now; expose in Settings later if users complain about the
  // defaults (deferred per plan §3).
  return {
    sizeCapBytes: DEFAULT_WEB3_SIZE_CAP_BYTES,
    entryBudget: DEFAULT_WEB3_ENTRY_BUDGET,
  };
}

export async function sha256Hex(body: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", body as BufferSource);
  const arr = new Uint8Array(buf);
  let out = "";
  for (let i = 0; i < arr.length; i++) {
    out += (arr[i] ?? 0).toString(16).padStart(2, "0");
  }
  return out;
}

export function mfsPathFor(
  contractAddress: string,
  contentHash: string,
): string {
  return `/walletchan/ens/web3/${normaliseAddr(contractAddress)}/${contentHash}`;
}
