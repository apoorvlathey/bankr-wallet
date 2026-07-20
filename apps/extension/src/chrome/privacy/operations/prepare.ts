import { getAccountById } from "../../accounts/repository";
import { getAuthCeremonyEpoch } from "../../authTransition";
import { handleUnlockWallet } from "../../authHandlers";
import { assertCurrentMasterAuthorization } from "../../masterAuthorization";
import {
  getCachedPrivacyKey,
  getPasswordType,
  isWalletUnlocked,
  tryRestoreSession,
} from "../../sessionCache";
import {
  WALLET_SECRET_OPERATION_LOCK_KEY,
  withStorageLock,
} from "../../storageLock";
import { decryptPrivacyRecovery } from "../crypto";
import {
  PRIVACY_POOLS_RELEASE_POLICY,
  PRIVACY_POOLS_DEPLOYMENT,
} from "../deployment/manifest";
import { isPrivacyPoolsMutationAccountType } from "../deployment/accountPolicy";
import { verifyPrivacyPoolsDeployment } from "../deployment/health";
import {
  assertPinnedSourceAccount,
  quotePrivacyShield,
  type PrivacyShieldQuoteRequest,
} from "../deposit/quote";
import {
  grossPrivacyShieldAmount,
  parsePrivacyShieldAmount,
  parsePrivacyShieldGrossAmount,
  type PrivacyShieldQuoteValues,
} from "../deposit/quotePolicy";
import {
  derivePrivacyPoolDepositPrecommitment,
  derivePrivacyPoolDepositSecrets,
  derivePrivacyPoolMasterKeys,
} from "../protocol/primitives";
import { readPrivacyVault } from "../repository";
import { verifyPrivacyVaultWithKey } from "../vault";
import { encryptPrivacyShieldOperationDetails } from "./crypto";
import {
  createPrivacyShieldOperationIntent,
  decodePrivacyShieldOperationIntent,
} from "./intent";
import {
  commitPrivacyShieldOperation,
  findPrivacyShieldOperation,
  readNextPrivacyDepositIndex,
  type PrivacyOperationCommitResult,
} from "./repository";
import {
  defaultPrivacyShieldOperationTracking,
  isValidStoredPrivacyShieldOperation,
  privacyShieldOperationPublicSummary,
  privacyShieldOperationDedupeKey,
  type PrivacyShieldOperationDetailsV1,
  type PrivacyShieldOperationSummaryV1,
  type PrivacyShieldOperationPublicV1,
  type StoredPrivacyShieldOperationV1,
} from "./types";

const MAX_INDEX_RESERVATION_ATTEMPTS = 3;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PrivacyShieldOperationErrorCode =
  | "invalid-request"
  | "auth-required"
  | "recovery-unavailable"
  | "insufficient-funds"
  | "bankr-testnet-unsupported"
  | "operation-unavailable";

export class PrivacyShieldOperationError extends Error {
  constructor(readonly code: PrivacyShieldOperationErrorCode) {
    super(code);
    this.name = "PrivacyShieldOperationError";
  }
}

export interface PrivacyShieldOperationRequest
  extends PrivacyShieldQuoteRequest {
  requestId: string;
}

type Dependencies = {
  getAccountById: typeof getAccountById;
  quotePrivacyShield: typeof quotePrivacyShield;
  verifyDeployment: typeof verifyPrivacyPoolsDeployment;
  findOperation: typeof findPrivacyShieldOperation;
  readNextDepositIndex: typeof readNextPrivacyDepositIndex;
  commitOperation: typeof commitPrivacyShieldOperation;
  createOperationId: () => string;
  now: () => number;
};

const productionDependencies: Dependencies = {
  getAccountById,
  quotePrivacyShield,
  verifyDeployment: verifyPrivacyPoolsDeployment,
  findOperation: findPrivacyShieldOperation,
  readNextDepositIndex: readNextPrivacyDepositIndex,
  commitOperation: commitPrivacyShieldOperation,
  createOperationId: () => crypto.randomUUID(),
  now: Date.now,
};

async function requireLiveMasterSession(): Promise<string> {
  if (!isWalletUnlocked()) {
    await tryRestoreSession(handleUnlockWallet).catch(() => false);
  }
  if (!isWalletUnlocked() || getPasswordType() !== "master") {
    throw new PrivacyShieldOperationError("auth-required");
  }
  return getAuthCeremonyEpoch();
}

