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
import { PRIVACY_POOLS_SEPOLIA_DEPLOYMENT } from "../deployment/manifest";
import {
  derivePrivacyPoolDepositPrecommitment,
  derivePrivacyPoolDepositSecrets,
  derivePrivacyPoolMasterKeys,
} from "../protocol/primitives";
import { readPrivacyVault } from "../repository";
import { verifyPrivacyVaultWithKey } from "../vault";
import {
  assertPinnedSourceAccount,
  quotePrivacyShield,
  type PrivacyShieldQuoteRequest,
} from "./quote";
import type { PrivacyShieldQuoteValues } from "./quotePolicy";
import {
  createPrivacyShieldReviewIntent,
  type PrivacyShieldReviewIntent,
} from "./intent";

// Review material lives outside the bounded durable deposit-index namespace.
// A later persisted operation must reserve its own index and derive a distinct
// precommitment before it can enter WalletChan's confirmation coordinator.
const REVIEW_DERIVATION_INDEX = 0xffff_ffffn;

export type PrivacyShieldReviewErrorCode =
  | "auth-required"
  | "recovery-unavailable"
  | "insufficient-funds"
  | "review-unavailable";

export class PrivacyShieldReviewError extends Error {
  constructor(readonly code: PrivacyShieldReviewErrorCode) {
    super(code);
    this.name = "PrivacyShieldReviewError";
  }
}

export interface PreparedPrivacyShieldReview {
  readonly accountId: string;
  readonly accountType: PrivacyShieldQuoteRequest["accountType"];
  readonly quote: PrivacyShieldQuoteValues;
  readonly intent: PrivacyShieldReviewIntent;
}

type Dependencies = {
  getAccountById: typeof getAccountById;
  quotePrivacyShield: typeof quotePrivacyShield;
};

const productionDependencies: Dependencies = {
  getAccountById,
  quotePrivacyShield,
};

async function requireLiveMasterSession(): Promise<string> {
  if (!isWalletUnlocked()) {
    await tryRestoreSession(handleUnlockWallet).catch(() => false);
  }
  if (!isWalletUnlocked() || getPasswordType() !== "master") {
    throw new PrivacyShieldReviewError("auth-required");
  }
  return getAuthCeremonyEpoch();
}

function assertQuoteMatchesIntent(
  quote: PrivacyShieldQuoteValues,
  intent: PrivacyShieldReviewIntent,
): void {
  if (
    quote.chainId !== intent.chainId ||
    quote.amountWei !== intent.valueWei.toString() ||
    quote.protocolFeeWei !== intent.protocolFeeWei.toString() ||
    quote.shieldedAmountWei !== intent.shieldedAmountWei.toString()
  ) {
    throw new PrivacyShieldReviewError("review-unavailable");
  }
}

/**
 * Prepare and independently verify a deterministic review intent. It is
 * deliberately non-submittable and performs no storage write.
 */
export async function preparePrivacyShieldReview(
  request: PrivacyShieldQuoteRequest,
  overrides: Partial<Dependencies> = {},
): Promise<PreparedPrivacyShieldReview> {
  const dependencies = { ...productionDependencies, ...overrides };
  const expectedAuthEpoch = await requireLiveMasterSession();
  const quote = await dependencies.quotePrivacyShield(request);
  if (!quote.canAfford) {
    throw new PrivacyShieldReviewError("insufficient-funds");
  }

  return withStorageLock(WALLET_SECRET_OPERATION_LOCK_KEY, async () => {
    try {
      assertCurrentMasterAuthorization(expectedAuthEpoch);
    } catch {
      throw new PrivacyShieldReviewError("auth-required");
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
      throw new PrivacyShieldReviewError("recovery-unavailable");
    }
    if (!(await verifyPrivacyVaultWithKey(stored.record, privacyKey.key))) {
      throw new PrivacyShieldReviewError("recovery-unavailable");
    }
    const phrase = await decryptPrivacyRecovery(
      privacyKey.key,
      stored.record.keyId,
      stored.record.recovery,
    );
    if (!phrase) {
      throw new PrivacyShieldReviewError("recovery-unavailable");
    }

    let intent: PrivacyShieldReviewIntent;
    try {
      const masterKeys = derivePrivacyPoolMasterKeys(phrase);
      const secrets = derivePrivacyPoolDepositSecrets(
        masterKeys,
        PRIVACY_POOLS_SEPOLIA_DEPLOYMENT.scope,
        REVIEW_DERIVATION_INDEX,
      );
      const precommitment = derivePrivacyPoolDepositPrecommitment(secrets);
      intent = createPrivacyShieldReviewIntent({
        sourceAddress,
        valueWei: BigInt(quote.amountWei),
        precommitment,
      });
      assertQuoteMatchesIntent(quote, intent);
    } catch (error) {
      if (error instanceof PrivacyShieldReviewError) throw error;
      throw new PrivacyShieldReviewError("review-unavailable");
    }

    try {
      assertCurrentMasterAuthorization(expectedAuthEpoch);
    } catch {
      throw new PrivacyShieldReviewError("auth-required");
    }
    return Object.freeze({
      accountId: request.accountId,
      accountType: request.accountType,
      quote,
      intent,
    });
  });
}
