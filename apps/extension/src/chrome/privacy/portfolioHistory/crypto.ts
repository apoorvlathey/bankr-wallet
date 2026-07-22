import {
  arrayBufferToBase64,
  decodeBase64Bounded,
  decodeBase64Exact,
} from "../../cryptography/base64";
import {
  isValidPrivacyPortfolioSnapshotDetails,
  type PrivacyPortfolioSnapshotDetailsV1,
  type StoredPrivacyPortfolioSnapshotV1,
} from "./types";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
type Header = Omit<StoredPrivacyPortfolioSnapshotV1, "encryptedDetails">;

function aad(header: Header): Uint8Array {
  return encoder.encode(JSON.stringify({
    domain: "walletchan/privacy-portfolio/v1",
    version: header.version,
    id: header.id,
    keyId: header.keyId,
    createdAt: header.createdAt,
  }));
}

export async function encryptPrivacyPortfolioSnapshot(
  key: CryptoKey,
  header: Header,
  details: PrivacyPortfolioSnapshotDetailsV1,
): Promise<StoredPrivacyPortfolioSnapshotV1["encryptedDetails"]> {
  if (!isValidPrivacyPortfolioSnapshotDetails(details, header.id)) {
    throw new Error("Invalid private portfolio snapshot");
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
    scheme: "privacy-portfolio-key",
    ciphertext: arrayBufferToBase64(ciphertext),
    iv: arrayBufferToBase64(iv.buffer as ArrayBuffer),
  };
}

export async function decryptPrivacyPortfolioSnapshot(
  key: CryptoKey,
  record: StoredPrivacyPortfolioSnapshotV1,
): Promise<PrivacyPortfolioSnapshotDetailsV1 | null> {
  try {
    const iv = decodeBase64Exact(record.encryptedDetails.iv, 12);
    const ciphertext = decodeBase64Bounded(record.encryptedDetails.ciphertext, 17, 2_048);
    if (!iv || !ciphertext) return null;
    const header: Header = {
      version: record.version,
      id: record.id,
      keyId: record.keyId,
      createdAt: record.createdAt,
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
    return isValidPrivacyPortfolioSnapshotDetails(parsed, record.id) ? parsed : null;
  } catch {
    return null;
  }
}
