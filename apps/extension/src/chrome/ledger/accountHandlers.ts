import { addLedgerAccounts, getLedgerDevices, type LedgerAddressInput } from "./storage";
import {
  cancelLedgerOperation,
  connectLedger,
  scanLedgerAddresses,
} from "./offscreenBridge";
import { handleUnlockWallet } from "../authHandlers";
import { getAuthCeremonyEpoch } from "../authTransition";
import { resolvePasswordType } from "../sessionCache";
import {
  WALLET_SECRET_OPERATION_LOCK_KEY,
  withStorageLock,
} from "../storageLock";

const SCHEMES = new Set(["ledgerLive", "bip44", "legacyMew", "custom"]);

export async function handleLedgerConnect(message: Record<string, unknown>) {
  requireWebHid();
  return connectLedger(
    requireString(message.opId, "operation ID"),
    typeof message.productName === "string" ? message.productName.slice(0, 128) : undefined,
  );
}

export async function handleLedgerScan(message: Record<string, unknown>) {
  requireWebHid();
  const scheme = requireString(message.scheme, "derivation scheme");
  if (!SCHEMES.has(scheme)) throw new Error("Invalid Ledger derivation scheme.");
  const startIndex = requireInteger(message.startIndex, "start index", 0, 0x7fffffff);
  const count = requireInteger(message.count, "address count", 1, 20);
  return scanLedgerAddresses({
    opId: requireString(message.opId, "operation ID"),
    deviceId: requireString(message.deviceId, "device ID"),
    startIndex,
    count,
    scheme: scheme as "ledgerLive" | "bip44" | "legacyMew" | "custom",
    customTemplate: typeof message.customTemplate === "string" ? message.customTemplate : undefined,
  });
}

export async function handleAddLedgerAccounts(message: Record<string, unknown>) {
  const passwordType = await resolvePasswordType(handleUnlockWallet);
  if (passwordType !== "master") {
    throw new Error("Adding accounts requires master password");
  }
  const expectedAuthEpoch = getAuthCeremonyEpoch();
  if (!Array.isArray(message.addresses)) throw new Error("No Ledger accounts selected.");
  const input = {
    deviceId: requireString(message.deviceId, "device ID"),
    deviceLabel: requireString(message.deviceLabel, "device label"),
    deviceModel: requireString(message.deviceModel, "device model"),
    addresses: message.addresses.map((value) => {
      if (!value || typeof value !== "object") throw new Error("Invalid Ledger account.");
      const item = value as Record<string, unknown>;
      return {
        address: requireString(item.address, "address"),
        hdPath: requireString(item.hdPath, "derivation path"),
        hdIndex: requireInteger(item.hdIndex, "derivation index", 0, 0x7fffffff),
        displayName: typeof item.displayName === "string" ? item.displayName : undefined,
      } satisfies LedgerAddressInput;
    }),
  };
  const accounts = await withStorageLock(
    WALLET_SECRET_OPERATION_LOCK_KEY,
    () => addLedgerAccounts(input, expectedAuthEpoch),
  );
  void chrome.runtime.sendMessage({ type: "accountsUpdated" }).catch(() => undefined);
  return accounts;
}

export async function handleGetLedgerDevices() {
  return getLedgerDevices();
}

export async function handleLedgerCancel(message: Record<string, unknown>) {
  await cancelLedgerOperation(requireString(message.opId, "operation ID"));
  return { success: true };
}

function requireWebHid(): void {
  if (!chrome.offscreen) throw new Error("Ledger support is only available in Chrome.");
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Missing ${name}.`);
  return value.trim().slice(0, 256);
}

function requireInteger(value: unknown, name: string, min: number, max: number): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    throw new Error(`Invalid ${name}.`);
  }
  return number;
}
