import { getAccounts } from "../accountStorage";
import type { Account } from "../types";
import { withStorageLock } from "../storageLock";
import { getSafeAccountRecords, importVerifiedSafeAccount } from "./accountRepository";
import { getLinkedSafeOwners, withDerivedSafeCapability } from "./capabilities";
import {
  reconcilePendingSafeExecutions,
  reconcileSafeExecution,
  SAFE_EXECUTION_RECONCILIATION_ALARM,
  startSafeExecutionReconciliation,
} from "./execution";
import { createSafeProposal, getSafeProposal, getSafeProposals, updateSafeProposal } from "./proposalRepository";
import { fetchSafePendingTransactions } from "./serviceClient";
import { validateServiceTransaction } from "./serviceValidation";
import type { SafeAccountRecord, SafeProposalRecord } from "./types";
import { verifySafeOnchainState } from "./onchainState";
import { claimSafeNotification } from "./notifications";
import { mergeSafeServiceProposal } from "./serviceMerge";
import { hasUnresolvedSafeExecution } from "./executionPolicy";
import { reconcileSafeProposalNonceQueue } from "./proposalNonceReconciliation";

const STORAGE_KEY = "safeSyncState";
const LOCK_KEY = "walletchan:safe-sync";
const MAX_MARKERS = 1_000;
const INTERVAL_MS = 2 * 60_000;
const ALARM_NAME = "walletchan-safe-sync";
const STALE_EFFECT_MS = 5 * 60_000;

interface SyncState {
  version: 1;
  lastSuccessfulSync: Record<string, number>;
  notificationMarkers: Record<string, number>;
}

function decode(value: unknown): SyncState {
  if (value === undefined) return { version: 1, lastSuccessfulSync: {}, notificationMarkers: {} };
  if (!value || typeof value !== "object" || Array.isArray(value) || (value as any).version !== 1) throw new Error("Invalid Safe sync state");
  const parseMap = (raw: unknown) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid Safe sync map");
    const entries = Object.entries(raw);
    if (entries.length > MAX_MARKERS) throw new Error("Safe sync map is too large");
    if (entries.some(([key, item]) => !key || key.length > 512 || !Number.isSafeInteger(item) || (item as number) < 0)) throw new Error("Invalid Safe sync marker");
    return Object.fromEntries(entries) as Record<string, number>;
  };
  return { version: 1, lastSuccessfulSync: parseMap((value as any).lastSuccessfulSync), notificationMarkers: parseMap((value as any).notificationMarkers) };
}

async function updateSyncState(mutator: (state: SyncState) => SyncState) {
  return withStorageLock(LOCK_KEY, async () => {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const next = mutator(decode(stored[STORAGE_KEY]));
    await chrome.storage.local.set({ [STORAGE_KEY]: next });
    return next;
  });
}

async function notifyTransition(proposal: SafeProposalRecord, previousState: SafeProposalRecord["state"] | undefined, hasLocalOwner: boolean) {
  const transition = proposal.state === "readyToExecute" && previousState !== "readyToExecute"
    ? "ready"
    : hasLocalOwner && proposal.state === "awaitingApprovals" && previousState === undefined
      ? "approval"
      : null;
  if (!transition) return;
  const marker = `${proposal.id}:${transition}`;
  if (!(await claimSafeNotification(marker))) return;
  try {
    await chrome.notifications.create(`safe-${transition}-${proposal.safeTxHash}`, {
      type: "basic",
      iconUrl: chrome.runtime.getURL("icons/icon128.png"),
      title: transition === "ready" ? "Safe proposal ready" : "Safe approval needed",
      message: transition === "ready" ? "A Safe proposal has enough approvals to execute." : "A Safe proposal needs one of your linked owners.",
    });
  } catch { /* Notifications are best effort. */ }
}

async function notifyConfigurationChange(accountId: string, chainId: number, configEpoch: string) {
  const marker = `${accountId}:${chainId}:configuration-changed:${configEpoch}`;
  if (!(await claimSafeNotification(marker))) return;
  try {
    await chrome.notifications.create(`safe-config-${accountId}-${chainId}`, {
      type: "basic",
      iconUrl: chrome.runtime.getURL("icons/icon128.png"),
      title: "Safe security changed",
      message: "Owners, threshold, or a Safe security extension changed. Review the Safe before taking action.",
    });
  } catch { /* Notifications are best effort. */ }
}

