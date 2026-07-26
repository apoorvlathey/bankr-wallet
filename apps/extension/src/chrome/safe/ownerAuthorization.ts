import { getAccountById } from "../accountStorage";
import { getAuthCeremonyEpoch, isCurrentAuthCeremonyEpoch } from "../authTransition";
import { signMessageViaApi } from "../bankr/signing";
import { getLocalPrivateKeyForAccount } from "../accounts/localKeyResolver";
import { signTypedData } from "../localSigner";
import { ensureLedgerSigningSession } from "../ledger/session";
import { signLedgerTypedDataForAccount } from "../ledger/signing";
import { getPasswordType } from "../sessionCache";
import { getUnlockedBankrApiKey } from "../transactions/bankrSession";
import { getSafeAccountRecord } from "./accountRepository";
import { verifySafeOnchainState } from "./onchainState";
import {
  claimSafeProposalEffect,
  getSafeProposal,
  releaseSafeProposalEffect,
} from "./proposalRepository";
import { buildSafeTransactionTypedData } from "./transactionHash";
import { validateSafeOwnerConfirmation } from "./signatureValidation";
import {
  getSafeOwnerSigningPath,
  isSafeOwnerAccount,
  type SafeOwnerAccount,
} from "./accountTypePolicy";
import {
  getSafeProposalNoncePosition,
  isFutureSafeNonceError,
} from "./proposalNonce";
import type {
  SafeAddress,
  SafeOwnerConfirmation,
  SafeProposalRecord,
} from "./types";

export { getSafeOwnerSigningPath } from "./accountTypePolicy";

export function isAgentPasswordAllowedForSafeOperation(
  operation: "approve" | "execute" | "revealSecret" | "changeConfiguration",
): boolean {
  return operation === "approve" || operation === "execute";
}

export function mergeSafeOwnerConfirmation(
  current: readonly SafeOwnerConfirmation[],
  confirmation: SafeOwnerConfirmation,
): SafeOwnerConfirmation[] {
  const byOwner = new Map(
    current.map((item) => [item.ownerAddress, item]),
  );
  byOwner.set(confirmation.ownerAddress, confirmation);
  return [...byOwner.values()];
}

async function resolveAuthority(proposal: SafeProposalRecord, ownerAccountId: string) {
  const [safe, rawAccount] = await Promise.all([
    getSafeAccountRecord(proposal.safeAccountId),
    getAccountById(ownerAccountId),
  ]);
  if (!safe || safe.address !== proposal.safeAddress) throw new Error("Safe account changed");
  const stored = safe.chains[String(proposal.chainId)];
  if (!stored || stored.configEpoch !== proposal.safeConfigEpoch) throw new Error("Safe configuration changed; review again");
  if (
    !rawAccount ||
    !isSafeOwnerAccount(rawAccount)
  ) {
    throw new Error("Selected account cannot approve Safe transactions");
  }
  const account = rawAccount;
  const ownerAddress = account.address.toLowerCase() as SafeAddress;
  if (!stored.owners.includes(ownerAddress)) throw new Error("Selected account is not a Safe owner");
  return { safe, stored, account, ownerAddress };
}

async function assertLiveReview(
  proposal: SafeProposalRecord,
  expectedOwner: SafeAddress,
) {
  const live = await verifySafeOnchainState({
    chainId: proposal.chainId,
    safeAddress: proposal.safeAddress,
  });
  if (live.configEpoch !== proposal.safeConfigEpoch) throw new Error("Safe configuration changed; review again");
  if (getSafeProposalNoncePosition(proposal.transaction.nonce, live.nonce) === "stale") {
    throw new Error("Safe nonce already advanced; review again");
  }
  if (!live.owners.includes(expectedOwner)) throw new Error("Selected signer is no longer a Safe owner");
  return live;
}

