import {
  addSeedGroup,
  getAccounts,
  removeSeedGroup,
  updateSeedGroupCount,
} from "../accountStorage";
import { assertCurrentMasterAuthorization } from "../masterAuthorization";
import { resolveMasterMnemonicAccess } from "./masterAccess";
import {
  getMnemonic,
  removeMnemonic,
  storeMnemonic,
} from "./operations";
import {
  findImportableSeedCandidates,
  normalizeSeedDerivationIndices,
  persistSeedAccounts,
  refreshSeedSigningCacheBestEffort,
  type SeedAccountCandidate,
} from "./accountPersistence";
import { normalizeMnemonicForPersistence } from "./derivation";
import {
  WALLET_SECRET_OPERATION_LOCK_KEY,
  withStorageLock,
} from "../storageLock";
import type { SeedGroup, SeedPhraseAccount } from "../types";

export interface AddSeedPhraseGroupRequest {
  mnemonic?: unknown;
  indices?: unknown;
  name?: string;
  accountDisplayName?: string;
}

export interface DeriveSeedAccountRequest {
  seedGroupId?: string;
  indices?: unknown;
  displayName?: string;
}

export type AddSeedPhraseGroupResult =
  | {
      success: true;
      account: SeedPhraseAccount;
      accounts: SeedPhraseAccount[];
      group: SeedGroup;
    }
  | { success: false; error: string };

export type DeriveSeedAccountResult =
  | {
      success: true;
      account: SeedPhraseAccount;
      accounts: SeedPhraseAccount[];
    }
  | { success: false; error: string };

function notifyAccountsUpdated(): void {
  chrome.runtime.sendMessage({ type: "accountsUpdated" }).catch(() => {});
}

/** Persist a renderer-staged phrase and its selected derived accounts. */
export async function addSeedPhraseGroup(
  request: AddSeedPhraseGroupRequest,
): Promise<AddSeedPhraseGroupResult> {
  try {
    const access = await resolveMasterMnemonicAccess();
    if (!access.success) return access;

    // Phrase generation/import and backup acknowledgement happen in the
    // renderer. This persistence boundary never creates a hidden phrase.
    const mnemonic = normalizeMnemonicForPersistence(request.mnemonic);
    if (!mnemonic) {
      return {
        success: false,
        error: "Generate or enter a valid 12-word seed phrase before saving",
      };
    }

    const indices = normalizeSeedDerivationIndices(request.indices, [0]);
    if (indices.length === 0) {
      return {
        success: false,
        error: "At least one derivation index is required",
      };
    }

    return await withStorageLock(
      WALLET_SECRET_OPERATION_LOCK_KEY,
      async () => {
        assertCurrentMasterAuthorization(access.authEpoch);
        const candidates = await findImportableSeedCandidates(
          mnemonic,
          indices,
        );
        if (candidates.length === 0) {
          return {
            success: false as const,
            error: "All selected addresses already exist in this wallet",
          };
        }

        const group = await addSeedGroup(request.name, access.authEpoch);
        let mnemonicStored = false;
        try {
          await storeMnemonic(
            group.id,
            mnemonic,
            access.mnemonicKey
              ? {
                  kind: "mnemonic-key",
                  key: access.mnemonicKey.key,
                  keyId: access.mnemonicKey.keyId,
                }
              : { kind: "password", password: access.password! },
            access.authEpoch,
          );
          mnemonicStored = true;
        } catch (error) {
          await removeSeedGroup(group.id);
          throw error;
        }

        const persisted = await persistSeedAccounts({
          mnemonic,
          seedGroupId: group.id,
          candidates,
          firstDisplayName: request.accountDisplayName,
          access,
          failureMessage: "Failed to import a seed account",
        });
        if (persisted.accounts.length === 0) {
          if (mnemonicStored) await removeMnemonic(group.id);
          await removeSeedGroup(group.id);
          return {
            success: false as const,
            error:
              persisted.lastError?.message ??
              "All selected addresses already exist in this wallet",
          };
        }

        await updateSeedGroupCount(
          group.id,
          persisted.accounts.length,
          access.authEpoch,
        ).catch((error) => {
          console.warn(
            "[seedAccountHandlers] Failed to update seed group count:",
            error,
          );
        });
        await refreshSeedSigningCacheBestEffort(access);
        notifyAccountsUpdated();
        return {
          success: true as const,
          account: persisted.accounts[0],
          accounts: persisted.accounts,
          group,
        };
      },
    );
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to create seed phrase",
    };
  }
}

/** Extend one existing seed group with explicit or next-index accounts. */
export async function deriveSeedAccounts(
  request: DeriveSeedAccountRequest,
): Promise<DeriveSeedAccountResult> {
  try {
    const access = await resolveMasterMnemonicAccess();
    if (!access.success) return access;

    return await withStorageLock(
      WALLET_SECRET_OPERATION_LOCK_KEY,
      async () => {
        assertCurrentMasterAuthorization(access.authEpoch);
        const seedGroupId = request.seedGroupId;
        const mnemonic = await getMnemonic(seedGroupId ?? "", {
          password: access.password,
          mnemonicKey: access.mnemonicKey,
          legacyVaultKey: access.vaultKey,
        });
        if (!mnemonic) {
          return {
            success: false as const,
            error: "Seed phrase not found or wrong password",
          };
        }

        const accounts = await getAccounts();
        const groupAccounts = accounts.filter(
          (account): account is SeedPhraseAccount =>
            account.type === "seedPhrase" &&
            account.seedGroupId === seedGroupId,
        );
        const fallbackIndex =
          groupAccounts.length > 0
            ? Math.max(...groupAccounts.map(({ derivationIndex }) => derivationIndex)) + 1
            : 0;
        const indices = Array.isArray(request.indices)
          ? normalizeSeedDerivationIndices(request.indices, [])
          : [fallbackIndex];
        if (indices.length === 0) {
          return {
            success: false as const,
            error: "At least one derivation index is required",
          };
        }

        const candidates: SeedAccountCandidate[] = indices.map((index) => ({
          index,
        }));
        const persisted = await persistSeedAccounts({
          mnemonic,
          seedGroupId: seedGroupId ?? "",
          candidates,
          firstDisplayName: request.displayName,
          access,
          failureMessage: "Failed to derive a seed account",
        });
        if (persisted.accounts.length === 0) {
          return {
            success: false as const,
            error:
              persisted.lastError?.message ??
              "All selected addresses already exist in this wallet",
          };
        }

        await updateSeedGroupCount(
          seedGroupId ?? "",
          groupAccounts.length + persisted.accounts.length,
          access.authEpoch,
        ).catch((error) => {
          console.warn(
            "[seedAccountHandlers] Failed to update seed group count:",
            error,
          );
        });
        await refreshSeedSigningCacheBestEffort(access);
        notifyAccountsUpdated();
        return {
          success: true as const,
          account: persisted.accounts[0],
          accounts: persisted.accounts,
        };
      },
    );
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to derive account",
    };
  }
}
