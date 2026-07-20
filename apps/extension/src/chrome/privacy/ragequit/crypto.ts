import {
  arrayBufferToBase64,
  decodeBase64Bounded,
  decodeBase64Exact,
} from "../../cryptography/base64";
import {
  isValidPrivacyRagequitDetails,
  type PrivacyEncryptedRagequitDetailsV1,
  type PrivacyRagequitDetailsV1,
  type PrivacyRagequitSummaryV1,
} from "./types";
import type { StoredPrivacyRagequitV1 } from "./types";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

function aad(keyId: string, summary: PrivacyRagequitSummaryV1): Uint8Array {
  return encoder.encode(JSON.stringify({
    domain: "walletchan/privacy-ragequit/v1",
    keyId,
    ...summary,
    accountAddress: summary.accountAddress.toLowerCase(),
    poolAddress: summary.poolAddress.toLowerCase(),
  }));
}

export async function encryptPrivacyRagequitDetails(
  key: CryptoKey,
  keyId: string,
  summary: PrivacyRagequitSummaryV1,
  details: PrivacyRagequitDetailsV1,
): Promise<PrivacyEncryptedRagequitDetailsV1> {
  if (!isValidPrivacyRagequitDetails(details, summary.id)) {
    throw new Error("Invalid public recovery details");
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
    scheme: "privacy-ragequit-key",
    ciphertext: arrayBufferToBase64(ciphertext),
    iv: arrayBufferToBase64(iv.buffer as ArrayBuffer),
  };
}

export async function decryptPrivacyRagequitDetails(
  key: CryptoKey,
  record: Pick<StoredPrivacyRagequitV1, "summary" | "keyId" | "encryptedDetails">,
): Promise<PrivacyRagequitDetailsV1 | null> {
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
    return isValidPrivacyRagequitDetails(parsed, record.summary.id) ? parsed : null;
  } catch {
    return null;
  }
}
