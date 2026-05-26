/**
 * Storage helper for user-configured EIP-7702 delegate overrides.
 *
 * Key: "customDelegates" in chrome.storage.local
 * Shape: { [accountId]: { [chainId]: "0x..." } }
 *
 * This is a UI mirror/cache only. Runtime batch resolution trusts the EOA's
 * current onchain delegation (`eth_getCode`) plus the WalletChan default
 * registry; it does not use this store as a signing input.
 *
 * Addresses are stored lowercased.
 */

type Address = `0x${string}`;

const STORAGE_KEY = "customDelegates";

type CustomDelegateMap = Record<string, Record<string, Address>>;

async function readAll(): Promise<CustomDelegateMap> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return (result[STORAGE_KEY] as CustomDelegateMap | undefined) ?? {};
}

async function writeAll(map: CustomDelegateMap): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: map });
}

export async function getCustomDelegate(
  accountId: string,
  chainId: number,
): Promise<Address | null> {
  const all = await readAll();
  const forAccount = all[accountId];
  if (!forAccount) return null;
  return forAccount[String(chainId)] ?? null;
}

export async function setCustomDelegate(
  accountId: string,
  chainId: number,
  delegate: Address,
): Promise<void> {
  const all = await readAll();
  const forAccount = all[accountId] ?? {};
  forAccount[String(chainId)] = delegate.toLowerCase() as Address;
  all[accountId] = forAccount;
  await writeAll(all);
}

export async function removeCustomDelegate(
  accountId: string,
  chainId: number,
): Promise<void> {
  const all = await readAll();
  const forAccount = all[accountId];
  if (!forAccount) return;
  delete forAccount[String(chainId)];
  if (Object.keys(forAccount).length === 0) {
    delete all[accountId];
  } else {
    all[accountId] = forAccount;
  }
  await writeAll(all);
}

export async function getAllDelegatesForAccount(
  accountId: string,
): Promise<Record<number, Address>> {
  const all = await readAll();
  const forAccount = all[accountId];
  if (!forAccount) return {};
  const out: Record<number, Address> = {};
  for (const [chainIdStr, addr] of Object.entries(forAccount)) {
    const chainId = Number(chainIdStr);
    if (!Number.isFinite(chainId)) continue;
    out[chainId] = addr;
  }
  return out;
}

/**
 * Drop all custom delegate entries for an account. Called when an account is
 * removed so we don't accumulate orphan storage.
 */
export async function removeAllDelegatesForAccount(
  accountId: string,
): Promise<void> {
  const all = await readAll();
  if (!all[accountId]) return;
  delete all[accountId];
  await writeAll(all);
}
