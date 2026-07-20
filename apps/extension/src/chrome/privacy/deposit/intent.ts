import {
  encodeFunctionData,
  parseAbi,
  type Address,
  type Hex,
} from "viem";

import { PRIVACY_POOLS_DEPLOYMENT } from "../deployment/manifest";

const ENTRYPOINT_NATIVE_DEPOSIT_ABI = parseAbi([
  "function deposit(uint256 precommitment) payable returns (uint256 commitment)",
]);
export const PRIVACY_SHIELD_DEPOSIT_SELECTOR = "0xb6b55f25" as const;
const EXACT_NATIVE_DEPOSIT_CALL = /^0x[0-9a-fA-F]{72}$/;
const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const ZERO_ADDRESS = /^0x0{40}$/i;
const SNARK_SCALAR_FIELD =
  21_888_242_871_839_275_222_246_405_745_257_275_088_548_364_400_416_034_343_698_204_186_575_808_495_617n;
const UINT128_MAX = (1n << 128n) - 1n;
const BASIS_POINTS_SCALE = 10_000n;

export interface PrivacyShieldReviewIntent {
  readonly kind: "privacy-shield-review-intent";
  readonly version: 1;
  readonly submittable: false;
  readonly chainId: typeof PRIVACY_POOLS_DEPLOYMENT.chainId;
  readonly sourceAddress: Address;
  readonly destinationAddress: Address;
  readonly valueWei: bigint;
  readonly protocolFeeWei: bigint;
  readonly shieldedAmountWei: bigint;
  readonly callData: Hex;
}

export interface DecodedPrivacyShieldReviewIntent {
  readonly sourceAddress: Address;
  readonly destinationAddress: Address;
  readonly valueWei: bigint;
  readonly protocolFeeWei: bigint;
  readonly shieldedAmountWei: bigint;
  readonly precommitment: bigint;
}

function normalizeAddress(value: unknown): Address {
  if (
    typeof value !== "string" ||
    !EVM_ADDRESS.test(value) ||
    ZERO_ADDRESS.test(value)
  ) {
    throw new Error("invalid-shield-intent");
  }
  return value.toLowerCase() as Address;
}

function feeValues(valueWei: bigint): {
  protocolFeeWei: bigint;
  shieldedAmountWei: bigint;
} {
  const deployment = PRIVACY_POOLS_DEPLOYMENT;
  if (
    valueWei < deployment.assetConfig.minimumDepositAmount ||
    valueWei < 0n
  ) {
    throw new Error("invalid-shield-intent");
  }
  const protocolFeeWei =
    (valueWei * deployment.assetConfig.vettingFeeBPS) /
    BASIS_POINTS_SCALE;
  const shieldedAmountWei = valueWei - protocolFeeWei;
  if (shieldedAmountWei >= UINT128_MAX) {
    throw new Error("invalid-shield-intent");
  }
  return { protocolFeeWei, shieldedAmountWei };
}

/** Decode without using the ABI encoder/decoder used to construct the call. */
export function decodePrivacyShieldReviewIntent(
  intent: PrivacyShieldReviewIntent,
): DecodedPrivacyShieldReviewIntent {
  if (
    intent?.kind !== "privacy-shield-review-intent" ||
    intent.version !== 1 ||
    intent.submittable !== false ||
    intent.chainId !== PRIVACY_POOLS_DEPLOYMENT.chainId ||
    typeof intent.valueWei !== "bigint" ||
    typeof intent.protocolFeeWei !== "bigint" ||
    typeof intent.shieldedAmountWei !== "bigint" ||
    typeof intent.callData !== "string" ||
    !EXACT_NATIVE_DEPOSIT_CALL.test(intent.callData)
  ) {
    throw new Error("invalid-shield-intent");
  }

  const sourceAddress = normalizeAddress(intent.sourceAddress);
  const destinationAddress = normalizeAddress(intent.destinationAddress);
  if (
    destinationAddress !==
    PRIVACY_POOLS_DEPLOYMENT.contracts.entrypointProxy.address.toLowerCase()
  ) {
    throw new Error("invalid-shield-intent");
  }
  if (
    intent.callData.slice(0, 10).toLowerCase() !==
    PRIVACY_SHIELD_DEPOSIT_SELECTOR
  ) {
    throw new Error("invalid-shield-intent");
  }

  let precommitment: bigint;
  try {
    precommitment = BigInt(`0x${intent.callData.slice(10)}`);
  } catch {
    throw new Error("invalid-shield-intent");
  }
  if (precommitment <= 0n || precommitment >= SNARK_SCALAR_FIELD) {
    throw new Error("invalid-shield-intent");
  }

  const expectedFees = feeValues(intent.valueWei);
  if (
    intent.protocolFeeWei !== expectedFees.protocolFeeWei ||
    intent.shieldedAmountWei !== expectedFees.shieldedAmountWei
  ) {
    throw new Error("invalid-shield-intent");
  }

  return Object.freeze({
    sourceAddress,
    destinationAddress,
    valueWei: intent.valueWei,
    ...expectedFees,
    precommitment,
  });
}

/** Build a review-only intent. Submission accepts only a later persisted type. */
export function createPrivacyShieldReviewIntent(input: {
  sourceAddress: Address;
  valueWei: bigint;
  precommitment: bigint;
}): PrivacyShieldReviewIntent {
  const sourceAddress = normalizeAddress(input.sourceAddress);
  if (
    typeof input.precommitment !== "bigint" ||
    input.precommitment <= 0n ||
    input.precommitment >= SNARK_SCALAR_FIELD
  ) {
    throw new Error("invalid-shield-intent");
  }
  const fees = feeValues(input.valueWei);
  const callData = encodeFunctionData({
    abi: ENTRYPOINT_NATIVE_DEPOSIT_ABI,
    functionName: "deposit",
    args: [input.precommitment],
  });
  const intent = Object.freeze({
    kind: "privacy-shield-review-intent" as const,
    version: 1 as const,
    submittable: false as const,
    chainId: PRIVACY_POOLS_DEPLOYMENT.chainId,
    sourceAddress,
    destinationAddress:
      PRIVACY_POOLS_DEPLOYMENT.contracts.entrypointProxy.address,
    valueWei: input.valueWei,
    ...fees,
    callData,
  });
  const decoded = decodePrivacyShieldReviewIntent(intent);
  if (decoded.precommitment !== input.precommitment) {
    throw new Error("invalid-shield-intent");
  }
  return intent;
}
