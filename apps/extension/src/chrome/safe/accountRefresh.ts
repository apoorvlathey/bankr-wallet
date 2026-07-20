import { getAccounts } from "../accountStorage";
import type { Account } from "../types";
import {
  getSafeAccountRecord,
  importVerifiedSafeAccount,
} from "./accountRepository";
import { withDerivedSafeCapability } from "./capabilities";
import { verifySafeOnchainState } from "./onchainState";
import { reconcileSafeProposalNonceQueue } from "./proposalNonceReconciliation";
import type { SafeAccountRecord, SafeChainSnapshot } from "./types";

type RefreshDependencies = {
  getAccounts: typeof getAccounts;
  getSafeAccountRecord: typeof getSafeAccountRecord;
  importVerifiedSafeAccount: typeof importVerifiedSafeAccount;
  verifySafeOnchainState: typeof verifySafeOnchainState;
  reconcileSafeProposalNonceQueue: typeof reconcileSafeProposalNonceQueue;
};

const production: RefreshDependencies = {
  getAccounts,
  getSafeAccountRecord,
  importVerifiedSafeAccount,
  verifySafeOnchainState,
  reconcileSafeProposalNonceQueue,
};

function parseAccountId(value: unknown): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 512) {
    throw new Error("Invalid Safe account ID");
  }
  return value;
}

function parseOptionalChainId(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new Error("Invalid Safe chain ID");
  }
  return value as number;
}

/**
 * Re-verifies an already imported Safe directly against its configured RPC.
 * Discovery/Transaction Service availability must not decide whether a known
 * onchain Safe still exists.
 */
export async function refreshSafeAccountState(
  input: { accountId: unknown; chainId?: unknown },
  overrides: Partial<RefreshDependencies> = {},
): Promise<SafeAccountRecord> {
  const dependencies = { ...production, ...overrides };
  const accountId = parseAccountId(input.accountId);
  const chainId = parseOptionalChainId(input.chainId);
  const record = await dependencies.getSafeAccountRecord(accountId);
  if (!record) throw new Error("Safe account not found");

  const targets: SafeChainSnapshot[] = chainId === undefined
    ? Object.values(record.chains)
    : record.chains[String(chainId)]
      ? [record.chains[String(chainId)]]
      : [];
  if (targets.length === 0) {
    throw new Error(`Safe is not imported on chain ${chainId}`);
  }

  const accounts: Account[] = await dependencies.getAccounts();
  const snapshots = await Promise.all(targets.map(async (snapshot) =>
    withDerivedSafeCapability(await dependencies.verifySafeOnchainState({
      chainId: snapshot.chainId,
      safeAddress: record.address,
      transactionService: snapshot.transactionService,
    }), accounts),
  ));
  const refreshed = await dependencies.importVerifiedSafeAccount({
    address: record.address,
    importedBy: record.importedBy,
    snapshots,
  });
  await Promise.all(snapshots.map((snapshot) =>
    dependencies.reconcileSafeProposalNonceQueue({
      safeAccountId: record.accountId,
      chainId: snapshot.chainId,
      liveNonce: snapshot.nonce,
      threshold: snapshot.threshold,
    }),
  ));
  return refreshed.record;
}
