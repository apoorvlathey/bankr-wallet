import { getAddress, isAddress, zeroAddress, type Address } from "viem";

import { getActiveAccount } from "../../accounts/selectionStorage";
import {
  WALLET_SECRET_OPERATION_LOCK_KEY,
  withStorageLock,
} from "../../storageLock";
import {
  assertPrivacyMasterAuthorization,
  capturePrivacyMasterAuthorization,
} from "../authorization";
import { readPrivacyAspMasterMaterial } from "../asp/eligibility";
import { readPrivacyCommitments } from "../commitments/repository";
import { quotePrivacyUnshield } from "../relayer/client";
import { encryptPrivacyUnshieldDetails } from "./crypto";
import { derivePrivacyWithdrawalLineage } from "./lineage";
import { commitPrivacyUnshield } from "./repository";
import {
  defaultPrivacyUnshieldTracking,
  type PrivacyUnshieldDetailsV1,
  type PrivacyUnshieldSummaryV1,
  type StoredPrivacyUnshieldV1,
} from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const UINT = /^(?:0|[1-9]\d{0,79})$/;

export type PrivacyUnshieldPrepareErrorCode =
  | "invalid-request"
  | "auth-required"
  | "balance-unavailable"
  | "quote-unavailable"
  | "operation-unavailable";

export class PrivacyUnshieldPrepareError extends Error {
  constructor(readonly code: PrivacyUnshieldPrepareErrorCode) {
    super(code);
    this.name = "PrivacyUnshieldPrepareError";
  }
}

export async function preparePrivacyUnshieldQuote(input: {
  requestId: string;
  amountWei: string;
  recipient: string;
}): Promise<StoredPrivacyUnshieldV1> {
  if (!UUID.test(input.requestId) || !UINT.test(input.amountWei)) {
    throw new PrivacyUnshieldPrepareError("invalid-request");
  }
  const amountWei = BigInt(input.amountWei);
  if (
    amountWei <= 0n ||
    !isAddress(input.recipient, { strict: false }) ||
    input.recipient.toLowerCase() === zeroAddress
  ) throw new PrivacyUnshieldPrepareError("invalid-request");
  const recipient = getAddress(input.recipient) as Address;
  const expectedEpoch = await capturePrivacyMasterAuthorization().catch(() => {
    throw new PrivacyUnshieldPrepareError("auth-required");
  });
  const activeAccount = await getActiveAccount();
  if (!activeAccount || activeAccount.type === "impersonator") {
    throw new PrivacyUnshieldPrepareError("auth-required");
  }
  const material = await readPrivacyAspMasterMaterial();
  if (!material) throw new PrivacyUnshieldPrepareError("auth-required");
  const commitments = await readPrivacyCommitments(material.key, material.keyId);
  const selected = commitments
    .filter((item) =>
      item.details.status === "private_ready" &&
      BigInt(item.details.balanceWei) >= amountWei
    )
    .sort((left, right) => {
      const leftBalance = BigInt(left.details.balanceWei);
      const rightBalance = BigInt(right.details.balanceWei);
      return leftBalance < rightBalance ? -1 : leftBalance > rightBalance ? 1 : 0;
    })[0];
  if (!selected) throw new PrivacyUnshieldPrepareError("balance-unavailable");
  const lineage = derivePrivacyWithdrawalLineage({
    commitment: selected.details,
    masterKeys: material.masterKeys,
    amountWei,
  });
  const quote = await quotePrivacyUnshield(amountWei, recipient).catch(() => {
    throw new PrivacyUnshieldPrepareError("quote-unavailable");
  });
  const operationId = crypto.randomUUID();
  const createdAt = Date.now();
  const relayFeeWei = amountWei - quote.netRecipientAmountWei;
  const summary: PrivacyUnshieldSummaryV1 = {
    schema: "walletchan-privacy-unshield-v1",
    version: 1,
    id: operationId,
    requestId: input.requestId,
    createdAt,
    chainId: 11_155_111,
    amountWei: amountWei.toString(),
    netRecipientAmountWei: quote.netRecipientAmountWei.toString(),
    relayFeeWei: relayFeeWei.toString(),
    feeBPS: quote.feeBPS.toString(),
    recipient,
    relayerName: quote.relayerName,
    expiresAt: quote.expiresAt,
    recipientMatchesDepositor:
      recipient.toLowerCase() === selected.details.depositor.toLowerCase(),
  };
  const details: PrivacyUnshieldDetailsV1 = {
    version: 1,
    operationId,
    commitmentId: selected.record.id,
    commitmentRevision: selected.record.revision,
    commitmentHash: selected.details.commitment,
    label: selected.details.label,
    balanceWei: selected.details.balanceWei,
    depositIndex: selected.details.depositIndex,
    withdrawalIndex: selected.details.withdrawalIndex,
    expectedSpentNullifier: lineage.spentNullifier.toString(),
    expectedNewCommitment: lineage.newCommitment.toString(),
    expectedNewBalanceWei: lineage.newBalanceWei.toString(),
    expectedNewWithdrawalIndex: lineage.newWithdrawalIndex.toString(),
    relayerUrl: quote.relayerUrl,
    signerAddress: quote.signerAddress,
    feeReceiverAddress: quote.feeReceiverAddress,
    baseFeeBPS: quote.baseFeeBPS.toString(),
    gasPrice: quote.gasPrice.toString(),
    relayGas: quote.relayGas.toString(),
    relayCostWei: quote.relayCostWei.toString(),
    feeCommitment: {
      expiration: quote.feeCommitment.expiration,
      withdrawalData: quote.feeCommitment.withdrawalData,
      asset: quote.feeCommitment.asset,
      amount: quote.feeCommitment.amount.toString(),
      extraGas: false,
      signedRelayerCommitment: quote.feeCommitment.signedRelayerCommitment,
    },
  };
  const record: StoredPrivacyUnshieldV1 = {
    summary,
    keyId: material.keyId,
    encryptedDetails: await encryptPrivacyUnshieldDetails(
      material.key,
      material.keyId,
      summary,
      details,
    ),
    tracking: defaultPrivacyUnshieldTracking(summary),
  };
  return withStorageLock(WALLET_SECRET_OPERATION_LOCK_KEY, async () => {
    try { assertPrivacyMasterAuthorization(expectedEpoch); } catch {
      throw new PrivacyUnshieldPrepareError("auth-required");
    }
    const latest = (await readPrivacyCommitments(material.key, material.keyId))
      .find((item) => item.record.id === selected.record.id);
    if (
      !latest || latest.record.revision !== selected.record.revision ||
      latest.details.status !== "private_ready" ||
      latest.details.commitment !== selected.details.commitment ||
      latest.details.balanceWei !== selected.details.balanceWei
    ) throw new PrivacyUnshieldPrepareError("operation-unavailable");
    assertPrivacyMasterAuthorization(expectedEpoch);
    return (await commitPrivacyUnshield(record)).record;
  });
}
