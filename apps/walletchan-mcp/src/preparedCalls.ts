import { parseChainId } from "./chains.js";
import type { WalletCall } from "./rpcClient.js";

export interface PreparedCallExtraction {
  chain: unknown;
  calls: WalletCall[];
  sourcePaths: string[];
  warnings: string[];
}

interface CandidateCall {
  call: WalletCall;
  chain?: unknown;
  path: string;
}

const KNOWN_CONTAINER_KEYS = [
  "body",
  "result",
  "results",
  "response",
  "data",
  "transaction",
  "transactions",
  "tx",
  "txs",
  "call",
  "calls",
  "approval",
  "approvals",
  "approve",
  "swap",
  "deposit",
  "withdraw",
  "borrow",
  "repay",
  "payload",
  "operation",
];

const CHAIN_ID_TO_NAME = new Map<number, string>([
  [1, "ethereum"],
  [10, "optimism"],
  [137, "polygon"],
  [8453, "base"],
  [42161, "arbitrum"],
  [43114, "avalanche"],
  [84532, "base-sepolia"],
]);

export function extractPreparedCalls(
  prepared: unknown,
  explicitChain?: unknown,
): PreparedCallExtraction {
  const root = parseMaybeJson(prepared);
  const candidates = extractCandidates(root, "$", 0, new Set());
  if (candidates.length === 0) {
    throw new Error(
      "Could not find prepared calls. Expected transactions[], calls[], or objects with to/value/data fields.",
    );
  }

  const detectedChain = chooseChain(explicitChain, root, candidates);
  return {
    chain: detectedChain ?? "base",
    calls: candidates.map((candidate) => candidate.call),
    sourcePaths: candidates.map((candidate) => candidate.path),
    warnings: buildWarnings(root),
  };
}

function extractCandidates(
  value: unknown,
  path: string,
  depth: number,
  seen: Set<object>,
): CandidateCall[] {
  if (depth > 8) return [];

  const parsed = parseMaybeJson(value);
  if (Array.isArray(parsed)) {
    return parsed.flatMap((entry, index) =>
      extractCandidates(entry, `${path}[${index}]`, depth + 1, seen));
  }

  if (!isRecord(parsed)) return [];
  if (seen.has(parsed)) return [];
  seen.add(parsed);

  const direct = toCandidate(parsed, path);
  if (direct) return [direct];

  const candidates: CandidateCall[] = [];
  for (const key of KNOWN_CONTAINER_KEYS) {
    if (!(key in parsed)) continue;
    const nested = parsed[key];
    if (key === "data" && typeof nested === "string") continue;
    candidates.push(...extractCandidates(nested, `${path}.${key}`, depth + 1, seen));
  }
  return candidates;
}

function toCandidate(record: Record<string, unknown>, path: string): CandidateCall | null {
  const to = firstString(record, ["to", "target", "destination"]);
  if (!to || !isAddress(to)) return null;

  const data = firstString(record, ["data", "calldata", "input"]) ?? "0x";
  if (!isHex(data)) return null;

  const value = normalizeValue(record.value ?? record.valueWei ?? "0x0");
  if (value === null) return null;

  return {
    call: {
      to: to as `0x${string}`,
      value: value as `0x${string}`,
      data: data as `0x${string}`,
    },
    chain: record.chain ?? record.chainId,
    path,
  };
}

function chooseChain(
  explicitChain: unknown,
  root: unknown,
  candidates: CandidateCall[],
): unknown {
  if (explicitChain !== undefined && explicitChain !== null && explicitChain !== "") {
    return normalizeChain(explicitChain);
  }

  const rootRecord = isRecord(root) ? root : {};
  const values = [
    rootRecord.chain,
    rootRecord.chainId,
    ...candidates.map((candidate) => candidate.chain),
  ].filter((value) => value !== undefined && value !== null && value !== "");

  const normalized = values.map(normalizeChain).filter((value) => value !== undefined);
  const unique = new Set(normalized.map(String));
  if (unique.size > 1) {
    throw new Error(`Prepared response contains conflicting chain values: ${Array.from(unique).join(", ")}`);
  }
  return normalized[0];
}

function normalizeChain(value: unknown): unknown {
  const chainId = parseChainId(value);
  if (chainId) return CHAIN_ID_TO_NAME.get(chainId) ?? chainId;
  if (typeof value === "string" && value.trim()) return value.trim().toLowerCase();
  return undefined;
}

function buildWarnings(root: unknown): string[] {
  const warnings: string[] = [];
  const record = isRecord(root) ? root : {};

  if (record.simulationOk === false) {
    warnings.push("Prepared response reports simulationOk=false.");
  }
  if (Array.isArray(record.warnings)) {
    for (const warning of record.warnings) {
      if (typeof warning === "string") warnings.push(warning);
      else if (isRecord(warning) && typeof warning.message === "string") {
        warnings.push(warning.message);
      }
    }
  }
  if (isRecord(record.error) && typeof record.error.message === "string") {
    warnings.push(record.error.message);
  } else if (typeof record.error === "string") {
    warnings.push(record.error);
  }

  return warnings;
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) {
    return value;
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
}

function firstString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function normalizeValue(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return "0x0";
  if (typeof value === "number") {
    return Number.isInteger(value) && value >= 0 ? `0x${value.toString(16)}` : null;
  }
  if (typeof value === "bigint") {
    return value >= 0n ? `0x${value.toString(16)}` : null;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (/^0x[0-9a-fA-F]*$/.test(trimmed)) return trimmed;
  if (/^[0-9]+$/.test(trimmed)) return `0x${BigInt(trimmed).toString(16)}`;
  return null;
}

function isAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function isHex(value: string): boolean {
  return /^0x[0-9a-fA-F]*$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
