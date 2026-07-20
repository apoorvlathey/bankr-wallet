import {
  arrayBufferToBase64,
  decodeBase64Bounded,
  decodeBase64Exact,
} from "../../cryptography/base64";
import {
  isValidPrivacyCommitmentDetails,
  type PrivacyCommitmentDetailsV1,
  type PrivacyEncryptedCommitmentV1,
  type StoredPrivacyCommitmentV1,
} from "./types";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

type CommitmentHeader = Omit<StoredPrivacyCommitmentV1, "encryptedDetails">;

function aad(header: CommitmentHeader): Uint8Array {
  return encoder.encode(JSON.stringify({
    domain: "walletchan/privacy-commitments/v1",
    version: header.version,
    id: header.id,
    keyId: header.keyId,
    revision: header.revision,
    createdAt: header.createdAt,
    updatedAt: header.updatedAt,
  }));
}

export async function encryptPrivacyCommitmentDetails(
  key: CryptoKey,
  header: CommitmentHeader,
  details: PrivacyCommitmentDetailsV1,
): Promise<PrivacyEncryptedCommitmentV1> {
  if (!isValidPrivacyCommitmentDetails(details, header.id)) {
    throw new Error("Invalid private commitment");
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv.buffer as ArrayBuffer,
      additionalData: aad(header).buffer as ArrayBuffer,
    },
    key,
    encoder.encode(JSON.stringify(details)),
  );
  return {
    version: 1,
    scheme: "privacy-commitment-key",
    ciphertext: arrayBufferToBase64(ciphertext),
    iv: arrayBufferToBase64(iv.buffer as ArrayBuffer),
  };
}

export async function decryptPrivacyCommitmentDetails(
  key: CryptoKey,
  record: StoredPrivacyCommitmentV1,
): Promise<PrivacyCommitmentDetailsV1 | null> {
  try {
    const iv = decodeBase64Exact(record.encryptedDetails.iv, 12);
    const ciphertext = decodeBase64Bounded(
      record.encryptedDetails.ciphertext,
      17,
      8_192,
    );
    if (!iv || !ciphertext) return null;
    const header: CommitmentHeader = {
      version: record.version,
      id: record.id,
      keyId: record.keyId,
      revision: record.revision,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv.buffer as ArrayBuffer,
        additionalData: aad(header).buffer as ArrayBuffer,
      },
      key,
      ciphertext.buffer as ArrayBuffer,
    );
    const parsed: unknown = JSON.parse(decoder.decode(plaintext));
    return isValidPrivacyCommitmentDetails(parsed, record.id) ? parsed : null;
  } catch {
    return null;
  }
}
