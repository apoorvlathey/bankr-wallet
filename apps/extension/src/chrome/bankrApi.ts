/**
 * Bankr API client for transaction submission, message signing, and job polling
 */

import { BANKR_API_BASE } from "@/constants/externalUrls";
import { normalizeBankrTypedDataChainId } from "./bankrApiUtils";

const API_BASE_URL = BANKR_API_BASE;

export interface TransactionParams {
  from: string;
  to: string | null;
  data?: string;
  value?: string;
  chainId: number;
  gas?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
}

export interface SubmitTransactionDirectResponse {
  success: boolean;
  transactionHash: string;
  status: "success" | "reverted" | "pending";
  blockNumber?: string;
  gasUsed?: string;
  signer?: string;
  chainId?: number;
}

export interface SignMessageResponse {
  success: boolean;
  signature: string;
  signer: string;
  signatureType: string;
}

export interface JobStatus {
  success?: boolean;
  jobId?: string;
  status: "pending" | "processing" | "completed" | "failed";
  prompt?: string;
  response?: string;
  statusUpdates?: Array<{
    message: string;
    timestamp: string;
  }>;
  result?: {
    txHash?: string;
    error?: string;
  };
}

export class BankrApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = "BankrApiError";
  }
}

// Bankr failure bodies are sometimes a plain string and sometimes a JSON
// envelope where the user-facing reason is buried in a nested, JSON-encoded
// `.error` field, e.g.
//   {"success":false,"signer":"0x...","error":"{\"error\":\"Invalid app ID or app secret.\"}"}
// Recursively unwrap `.error` / `.message` so callers get the deepest plain
// string ("Invalid app ID or app secret.") instead of the raw blob.
function extractBankrErrorMessage(text: string): string {
  const unwrap = (value: unknown, depth: number): string => {
    if (depth > 5) {
      return typeof value === "string" ? value : JSON.stringify(value);
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try {
          return unwrap(JSON.parse(trimmed), depth + 1);
        } catch {
          return value;
        }
      }
      return value;
    }
    if (value && typeof value === "object") {
      const obj = value as Record<string, unknown>;
      if (obj.error !== undefined) return unwrap(obj.error, depth + 1);
      if (typeof obj.message === "string") return obj.message;
      return JSON.stringify(value);
    }
    return String(value);
  };
  return unwrap(text, 0);
}

function extractBankrErrorPayloadMessage(payload: unknown): string | null {
  try {
    const serialized = JSON.stringify(payload);
    if (!serialized) return null;
    const extracted = extractBankrErrorMessage(serialized);
    return extracted && extracted !== serialized ? extracted : null;
  } catch {
    return null;
  }
}

