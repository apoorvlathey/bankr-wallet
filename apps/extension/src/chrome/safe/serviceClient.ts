import { getAddress } from "viem";
import { getSafeServiceChain } from "./serviceRegistry";
import type { SafeAddress, SafeOwnerConfirmation, SafeProposalRecord } from "./types";

const TIMEOUT_MS = 12_000;
const MAX_RESPONSE_CHARS = 2 * 1024 * 1024;
const RATE_LIMIT_RETRY_MS = 1_200;

export class SafeServiceError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "SafeServiceError";
  }
}

async function request(input: {
  method?: "GET" | "POST";
  chainId: number;
  op: "discover" | "info" | "pending" | "transaction" | "status" | "propose" | "confirm";
  address?: string;
  hash?: string;
  body?: unknown;
}): Promise<unknown> {
  const service = await getSafeServiceChain(input.chainId);
  if (!service) {
    throw new SafeServiceError("Safe service unavailable for network", 404);
  }
  const fetchJson = async (url: string): Promise<unknown> => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const response = await fetch(url, {
          method: input.method ?? "GET",
          headers: input.body === undefined ? undefined : { "Content-Type": "application/json" },
          body: input.body === undefined ? undefined : JSON.stringify(input.body),
          signal: controller.signal,
          cache: "no-store",
          credentials: "omit",
          redirect: "error",
          referrerPolicy: "no-referrer",
        });
        const text = await response.text();
        if (text.length > MAX_RESPONSE_CHARS) throw new Error("Safe service response is too large");
        if (response.status === 429 && attempt === 0) {
          await new Promise<void>((resolve) => setTimeout(resolve, RATE_LIMIT_RETRY_MS));
          continue;
        }
        if (response.ok && !text.trim()) return null;
        let payload: any;
        try { payload = JSON.parse(text); } catch {
          if (!response.ok) throw new SafeServiceError("Safe service request failed", response.status);
          throw new Error("Safe service returned invalid JSON");
        }
        if (!response.ok) {
          const message = [payload?.error, payload?.error_msg, payload?.message]
            .find((value) => typeof value === "string");
          throw new SafeServiceError(message ?? "Safe service request failed", response.status);
        }
        return payload;
      } finally {
        clearTimeout(timeout);
      }
    }
    throw new SafeServiceError("Safe service rate limit exceeded", 429);
  };

  return fetchJson(`${service.transactionService}${serviceEndpoint(input)}`);
}

function serviceEndpoint(input: {
  op: "discover" | "info" | "pending" | "transaction" | "status" | "propose" | "confirm";
  address?: string;
  hash?: string;
}): string {
  const address = input.address ? getAddress(input.address) : null;
  if (input.op === "discover" && address) return `/api/v1/owners/${address}/safes/`;
  if (input.op === "info" && address) return `/api/v1/safes/${address}/`;
  if (input.op === "pending" && address) return `/api/v1/safes/${address}/multisig-transactions/?executed=false&limit=100`;
  if ((input.op === "transaction" || input.op === "status") && input.hash) {
    return `/api/v1/multisig-transactions/${input.hash.toLowerCase()}/`;
  }
  if (input.op === "propose" && address) {
    return `/api/v1/safes/${address}/multisig-transactions/`;
  }
  if (input.op === "confirm" && input.hash) {
    return `/api/v1/multisig-transactions/${input.hash.toLowerCase()}/confirmations/`;
  }
  throw new Error("Unsupported Safe service operation");
}

export const discoverSafesByOwner = (chainId: number, owner: SafeAddress) =>
  request({ chainId, op: "discover", address: owner });
export const fetchSafeInfo = (chainId: number, safe: SafeAddress) =>
  request({ chainId, op: "info", address: safe });
export const fetchSafePendingTransactions = (chainId: number, safe: SafeAddress) =>
  request({ chainId, op: "pending", address: safe });
export const fetchSafeServiceTransaction = (chainId: number, safeTxHash: string) =>
  request({ chainId, op: "transaction", hash: safeTxHash });

export function publishSafeProposal(proposal: SafeProposalRecord, confirmation: SafeOwnerConfirmation) {
  return request({
    method: "POST",
    chainId: proposal.chainId,
    op: "propose",
    address: proposal.safeAddress,
    body: {
      ...proposal.transaction,
      to: getAddress(proposal.transaction.to),
      gasToken: getAddress(proposal.transaction.gasToken),
      refundReceiver: getAddress(proposal.transaction.refundReceiver),
      contractTransactionHash: proposal.safeTxHash,
      sender: getAddress(confirmation.ownerAddress),
      signature: confirmation.signature,
      origin: proposal.route.origin,
    },
  });
}

export function publishSafeConfirmation(proposal: SafeProposalRecord, confirmation: SafeOwnerConfirmation) {
  return request({
    method: "POST",
    chainId: proposal.chainId,
    op: "confirm",
    hash: proposal.safeTxHash,
    body: { signature: confirmation.signature },
  });
}
