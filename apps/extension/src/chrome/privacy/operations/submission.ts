import { toHex, type Address } from "viem";

import { getAccountById } from "../../accounts/repository";
import type { PendingTxRequest } from "../../requests/pendingTxStorage";
import {
  getPendingTxRequestById,
  savePendingTxRequest,
} from "../../requests/pendingTxStorage";
import { pinnedTxRequest } from "../../requests/pinnedRequest";
import { getCachedPrivacyKey } from "../../sessionCache";
import {
  WALLET_SECRET_OPERATION_LOCK_KEY,
  withStorageLock,
} from "../../storageLock";
import {
  assertPrivacyMasterAuthorization,
  capturePrivacyMasterAuthorization,
} from "../authorization";
import { PRIVACY_POOLS_DEPLOYMENT, PRIVACY_POOLS_RELEASE_POLICY } from "../deployment/manifest";
import { isPrivacyPoolsMutationAccountType } from "../deployment/accountPolicy";
import { verifyPrivacyPoolsDeployment } from "../deployment/health";
import { decodePrivacyShieldReviewIntent } from "../deposit/intent";
import { readPrivacyVault } from "../repository";
import { verifyPrivacyVaultWithKey } from "../vault";
import { decryptPrivacyShieldOperationDetails } from "./crypto";
import { getPrivacyShieldOperationById } from "./repository";
import {
  defaultPrivacyShieldOperationTracking,
  privacyShieldOperationPublicSummary,
  type PrivacyShieldOperationPublicV1,
  type StoredPrivacyShieldOperationV1,
} from "./types";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PrivacyShieldSubmissionErrorCode =
  | "invalid-request"
  | "auth-required"
  | "operation-unavailable"
  | "bankr-testnet-unsupported";

export class PrivacyShieldSubmissionError extends Error {
  constructor(readonly code: PrivacyShieldSubmissionErrorCode) {
    super(code);
    this.name = "PrivacyShieldSubmissionError";
  }
}

type Dependencies = {
  getOperation: typeof getPrivacyShieldOperationById;
  getAccountById: typeof getAccountById;
  getPending: typeof getPendingTxRequestById;
  savePending: typeof savePendingTxRequest;
  verifyDeployment: typeof verifyPrivacyPoolsDeployment;
  sendRuntimeMessage: (message: unknown) => Promise<unknown>;
};

const productionDependencies: Dependencies = {
  getOperation: getPrivacyShieldOperationById,
  getAccountById,
  getPending: getPendingTxRequestById,
  savePending: savePendingTxRequest,
  verifyDeployment: verifyPrivacyPoolsDeployment,
  sendRuntimeMessage: (message) => chrome.runtime.sendMessage(message),
};

function trackingFor(operation: StoredPrivacyShieldOperationV1) {
  return operation.tracking ?? defaultPrivacyShieldOperationTracking(operation.summary);
}

function isExactPrivacyPending(
  pending: PendingTxRequest,
  operation: StoredPrivacyShieldOperationV1,
  callData: string,
): boolean {
  const summary = operation.summary;
  return (
    pending.id === summary.id &&
    pending.trustedInternal === true &&
    pending.privacyShieldMeta?.version === 1 &&
    pending.privacyShieldMeta.operationId === summary.id &&
    pending.accountId === summary.accountId &&
    pending.accountType === summary.accountType &&
    pending.accountAddress?.toLowerCase() === summary.accountAddress.toLowerCase() &&
    pending.tx.chainId === summary.chainId &&
    pending.tx.from.toLowerCase() === summary.accountAddress.toLowerCase() &&
    pending.tx.to?.toLowerCase() === summary.destinationAddress.toLowerCase() &&
    pending.tx.value === toHex(BigInt(summary.amountWei)) &&
    pending.tx.data?.toLowerCase() === callData.toLowerCase()
  );
}