function isEvmTransactionHash(value: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

function normalizeSubmitTransactionDirectResponse(
  payload: unknown
): SubmitTransactionDirectResponse {
  if (!payload || typeof payload !== "object") {
    throw new BankrApiError("Bankr returned an invalid transaction response");
  }

  const body = payload as Record<string, unknown>;
  const rawStatus = body.status;
  const status =
    rawStatus === "success" || rawStatus === "reverted" || rawStatus === "pending"
      ? rawStatus
      : null;

  if (!status) {
    throw new BankrApiError(
      extractBankrErrorPayloadMessage(payload) ||
        "Bankr returned a transaction response without a valid status",
    );
  }

  const success = body.success === true;
  const transactionHash =
    typeof body.transactionHash === "string" && body.transactionHash.trim()
      ? body.transactionHash.trim()
      : typeof body.txHash === "string" && body.txHash.trim()
        ? body.txHash.trim()
        : "";

  if (status !== "reverted" && !success) {
    throw new BankrApiError(
      extractBankrErrorPayloadMessage(payload) ||
        "Bankr transaction submission failed",
    );
  }

  if (!transactionHash) {
    throw new BankrApiError(
      status === "pending"
        ? "Bankr returned a pending transaction without a transaction hash"
        : `Bankr returned a ${status} transaction without a transaction hash`,
    );
  }

  if (!isEvmTransactionHash(transactionHash)) {
    throw new BankrApiError("Bankr returned an invalid transaction hash");
  }

  return {
    success,
    transactionHash,
    status,
    ...(typeof body.blockNumber === "string" ? { blockNumber: body.blockNumber } : {}),
    ...(typeof body.gasUsed === "string" ? { gasUsed: body.gasUsed } : {}),
    ...(typeof body.signer === "string" ? { signer: body.signer } : {}),
    ...(typeof body.chainId === "number" ? { chainId: body.chainId } : {}),
  };
}

/**
 * Submits a transaction directly via /wallet/submit (synchronous, no polling)
 */
export async function submitTransactionDirect(
  apiKey: string,
  tx: TransactionParams,
  signal?: AbortSignal
): Promise<SubmitTransactionDirectResponse> {
  // Bankr's /wallet/submit schema rejects any non-whitelisted key in
  // `params.transaction` (zod `unrecognized_keys`). Bankr handles gas
  // server-side, so we only forward to/value/data/chainId here. Any
  // `tx.gas` / `tx.gasPrice` / `tx.maxFeePerGas` / `tx.maxPriorityFeePerGas`
  // fields on the pending tx (from the dapp, our local sim, or the user's
  // tier picker) are intentionally dropped on this path — they only apply
  // to local-signing accounts (PK/Seed).
  const body: Record<string, any> = {
    transaction: {
      to: tx.to || undefined,
      chainId: tx.chainId,
      value: hexToDecimalString(tx.value),
      data: tx.data && tx.data !== "0x" ? tx.data : undefined,
    },
    waitForConfirmation: true,
  };

  // Remove undefined fields from transaction
  body.transaction = Object.fromEntries(
    Object.entries(body.transaction).filter(([, v]) => v !== undefined)
  );

  const response = await fetch(`${API_BASE_URL}/wallet/submit`, {
    method: "POST",
    headers: {
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });

  const text = await response.text();

  if (!response.ok) {
    throw new BankrApiError(
      `Failed to submit transaction: ${extractBankrErrorMessage(text)}`,
      response.status
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new BankrApiError("Bankr returned invalid JSON for transaction submission");
  }

  return normalizeSubmitTransactionDirectResponse(payload);
}

/**
 * Signs a message or typed data via /wallet/sign (synchronous)
 */
export async function signMessageViaApi(
  apiKey: string,
  method: string,
  params: any[],
  signal?: AbortSignal
): Promise<SignMessageResponse> {
  let body: Record<string, any>;

  if (method === "personal_sign") {
    // params[0] is hex message, params[1] is address
    const hexMsg = params[0];
    let message = hexMsg;
    // Decode hex to UTF-8 string for the API
    if (typeof hexMsg === "string" && hexMsg.startsWith("0x")) {
      try {
        const hex = hexMsg.slice(2);
        const bytes = new Uint8Array(
          hex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
        );
        message = new TextDecoder().decode(bytes);
      } catch {
        message = hexMsg;
      }
    }
    body = { signatureType: "personal_sign", message };
  } else if (method === "eth_sign") {
    // SECURITY: eth_sign signs an untyped raw digest and must stay rejected at
    // intake. Keep the old mapping visible as a reminder not to re-enable it.
    // params[0] is address, params[1] is the data hash.
    // body = { signatureType: "personal_sign", message: params[1] };
    throw new BankrApiError(
      "eth_sign is deprecated and unsafe; use personal_sign or eth_signTypedData_v4"
    );
  } else if (method.startsWith("eth_signTypedData")) {
    // params[0] is address, params[1] is typed data (may be stringified JSON)
    let typedData = params[1];
    if (typeof typedData === "string") {
      typedData = JSON.parse(typedData);
    }
    typedData = normalizeBankrTypedDataChainId(typedData);
    body = { signatureType: "eth_signTypedData_v4", typedData };
  } else {
    throw new BankrApiError(`Unsupported signing method: ${method}`);
  }

  const response = await fetch(`${API_BASE_URL}/wallet/sign`, {
    method: "POST",
    headers: {
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new BankrApiError(extractBankrErrorMessage(text), response.status);
  }

  return response.json();
}

/**
 * Polls the job status from the Bankr API
 */
export async function getJobStatus(
  apiKey: string,
  jobId: string,
  signal?: AbortSignal
): Promise<JobStatus> {
  const response = await fetch(`${API_BASE_URL}/agent/job/${jobId}`, {
    method: "GET",
    headers: {
      "X-API-Key": apiKey,
    },
    signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new BankrApiError(`Failed to get job status: ${text}`, response.status);
  }

  return response.json();
}

/**
 * Polls job status until completion or timeout
 */
export async function pollJobUntilComplete(
  apiKey: string,
  jobId: string,
  options: {
    pollInterval?: number; // ms
    maxDuration?: number; // ms
    onStatusUpdate?: (status: JobStatus) => void;
    signal?: AbortSignal;
  } = {}
): Promise<JobStatus> {
  const { pollInterval = 2000, maxDuration = 300000, onStatusUpdate, signal } = options;

  const startTime = Date.now();

  while (Date.now() - startTime < maxDuration) {
    // Check if cancelled
    if (signal?.aborted) {
      throw new DOMException("Transaction cancelled", "AbortError");
    }

    const status = await getJobStatus(apiKey, jobId, signal);

    if (onStatusUpdate) {
      onStatusUpdate(status);
    }

    if (status.status === "completed" || status.status === "failed") {
      return status;
    }

    await sleep(pollInterval);
  }

  throw new BankrApiError("Transaction timeout: exceeded maximum wait time");
}

/**
 * Converts hex value to decimal string (wei)
 */
function hexToDecimalString(hex: string | undefined): string {
  if (!hex || hex === "0x0" || hex === "0x") {
    return "0";
  }
  try {
    return BigInt(hex).toString();
  } catch {
    return "0";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
