import { withStorageLock } from "../storageLock";
import { serializedJsonLength } from "../providerRequestLimits";

const STORAGE_KEY = "walletConnectPendingRequests";
const CHAIN_STORAGE_KEY = "walletConnectChainId";
const STORAGE_LOCK_KEY = `local:${STORAGE_KEY}`;
const WALLETCONNECT_REQUEST_EXPIRY_MS = 30 * 60 * 1000;
const WALLETCONNECT_CLAIM_EXPIRY_MS = 2 * 60 * 1000;
const MAX_WALLETCONNECT_TERMINAL_RESPONSE_CHARS = 1_000_000;
const MAX_WALLETCONNECT_TOPIC_CHARS = 512;
const MAX_WALLETCONNECT_METHOD_CHARS = 128;
export const MAX_WALLETCONNECT_PENDING_REQUESTS = 125;
export const MAX_WALLETCONNECT_PENDING_REQUESTS_PER_TOPIC = 25;

export type WalletConnectTerminalResponse =
  | { kind: "result"; value: unknown; timestamp: number }
  | { kind: "error"; code: number; message: string; timestamp: number };
export type WalletConnectTerminalResponseInput =
  | { kind: "result"; value: unknown }
  | { kind: "error"; code: number; message: string };

export interface WalletConnectPendingRequest {
  id: string;
  kind: "claim" | "transaction" | "signature" | "erc7715Permission";
  topic: string;
  requestId: number;
  method: string;
  timestamp: number;
  terminalResponse?: WalletConnectTerminalResponse;
}

export type WalletConnectRemoteRequestClaim =
  | { acquired: true; claimId: string }
  | { acquired: false; existing: WalletConnectPendingRequest };

type PendingRequestMap = Record<string, WalletConnectPendingRequest>;

function isPendingRequest(value: unknown): value is WalletConnectPendingRequest {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<WalletConnectPendingRequest>;
  return (
    typeof candidate.id === "string" &&
    candidate.id.length > 0 &&
    (candidate.kind === "claim" ||
      candidate.kind === "transaction" ||
      candidate.kind === "signature" ||
      candidate.kind === "erc7715Permission") &&
    typeof candidate.topic === "string" &&
    candidate.topic.length > 0 &&
    candidate.topic.length <= MAX_WALLETCONNECT_TOPIC_CHARS &&
    typeof candidate.requestId === "number" &&
    Number.isSafeInteger(candidate.requestId) &&
    typeof candidate.method === "string" &&
    candidate.method.length > 0 &&
    candidate.method.length <= MAX_WALLETCONNECT_METHOD_CHARS &&
    typeof candidate.timestamp === "number" &&
    Number.isFinite(candidate.timestamp) &&
    (candidate.terminalResponse === undefined ||
      isTerminalResponse(candidate.terminalResponse))
  );
}

function isTerminalResponse(value: unknown): value is WalletConnectTerminalResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<WalletConnectTerminalResponse>;
  if (
    typeof candidate.timestamp !== "number" ||
    !Number.isFinite(candidate.timestamp)
  ) {
    return false;
  }
  if (candidate.kind === "error") {
    const error = candidate as Partial<Extract<WalletConnectTerminalResponse, { kind: "error" }>>;
    return (
      typeof error.code === "number" &&
      Number.isFinite(error.code) &&
      typeof error.message === "string" &&
      error.message.length <= 1_000
    );
  }
  if (candidate.kind !== "result") return false;
  const result = candidate as Partial<Extract<WalletConnectTerminalResponse, { kind: "result" }>>;
  const length = serializedJsonLength(result.value);
  return (
    length !== null && length <= MAX_WALLETCONNECT_TERMINAL_RESPONSE_CHARS
  );
}

function activePendingRequests(value: unknown, now = Date.now()): PendingRequestMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      ([id, request]) =>
        isPendingRequest(request) &&
        request.id === id &&
        now - (request.terminalResponse?.timestamp ?? request.timestamp) <
          (request.kind === "claim" && !request.terminalResponse
            ? WALLETCONNECT_CLAIM_EXPIRY_MS
            : WALLETCONNECT_REQUEST_EXPIRY_MS),
    ),
  );
}

