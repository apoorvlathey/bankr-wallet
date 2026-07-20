import type { Account, SafeAccount } from "../types";
import {
  WALLET_SECRET_STORAGE_LOCK_KEY,
  withStorageLock,
} from "../storageLock";
import type {
  SafeAccountRecord,
  SafeAddress,
  SafeCapability,
  SafeChainSnapshot,
  SafeSupportedVersion,
} from "./types";
import { removeSafeProposalsForAccount } from "./proposalRepository";

export const SAFE_ACCOUNTS_STORAGE_KEY = "safeAccounts";
const ACCOUNTS_STORAGE_KEY = "accounts";
const MAX_SAFE_ACCOUNTS = 100;
const MAX_SAFE_CHAINS = 100;
const MAX_SAFE_OWNERS = 100;
const MAX_SAFE_MODULES = 100;
const MAX_DISPLAY_NAME_CHARS = 64;

interface SafeAccountsEnvelope {
  version: 1;
  records: SafeAccountRecord[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseAddress(value: unknown, label: string): SafeAddress {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error(`Invalid Safe ${label}`);
  }
  return value.toLowerCase() as SafeAddress;
}

function parseDecimal(value: unknown, label: string): `${bigint}` {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`Invalid Safe ${label}`);
  }
  return value as `${bigint}`;
}

function parseBoundedInteger(
  value: unknown,
  label: string,
  min: number,
  max: number,
): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) {
    throw new Error(`Invalid Safe ${label}`);
  }
  return value as number;
}

function parseAddressArray(
  value: unknown,
  label: string,
  max: number,
): SafeAddress[] {
  if (!Array.isArray(value) || value.length > max) {
    throw new Error(`Invalid Safe ${label}`);
  }
  const addresses = value.map((item) => parseAddress(item, label));
  if (new Set(addresses).size !== addresses.length) {
    throw new Error(`Duplicate Safe ${label}`);
  }
  return addresses;
}

const CAPABILITIES = new Set<SafeCapability>([
  "observe",
  "approve",
  "quorumAvailable",
  "readyToExecute",
  "blocked",
]);
const VERSIONS = new Set<SafeSupportedVersion>(["1.3.0", "1.4.1", "1.5.0"]);
const SERVICE_STATES = new Set(["supported", "unavailable", "unsupported"]);

export function decodeSafeChainSnapshot(value: unknown): SafeChainSnapshot {
  if (!isObject(value)) throw new Error("Invalid Safe chain snapshot");
  const owners = parseAddressArray(value.owners, "owners", MAX_SAFE_OWNERS);
  const contractOwners = parseAddressArray(value.contractOwners ?? [], "contract owners", MAX_SAFE_OWNERS);
  if (contractOwners.some((owner) => !owners.includes(owner))) {
    throw new Error("Safe contract owner is not in the owner set");
  }
  const threshold = parseBoundedInteger(
    value.threshold,
    "threshold",
    1,
    MAX_SAFE_OWNERS,
  );
  if (threshold > owners.length) throw new Error("Invalid Safe threshold");
  if (!VERSIONS.has(value.version as SafeSupportedVersion)) {
    throw new Error("Unsupported Safe version");
  }
  if (!CAPABILITIES.has(value.capability as SafeCapability)) {
    throw new Error("Invalid Safe capability");
  }
  if (!SERVICE_STATES.has(value.transactionService as string)) {
    throw new Error("Invalid Safe service state");
  }
  if (
    typeof value.configEpoch !== "string" ||
    !/^0x[0-9a-f]{64}$/.test(value.configEpoch)
  ) {
    throw new Error("Invalid Safe configuration epoch");
  }

  return {
    chainId: parseBoundedInteger(value.chainId, "chain ID", 1, Number.MAX_SAFE_INTEGER),
    verifiedAtBlock: parseDecimal(value.verifiedAtBlock, "verified block"),
    configEpoch: value.configEpoch,
    singleton: parseAddress(value.singleton, "singleton"),
    version: value.version as SafeSupportedVersion,
    owners,
    contractOwners,
    threshold,
    nonce: parseDecimal(value.nonce, "nonce"),
    modules: parseAddressArray(value.modules, "modules", MAX_SAFE_MODULES),
    guard: parseAddress(value.guard, "guard"),
    fallbackHandler: parseAddress(value.fallbackHandler, "fallback handler"),
    transactionService: value.transactionService as SafeChainSnapshot["transactionService"],
    capability: value.capability as SafeCapability,
    blockedReason:
      typeof value.blockedReason === "string"
        ? value.blockedReason.slice(0, 500)
        : undefined,
  };
}