async function signForOwner(input: {
  account: SafeOwnerAccount;
  proposal: SafeProposalRecord;
}): Promise<string> {
  const typedData = buildSafeTransactionTypedData({
    chainId: input.proposal.chainId,
    safeAddress: input.proposal.safeAddress,
    safeVersion: input.proposal.safeVersion,
    transaction: input.proposal.transaction,
  });
  if (getSafeOwnerSigningPath(input.account) === "bankr") {
    const apiKey = await getUnlockedBankrApiKey();
    if (!apiKey) throw new Error("Wallet is locked; unlock it and try again");
    const result = await signMessageViaApi(apiKey, "eth_signTypedData_v4", [
      input.account.address,
      typedData,
    ]);
    return result.signature;
  }
  if (input.account.type === "ledger") {
    return signLedgerTypedDataForAccount({
      opId: `safe-approval:${input.proposal.id}`,
      account: input.account,
      typedData,
      chainId: input.proposal.chainId,
    });
  }
  const privateKey = await getLocalPrivateKeyForAccount(input.account.id, "");
  if (!privateKey) throw new Error("Wallet is locked; unlock it and try again");
  return signTypedData(privateKey, typedData, input.proposal.chainId);
}

async function ensureSafeSigningSession(
  account: SafeOwnerAccount,
) {
  const signingPath = getSafeOwnerSigningPath(account);
  if (signingPath === "ledger") {
    await ensureLedgerSigningSession("");
    return;
  }
  const material = signingPath === "bankr"
    ? await getUnlockedBankrApiKey()
    : await getLocalPrivateKeyForAccount(account.id, "");
  if (!material || !getPasswordType()) {
    throw new Error("Wallet is locked; unlock it and try again");
  }
}

export async function approveSafeProposalWithOwner(input: {
  proposalId: string;
  ownerAccountId: string;
}): Promise<SafeProposalRecord> {
  const proposal = await getSafeProposal(input.proposalId);
  if (!proposal) throw new Error("Safe proposal not found");
  if (
    !["draft", "approvedLocally", "awaitingApprovals"].includes(proposal.state) &&
    !(proposal.state === "blocked" && isFutureSafeNonceError(proposal.error))
  ) {
    throw new Error("Safe proposal cannot be approved in its current state");
  }
  const authority = await resolveAuthority(proposal, input.ownerAccountId);
  if (proposal.confirmations.some((item) => item.ownerAddress === authority.ownerAddress)) throw new Error("This Safe owner already approved");
  const claimed = await claimSafeProposalEffect(proposal.id, { kind: "approve", ownerAddress: authority.ownerAddress });
  const claimId = claimed.effectClaim!.claimId;
  try {
    await ensureSafeSigningSession(authority.account);
    const authEpoch = getAuthCeremonyEpoch();
    const liveBefore = await assertLiveReview(proposal, authority.ownerAddress);
    const signature = await signForOwner({
      account: authority.account,
      proposal,
    });
    if (!isCurrentAuthCeremonyEpoch(authEpoch) || !getPasswordType()) throw new Error("Authentication state changed; unlock and try again");
    const refreshedAuthority = await resolveAuthority(proposal, input.ownerAccountId);
    if (
      refreshedAuthority.ownerAddress !== authority.ownerAddress ||
      refreshedAuthority.account.type !== authority.account.type ||
      (
        authority.account.type === "ledger" &&
        (
          refreshedAuthority.account.type !== "ledger" ||
          refreshedAuthority.account.deviceId !== authority.account.deviceId ||
          refreshedAuthority.account.hdPath !== authority.account.hdPath
        )
      )
    ) {
      throw new Error("Selected owner account changed");
    }
    const liveAfter = await assertLiveReview(proposal, authority.ownerAddress);
    if (liveAfter.configEpoch !== liveBefore.configEpoch) throw new Error("Safe configuration changed while approving");
    const confirmation = await validateSafeOwnerConfirmation({
      proposal,
      signature,
      expectedOwner: authority.ownerAddress,
      currentOwners: liveAfter.owners,
      accountId: authority.account.id,
      accountType: authority.account.type,
    });
    return releaseSafeProposalEffect(proposal.id, claimId, (current) => {
      const confirmations = mergeSafeOwnerConfirmation(
        current.confirmations,
        confirmation,
      );
      return {
        confirmations,
        state: confirmations.length >= liveAfter.threshold
          ? "readyToExecute"
          : "approvedLocally",
        error: undefined,
      };
    });
  } catch (error) {
    await releaseSafeProposalEffect(proposal.id, claimId, {
      state: proposal.state,
      error: error instanceof Error ? error.message : "Safe approval failed",
    }).catch(() => {});
    throw error;
  }
}
