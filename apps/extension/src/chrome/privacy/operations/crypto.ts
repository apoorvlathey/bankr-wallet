import {
  arrayBufferToBase64,
  decodeBase64Bounded,
  decodeBase64Exact,
} from "../../cryptography/base64";
import type {
  PrivacyEncryptedOperationDetailsV1,
  PrivacyShieldOperationDetailsV1,
  PrivacyShieldOperationSummaryV1,
} from "./types";
import { isValidPrivacyShieldOperationDetails } from "./types";

const IV_BYTES = 12;
const MAX_CIPHERTEXT_BYTES = 4_096;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

function operationAad(
  keyId: string,
  summary: PrivacyShieldOperationSummaryV1,
): Uint8Array {
  return encoder.encode(
    JSON.stringify({
      domain: "walletchan/privacy-operations/v1",
      keyId,
      schema: summary.schema,
      id: summary.id,
      requestId: summary.requestId,
      revision: summary.revision,
      state: summary.state,
      createdAt: summary.createdAt,
      chainId: summary.chainId,
      accountId: summary.accountId,
      accountAddress: summary.accountAddress.toLowerCase(),
      accountType: summary.accountType,
      amountWei: summary.amountWei,
      protocolFeeWei: summary.protocolFeeWei,
      shieldedAmountWei: summary.shieldedAmountWei,
      gasReserveWei: summary.gasReserveWei,
      totalRequiredWei: summary.totalRequiredWei,
      destinationAddress: summary.destinationAddress.toLowerCase(),
      poolAddress: summary.poolAddress.toLowerCase(),
    }),
  );
}

export async function encryptPrivacyShieldOperationDetails(
  key: CryptoKey,
  keyId: string,
  summary: PrivacyShieldOperationSummaryV1,
  details: PrivacyShieldOperationDetailsV1,
): Promise<PrivacyEncryptedOperationDetailsV1> {
  if (!isValidPrivacyShieldOperationDetails(details, summary.id)) {
    throw new Error("Invalid privacy operation details");
  }
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv.buffer as ArrayBuffer,
      additionalData: operationAad(keyId, summary).buffer as ArrayBuffer,
    },
    key,
    encoder.encode(JSON.stringify(details)),
  );
  return {
    version: 1,
    scheme: "privacy-operation-key",
    ciphertext: arrayBufferToBase64(ciphertext),
    iv: arrayBufferToBase64(iv.buffer as ArrayBuffer),
  };
}

export async function decryptPrivacyShieldOperationDetails(
  key: CryptoKey,
  keyId: string,
  summary: PrivacyShieldOperationSummaryV1,
  encrypted: PrivacyEncryptedOperationDetailsV1,
): Promise<PrivacyShieldOperationDetailsV1 | null> {
  try {
    const iv = decodeBase64Exact(encrypted.iv, IV_BYTES);
    const ciphertext = decodeBase64Bounded(
      encrypted.ciphertext,
      17,
      MAX_CIPHERTEXT_BYTES,
    );
    if (!iv || !ciphertext) return null;
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv.buffer as ArrayBuffer,
        additionalData: operationAad(keyId, summary).buffer as ArrayBuffer,
      },
      key,
      ciphertext.buffer as ArrayBuffer,
    );
    const parsed: unknown = JSON.parse(decoder.decode(plaintext));
    return isValidPrivacyShieldOperationDetails(parsed, summary.id)
      ? parsed
      : null;
  } catch {
    return null;
  }
}
