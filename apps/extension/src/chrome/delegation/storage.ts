import { withStorageLock } from "../storageLock";
import type { Address } from "./types";

export const CUSTOM_DELEGATES_STORAGE_KEY = "customDelegates";
const STORAGE_LOCK_KEY = `local:${CUSTOM_DELEGATES_STORAGE_KEY}`;

type CustomDelegateMap = Record<string, Record<string, Address>>;

async function readAll(): Promise<CustomDelegateMap> {
  const result = await chrome.storage.local.get(CUSTOM_DELEGATES_STORAGE_KEY);
  return (
    (result[CUSTOM_DELEGATES_STORAGE_KEY] as CustomDelegateMap | undefined) ??
    {}
  );
}

async function writeAll(map: CustomDelegateMap): Promise<void> {
  await chrome.storage.local.set({ [CUSTOM_DELEGATES_STORAGE_KEY]: map });
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
  await withStorageLock(STORAGE_LOCK_KEY, async () => {
    const all = await readAll();
    const forAccount = all[accountId] ?? {};
    forAccount[String(chainId)] = delegate.toLowerCase() as Address;
    all[accountId] = forAccount;
    await writeAll(all);
  });
}

export async function removeCustomDelegate(
  accountId: string,
  chainId: number,
): Promise<void> {
  await withStorageLock(STORAGE_LOCK_KEY, async () => {
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
  });
}

export async function getAllDelegatesForAccount(
  accountId: string,
): Promise<Record<number, Address>> {
  const all = await readAll();
  const forAccount = all[accountId];
  if (!forAccount) return {};
  const out: Record<number, Address> = {};
  for (const [chainIdString, address] of Object.entries(forAccount)) {
    const chainId = Number(chainIdString);
    if (!Number.isFinite(chainId)) continue;
    out[chainId] = address;
  }
  return out;
}

export async function removeAllDelegatesForAccount(
  accountId: string,
): Promise<void> {
  await withStorageLock(STORAGE_LOCK_KEY, async () => {
    const all = await readAll();
    if (!all[accountId]) return;
    delete all[accountId];
    await writeAll(all);
  });
}
