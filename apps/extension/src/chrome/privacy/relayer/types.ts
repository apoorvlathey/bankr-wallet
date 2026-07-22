import type { Address, Hex } from "viem";

import { PRIVACY_POOLS_DEPLOYMENT } from "../deployment/manifest";

export const PRIVACY_RELAYER_QUOTE_TIMEOUT_MS = 12_000;
export const PRIVACY_RELAYER_SUBMIT_TIMEOUT_MS = 90_000;
export const PRIVACY_RELAYER_MAX_RESPONSE_BYTES = 32 * 1_024;
export const PRIVACY_RELAYER_MAX_QUOTE_LIFETIME_MS = 5 * 60_000;

export interface PrivacyRelayerDetails {
  readonly feeBPS: bigint;
  readonly feeReceiverAddress: Address;
  readonly chainId: typeof PRIVACY_POOLS_DEPLOYMENT.chainId;
  readonly assetAddress: Address;
  readonly minWithdrawAmount: bigint;
  readonly maxGasPrice: bigint;
}

export interface PrivacyRelayerFeeCommitment {
  readonly expiration: number;
  readonly withdrawalData: Hex;
  readonly asset: Address;
  readonly amount: bigint;
  readonly extraGas: false;
  readonly signedRelayerCommitment: Hex;
}

export interface PrivacyRelayerQuote {
  readonly baseFeeBPS: bigint;
  readonly feeBPS: bigint;
  readonly gasPrice: bigint;
  readonly relayGas: bigint;
  readonly relayCostWei: bigint;
  readonly feeCommitment: PrivacyRelayerFeeCommitment;
}

export interface PrivacyRelayerQuoteSelection extends PrivacyRelayerQuote {
  readonly relayerName: string;
  readonly relayerUrl: string;
  readonly feeReceiverAddress: Address;
  readonly signerAddress: Address;
  readonly expiresAt: number;
  readonly netRecipientAmountWei: bigint;
}

export interface PrivacyRelayerSubmission {
  readonly success: true;
  readonly timestamp: number;
  readonly requestId: string;
  readonly txHash: Hex;
}

const UINT = /^(?:0|[1-9]\d{0,79})$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HEX = /^0x(?:[0-9a-fA-F]{2})*$/;
const HASH = /^0x[0-9a-fA-F]{64}$/;
const SIGNATURE = /^0x[0-9a-fA-F]{130}$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
}

function uint(value: unknown): bigint | null {
  if (typeof value !== "string" || !UINT.test(value)) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function address(value: unknown): Address | null {
  return typeof value === "string" && ADDRESS.test(value) ? value as Address : null;
}

export function parsePrivacyRelayerDetails(value: unknown): PrivacyRelayerDetails | null {
  if (!exact(value, [
    "assetAddress",
    "chainId",
    "feeBPS",
    "feeReceiverAddress",
    "maxGasPrice",
    "minWithdrawAmount",
  ])) return null;
  const feeBPS = uint(value.feeBPS);
  const feeReceiverAddress = address(value.feeReceiverAddress);
  const assetAddress = address(value.assetAddress);
  const minWithdrawAmount = uint(value.minWithdrawAmount);
  const maxGasPrice = uint(value.maxGasPrice);
  if (
    value.chainId !== PRIVACY_POOLS_DEPLOYMENT.chainId ||
    feeBPS === null || feeBPS > 10_000n ||
    !feeReceiverAddress || !assetAddress ||
    minWithdrawAmount === null || maxGasPrice === null || maxGasPrice === 0n
  ) return null;
  return Object.freeze({
    feeBPS,
    feeReceiverAddress,
    chainId: PRIVACY_POOLS_DEPLOYMENT.chainId,
    assetAddress,
    minWithdrawAmount,
    maxGasPrice,
  });
}

export function parsePrivacyRelayerQuote(value: unknown): PrivacyRelayerQuote | null {
  if (!exact(value, ["baseFeeBPS", "detail", "feeBPS", "feeCommitment", "gasPrice"])) {
    return null;
  }
  if (!exact(value.detail, ["relayTxCost"]) ||
      !exact(value.detail.relayTxCost, ["eth", "gas"]) ||
      !exact(value.feeCommitment, [
        "amount",
        "asset",
        "expiration",
        "extraGas",
        "signedRelayerCommitment",
        "withdrawalData",
      ])) return null;
  const baseFeeBPS = uint(value.baseFeeBPS);
  const feeBPS = uint(value.feeBPS);
  const gasPrice = uint(value.gasPrice);
  const relayGas = uint(value.detail.relayTxCost.gas);
  const relayCostWei = uint(value.detail.relayTxCost.eth);
  const amount = uint(value.feeCommitment.amount);
  const asset = address(value.feeCommitment.asset);
  const expiration = value.feeCommitment.expiration;
  const withdrawalData = value.feeCommitment.withdrawalData;
  const signed = value.feeCommitment.signedRelayerCommitment;
  if (
    baseFeeBPS === null || feeBPS === null || gasPrice === null ||
    relayGas === null || relayCostWei === null || amount === null || amount === 0n ||
    !asset ||
    typeof expiration !== "number" || !Number.isSafeInteger(expiration) || expiration < 0 ||
    typeof withdrawalData !== "string" || !HEX.test(withdrawalData) ||
    withdrawalData.length !== 2 + 32 * 3 * 2 ||
    typeof signed !== "string" || !SIGNATURE.test(signed) ||
    value.feeCommitment.extraGas !== false
  ) return null;
  return Object.freeze({
    baseFeeBPS,
    feeBPS,
    gasPrice,
    relayGas,
    relayCostWei,
    feeCommitment: Object.freeze({
      expiration,
      withdrawalData: withdrawalData as Hex,
      asset,
      amount,
      extraGas: false,
      signedRelayerCommitment: signed as Hex,
    }),
  });
}

export function parsePrivacyRelayerSubmission(value: unknown): PrivacyRelayerSubmission | null {
  if (!exact(value, ["requestId", "success", "timestamp", "txHash"])) return null;
  return value.success === true &&
      typeof value.timestamp === "number" && Number.isSafeInteger(value.timestamp) && value.timestamp >= 0 &&
      typeof value.requestId === "string" && UUID.test(value.requestId) &&
      typeof value.txHash === "string" && HASH.test(value.txHash)
    ? Object.freeze({
        success: true,
        timestamp: value.timestamp,
        requestId: value.requestId,
        txHash: value.txHash as Hex,
      })
    : null;
}
