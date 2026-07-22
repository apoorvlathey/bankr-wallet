import { getCachedPrivacyKey } from "../../sessionCache";
import { readPrivacyVault } from "../repository";
import { verifyPrivacyVaultWithKey } from "../vault";
import { decryptPrivacyShieldOperationDetails } from "../operations/crypto";
import {
  listAllPrivacyShieldOperations,
  isTerminalPrivacyShieldState,
} from "../operations/repository";
import { applyPrivacyShieldDepositEvent } from "../operations/lifecycle";
import { findPrivacyDepositEventByPrecommitment } from "./repository";

/** Match public deposits only inside the background while the privacy key is live. */
export async function matchPrivacyShieldOperationsFromEvents(): Promise<number> {
  const [vault, privacyKey, operations] = await Promise.all([
    readPrivacyVault(),
    Promise.resolve(getCachedPrivacyKey()),
    listAllPrivacyShieldOperations(),
  ]);
  if (
    vault.status !== "valid" ||
    !privacyKey ||
    privacyKey.keyId !== vault.record.keyId ||
    !(await verifyPrivacyVaultWithKey(vault.record, privacyKey.key))
  ) {
    return 0;
  }

  let matched = 0;
  for (const operation of operations) {
    const state = operation.tracking?.state ?? "awaiting_wallet_confirmation";
    if (isTerminalPrivacyShieldState(state)) continue;
    const details = await decryptPrivacyShieldOperationDetails(
      privacyKey.key,
      operation.keyId,
      operation.summary,
      operation.encryptedDetails,
    );
    if (!details) continue;
    const event = await findPrivacyDepositEventByPrecommitment(details.precommitment);
    if (!event) continue;
    await applyPrivacyShieldDepositEvent(operation.summary.id, event);
    matched += 1;
  }
  return matched;
}