function assertOperationMatchesRequest(
  operation: StoredPrivacyShieldOperationV1,
  request: PrivacyShieldOperationRequest,
  quote: PrivacyShieldQuoteValues,
): void {
  const summary = operation.summary;
  if (
    summary.requestId !== request.requestId &&
    summary.dedupeKey !==
      privacyShieldOperationDedupeKey({
        chainId: quote.chainId,
        accountId: request.accountId,
        amountWei: quote.amountWei,
      })
  ) {
    throw new PrivacyShieldOperationError("operation-unavailable");
  }
  if (
    summary.accountId !== request.accountId ||
    summary.accountType !== request.accountType ||
    summary.accountAddress.toLowerCase() !== request.accountAddress.toLowerCase() ||
    summary.amountWei !== quote.amountWei ||
    summary.protocolFeeWei !== quote.protocolFeeWei ||
    summary.shieldedAmountWei !== quote.shieldedAmountWei
  ) {
    throw new PrivacyShieldOperationError("operation-unavailable");
  }
}

function publicSummary(
  operation: StoredPrivacyShieldOperationV1,
): PrivacyShieldOperationPublicV1 {
  if (!isValidStoredPrivacyShieldOperation(operation)) {
    throw new PrivacyShieldOperationError("operation-unavailable");
  }
  return privacyShieldOperationPublicSummary(operation);
}

function resumeExistingOperation(
  operation: StoredPrivacyShieldOperationV1,
  request: PrivacyShieldOperationRequest,
  amountWei: string,
  dedupeKey: string,
): PrivacyShieldOperationPublicV1 {
  const released = publicSummary(operation);
  const summary = operation.summary;
  if (
    (summary.requestId !== request.requestId && summary.dedupeKey !== dedupeKey) ||
    summary.accountId !== request.accountId ||
    summary.accountType !== request.accountType ||
    summary.accountAddress.toLowerCase() !== request.accountAddress.toLowerCase() ||
    summary.amountWei !== amountWei
  ) {
    throw new PrivacyShieldOperationError("operation-unavailable");
  }
  return released;
}

