import { decodeBase64Bounded, decodeBase64Exact } from "../../cryptography/base64";
import { PRIVACY_POOLS_DEPLOYMENT } from "../deployment/manifest";

export const PRIVACY_PORTFOLIO_DATABASES = Object.freeze([
  "walletchan-privacy-portfolio-v1",
  "walletchan-privacy-portfolio-mainnet-v1",
] as const);
export const PRIVACY_PORTFOLIO_DATABASE = PRIVACY_POOLS_DEPLOYMENT.profile === "sepolia"
  ? PRIVACY_PORTFOLIO_DATABASES[0]
  : PRIVACY_PORTFOLIO_DATABASES[1];
export const PRIVACY_PORTFOLIO_DATABASE_VERSION = 1;
export const PRIVACY_PORTFOLIO_STORE = "snapshots";
export const MAX_PRIVACY_PORTFOLIO_SNAPSHOTS = 193;
export const PRIVACY_PORTFOLIO_RETENTION_MS = 8 * 24 * 60 * 60 * 1_000;
export const PRIVACY_PORTFOLIO_SAMPLE_INTERVAL_MS = 60 * 60 * 1_000;

export interface PrivacyPortfolioSnapshotDetailsV1 {
  version: 1;
  id: string;
  timestamp: number;
  confirmedBalanceWei: string;
  priceUsd: number;
  totalValueUsd: number;
}

export interface StoredPrivacyPortfolioSnapshotV1 {
  version: 1;
  id: string;
  keyId: string;
  createdAt: number;
  encryptedDetails: {
    version: 1;
    scheme: "privacy-portfolio-key";
    ciphertext: string;
    iv: string;
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UINT = /^(?:0|[1-9]\d{0,79})$/;

function exactKeys(value: object, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  return actual.length === sorted.length &&
    actual.every((key, index) => key === sorted[index]);
}

export function isValidPrivacyPortfolioSnapshotDetails(
  value: unknown,
  expectedId?: string,
): value is PrivacyPortfolioSnapshotDetailsV1 {
  if (typeof value !== "object" || value === null || Array.isArray(value) ||
    !exactKeys(value, [
      "confirmedBalanceWei",
      "id",
      "priceUsd",
      "timestamp",
      "totalValueUsd",
      "version",
    ])) return false;
  const item = value as Partial<PrivacyPortfolioSnapshotDetailsV1>;
  return item.version === 1 &&
    typeof item.id === "string" && UUID.test(item.id) &&
    (!expectedId || item.id === expectedId) &&
    typeof item.timestamp === "number" && Number.isSafeInteger(item.timestamp) && item.timestamp >= 0 &&
    typeof item.confirmedBalanceWei === "string" && UINT.test(item.confirmedBalanceWei) &&
    typeof item.priceUsd === "number" && Number.isFinite(item.priceUsd) && item.priceUsd > 0 && item.priceUsd < 10_000_000 &&
    typeof item.totalValueUsd === "number" && Number.isFinite(item.totalValueUsd) && item.totalValueUsd >= 0 && item.totalValueUsd < 1e18;
}

export function isValidStoredPrivacyPortfolioSnapshot(
  value: unknown,
): value is StoredPrivacyPortfolioSnapshotV1 {
  if (typeof value !== "object" || value === null || Array.isArray(value) ||
    !exactKeys(value, ["createdAt", "encryptedDetails", "id", "keyId", "version"])) return false;
  const item = value as Partial<StoredPrivacyPortfolioSnapshotV1>;
  const encrypted = item.encryptedDetails;
  return item.version === 1 &&
    typeof item.id === "string" && UUID.test(item.id) &&
    typeof item.keyId === "string" && item.keyId.length > 0 && item.keyId.length <= 128 &&
    typeof item.createdAt === "number" && Number.isSafeInteger(item.createdAt) && item.createdAt >= 0 &&
    typeof encrypted === "object" && encrypted !== null && !Array.isArray(encrypted) &&
    exactKeys(encrypted, ["ciphertext", "iv", "scheme", "version"]) &&
    encrypted.version === 1 && encrypted.scheme === "privacy-portfolio-key" &&
    decodeBase64Exact(encrypted.iv, 12) !== null &&
    decodeBase64Bounded(encrypted.ciphertext, 17, 2_048) !== null;
}