function sameRemoteRequest(
  request: WalletConnectPendingRequest,
  topic: string,
  requestId: number,
): boolean {
  return request.topic === topic && request.requestId === requestId;
}

function validateRemoteRequestIdentity(
  topic: unknown,
  requestId: unknown,
  method: unknown,
): void {
  if (
    typeof topic !== "string" ||
    !topic ||
    topic.length > MAX_WALLETCONNECT_TOPIC_CHARS
  ) {
    throw new Error("Invalid WalletConnect session topic");
  }
  if (typeof requestId !== "number" || !Number.isSafeInteger(requestId)) {
    throw new Error("Invalid WalletConnect request id");
  }
  if (
    typeof method !== "string" ||
    !method ||
    method.length > MAX_WALLETCONNECT_METHOD_CHARS
  ) {
    throw new Error("Invalid WalletConnect request method");
  }
}

function assertRequestCapacity(
  requests: PendingRequestMap,
  topic: string,
): void {
  const activeRequests = Object.values(requests);
  if (activeRequests.length >= MAX_WALLETCONNECT_PENDING_REQUESTS) {
    throw new Error("Too many pending WalletConnect requests");
  }
  if (
    activeRequests.filter((pending) => pending.topic === topic).length >=
    MAX_WALLETCONNECT_PENDING_REQUESTS_PER_TOPIC
  ) {
    throw new Error("This WalletConnect session has too many pending requests");
  }
}

export async function getWalletConnectChainId(): Promise<number | null> {
  const result = (await chrome.storage.local.get(CHAIN_STORAGE_KEY)) as {
    walletConnectChainId?: unknown;
  };
  const chainId = Number(result.walletConnectChainId);
  return Number.isInteger(chainId) && chainId > 0 ? chainId : null;
}

export async function saveWalletConnectChainId(chainId: number): Promise<void> {
  await chrome.storage.local.set({ [CHAIN_STORAGE_KEY]: chainId });
}

export async function getWalletConnectPendingRequests(): Promise<PendingRequestMap> {
  const result = (await chrome.storage.local.get(STORAGE_KEY)) as {
    walletConnectPendingRequests?: unknown;
  };
  return activePendingRequests(result.walletConnectPendingRequests);
}

export async function saveWalletConnectPendingRequest(
  request: WalletConnectPendingRequest,
): Promise<void> {
  await withStorageLock(STORAGE_LOCK_KEY, async () => {
    const requests = await getWalletConnectPendingRequests();
    if (requests[request.id]) {
      throw new Error("WalletConnect request route already exists");
    }
    if (
      Object.values(requests).some((pending) =>
        sameRemoteRequest(pending, request.topic, request.requestId),
      )
    ) {
      throw new Error("WalletConnect request is already pending");
    }
    assertRequestCapacity(requests, request.topic);
    requests[request.id] = request;
    await chrome.storage.local.set({ [STORAGE_KEY]: requests });
  });
}

/**
 * Atomically claims a remote JSON-RPC request before any account lookup,
 * pending persistence, or signing UI is created. The claim lives in the same
 * bounded/expiring route map as deferred requests, so MV3 worker restarts do
 * not reopen an already-pending request.
 */
export async function claimWalletConnectRemoteRequest(
  topic: string,
  requestId: number,
  method: string,
): Promise<WalletConnectRemoteRequestClaim> {
  validateRemoteRequestIdentity(topic, requestId, method);
  return withStorageLock(STORAGE_LOCK_KEY, async () => {
    const requests = await getWalletConnectPendingRequests();
    const existing = Object.values(requests).find((pending) =>
      sameRemoteRequest(pending, topic, requestId),
    );
    if (existing) return { acquired: false, existing };

    assertRequestCapacity(requests, topic);
    let claimId: string;
    do {
      claimId = `wc-claim:${crypto.randomUUID()}`;
    } while (requests[claimId]);
    requests[claimId] = {
      id: claimId,
      kind: "claim",
      topic,
      requestId,
      method,
      timestamp: Date.now(),
    };
    await chrome.storage.local.set({ [STORAGE_KEY]: requests });
    return { acquired: true, claimId };
  });
}

