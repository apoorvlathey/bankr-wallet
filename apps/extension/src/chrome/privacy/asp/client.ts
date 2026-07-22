import { fetchJsonBounded } from "../../network/boundedHttp";
import { PRIVACY_POOLS_DEPLOYMENT } from "../deployment/manifest";
import {
  MAX_PRIVACY_ASP_LABELS_PER_REQUEST,
  parsePrivacyAspDeposits,
  parsePrivacyAspLeaves,
  parsePrivacyAspRoots,
  parsePrivacyFieldElement,
  type PrivacyAspDeposit,
  type PrivacyAspLeaves,
  type PrivacyAspRoots,
} from "./types";

const ASP_TIMEOUT_MS = 12_000;
const ROOTS_RESPONSE_BYTES = 8_192;
const LEAVES_RESPONSE_BYTES = 2_000_000;
const DEPOSITS_RESPONSE_BYTES = 512_000;

function endpoint(path: "mt-roots" | "mt-leaves" | "deposits-by-label"): string {
  return `${PRIVACY_POOLS_DEPLOYMENT.services.aspBaseUrl}/${PRIVACY_POOLS_DEPLOYMENT.chainId}/public/${path}`;
}

function requestHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    Accept: "application/json",
    "X-Pool-Scope": PRIVACY_POOLS_DEPLOYMENT.scope.toString(),
    ...extra,
  };
}

async function getJson(
  path: "mt-roots" | "mt-leaves" | "deposits-by-label",
  headers: Record<string, string>,
  maxBytes: number,
): Promise<unknown> {
  const { response, data } = await fetchJsonBounded(
    endpoint(path),
    { method: "GET", headers },
    {
      timeoutMs: ASP_TIMEOUT_MS,
      maxBytes,
      invalidMessage: "ASP returned invalid JSON",
    },
  );
  if (!response.ok) throw new Error("ASP request failed");
  return data;
}

export async function fetchPrivacyAspRoots(): Promise<PrivacyAspRoots> {
  return parsePrivacyAspRoots(
    await getJson("mt-roots", requestHeaders(), ROOTS_RESPONSE_BYTES),
  );
}

export async function fetchPrivacyAspLeaves(): Promise<PrivacyAspLeaves> {
  return parsePrivacyAspLeaves(
    await getJson("mt-leaves", requestHeaders(), LEAVES_RESPONSE_BYTES),
  );
}

export async function fetchPrivacyAspDepositsByLabel(
  labels: readonly string[],
): Promise<PrivacyAspDeposit[]> {
  if (
    labels.length === 0 ||
    labels.length > MAX_PRIVACY_ASP_LABELS_PER_REQUEST
  ) {
    throw new Error("Invalid ASP label request");
  }
  const normalized = labels.map((label) => {
    const parsed = parsePrivacyFieldElement(label);
    if (parsed === null) throw new Error("Invalid ASP label request");
    return parsed.toString();
  });
  if (new Set(normalized).size !== normalized.length) {
    throw new Error("Invalid ASP label request");
  }
  const requested = new Set(normalized);
  const deposits = parsePrivacyAspDeposits(
    await getJson(
      "deposits-by-label",
      requestHeaders({ "X-Labels": normalized.join(",") }),
      DEPOSITS_RESPONSE_BYTES,
    ),
  );
  if (deposits.some((deposit) => !requested.has(BigInt(deposit.label).toString()))) {
    throw new Error("ASP returned an unrequested label");
  }
  return deposits;
}