async function releaseOperationDetails(operation: StoredPrivacyShieldOperationV1) {
  const [vault, privacyKey] = await Promise.all([
    readPrivacyVault(),
    Promise.resolve(getCachedPrivacyKey()),
  ]);
  if (
    vault.status !== "valid" ||
    !privacyKey ||
    privacyKey.keyId !== vault.record.keyId ||
    operation.keyId !== vault.record.keyId ||
    !(await verifyPrivacyVaultWithKey(vault.record, privacyKey.key))
  ) {
    throw new PrivacyShieldSubmissionError("operation-unavailable");
  }
  const details = await decryptPrivacyShieldOperationDetails(
    privacyKey.key,
    operation.keyId,
    operation.summary,
    operation.encryptedDetails,
  );
  if (!details) {
    throw new PrivacyShieldSubmissionError("operation-unavailable");
  }
  const decoded = decodePrivacyShieldReviewIntent({
    kind: "privacy-shield-review-intent",
    version: 1,
    submittable: false,
    chainId: operation.summary.chainId,
    sourceAddress: operation.summary.accountAddress,
    destinationAddress: operation.summary.destinationAddress,
    valueWei: BigInt(operation.summary.amountWei),
    protocolFeeWei: BigInt(operation.summary.protocolFeeWei),
    shieldedAmountWei: BigInt(operation.summary.shieldedAmountWei),
    callData: details.callData,
  });
  if (decoded.precommitment.toString() !== details.precommitment) {
    throw new PrivacyShieldSubmissionError("operation-unavailable");
  }
  return details;
}

async function loadSubmittableOperation(
  operationId: string,
  dependencies: Dependencies,
): Promise<{
  operation: StoredPrivacyShieldOperationV1;
  details: Awaited<ReturnType<typeof releaseOperationDetails>>;
}> {
  if (!UUID.test(operationId)) {
    throw new PrivacyShieldSubmissionError("invalid-request");
  }
  if (PRIVACY_POOLS_RELEASE_POLICY.mutations !== "enabled") {
    throw new PrivacyShieldSubmissionError("operation-unavailable");
  }
  const operation = await dependencies.getOperation(operationId);
  if (!operation || trackingFor(operation).state !== "awaiting_wallet_confirmation") {
    throw new PrivacyShieldSubmissionError("operation-unavailable");
  }
  if (
    !isPrivacyPoolsMutationAccountType(operation.summary.accountType)
  ) {
    throw new PrivacyShieldSubmissionError("bankr-testnet-unsupported");
  }
  const details = await releaseOperationDetails(operation);
  return { operation, details };
}

/**
 * Turn one encrypted, durable operation into the normal WalletChan
 * confirmation request. Nothing is signed or broadcast here.
 */
