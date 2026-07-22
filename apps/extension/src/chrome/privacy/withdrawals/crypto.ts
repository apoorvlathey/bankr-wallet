import {
  arrayBufferToBase64,
  decodeBase64Bounded,
  decodeBase64Exact,
} from "../../cryptography/base64";
import {
  isValidPrivacyUnshieldDetails,
  type PrivacyEncryptedUnshieldDetailsV1,
  type PrivacyAnyUnshieldDetailsV1,
  type PrivacyAnyUnshieldSummaryV1,
} from "./types";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

function aad(keyId: string, summary: PrivacyAnyUnshieldSummaryV1): Uint8Array {
  return encoder.encode(JSON.stringify({
    domain: "walletchan/privacy-unshield/v1",
    keyId,
    ...summary,
    recipient: summary.recipient.toLowerCase(),
  }));
}

export async function encryptPrivacyUnshieldDetails(
  key: CryptoKey,
  keyId: string,
  summary: PrivacyAnyUnshieldSummaryV1,
  details: PrivacyAnyUnshieldDetailsV1,
): Promise<PrivacyEncryptedUnshieldDetailsV1> {
  if (!isValidPrivacyUnshieldDetails(details, summary.id)) {
    throw new Error("Invalid Unshield details");
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv.buffer as ArrayBuffer,
      additionalData: aad(keyId, summary).buffer as ArrayBuffer,
    },
    key,
    encoder.encode(JSON.stringify(details)),
  );
  return {
    version: 1,
    scheme: "privacy-unshield-key",
    ciphertext: arrayBufferToBase64(ciphertext),
    iv: arrayBufferToBase64(iv.buffer as ArrayBuffer),
  };
}

export async function decryptPrivacyUnshieldDetails(
  key: CryptoKey,
  record: { summary: PrivacyAnyUnshieldSummaryV1; keyId: string; encryptedDetails: PrivacyEncryptedUnshieldDetailsV1 },
): Promise<PrivacyAnyUnshieldDetailsV1 | null> {
  try {
    const iv = decodeBase64Exact(record.encryptedDetails.iv, 12);
    const ciphertext = decodeBase64Bounded(record.encryptedDetails.ciphertext, 17, 16_384);
    if (!iv || !ciphertext) return null;
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv.buffer as ArrayBuffer,
        additionalData: aad(record.keyId, record.summary).buffer as ArrayBuffer,
      },
      key,
      ciphertext.buffer as ArrayBuffer,
    );
    const parsed: unknown = JSON.parse(decoder.decode(plaintext));
    return isValidPrivacyUnshieldDetails(parsed, record.summary.id) ? parsed : null;
  } catch {
    return null;
  }
}
