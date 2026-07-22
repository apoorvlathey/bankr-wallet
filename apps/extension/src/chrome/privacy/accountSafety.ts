import { readPrivacyAspMasterMaterial } from "./asp/eligibility";
import { readPrivacyCommitments } from "./commitments/repository";
import {
  canonicalPrivacyCommitments,
} from "./commitments/lineageIntegrity";
import { listAllPrivacyShieldOperations } from "./operations/repository";
import type { PrivacyShieldTrackingState } from "./operations/types";
import { listAllPrivacyRagequits } from "./ragequit/repository";
import type { PrivacyRagequitState } from "./ragequit/types";
import { readPrivacyVault } from "./repository";

const SHIELD_OPERATION_REMOVAL_RISKS = new Set<PrivacyShieldTrackingState>([
  "awaiting_wallet_confirmation",
  "submission_unknown",
  "submitted",
  "public_confirmed",
  "awaiting_event",
  "awaiting_asp",
  "asp_unavailable",
  "asp_poi_required",
  "failed_recoverable",
  "failed_needs_support",
]);

const RAGEQUIT_REMOVAL_RISKS = new Set<PrivacyRagequitState>([
  "awaiting_wallet_confirmation",
  "submission_unknown",
  "submitted",
  "public_confirmed",
  "failed_recoverable",
  "failed_needs_support",
]);

export class PrivacyAccountRemovalError extends Error {
  constructor() {
    super(
      "Unshield or recover this account's Shield balance before removing the account",
    );
    this.name = "PrivacyAccountRemovalError";
  }
}

type Dependencies = {
  readPrivacyVault: typeof readPrivacyVault;
  listAllPrivacyShieldOperations: typeof listAllPrivacyShieldOperations;
  listAllPrivacyRagequits: typeof listAllPrivacyRagequits;
  readPrivacyAspMasterMaterial: typeof readPrivacyAspMasterMaterial;
  readPrivacyCommitments: typeof readPrivacyCommitments;
};

const productionDependencies: Dependencies = {
  readPrivacyVault,
  listAllPrivacyShieldOperations,
  listAllPrivacyRagequits,
  readPrivacyAspMasterMaterial,
  readPrivacyCommitments,
};

/** Fail closed when deleting an account could orphan or race Shield funds. */
export async function assertPrivacyAccountRemovalSafe(input: {
  accountId: string;
  accountAddress: string;
}, overrides: Partial<Dependencies> = {}): Promise<void> {
  const dependencies = { ...productionDependencies, ...overrides };
  const address = input.accountAddress.toLowerCase();
  const [vault, operations, ragequits] = await Promise.all([
    dependencies.readPrivacyVault(),
    dependencies.listAllPrivacyShieldOperations(),
    dependencies.listAllPrivacyRagequits(),
  ]);
  const riskyOperation = operations.some((operation) =>
    operation.summary.accountId === input.accountId &&
    (!operation.tracking || SHIELD_OPERATION_REMOVAL_RISKS.has(operation.tracking.state))
  );
  const riskyRecovery = ragequits.some((operation) =>
    (operation.summary.accountId === input.accountId ||
      operation.summary.accountAddress.toLowerCase() === address) &&
    RAGEQUIT_REMOVAL_RISKS.has(operation.tracking.state)
  );

  if (vault.status === "missing") {
    if (riskyOperation || riskyRecovery) throw new PrivacyAccountRemovalError();
    return;
  }
  if (vault.status !== "valid") throw new PrivacyAccountRemovalError();
  if (vault.record.recovery === null) {
    if (riskyOperation || riskyRecovery) throw new PrivacyAccountRemovalError();
    return;
  }

  const material = await dependencies.readPrivacyAspMasterMaterial();
  if (!material || material.keyId !== vault.record.keyId) {
    // A valid Shield identity may own encrypted commitments. Removal is safe
    // only after the live privacy capability proves that it does not.
    throw new PrivacyAccountRemovalError();
  }
  const commitments = canonicalPrivacyCommitments(await dependencies.readPrivacyCommitments(
    material.key,
    material.keyId,
  ));
  const hasBalance = commitments.some(({ details }) =>
    details.depositor.toLowerCase() === address &&
    details.status !== "spent" &&
    details.status !== "ragequit_recovered"
  );
  if (riskyOperation || riskyRecovery || hasBalance) {
    throw new PrivacyAccountRemovalError();
  }
}