export function decodeSafeAccountRecord(value: unknown): SafeAccountRecord {
  if (!isObject(value) || value.version !== 1) {
    throw new Error("Invalid Safe account record");
  }
  if (
    typeof value.accountId !== "string" ||
    value.accountId.length < 1 ||
    value.accountId.length > 512
  ) {
    throw new Error("Invalid Safe account ID");
  }
  if (value.importedBy !== "manual" && value.importedBy !== "ownerDiscovery") {
    throw new Error("Invalid Safe import source");
  }
  if (!isObject(value.chains) || Object.keys(value.chains).length > MAX_SAFE_CHAINS) {
    throw new Error("Invalid Safe chain records");
  }
  const chains: Record<string, SafeChainSnapshot> = {};
  for (const [key, rawSnapshot] of Object.entries(value.chains)) {
    const snapshot = decodeSafeChainSnapshot(rawSnapshot);
    if (key !== String(snapshot.chainId)) {
      throw new Error("Safe chain key does not match chain ID");
    }
    chains[key] = snapshot;
  }
  if (Object.keys(chains).length === 0) {
    throw new Error("Safe account has no verified chains");
  }
  return {
    version: 1,
    accountId: value.accountId,
    address: parseAddress(value.address, "address"),
    importedBy: value.importedBy,
    chains,
  };
}

export function decodeSafeAccountsEnvelope(value: unknown): SafeAccountsEnvelope {
  if (value === undefined) return { version: 1, records: [] };
  if (!isObject(value) || value.version !== 1 || !Array.isArray(value.records)) {
    throw new Error("Invalid Safe account storage");
  }
  if (value.records.length > MAX_SAFE_ACCOUNTS) {
    throw new Error("Too many Safe accounts");
  }
  const records = value.records.map(decodeSafeAccountRecord);
  const ids = new Set(records.map((record) => record.accountId));
  const addresses = new Set(records.map((record) => record.address));
  if (ids.size !== records.length || addresses.size !== records.length) {
    throw new Error("Duplicate Safe account record");
  }
  return { version: 1, records };
}

export async function getSafeAccountRecords(): Promise<SafeAccountRecord[]> {
  const stored = await chrome.storage.local.get(SAFE_ACCOUNTS_STORAGE_KEY);
  return decodeSafeAccountsEnvelope(stored[SAFE_ACCOUNTS_STORAGE_KEY]).records;
}

export async function getSafeAccountRecord(
  accountId: string,
): Promise<SafeAccountRecord | null> {
  return (
    (await getSafeAccountRecords()).find((record) => record.accountId === accountId) ??
    null
  );
}

