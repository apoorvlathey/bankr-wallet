import {
  addSeedPhraseAccount,
  convertToSeedPhraseAccount,
  findNonImpersonatorAccountByAddress,
} from "../accountStorage";
import { deriveAddress } from "../localSigner";
import type { MasterMnemonicAccess } from "./masterAccess";
import {
  hasCurrentMasterAuthorization,
} from "../masterAuthorization";
import { derivePrivateKey as deriveSeedPrivateKey } from "./derivation";
import {
  getCachedVaultKey,
  setCachedVault,
} from "../sessionCache";
import type { SeedPhraseAccount } from "../types";
import {
  addKeyToVault,
  decryptAllKeys,
  removeKeyFromVault,
} from "../vaultCrypto";
import { decryptAllKeysWithVaultKey } from "../authHandlers";

export interface SeedAccountCandidate {
  index: number;
}

export interface PersistSeedAccountsOptions {
  mnemonic: string;
  seedGroupId: string;
  candidates: readonly SeedAccountCandidate[];
  firstDisplayName?: string;
  access: MasterMnemonicAccess;
  failureMessage: string;
}

export interface PersistSeedAccountsResult {
  accounts: SeedPhraseAccount[];
  lastError: Error | null;
}

/** Normalize the renderer's optional multi-index selection. */
export function normalizeSeedDerivationIndices(
  value: unknown,
  fallback: readonly number[],
): number[] {
  const raw = Array.isArray(value) ? value : fallback;
  return Array.from(
    new Set(
      raw
        .map((item) => Math.floor(Number(item)))
        .filter((item) => Number.isFinite(item) && item >= 0),
    ),
  ).sort((left, right) => left - right);
}

/**
 * Preflight a new group before writing its recovery phrase. Existing
 * seed/Bankr signers are duplicates, while a private-key account can be
 * converted in place and a view-only account may coexist with the signer.
 */
export async function findImportableSeedCandidates(
  mnemonic: string,
  indices: readonly number[],
): Promise<SeedAccountCandidate[]> {
  const candidates: SeedAccountCandidate[] = [];
  for (const index of indices) {
    const privateKey = deriveSeedPrivateKey(mnemonic, index);
    const address = deriveAddress(privateKey);
    const existing = await findNonImpersonatorAccountByAddress(address);
    if (!existing || existing.type === "privateKey") {
      candidates.push({ index });
    }
  }
  return candidates;
}

/**
 * Persist derived signers while the caller owns the wallet-secret operation
 * lock. Storage primitives acquire the separate storage lock themselves.
 * A metadata failure compensates a newly written key; pre-existing PK entries
 * are converted in place and are never removed by this helper.
 */
export async function persistSeedAccounts(
  options: PersistSeedAccountsOptions,
): Promise<PersistSeedAccountsResult> {
  const accounts: SeedPhraseAccount[] = [];
  let lastError: Error | null = null;

  for (const candidate of options.candidates) {
    try {
      const privateKey = deriveSeedPrivateKey(
        options.mnemonic,
        candidate.index,
      );
      const address = deriveAddress(privateKey);
      const existing = await findNonImpersonatorAccountByAddress(address);
      let account: SeedPhraseAccount;

      if (existing) {
        if (existing.type !== "privateKey") continue;
        const converted = await convertToSeedPhraseAccount(
          existing.id,
          options.seedGroupId,
          candidate.index,
          options.access.authEpoch,
        );
        if (!converted) throw new Error("Failed to convert account");
        account = converted;
      } else {
        const accountId = crypto.randomUUID();
        await addKeyToVault(
          accountId,
          privateKey,
          options.access.password ?? undefined,
          options.access.authEpoch,
        );
        try {
          account = await addSeedPhraseAccount(
            address,
            options.seedGroupId,
            candidate.index,
            accounts.length === 0
              ? options.firstDisplayName || undefined
              : undefined,
            accountId,
            options.access.authEpoch,
          );
        } catch (error) {
          await removeKeyFromVault(accountId).catch(() => undefined);
          throw error;
        }
      }
      accounts.push(account);
    } catch (error) {
      lastError =
        error instanceof Error ? error : new Error(options.failureMessage);
    }
  }

  return { accounts, lastError };
}

/** Refresh only the in-memory signing cache after durable account commit. */
export async function refreshSeedSigningCacheBestEffort(
  access: MasterMnemonicAccess,
): Promise<void> {
  if (!hasCurrentMasterAuthorization(access.authEpoch)) return;
  const cachedVaultKey = getCachedVaultKey();
  const vault = cachedVaultKey
    ? await decryptAllKeysWithVaultKey(cachedVaultKey, access.password)
    : access.password
      ? await decryptAllKeys(access.password)
      : null;
  if (vault && hasCurrentMasterAuthorization(access.authEpoch)) {
    setCachedVault(vault);
  }
}
