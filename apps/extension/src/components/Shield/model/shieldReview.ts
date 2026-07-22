import type { ShieldSourceAccount } from "./shieldQuote";
import { PRIVACY_POOLS_DEPLOYMENT } from "@/chrome/privacy/deployment/manifest";
import { privacyShieldProtocolFeeWei } from "@/lib/privacyShieldAmounts";

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const SERIALIZED_WEI = /^(?:0|[1-9]\d{0,79})$/;

export interface ShieldPreparedReview {
  readonly chainId: typeof PRIVACY_POOLS_DEPLOYMENT.chainId;
  readonly accountId: string;
  readonly accountAddress: string;
  readonly accountType: ShieldSourceAccount["type"];
  readonly amountWei: bigint;
  readonly protocolFeeWei: bigint;
  readonly shieldedAmountWei: bigint;
  readonly destinationAddress: string;
}

function hasExactKeys(value: object, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

export function parseShieldReviewResponse(
  response: unknown,
  expectedAccount: ShieldSourceAccount,
  expectedAmountWei: bigint,
): ShieldPreparedReview | null {
  if (
    typeof response !== "object" ||
    response === null ||
    Array.isArray(response) ||
    !hasExactKeys(response, ["review", "status", "success"])
  ) {
    return null;
  }
  const outer = response as Record<string, unknown>;
  if (outer.success !== true || outer.status !== "ready") return null;

  const raw = outer.review;
  if (
    typeof raw !== "object" ||
    raw === null ||
    Array.isArray(raw) ||
    !hasExactKeys(raw, [
      "accountAddress",
      "accountId",
      "accountType",
      "amountWei",
      "chainId",
      "destinationAddress",
      "protocolFeeWei",
      "shieldedAmountWei",
    ])
  ) {
    return null;
  }
  const value = raw as Record<string, unknown>;
  if (
    value.chainId !== PRIVACY_POOLS_DEPLOYMENT.chainId ||
    value.accountId !== expectedAccount.id ||
    value.accountType !== expectedAccount.type ||
    typeof value.accountAddress !== "string" ||
    value.accountAddress.toLowerCase() !== expectedAccount.address.toLowerCase() ||
    typeof value.destinationAddress !== "string" ||
    !EVM_ADDRESS.test(value.destinationAddress) ||
    /^0x0{40}$/i.test(value.destinationAddress) ||
    typeof value.amountWei !== "string" ||
    !SERIALIZED_WEI.test(value.amountWei) ||
    typeof value.protocolFeeWei !== "string" ||
    !SERIALIZED_WEI.test(value.protocolFeeWei) ||
    typeof value.shieldedAmountWei !== "string" ||
    !SERIALIZED_WEI.test(value.shieldedAmountWei)
  ) {
    return null;
  }
  let amountWei: bigint;
  let protocolFeeWei: bigint;
  let shieldedAmountWei: bigint;
  try {
    amountWei = BigInt(value.amountWei);
    protocolFeeWei = BigInt(value.protocolFeeWei);
    shieldedAmountWei = BigInt(value.shieldedAmountWei);
  } catch {
    return null;
  }
  if (
    shieldedAmountWei !== expectedAmountWei ||
    protocolFeeWei !== privacyShieldProtocolFeeWei(
      amountWei,
      PRIVACY_POOLS_DEPLOYMENT.assetConfig.vettingFeeBPS,
    ) ||
    amountWei !== shieldedAmountWei + protocolFeeWei
  ) return null;

  return Object.freeze({
    chainId: PRIVACY_POOLS_DEPLOYMENT.chainId,
    accountId: expectedAccount.id,
    accountAddress: value.accountAddress,
    accountType: expectedAccount.type,
    amountWei,
    protocolFeeWei,
    shieldedAmountWei,
    destinationAddress: value.destinationAddress,
  });
}