async function syncSafeRecords(
  safes: SafeAccountRecord[],
  accounts: Account[],
  accountId?: string,
): Promise<void> {
  for (const safe of safes) {
    for (const snapshot of Object.values(safe.chains)) {
      const key = `${snapshot.chainId}:${safe.address}`;
      try {
        const live = withDerivedSafeCapability(await verifySafeOnchainState({
          chainId: snapshot.chainId,
          safeAddress: safe.address,
          transactionService: snapshot.transactionService,
        }), accounts);
        if (live.configEpoch !== snapshot.configEpoch) {
          const affected = (await getSafeProposals()).filter((item) =>
            item.safeAccountId === safe.accountId &&
            item.chainId === snapshot.chainId &&
            !["executed", "cancelled", "replaced", "failed"].includes(item.state),
          );
          await Promise.all(affected.map((item) => updateSafeProposal(item.id, (current) => {
            const executionPending = hasUnresolvedSafeExecution(current);
            return {
              ...current,
              state: executionPending
                ? current.state === "executing" ? "executing" : "ambiguous"
                : "blocked",
              effectClaim: executionPending ? current.effectClaim : undefined,
              error: executionPending
                ? current.error
                : "Safe configuration changed; create and review a new proposal",
              updatedAt: Date.now(),
            };
          })));
          await notifyConfigurationChange(safe.accountId, snapshot.chainId, live.configEpoch);
        }
        await importVerifiedSafeAccount({
          address: safe.address,
          importedBy: safe.importedBy,
          snapshots: [live],
        });
        await reconcileSafeProposalNonceQueue({
          safeAccountId: safe.accountId,
          chainId: live.chainId,
          liveNonce: live.nonce,
          threshold: live.threshold,
        });
        const raw = await fetchSafePendingTransactions(snapshot.chainId, safe.address) as any;
        if (!Array.isArray(raw?.results) || raw.results.length > 100) throw new Error("Invalid Safe proposal page");
        for (const item of raw.results) {
          const remote = await validateServiceTransaction({ value: item, safeAccountId: safe.accountId, snapshot: live, safeAddress: safe.address });
          const previous = await getSafeProposal(remote.id);
          const merged = previous
            ? await updateSafeProposal(remote.id, (current) =>
                mergeSafeServiceProposal(current, remote))
            : await createSafeProposal(remote);
          await notifyTransition(merged, previous?.state, getLinkedSafeOwners(snapshot, accounts).some((owner) => !merged.confirmations.some((confirmation) => confirmation.ownerAddress === owner.ownerAddress)));
        }
        if (live.transactionService !== "supported") {
          await importVerifiedSafeAccount({
            address: safe.address,
            importedBy: safe.importedBy,
            snapshots: [{ ...live, transactionService: "supported" }],
          });
        }
        await updateSyncState((current) => ({ ...current, lastSuccessfulSync: { ...current.lastSuccessfulSync, [key]: Date.now() } }));
      } catch {
        // Service/RPC outages never delete or downgrade locally durable data.
      }
    }
  }
  const allProposals = (await getSafeProposals()).filter(
    (item) => !accountId || item.safeAccountId === accountId,
  );
  const now = Date.now();
  await Promise.all(allProposals
    .filter((item) => item.effectClaim && now - item.effectClaim.claimedAt >= STALE_EFFECT_MS)
    .map((item) => updateSafeProposal(item.id, (current) => {
      if (!current.effectClaim || now - current.effectClaim.claimedAt < STALE_EFFECT_MS) return current;
      if (current.effectClaim.kind === "publish") {
        return { ...current, state: "ambiguous", effectClaim: undefined, error: "Publication was interrupted; reconcile before retrying", updatedAt: now };
      }
      if (
        current.effectClaim.kind === "execute" &&
        (current.serializedExecution || current.transactionHash)
      ) {
        return { ...current, state: "ambiguous", effectClaim: undefined, error: "Execution was interrupted; reconciling exact signed bytes", updatedAt: now };
      }
      return { ...current, state: current.effectClaim.kind === "execute" ? "readyToExecute" : "draft", effectClaim: undefined, error: "Interrupted Safe action can be retried", updatedAt: now };
    }).catch(() => undefined)));
  const executions = (await getSafeProposals()).filter((item) => (item.state === "executing" || item.state === "ambiguous") && !!item.transactionHash);
  executions
    .filter((item) => !accountId || item.safeAccountId === accountId)
    .forEach((item) => startSafeExecutionReconciliation(item.id));
  await Promise.all(executions
    .filter((item) => !accountId || item.safeAccountId === accountId)
    .map((item) => reconcileSafeExecution(item.id).catch(() => undefined)));
}

let syncQueue: Promise<void> = Promise.resolve();
let fullSync: Promise<void> | null = null;
const accountSyncs = new Map<string, Promise<void>>();

function enqueueSafeSync(work: () => Promise<void>): Promise<void> {
  const queued = syncQueue.then(work, work);
  syncQueue = queued.catch(() => undefined);
  return queued;
}

export function syncSafeAccounts(): Promise<void> {
  if (fullSync) return fullSync;
  const work = enqueueSafeSync(async () => {
    const [safes, accounts] = await Promise.all([getSafeAccountRecords(), getAccounts()]);
    await syncSafeRecords(safes, accounts);
  });
  fullSync = work;
  const clearFullSync = () => {
    if (fullSync === work) fullSync = null;
  };
  void work.then(clearFullSync, clearFullSync);
  return work;
}

export function syncSafeAccount(accountId: string): Promise<void> {
  if (!accountId || accountId.length > 128) {
    return Promise.reject(new Error("Invalid Safe account ID"));
  }
  if (fullSync) return fullSync;
  const existing = accountSyncs.get(accountId);
  if (existing) return existing;

  const work = enqueueSafeSync(async () => {
    const [safes, accounts] = await Promise.all([getSafeAccountRecords(), getAccounts()]);
    const safe = safes.find((candidate) => candidate.accountId === accountId);
    if (!safe) throw new Error("Safe account not found");
    await syncSafeRecords([safe], accounts, accountId);
  });
  accountSyncs.set(accountId, work);
  const clearAccountSync = () => {
    if (accountSyncs.get(accountId) === work) accountSyncs.delete(accountId);
  };
  void work.then(clearAccountSync, clearAccountSync);
  return work;
}

export function startSafeSync(): void {
  void reconcilePendingSafeExecutions().catch(() => undefined);
  void syncSafeAccounts().catch(() => undefined);
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: INTERVAL_MS / 60_000 });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_NAME) {
      void syncSafeAccounts().catch(() => undefined);
    } else if (alarm.name === SAFE_EXECUTION_RECONCILIATION_ALARM) {
      void reconcilePendingSafeExecutions().catch(() => undefined);
    }
  });
}
