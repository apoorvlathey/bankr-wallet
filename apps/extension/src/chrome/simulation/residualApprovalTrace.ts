import {
  decodeAbiParameters,
  encodeFunctionData,
  getAddress,
  toHex,
  type Address,
  type Hex,
} from "viem";

import { fetchRpcEnvelope } from "../network/rpcClient";
import { getRpcUrl } from "../transactions/rpcConfig";
import { BATCH_SIMULATION_GAS_LIMIT } from "./constants";
import type { ApprovalSimulationCall } from "./approvalIntents";
import { TRACE_BATCH_SIMULATOR_ABI } from "./residualApprovalSimulatorAbis";
import { SIMULATOR_BYTECODE } from "./simulatorContract";

const TRANSFER_FROM_SELECTOR = "0x23b872dd";
const TRACE_TIMEOUT_MS = 5_000;
const TRACE_RESPONSE_BYTES = 2 * 1024 * 1024;
const TRACE_SUPPORTED_TTL_MS = 10 * 60 * 1_000;
const TRACE_TRANSIENT_TTL_MS = 60 * 1_000;
const MAX_TRACE_FRAMES = 512;
const MAX_TRACE_DEPTH = 32;

export interface TracedResidualApprovalCandidate {
  tokenAddress: Address;
  owner: Address;
  spender: Address;
  sourceCallIndex: number;
  evidence: "transferFromTrace";
}

export interface ResidualApprovalTraceDiscovery {
  candidates: TracedResidualApprovalCandidate[];
  incomplete: boolean;
}

interface TraceSupportState {
  status: "supported" | "unsupported" | "transient";
  checkedAt: number;
}

const traceSupport = new Map<string, TraceSupportState>();
const activeTraces = new Map<
  string,
  { key: string; promise: Promise<ResidualApprovalTraceDiscovery | null> }
>();

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalizedEndpoint(value: string): string | null {
  try {
    return new URL(value).href;
  } catch {
    return null;
  }
}

function cachedTraceStatus(endpoint: string): TraceSupportState["status"] | null {
  const cached = traceSupport.get(endpoint);
  if (!cached) return null;
  const ttl = cached.status === "transient"
    ? TRACE_TRANSIENT_TTL_MS
    : TRACE_SUPPORTED_TTL_MS;
  if (Date.now() - cached.checkedAt > ttl) {
    traceSupport.delete(endpoint);
    return null;
  }
  return cached.status;
}

function setTraceStatus(
  endpoint: string,
  status: TraceSupportState["status"],
): void {
  traceSupport.set(endpoint, { status, checkedAt: Date.now() });
}

function isUnsupportedError(error: Record<string, unknown>): boolean {
  const message = String(error.message ?? "").toLowerCase();
  return error.code === -32601 ||
    message.includes("method not found") ||
    message.includes("not supported") ||
    message.includes("does not exist") ||
    message.includes("unknown method");
}

function traceCallData(calls: ApprovalSimulationCall[]): Hex | null {
  try {
    return encodeFunctionData({
      abi: TRACE_BATCH_SIMULATOR_ABI,
      functionName: "executeBatchForTrace",
      args: [
        calls.map((call) => ({
          to: getAddress(call.to ?? ""),
          value: BigInt(call.value ?? "0x0"),
          data: (call.data ?? "0x") as Hex,
        })),
      ],
    });
  } catch {
    return null;
  }
}

function decodeTransferFrom(
  input: unknown,
): { owner: Address; amount: bigint } | null {
  if (
    typeof input !== "string" ||
    !/^0x[0-9a-fA-F]*$/.test(input) ||
    input.slice(0, 10).toLowerCase() !== TRANSFER_FROM_SELECTOR ||
    input.length < 202
  ) {
    return null;
  }
  try {
    const [owner, , amount] = decodeAbiParameters(
      [
        { type: "address" },
        { type: "address" },
        { type: "uint256" },
      ],
      `0x${input.slice(10)}` as Hex,
    );
    return { owner: getAddress(owner), amount };
  } catch {
    return null;
  }
}

function frameCalls(frame: Record<string, unknown>): unknown[] {
  return Array.isArray(frame.calls) ? frame.calls : [];
}

function candidateKey(candidate: TracedResidualApprovalCandidate): string {
  return [
    candidate.tokenAddress.toLowerCase(),
    candidate.owner.toLowerCase(),
    candidate.spender.toLowerCase(),
  ].join(":");
}

/**
 * Parse a Geth-compatible callTracer tree without trusting its shape or size.
 * Direct children of the simulator root correspond to the reviewed call list.
 */
