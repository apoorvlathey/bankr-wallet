/** Non-secret metadata for groups of accounts derived from one mnemonic. */

import type { SeedGroup } from "../types";
import {
  WALLET_SECRET_STORAGE_LOCK_KEY,
  withStorageLock,
} from "../storageLock";
import { assertAccountStorageAuthorized } from "./authorization";

const SEED_GROUPS_KEY = "seedGroups";
const SEED_GROUPS_LOCK_KEY = WALLET_SECRET_STORAGE_LOCK_KEY;

export async function getSeedGroups(): Promise<SeedGroup[]> {
  const result = await chrome.storage.local.get(SEED_GROUPS_KEY);
  return result[SEED_GROUPS_KEY] || [];
}

export async function addSeedGroup(
  name?: string,
  expectedAuthEpoch?: string,
): Promise<SeedGroup> {
  return withStorageLock(SEED_GROUPS_LOCK_KEY, async () => {
    const groups = await getSeedGroups();
    assertAccountStorageAuthorized(expectedAuthEpoch);
    const group: SeedGroup = {
      id: crypto.randomUUID(),
      name: name || `Seed #${groups.length + 1}`,
      createdAt: Date.now(),
      accountCount: 0,
    };
    groups.push(group);
    assertAccountStorageAuthorized(expectedAuthEpoch);
    await chrome.storage.local.set({ [SEED_GROUPS_KEY]: groups });
    return group;
  });
}

export async function updateSeedGroupCount(
  seedGroupId: string,
  accountCount: number,
  expectedAuthEpoch?: string,
): Promise<void> {
  await withStorageLock(SEED_GROUPS_LOCK_KEY, async () => {
    const groups = await getSeedGroups();
    assertAccountStorageAuthorized(expectedAuthEpoch);
    const group = groups.find((candidate) => candidate.id === seedGroupId);
    if (group) {
      group.accountCount = accountCount;
      assertAccountStorageAuthorized(expectedAuthEpoch);
      await chrome.storage.local.set({ [SEED_GROUPS_KEY]: groups });
    }
  });
}

export async function renameSeedGroup(
  seedGroupId: string,
  newName: string,
): Promise<void> {
  await withStorageLock(SEED_GROUPS_LOCK_KEY, async () => {
    const groups = await getSeedGroups();
    const group = groups.find((candidate) => candidate.id === seedGroupId);
    if (group) {
      group.name = newName;
      await chrome.storage.local.set({ [SEED_GROUPS_KEY]: groups });
    }
  });
}

export async function removeSeedGroup(
  seedGroupId: string,
  expectedAuthEpoch?: string,
): Promise<void> {
  await withStorageLock(SEED_GROUPS_LOCK_KEY, async () => {
    const groups = await getSeedGroups();
    const filtered = groups.filter((group) => group.id !== seedGroupId);
    assertAccountStorageAuthorized(expectedAuthEpoch);
    await chrome.storage.local.set({ [SEED_GROUPS_KEY]: filtered });
  });
}
