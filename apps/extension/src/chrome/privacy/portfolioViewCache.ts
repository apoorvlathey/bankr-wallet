import {
  getSessionItems,
  removeSessionItems,
  setSessionItems,
} from "../session/storage";
import { PRIVACY_POOLS_DEPLOYMENT } from "./deployment/manifest";

const CACHE_KEY = "privacyPortfolioViewV1";
const UINT = /^(?:0|[1-9]\d{0,79})$/;
const MAX_SNAPSHOTS = 193;

export interface ReleasedPrivacyPortfolio {
  confirmedBalanceWei: string;
  readyBalanceWei: string;
  maxPrivateSendWei: string;
  pendingBalanceWei: string;
  recoverableBalanceWei: string;
  attentionCount: number;
  lastUpdatedAt: number | null;
}

export interface ReleasedPrivacyPortfolioSeries {
  priceUsd: number | null;
  totalValueUsd: number | null;
  snapshots: Array<{ timestamp: number; totalValueUsd: number }>;
}

export interface ReleasedPrivacyPortfolioViewV1 {
  version: 1;
  profile: string;
  portfolio: ReleasedPrivacyPortfolio | null;
  series: ReleasedPrivacyPortfolioSeries | null;
}

function exactKeys(value: object, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  return actual.length === sorted.length &&
    actual.every((key, index) => key === sorted[index]);
}

function validWei(value: unknown): value is string {
  return typeof value === "string" && UINT.test(value);
}

function validNullableTimestamp(value: unknown): value is number | null {
  return value === null || (
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0
  );
}

function validNullableUsd(value: unknown): value is number | null {
  return value === null || (
    typeof value === "number" && Number.isFinite(value) && value >= 0 && value < 1e18
  );
}

function isReleasedPortfolio(value: unknown): value is ReleasedPrivacyPortfolio {
  if (typeof value !== "object" || value === null || Array.isArray(value) ||
    !exactKeys(value, [
      "attentionCount",
      "confirmedBalanceWei",
      "lastUpdatedAt",
      "maxPrivateSendWei",
      "pendingBalanceWei",
      "readyBalanceWei",
      "recoverableBalanceWei",
    ])) return false;
  const item = value as Partial<ReleasedPrivacyPortfolio>;
  if (!(validWei(item.confirmedBalanceWei) &&
    validWei(item.readyBalanceWei) &&
    validWei(item.maxPrivateSendWei) &&
    validWei(item.pendingBalanceWei) &&
    validWei(item.recoverableBalanceWei) &&
    typeof item.attentionCount === "number" &&
    Number.isSafeInteger(item.attentionCount) && item.attentionCount >= 0 &&
    item.attentionCount <= 256 &&
    validNullableTimestamp(item.lastUpdatedAt))) return false;
  const confirmed = BigInt(item.confirmedBalanceWei);
  const ready = BigInt(item.readyBalanceWei);
  return ready <= confirmed &&
    BigInt(item.maxPrivateSendWei) <= ready &&
    BigInt(item.pendingBalanceWei) <= confirmed &&
    BigInt(item.recoverableBalanceWei) <= confirmed;
}

function isReleasedSeries(value: unknown): value is ReleasedPrivacyPortfolioSeries {
  if (typeof value !== "object" || value === null || Array.isArray(value) ||
    !exactKeys(value, ["priceUsd", "snapshots", "totalValueUsd"])) return false;
  const item = value as Partial<ReleasedPrivacyPortfolioSeries>;
  if (!validNullableUsd(item.priceUsd) || !validNullableUsd(item.totalValueUsd) ||
    !Array.isArray(item.snapshots) || item.snapshots.length > MAX_SNAPSHOTS) return false;
  let previousTimestamp = -1;
  return item.snapshots.every((snapshot) => {
    if (!(
    typeof snapshot === "object" && snapshot !== null && !Array.isArray(snapshot) &&
    exactKeys(snapshot, ["timestamp", "totalValueUsd"]) &&
    validNullableTimestamp((snapshot as { timestamp?: unknown }).timestamp) &&
    (snapshot as { timestamp: number | null }).timestamp !== null &&
    validNullableUsd((snapshot as { totalValueUsd?: unknown }).totalValueUsd) &&
    (snapshot as { totalValueUsd: number | null }).totalValueUsd !== null
    )) return false;
    const timestamp = (snapshot as { timestamp: number }).timestamp;
    if (timestamp <= previousTimestamp) return false;
    previousTimestamp = timestamp;
    return true;
  });
}

export function parseReleasedPrivacyPortfolioView(
  value: unknown,
): ReleasedPrivacyPortfolioViewV1 | null {
  if (typeof value !== "object" || value === null || Array.isArray(value) ||
    !exactKeys(value, ["portfolio", "profile", "series", "version"])) return null;
  const item = value as Partial<ReleasedPrivacyPortfolioViewV1>;
  if (item.version !== 1 || item.profile !== PRIVACY_POOLS_DEPLOYMENT.profile ||
    (item.portfolio !== null && !isReleasedPortfolio(item.portfolio)) ||
    (item.series !== null && !isReleasedSeries(item.series))) return null;
  return item as ReleasedPrivacyPortfolioViewV1;
}

let updateLock = Promise.resolve();

export async function readReleasedPrivacyPortfolioView(): Promise<ReleasedPrivacyPortfolioViewV1 | null> {
  const stored = await getSessionItems<unknown>(CACHE_KEY);
  return parseReleasedPrivacyPortfolioView(stored[CACHE_KEY]);
}

function updateReleasedView(
  update: (current: ReleasedPrivacyPortfolioViewV1) => ReleasedPrivacyPortfolioViewV1,
): Promise<void> {
  updateLock = updateLock.catch(() => undefined).then(async () => {
    const current = await readReleasedPrivacyPortfolioView() ?? {
      version: 1,
      profile: PRIVACY_POOLS_DEPLOYMENT.profile,
      portfolio: null,
      series: null,
    };
    await setSessionItems({ [CACHE_KEY]: update(current) });
  });
  return updateLock;
}

export function storeReleasedPrivacyPortfolio(
  portfolio: ReleasedPrivacyPortfolio,
): Promise<void> {
  return updateReleasedView((current) => ({ ...current, portfolio }));
}

export function storeReleasedPrivacyPortfolioSeries(
  series: ReleasedPrivacyPortfolioSeries,
): Promise<void> {
  return updateReleasedView((current) => ({ ...current, series }));
}

export async function clearReleasedPrivacyPortfolioView(): Promise<void> {
  await updateLock.catch(() => undefined);
  await removeSessionItems(CACHE_KEY);
}