export async function queuePrivacyShieldConfirmation(
  operationId: string,
  overrides: Partial<Dependencies> = {},
): Promise<PrivacyShieldOperationPublicV1> {
  const dependencies = { ...productionDependencies, ...overrides };
  const expectedAuthEpoch = await capturePrivacyMasterAuthorization().catch(() => {
    throw new PrivacyShieldSubmissionError("auth-required");
  });
  const pendingBeforeLock = await dependencies.getPending(operationId);

  return withStorageLock(WALLET_SECRET_OPERATION_LOCK_KEY, async () => {
    try {
      assertPrivacyMasterAuthorization(expectedAuthEpoch);
    } catch {
      throw new PrivacyShieldSubmissionError("auth-required");
    }
    const { operation, details } = await loadSubmittableOperation(
      operationId,
      dependencies,
    );
    const account = await dependencies.getAccountById(operation.summary.accountId);
    if (
      !account ||
      account.type === "impersonator" ||
      account.type !== operation.summary.accountType ||
      account.address.toLowerCase() !== operation.summary.accountAddress.toLowerCase()
    ) {
      throw new PrivacyShieldSubmissionError("operation-unavailable");
    }
    const existing = await dependencies.getPending(operationId);
    if (existing) {
      if (!isExactPrivacyPending(existing, operation, details.callData)) {
        throw new PrivacyShieldSubmissionError("operation-unavailable");
      }
      void dependencies
        .sendRuntimeMessage({ type: "newPendingTxRequest", txRequest: existing })
        .catch(() => undefined);
      return privacyShieldOperationPublicSummary(operation);
    }
    if (pendingBeforeLock) {
      throw new PrivacyShieldSubmissionError("operation-unavailable");
    }
    const pending = pinnedTxRequest(account, {
      id: operationId,
      tx: {
        from: operation.summary.accountAddress,
        to: operation.summary.destinationAddress,
        data: details.callData,
        value: toHex(BigInt(operation.summary.amountWei)),
        chainId: PRIVACY_POOLS_DEPLOYMENT.chainId,
      },
      origin: "WalletChan Shield",
      favicon: null,
      chainName: PRIVACY_POOLS_DEPLOYMENT.chainName,
      timestamp: Date.now(),
      trustedInternal: true,
      privacyShieldMeta: { version: 1, operationId },
    });
    try {
      assertPrivacyMasterAuthorization(expectedAuthEpoch);
      await dependencies.savePending(pending, expectedAuthEpoch);
    } catch (error) {
      const raced = await dependencies.getPending(operationId);
      if (!raced || !isExactPrivacyPending(raced, operation, details.callData)) {
        if (error instanceof PrivacyShieldSubmissionError) throw error;
        throw new PrivacyShieldSubmissionError("operation-unavailable");
      }
    }
    void dependencies
      .sendRuntimeMessage({ type: "newPendingTxRequest", txRequest: pending })
      .catch(() => undefined);
    return privacyShieldOperationPublicSummary(operation);
  });
}

export interface PrivacyShieldConfirmationAuthorization {
  operationId: string;
  expectedAuthEpoch: string;
}

/** Revalidate the encrypted intent when the user presses the wallet Confirm button. */
export async function authorizePrivacyShieldConfirmation(
  pending: PendingTxRequest,
  overrides: Partial<Dependencies> = {},
): Promise<PrivacyShieldConfirmationAuthorization | null> {
  if (!pending.privacyShieldMeta) return null;
  const dependencies = { ...productionDependencies, ...overrides };
  if (
    pending.privacyShieldMeta.version !== 1 ||
    pending.privacyShieldMeta.operationId !== pending.id
  ) {
    throw new PrivacyShieldSubmissionError("operation-unavailable");
  }
  const expectedAuthEpoch = await capturePrivacyMasterAuthorization().catch(() => {
    throw new PrivacyShieldSubmissionError("auth-required");
  });
  await dependencies.verifyDeployment().catch(() => {
    throw new PrivacyShieldSubmissionError("operation-unavailable");
  });
  const { operation, details } = await loadSubmittableOperation(
    pending.id,
    dependencies,
  );
  if (!isExactPrivacyPending(pending, operation, details.callData)) {
    throw new PrivacyShieldSubmissionError("operation-unavailable");
  }
  assertPrivacyMasterAuthorization(expectedAuthEpoch);
  return { operationId: pending.id, expectedAuthEpoch };
}

export function assertPrivacyShieldConfirmationAuthorization(
  authorization: PrivacyShieldConfirmationAuthorization | null,
): void {
  if (!authorization) return;
  if (PRIVACY_POOLS_RELEASE_POLICY.mutations !== "enabled") {
    throw new PrivacyShieldSubmissionError("operation-unavailable");
  }
  assertPrivacyMasterAuthorization(authorization.expectedAuthEpoch);
}

export function isPrivacyShieldPendingTransaction(
  pending: PendingTxRequest,
): boolean {
  return pending.privacyShieldMeta?.version === 1 &&
    pending.privacyShieldMeta.operationId === pending.id;
}

export const privacyShieldSubmissionDestination =
  PRIVACY_POOLS_DEPLOYMENT.contracts.entrypointProxy.address as Address;