/** Reserve, encrypt, and atomically persist a real deposit operation. */
export async function preparePrivacyShieldOperation(
  request: PrivacyShieldOperationRequest,
  overrides: Partial<Dependencies> = {},
): Promise<PrivacyShieldOperationPublicV1> {
  if (!UUID.test(request.requestId)) {
    throw new PrivacyShieldOperationError("invalid-request");
  }
  if (
    PRIVACY_POOLS_RELEASE_POLICY.operationPreparation !== "enabled" ||
    PRIVACY_POOLS_RELEASE_POLICY.mutations !== "enabled"
  ) {
    throw new PrivacyShieldOperationError("operation-unavailable");
  }
  if (
    !isPrivacyPoolsMutationAccountType(request.accountType)
  ) {
    throw new PrivacyShieldOperationError("bankr-testnet-unsupported");
  }
  const dependencies = { ...productionDependencies, ...overrides };
  const expectedAuthEpoch = await requireLiveMasterSession();
  const requestedShieldedAmountWei = parsePrivacyShieldAmount(request.amount);
  const amountWei = (
    request.grossAmountWei === undefined
      ? grossPrivacyShieldAmount(requestedShieldedAmountWei)
      : parsePrivacyShieldGrossAmount(
          request.grossAmountWei,
          requestedShieldedAmountWei,
        )
  ).toString();
  const dedupeKey = privacyShieldOperationDedupeKey({
    chainId: PRIVACY_POOLS_DEPLOYMENT.chainId,
    accountId: request.accountId,
    amountWei,
  });
  const resumable = await dependencies.findOperation({
    requestId: request.requestId,
    dedupeKey,
  });
  if (resumable) {
    return withStorageLock(WALLET_SECRET_OPERATION_LOCK_KEY, async () => {
      try {
        assertCurrentMasterAuthorization(expectedAuthEpoch);
      } catch {
        throw new PrivacyShieldOperationError("auth-required");
      }
      const account = await dependencies.getAccountById(request.accountId);
      assertPinnedSourceAccount(request, account);
      return resumeExistingOperation(resumable, request, amountWei, dedupeKey);
    });
  }
  await dependencies.verifyDeployment().catch(() => {
    throw new PrivacyShieldOperationError("operation-unavailable");
  });
  const quote = await dependencies.quotePrivacyShield(request);
  if (
    quote.amountWei !== amountWei ||
    quote.shieldedAmountWei !== requestedShieldedAmountWei.toString()
  ) {
    throw new PrivacyShieldOperationError("operation-unavailable");
  }
  if (!quote.canAfford) {
    throw new PrivacyShieldOperationError("insufficient-funds");
  }

  return withStorageLock(WALLET_SECRET_OPERATION_LOCK_KEY, async () => {
    try {
      assertCurrentMasterAuthorization(expectedAuthEpoch);
    } catch {
      throw new PrivacyShieldOperationError("auth-required");
    }
    const account = await dependencies.getAccountById(request.accountId);
    const sourceAddress = assertPinnedSourceAccount(request, account);
    const stored = await readPrivacyVault();
    const privacyKey = getCachedPrivacyKey();
    if (
      stored.status !== "valid" ||
      stored.record.recovery === null ||
      !privacyKey ||
      privacyKey.keyId !== stored.record.keyId
    ) {
      throw new PrivacyShieldOperationError("recovery-unavailable");
    }
    if (!(await verifyPrivacyVaultWithKey(stored.record, privacyKey.key))) {
      throw new PrivacyShieldOperationError("recovery-unavailable");
    }
    const phrase = await decryptPrivacyRecovery(
      privacyKey.key,
      stored.record.keyId,
      stored.record.recovery,
    );
    if (!phrase) {
      throw new PrivacyShieldOperationError("recovery-unavailable");
    }

    const existing = await dependencies.findOperation({
      requestId: request.requestId,
      dedupeKey,
    });
    if (existing) {
      assertOperationMatchesRequest(existing, request, quote);
      return publicSummary(existing);
    }

    for (let attempt = 0; attempt < MAX_INDEX_RESERVATION_ATTEMPTS; attempt += 1) {
      const depositIndex = await dependencies.readNextDepositIndex();
      const operationId = dependencies.createOperationId();
      const createdAt = dependencies.now();
      try {
        const masterKeys = derivePrivacyPoolMasterKeys(phrase);
        const secrets = derivePrivacyPoolDepositSecrets(
          masterKeys,
          PRIVACY_POOLS_DEPLOYMENT.scope,
          BigInt(depositIndex),
        );
        const precommitment = derivePrivacyPoolDepositPrecommitment(secrets);
        const intent = createPrivacyShieldOperationIntent({
          operationId,
          depositIndex,
          sourceAddress,
          valueWei: BigInt(quote.amountWei),
          precommitment,
        });
        const decoded = decodePrivacyShieldOperationIntent(intent);
        if (
          decoded.valueWei.toString() !== quote.amountWei ||
          decoded.protocolFeeWei.toString() !== quote.protocolFeeWei ||
          decoded.shieldedAmountWei.toString() !== quote.shieldedAmountWei
        ) {
          throw new Error("Quote mismatch");
        }
        const summary: PrivacyShieldOperationSummaryV1 = {
          schema: "walletchan-privacy-shield-operation-v1",
          id: operationId,
          requestId: request.requestId,
          revision: 0,
          state: "awaiting_wallet_confirmation",
          createdAt,
          updatedAt: createdAt,
          chainId: intent.chainId,
          accountId: request.accountId,
          accountAddress: sourceAddress,
          accountType: request.accountType as PrivacyShieldOperationSummaryV1["accountType"],
          amountWei: quote.amountWei,
          protocolFeeWei: quote.protocolFeeWei,
          shieldedAmountWei: quote.shieldedAmountWei,
          gasReserveWei: quote.gasReserveWei,
          totalRequiredWei: quote.totalRequiredWei,
          destinationAddress: intent.destinationAddress,
          poolAddress: PRIVACY_POOLS_DEPLOYMENT.contracts.ethPool.address,
          dedupeKey,
        };
        const details: PrivacyShieldOperationDetailsV1 = {
          version: 1,
          operationId,
          depositIndex: depositIndex.toString(),
          precommitment: decoded.precommitment.toString(),
          callData: intent.callData,
        };
        const encryptedDetails = await encryptPrivacyShieldOperationDetails(
          privacyKey.key,
          stored.record.keyId,
          summary,
          details,
        );
        try {
          assertCurrentMasterAuthorization(expectedAuthEpoch);
        } catch {
          throw new PrivacyShieldOperationError("auth-required");
        }
        const commit: PrivacyOperationCommitResult =
          await dependencies.commitOperation(
            {
              summary,
              keyId: stored.record.keyId,
              encryptedDetails,
              tracking: defaultPrivacyShieldOperationTracking(summary),
            },
            depositIndex,
          );
        if (commit.status === "conflict") continue;
        assertOperationMatchesRequest(commit.operation, request, quote);
        return publicSummary(commit.operation);
      } catch (error) {
        if (error instanceof PrivacyShieldOperationError) throw error;
        if (attempt + 1 >= MAX_INDEX_RESERVATION_ATTEMPTS) {
          throw new PrivacyShieldOperationError("operation-unavailable");
        }
      }
    }
    throw new PrivacyShieldOperationError("operation-unavailable");
  });
}