export async function importVerifiedSafeAccount(input: {
  address: SafeAddress;
  displayName?: string;
  importedBy: SafeAccountRecord["importedBy"];
  snapshots: SafeChainSnapshot[];
}): Promise<{ account: SafeAccount; record: SafeAccountRecord; created: boolean }> {
  if (input.snapshots.length === 0 || input.snapshots.length > MAX_SAFE_CHAINS) {
    throw new Error("Safe import requires verified chain state");
  }
  const normalizedAddress = parseAddress(input.address, "address");
  const decodedSnapshots = input.snapshots.map(decodeSafeChainSnapshot);

  return withStorageLock(WALLET_SECRET_STORAGE_LOCK_KEY, async () => {
    const stored = await chrome.storage.local.get([
      ACCOUNTS_STORAGE_KEY,
      SAFE_ACCOUNTS_STORAGE_KEY,
    ]);
    const accounts = Array.isArray(stored[ACCOUNTS_STORAGE_KEY])
      ? (stored[ACCOUNTS_STORAGE_KEY] as Account[])
      : [];
    const envelope = decodeSafeAccountsEnvelope(stored[SAFE_ACCOUNTS_STORAGE_KEY]);
    const existingRecord = envelope.records.find(
      (record) => record.address === normalizedAddress,
    );
    const existingAccount = existingRecord
      ? accounts.find(
          (account) =>
            account.id === existingRecord.accountId && account.type === "safe",
        ) as SafeAccount | undefined
      : undefined;

    if (!!existingRecord !== !!existingAccount) {
      throw new Error("Safe account metadata is inconsistent");
    }

    const chainMap = Object.fromEntries(
      decodedSnapshots.map((snapshot) => [String(snapshot.chainId), snapshot]),
    );
    if (existingRecord && existingAccount) {
      const record = decodeSafeAccountRecord({
        ...existingRecord,
        chains: { ...existingRecord.chains, ...chainMap },
      });
      const nextRecords = envelope.records.map((candidate) =>
        candidate.accountId === record.accountId ? record : candidate,
      );
      await chrome.storage.local.set({
        [SAFE_ACCOUNTS_STORAGE_KEY]: { version: 1, records: nextRecords },
      });
      return { account: existingAccount, record, created: false };
    }

    if (envelope.records.length >= MAX_SAFE_ACCOUNTS) {
      throw new Error("Too many Safe accounts");
    }
    const account: SafeAccount = {
      id: crypto.randomUUID(),
      type: "safe",
      address: normalizedAddress,
      displayName:
        typeof input.displayName === "string" && input.displayName.trim()
          ? input.displayName.trim().slice(0, MAX_DISPLAY_NAME_CHARS)
          : undefined,
      createdAt: Date.now(),
    };
    const record = decodeSafeAccountRecord({
      version: 1,
      accountId: account.id,
      address: normalizedAddress,
      importedBy: input.importedBy,
      chains: chainMap,
    });
    await chrome.storage.local.set({
      [ACCOUNTS_STORAGE_KEY]: [...accounts, account],
      [SAFE_ACCOUNTS_STORAGE_KEY]: {
        version: 1,
        records: [...envelope.records, record],
      },
    });
    return { account, record, created: true };
  });
}

export async function removeSafeAccountRecord(
  accountId: string,
  options: { walletSecretLockHeld?: boolean } = {},
): Promise<void> {
  // Published proposals remain on the external service/onchain; this removes
  // only WalletChan's local display records after the UI warning.
  await removeSafeProposalsForAccount(accountId);
  const removeMetadata = async () => {
    const stored = await chrome.storage.local.get([
      ACCOUNTS_STORAGE_KEY,
      SAFE_ACCOUNTS_STORAGE_KEY,
    ]);
    const accounts = Array.isArray(stored[ACCOUNTS_STORAGE_KEY])
      ? (stored[ACCOUNTS_STORAGE_KEY] as Account[])
      : [];
    const account = accounts.find((candidate) => candidate.id === accountId);
    if (account && account.type !== "safe") {
      throw new Error("Account is not a Safe");
    }
    const envelope = decodeSafeAccountsEnvelope(stored[SAFE_ACCOUNTS_STORAGE_KEY]);
    await chrome.storage.local.set({
      [ACCOUNTS_STORAGE_KEY]: accounts.filter((candidate) => candidate.id !== accountId),
      [SAFE_ACCOUNTS_STORAGE_KEY]: {
        version: 1,
        records: envelope.records.filter((record) => record.accountId !== accountId),
      },
    });
  };
  if (options.walletSecretLockHeld) {
    await removeMetadata();
  } else {
    await withStorageLock(WALLET_SECRET_STORAGE_LOCK_KEY, removeMetadata);
  }
}
