import { getAccounts } from "../accountStorage";
import type { Account } from "../types";
import {
  getSafeAccountRecord,
  importVerifiedSafeAccount,
} from "./accountRepository";
import { withDerivedSafeCapability } from "./capabilities";
import { discoverNewSafeDeployments } from "./discovery";
import { verifySafeOnchainState } from "./onchainState";
import { reconcileSafeProposalNonceQueue } from "./proposalNonceReconciliation";
import type { SafeAccountRecord, SafeChainSnapshot } from "./types";

type RefreshDependencies = {
  discoverNewSafeDeployments: typeof discoverNewSafeDeployments;
  getAccounts: typeof getAccounts;
  getSafeAccountRecord: typeof getSafeAccountRecord;
  importVerifiedSafeAccount: typeof importVerifiedSafeAccount;
  verifySafeOnchainState: typeof verifySafeOnchainState;
  reconcileSafeProposalNonceQueue: typeof reconcileSafeProposalNonceQueue;
};

const production: RefreshDependencies = {
  discoverNewSafeDeployments,
  getAccounts,
  getSafeAccountRecord,
  importVerifiedSafeAccount,
  verifySafeOnchainState,
  reconcileSafeProposalNonceQueue,
};

export interface SafeAccountRefreshResult {
  record: SafeAccountRecord;
  newChainIds: number[];
  discoveryFailureCount: number;
  discoveryError?: string;
}

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
): Promise<SafeAccountRefreshResult> {
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
  const knownChainIds = Object.values(record.chains).map((snapshot) => snapshot.chainId);
  const discoveryPromise = chainId === undefined
    ? dependencies.discoverNewSafeDeployments({
        address: record.address,
        knownChainIds,
      }).then(
        (result) => ({ result }),
        (error) => ({
          error: error instanceof Error ? error.message : "Safe network discovery failed",
        }),
      )
    : Promise.resolve(null);
  const [snapshots, discovery] = await Promise.all([
    Promise.all(targets.map(async (snapshot) =>
      withDerivedSafeCapability(await dependencies.verifySafeOnchainState({
        chainId: snapshot.chainId,
        safeAddress: record.address,
        transactionService: snapshot.transactionService,
      }), accounts),
    )),
    discoveryPromise,
  ]);
  const discoveredSnapshots = discovery && "result" in discovery
    ? discovery.result.snapshots.map((snapshot) =>
        withDerivedSafeCapability(snapshot, accounts))
    : [];
  const allSnapshots = [...snapshots, ...discoveredSnapshots];
  const refreshed = await dependencies.importVerifiedSafeAccount({
    address: record.address,
    importedBy: record.importedBy,
    snapshots: allSnapshots,
  });
  await Promise.all(allSnapshots.map((snapshot) =>
    dependencies.reconcileSafeProposalNonceQueue({
      safeAccountId: record.accountId,
      chainId: snapshot.chainId,
      liveNonce: snapshot.nonce,
      threshold: snapshot.threshold,
    }),
  ));
  return {
    record: refreshed.record,
    newChainIds: discoveredSnapshots.map((snapshot) => snapshot.chainId),
    discoveryFailureCount:
      discovery && "result" in discovery ? discovery.result.failures.length : 0,
    discoveryError:
      discovery && "error" in discovery ? discovery.error : undefined,
  };
}
