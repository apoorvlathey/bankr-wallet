import type { Address, Hex } from "viem";

import {
  createPrivacyShieldReviewIntent,
  decodePrivacyShieldReviewIntent,
} from "../deposit/intent";
import { MAX_PRIVACY_DEPOSIT_INDEX } from "./types";

export interface PrivacyShieldOperationIntent {
  readonly kind: "privacy-shield-operation-intent";
  readonly version: 1;
  readonly submittable: false;
  readonly operationId: string;
  readonly depositIndex: number;
  readonly chainId: 11_155_111;
  readonly sourceAddress: Address;
  readonly destinationAddress: Address;
  readonly valueWei: bigint;
  readonly protocolFeeWei: bigint;
  readonly shieldedAmountWei: bigint;
  readonly callData: Hex;
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createPrivacyShieldOperationIntent(input: {
  operationId: string;
  depositIndex: number;
  sourceAddress: Address;
  valueWei: bigint;
  precommitment: bigint;
}): PrivacyShieldOperationIntent {
  if (
    !UUID.test(input.operationId) ||
    !Number.isSafeInteger(input.depositIndex) ||
    input.depositIndex < 0 ||
    input.depositIndex > MAX_PRIVACY_DEPOSIT_INDEX
  ) {
    throw new Error("invalid-shield-operation-intent");
  }
  const reviewed = createPrivacyShieldReviewIntent(input);
  const decoded = decodePrivacyShieldReviewIntent(reviewed);
  if (decoded.precommitment !== input.precommitment) {
    throw new Error("invalid-shield-operation-intent");
  }
  return Object.freeze({
    kind: "privacy-shield-operation-intent" as const,
    version: 1 as const,
    submittable: false as const,
    operationId: input.operationId,
    depositIndex: input.depositIndex,
    chainId: reviewed.chainId,
    sourceAddress: reviewed.sourceAddress,
    destinationAddress: reviewed.destinationAddress,
    valueWei: reviewed.valueWei,
    protocolFeeWei: reviewed.protocolFeeWei,
    shieldedAmountWei: reviewed.shieldedAmountWei,
    callData: reviewed.callData,
  });
}

export function decodePrivacyShieldOperationIntent(
  intent: PrivacyShieldOperationIntent,
): ReturnType<typeof decodePrivacyShieldReviewIntent> & {
  operationId: string;
  depositIndex: number;
} {
  if (
    intent?.kind !== "privacy-shield-operation-intent" ||
    intent.version !== 1 ||
    intent.submittable !== false ||
    !UUID.test(intent.operationId) ||
    !Number.isSafeInteger(intent.depositIndex) ||
    intent.depositIndex < 0 ||
    intent.depositIndex > MAX_PRIVACY_DEPOSIT_INDEX
  ) {
    throw new Error("invalid-shield-operation-intent");
  }
  const decoded = decodePrivacyShieldReviewIntent({
    kind: "privacy-shield-review-intent",
    version: 1,
    submittable: false,
    chainId: intent.chainId,
    sourceAddress: intent.sourceAddress,
    destinationAddress: intent.destinationAddress,
    valueWei: intent.valueWei,
    protocolFeeWei: intent.protocolFeeWei,
    shieldedAmountWei: intent.shieldedAmountWei,
    callData: intent.callData,
  });
  return Object.freeze({
    ...decoded,
    operationId: intent.operationId,
    depositIndex: intent.depositIndex,
  });
}