export function parseResidualApprovalCallTrace(
  value: unknown,
  ownerAddress: string,
): ResidualApprovalTraceDiscovery {
  let owner: Address;
  try {
    owner = getAddress(ownerAddress);
  } catch {
    return { candidates: [], incomplete: true };
  }
  const root = object(value);
  if (!root) return { candidates: [], incomplete: true };

  let frames = 1;
  let incomplete = false;
  const byKey = new Map<string, TracedResidualApprovalCandidate>();

  function walk(
    raw: unknown,
    sourceCallIndex: number,
    depth: number,
    ancestorFailed: boolean,
  ): void {
    if (frames >= MAX_TRACE_FRAMES || depth > MAX_TRACE_DEPTH) {
      incomplete = true;
      return;
    }
    const frame = object(raw);
    if (!frame) {
      incomplete = true;
      return;
    }
    frames += 1;
    const failed = ancestorFailed ||
      (typeof frame.error === "string" && frame.error.length > 0);
    const callType = typeof frame.type === "string"
      ? frame.type.toUpperCase()
      : "";
    if (!failed && callType === "CALL") {
      const decoded = decodeTransferFrom(frame.input);
      if (decoded && decoded.amount > 0n &&
          decoded.owner.toLowerCase() === owner.toLowerCase()) {
        try {
          const candidate: TracedResidualApprovalCandidate = {
            tokenAddress: getAddress(String(frame.to ?? "")),
            owner,
            spender: getAddress(String(frame.from ?? "")),
            sourceCallIndex,
            evidence: "transferFromTrace",
          };
          byKey.set(candidateKey(candidate), candidate);
        } catch {
          incomplete = true;
        }
      }
    }
    for (const child of frameCalls(frame)) {
      walk(child, sourceCallIndex, depth + 1, failed);
    }
  }

  frameCalls(root).forEach((child, callIndex) => {
    walk(child, callIndex, 1, false);
  });
  return { candidates: [...byKey.values()], incomplete };
}

async function requestTrace(input: {
  calls: ApprovalSimulationCall[];
  ownerAddress: Address;
  blockNumber: bigint;
  rpcUrl: string;
  endpoint: string;
  data: Hex;
}): Promise<ResidualApprovalTraceDiscovery | null> {
  const storageWord = toHex(0n, { size: 32 });
  try {
    const response = await fetchRpcEnvelope(
      input.rpcUrl,
      "debug_traceCall",
      [
        {
          from: input.ownerAddress,
          to: input.ownerAddress,
          data: input.data,
          value: "0x0",
          gas: toHex(BATCH_SIMULATION_GAS_LIMIT),
        },
        toHex(input.blockNumber),
        {
          tracer: "callTracer",
          timeout: "5s",
          tracerConfig: { onlyTopCall: false, withLog: false },
          stateOverrides: {
            [input.ownerAddress]: {
              code: SIMULATOR_BYTECODE,
              balance: toHex(100n * 10n ** 18n),
              state: { [storageWord]: storageWord },
            },
          },
        },
      ],
      {
        timeoutMs: TRACE_TIMEOUT_MS,
        maxResponseBytes: TRACE_RESPONSE_BYTES,
        allowPrivateWithoutOrigin: true,
      },
    );
    if (response.error) {
      const error = object(response.error) ?? {};
      setTraceStatus(
        input.endpoint,
        isUnsupportedError(error) ? "unsupported" : "transient",
      );
      return null;
    }
    setTraceStatus(input.endpoint, "supported");
    return parseResidualApprovalCallTrace(
      response.result,
      input.ownerAddress,
    );
  } catch {
    setTraceStatus(input.endpoint, "transient");
    return null;
  }
}

/**
 * Run at most one bounded trace per configured RPC endpoint. Concurrent
 * duplicate requests share the same promise; unrelated requests skip tracing
 * rather than queueing more work against a rate-limited endpoint.
 */
export async function traceResidualApprovalCandidates(input: {
  calls: ApprovalSimulationCall[];
  ownerAddress: string;
  chainId: number;
  blockNumber: bigint;
}): Promise<ResidualApprovalTraceDiscovery | null> {
  let ownerAddress: Address;
  try {
    ownerAddress = getAddress(input.ownerAddress);
  } catch {
    return null;
  }
  const rpcUrl = await getRpcUrl(input.chainId);
  if (!rpcUrl) return null;
  const endpoint = normalizedEndpoint(rpcUrl);
  if (!endpoint || cachedTraceStatus(endpoint) === "unsupported" ||
      cachedTraceStatus(endpoint) === "transient") {
    return null;
  }
  const data = traceCallData(input.calls);
  if (!data) return null;
  const key = [
    ownerAddress.toLowerCase(),
    input.blockNumber.toString(),
    data,
  ].join(":");
  const active = activeTraces.get(endpoint);
  if (active) return active.key === key ? active.promise : null;

  const promise = requestTrace({
    ...input,
    ownerAddress,
    rpcUrl,
    endpoint,
    data,
  });
  activeTraces.set(endpoint, { key, promise });
  try {
    return await promise;
  } finally {
    if (activeTraces.get(endpoint)?.promise === promise) {
      activeTraces.delete(endpoint);
    }
  }
}

export function resetResidualApprovalTraceStateForTests(): void {
  traceSupport.clear();
  activeTraces.clear();
}