async function replaceWalletConnectClaimWithPendingRequest(
  claimId: string,
  request: WalletConnectPendingRequest,
): Promise<void> {
  await withStorageLock(STORAGE_LOCK_KEY, async () => {
    const requests = await getWalletConnectPendingRequests();
    const claim = requests[claimId];
    if (
      !claim ||
      claim.kind !== "claim" ||
      claim.topic !== request.topic ||
      claim.requestId !== request.requestId ||
      claim.method !== request.method
    ) {
      throw new Error("WalletConnect request claim is no longer valid");
    }
    if (requests[request.id]) {
      throw new Error("WalletConnect request route already exists");
    }
    delete requests[claimId];
    requests[request.id] = request;
    await chrome.storage.local.set({ [STORAGE_KEY]: requests });
  });
}

/**
 * A WalletConnect response route must never outlive a pending request that
 * failed to persist. This wrapper gives every routed request the same
 * compensating cleanup instead of relying on each ingress path to remember it.
 */
export async function withWalletConnectPendingRoute<T>(
  request: WalletConnectPendingRequest,
  persistPendingRequest: () => Promise<T>,
  claimId?: string,
): Promise<T> {
  if (claimId) {
    await replaceWalletConnectClaimWithPendingRequest(claimId, request);
  } else {
    await saveWalletConnectPendingRequest(request);
  }
  try {
    return await persistPendingRequest();
  } catch (error) {
    await removeWalletConnectPendingRequest(request.id).catch(() => undefined);
    throw error;
  }
}

function normalizeTerminalResponse(
  response: WalletConnectTerminalResponseInput,
): WalletConnectTerminalResponse | null {
  const terminal = { ...response, timestamp: Date.now() } as WalletConnectTerminalResponse;
  return isTerminalResponse(terminal) ? terminal : null;
}

/**
 * Persists the first terminal response for a remote request before relay
 * delivery. Later callers can only retrieve that same response; they cannot
 * replace a transaction hash/signature with a conflicting error (or vice
 * versa) after an ambiguous transport failure.
 */
export async function saveWalletConnectTerminalResponse(
  topic: string,
  requestId: number,
  response: WalletConnectTerminalResponseInput,
): Promise<WalletConnectPendingRequest | null> {
  const terminal = normalizeTerminalResponse(response);
  if (!terminal) {
    throw new Error("WalletConnect terminal response exceeds safe limits");
  }
  return withStorageLock(STORAGE_LOCK_KEY, async () => {
    const requests = await getWalletConnectPendingRequests();
    const pending = Object.values(requests).find((candidate) =>
      sameRemoteRequest(candidate, topic, requestId),
    );
    if (!pending) return null;
    if (pending.terminalResponse) return pending;

    const updated: WalletConnectPendingRequest = {
      ...pending,
      terminalResponse: terminal,
    };
    requests[pending.id] = updated;
    await chrome.storage.local.set({ [STORAGE_KEY]: requests });
    return updated;
  });
}

export async function getWalletConnectPendingRequest(
  id: string,
): Promise<WalletConnectPendingRequest | null> {
  const requests = await getWalletConnectPendingRequests();
  return requests[id] || null;
}

export async function removeWalletConnectPendingRequest(
  id: string,
): Promise<void> {
  await withStorageLock(STORAGE_LOCK_KEY, async () => {
    const requests = await getWalletConnectPendingRequests();
    if (!requests[id]) return;
    delete requests[id];
    await chrome.storage.local.set({ [STORAGE_KEY]: requests });
  });
}

export async function clearExpiredWalletConnectPendingRequests(): Promise<void> {
  await withStorageLock(STORAGE_LOCK_KEY, async () => {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const requests = activePendingRequests(stored[STORAGE_KEY]);
    // Persist the sanitized map so expired or malformed legacy entries do not
    // continue consuming Chrome storage even though reads already ignore them.
    await chrome.storage.local.set({ [STORAGE_KEY]: requests });
  });
}
