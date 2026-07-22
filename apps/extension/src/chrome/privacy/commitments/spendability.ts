import {
  derivePrivacyPoolCommitment,
  type PrivacyPoolMasterKeys,
} from "../protocol/primitives";
import { derivePrivacyCurrentCommitmentSecrets } from "../withdrawals/lineage";
import { isPrivacyNullifierSpent } from "../withdrawals/onchain";
import type { PrivacyCommitmentDetailsV1 } from "./types";

export type PrivacyCommitmentSpendabilityFailure = "already-spent" | "unavailable";

export class PrivacyCommitmentSpendabilityError extends Error {
  constructor(readonly code: PrivacyCommitmentSpendabilityFailure) {
    super(code);
    this.name = "PrivacyCommitmentSpendabilityError";
  }
}

/** Fail closed before proving when the locally-current note cannot be verified. */
export async function assertPrivacyCommitmentSpendable(input: {
  commitment: PrivacyCommitmentDetailsV1;
  masterKeys: PrivacyPoolMasterKeys;
}, dependencies: {
  isPrivacyNullifierSpent: typeof isPrivacyNullifierSpent;
} = { isPrivacyNullifierSpent }): Promise<void> {
  const secrets = derivePrivacyCurrentCommitmentSecrets(input);
  const current = derivePrivacyPoolCommitment(
    BigInt(input.commitment.balanceWei),
    BigInt(input.commitment.label),
    secrets,
  );
  if (current.hash !== BigInt(input.commitment.commitment)) {
    throw new PrivacyCommitmentSpendabilityError("unavailable");
  }
  let spent: boolean;
  try {
    spent = await dependencies.isPrivacyNullifierSpent(current.nullifierHash);
  } catch {
    throw new PrivacyCommitmentSpendabilityError("unavailable");
  }
  if (spent) throw new PrivacyCommitmentSpendabilityError("already-spent");
}
