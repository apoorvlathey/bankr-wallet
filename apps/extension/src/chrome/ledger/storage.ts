import { getAddress, isAddress } from "viem";
import type { LedgerAccount, LedgerDevice } from "../types";
import { assertAccountStorageAuthorized } from "../accounts/authorization";
import {
  ACCOUNTS_LOCK_KEY,
  ACCOUNTS_STORAGE_KEY,
  getAccounts,
  normalizeEvmAccountAddress,
} from "../accounts/repository";
import { setActiveAccountId } from "../accounts/selectionStorage";
import { withStorageLock } from "../storageLock";
import { isValidBip32Path } from "../../lib/bip32Path";

export const LEDGER_DEVICES_STORAGE_KEY = "ledgerDevices";

export type LedgerDeviceMap = Record<string, LedgerDevice>;

export interface LedgerAddressInput {
  address: string;
  hdPath: string;
  hdIndex: number;
  displayName?: string;
}

export async function getLedgerDevices(): Promise<LedgerDeviceMap> {
  const result = await chrome.storage.local.get(LEDGER_DEVICES_STORAGE_KEY);
  return (result[LEDGER_DEVICES_STORAGE_KEY] as LedgerDeviceMap | undefined) ?? {};
}

export async function addLedgerAccounts(input: {
  deviceId: string;
  deviceLabel: string;
  deviceModel: string;
  addresses: LedgerAddressInput[];
}, expectedAuthEpoch: string): Promise<LedgerAccount[]> {
  const created = await withStorageLock(ACCOUNTS_LOCK_KEY, async () => {
    assertAccountStorageAuthorized(expectedAuthEpoch);
    const deviceId = normalizeDeviceId(input.deviceId);
    const label = input.deviceLabel.trim().slice(0, 64) || "Ledger";
    if (input.addresses.length < 1 || input.addresses.length > 20) {
      throw new Error("Select between 1 and 20 Ledger accounts.");
    }
    const accounts = await getAccounts();
    const existingAddresses = new Set(
      accounts.filter((account) => account.type !== "impersonator").map((account) => account.address.toLowerCase()),
    );
    const selectedAddresses = new Set<string>();
    const created = input.addresses.map((entry): LedgerAccount => {
      if (!isAddress(entry.address) || !isValidBip32Path(entry.hdPath)) {
        throw new Error("Invalid Ledger account details.");
      }
      if (!Number.isSafeInteger(entry.hdIndex) || entry.hdIndex < 0) {
        throw new Error("Invalid Ledger derivation index.");
      }
      const checksummedAddress = getAddress(entry.address);
      const normalized = normalizeEvmAccountAddress(checksummedAddress);
      if (existingAddresses.has(normalized) || selectedAddresses.has(normalized)) {
        throw new Error(`${checksummedAddress} is already in this wallet.`);
      }
      selectedAddresses.add(normalized);
      return {
        id: crypto.randomUUID(), type: "ledger", address: checksummedAddress, deviceId,
        hdPath: entry.hdPath, hdIndex: entry.hdIndex,
        displayName: entry.displayName?.trim().slice(0, 64) || undefined,
        createdAt: Date.now(),
      };
    });
    const devices = await getLedgerDevices();
    devices[deviceId] = {
      label,
      model: input.deviceModel.trim().slice(0, 64) || "Ledger",
      addedAt: devices[deviceId]?.addedAt ?? Date.now(),
    };
    assertAccountStorageAuthorized(expectedAuthEpoch);
    await chrome.storage.local.set({
      [ACCOUNTS_STORAGE_KEY]: [...accounts, ...created],
      [LEDGER_DEVICES_STORAGE_KEY]: devices,
    });
    return created;
  });
  // The account/device write above is the durable commit. Selection lives in
  // sync storage and is a convenience mirror, so a sync failure must not turn
  // a successful import into a false failure that the user cannot safely retry.
  await setActiveAccountId(created[0].id, expectedAuthEpoch).catch((error) => {
    console.warn("[ledger] Failed to select newly added Ledger account:", error);
  });
  return created;
}

export async function removeLedgerDeviceIfUnused(
  deviceId: string,
  expectedAuthEpoch?: string,
): Promise<void> {
  await withStorageLock(ACCOUNTS_LOCK_KEY, async () => {
    const accounts = await getAccounts();
    if (accounts.some((account) => account.type === "ledger" && account.deviceId === deviceId)) return;
    const devices = await getLedgerDevices();
    if (!(deviceId in devices)) return;
    delete devices[deviceId];
    assertAccountStorageAuthorized(expectedAuthEpoch);
    await chrome.storage.local.set({ [LEDGER_DEVICES_STORAGE_KEY]: devices });
  });
}

function normalizeDeviceId(value: string): string {
  if (!isAddress(value)) throw new Error("Invalid Ledger device identity.");
  return getAddress(value).toLowerCase();
}
