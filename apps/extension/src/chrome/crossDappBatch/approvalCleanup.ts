import { supportsAtomicEoaApprovalCleanup } from "../approvalCleanup/accountPolicy";
import {
  eligibilityErrorForCrossDappBatch,
  resolvePinnedCrossDappAccount,
} from "./accountPolicy";
import {
  buildWalletGeneratedApprovalCleanupEntry,
  resolveApprovalCleanupAdditions,
} from "./approvalCleanupEntries";
import {
  getCrossDappBatch,
  setCrossDappBatch,
} from "./storage";

interface ApprovalCleanupDependencies {
  resolvePinnedAccount: typeof resolvePinnedCrossDappAccount;
  eligibilityError: typeof eligibilityErrorForCrossDappBatch;
}

const production: ApprovalCleanupDependencies = {
  resolvePinnedAccount: resolvePinnedCrossDappAccount,
  eligibilityError: eligibilityErrorForCrossDappBatch,
};

export async function handleAppendApprovalRevokeToCrossDappBatch(
  tokenAddress: unknown,
  spender: unknown,
  sourceCallIndex: unknown,
  overrides: Partial<ApprovalCleanupDependencies> = {},
): Promise<{
  success: boolean;
  error?: string;
  alreadyPresent?: boolean;
}> {
  return handleAppendApprovalRevokesToCrossDappBatch(
    [{ tokenAddress, spender, sourceCallIndex }],
    overrides,
  );
}

export async function handleAppendApprovalRevokesToCrossDappBatch(
  rawTargets: unknown,
  overrides: Partial<ApprovalCleanupDependencies> = {},
): Promise<{
  success: boolean;
  error?: string;
  alreadyPresent?: boolean;
}> {
  const dependencies = { ...production, ...overrides };
  const batch = await getCrossDappBatch();
  if (!batch) return { success: false, error: "No active batch" };
  if (!supportsAtomicEoaApprovalCleanup(batch.accountType)) {
    return {
      success: false,
      error: "This account cannot add an atomic approval cleanup",
    };
  }
  const pinned = await dependencies.resolvePinnedAccount(
    {
      accountId: batch.accountId,
      accountAddress: batch.fromAddress,
      accountType: batch.accountType,
    },
    batch.fromAddress,
  );
  if (!pinned.ok) return { success: false, error: pinned.error };
  const eligibilityError = await dependencies.eligibilityError(
    pinned.account,
    batch.chainId,
    batch.chainName,
  );
  if (eligibilityError) return { success: false, error: eligibilityError };

  const resolved = resolveApprovalCleanupAdditions(batch, rawTargets);
  if (!resolved.ok) {
    return { success: false, error: resolved.error };
  }
  if (resolved.additions.length === 0) {
    return { success: true, alreadyPresent: true };
  }
  const entries = resolved.additions.map(({ revoke, sourceCallIndex }) =>
    buildWalletGeneratedApprovalCleanupEntry(
      batch,
      batch.entries[sourceCallIndex],
      revoke,
    )
  );
  await setCrossDappBatch({
    ...batch,
    entries: [...batch.entries, ...entries],
  });
  chrome.runtime
    .sendMessage({ type: "crossDappBatchUpdated" })
    .catch(() => {});
  return { success: true };
}
