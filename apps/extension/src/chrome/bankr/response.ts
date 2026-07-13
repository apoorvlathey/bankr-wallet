export interface SubmitTransactionDirectResponse {
  success: boolean;
  transactionHash: string;
  status: "success" | "reverted" | "pending";
  blockNumber?: string;
  gasUsed?: string;
  signer: string;
  chainId: number;
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
  statusUpdates?: Array<{ message: string; timestamp: string }>;
  result?: { txHash?: string; error?: string };
}

export class BankrApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public outcomeUncertain = false,
  ) {
    super(message);
    this.name = "BankrApiError";
  }
}

export function extractBankrErrorMessage(text: string): string {
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
  const extracted = unwrap(text, 0)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .trim();
  return extracted.slice(0, 1_000) || "Bankr request failed";
}

function extractPayloadError(payload: unknown): string | null {
  try {
    const serialized = JSON.stringify(payload);
    if (!serialized) return null;
    const extracted = extractBankrErrorMessage(serialized);
    return extracted && extracted !== serialized ? extracted : null;
  } catch {
    return null;
  }
}

export function isEvmTransactionHash(value: unknown): value is string {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);
}

export function isEvmAddress(value: unknown): value is string {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);
}

function boundedString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length <= maxLength;
}

export function normalizeSubmitTransactionResponse(
  payload: unknown,
  expectedSigner: string,
  expectedChainId: number,
): SubmitTransactionDirectResponse {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new BankrApiError("Bankr returned an invalid transaction response");
  }
  const body = payload as Record<string, unknown>;
  const status =
    body.status === "success" ||
    body.status === "reverted" ||
    body.status === "pending"
      ? body.status
      : null;
  if (!status) {
    throw new BankrApiError(
      extractPayloadError(payload) ||
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
      extractPayloadError(payload) || "Bankr transaction submission failed",
    );
  }
  if (!isEvmTransactionHash(transactionHash)) {
    throw new BankrApiError("Bankr returned an invalid transaction hash");
  }
  if (!isEvmAddress(body.signer)) {
    throw new BankrApiError("Bankr returned an invalid transaction signer");
  }
  if (body.signer.toLowerCase() !== expectedSigner.toLowerCase()) {
    throw new BankrApiError(
      "Bankr transaction signer does not match the reviewed account",
    );
  }
  if (
    !Number.isSafeInteger(body.chainId) ||
    (body.chainId as number) <= 0 ||
    body.chainId !== expectedChainId
  ) {
    throw new BankrApiError("Bankr returned an unexpected transaction chain");
  }
  for (const field of ["blockNumber", "gasUsed"] as const) {
    const value = body[field];
    if (
      value !== undefined &&
      (!boundedString(value, 80) || !/^(?:0x[0-9a-fA-F]+|[0-9]+)$/.test(value))
    ) {
      throw new BankrApiError(`Bankr returned an invalid ${field}`);
    }
  }
  return {
    success,
    transactionHash,
    status,
    ...(typeof body.blockNumber === "string" ? { blockNumber: body.blockNumber } : {}),
    ...(typeof body.gasUsed === "string" ? { gasUsed: body.gasUsed } : {}),
    signer: body.signer,
    chainId: body.chainId as number,
  };
}

export function normalizeSignMessageResponse(
  payload: unknown,
  expectedSigner: string,
  expectedSignatureType: string,
): SignMessageResponse {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new BankrApiError("Bankr returned an invalid signature response");
  }
  const body = payload as Record<string, unknown>;
  if (body.success !== true) {
    throw new BankrApiError(
      extractPayloadError(payload) || "Bankr signing failed",
    );
  }
  if (typeof body.signature !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(body.signature)) {
    throw new BankrApiError("Bankr returned an invalid signature");
  }
  if (!isEvmAddress(body.signer)) {
    throw new BankrApiError("Bankr returned an invalid signer address");
  }
  if (body.signer.toLowerCase() !== expectedSigner.toLowerCase()) {
    throw new BankrApiError("Bankr signer does not match the reviewed account");
  }
  if (
    !boundedString(body.signatureType, 64) ||
    body.signatureType !== expectedSignatureType
  ) {
    throw new BankrApiError("Bankr returned an unexpected signature type");
  }
  return {
    success: true,
    signature: body.signature,
    signer: body.signer,
    signatureType: body.signatureType,
  };
}

export function normalizeJobStatus(payload: unknown): JobStatus {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new BankrApiError("Bankr returned an invalid job response");
  }
  const body = payload as Record<string, unknown>;
  if (
    body.status !== "pending" &&
    body.status !== "processing" &&
    body.status !== "completed" &&
    body.status !== "failed"
  ) {
    throw new BankrApiError("Bankr returned an invalid job status");
  }
  if (body.success !== undefined && typeof body.success !== "boolean") {
    throw new BankrApiError("Bankr returned an invalid job success flag");
  }
  for (const field of ["jobId", "prompt", "response"] as const) {
    if (body[field] !== undefined && !boundedString(body[field], 256 * 1024)) {
      throw new BankrApiError(`Bankr returned an invalid job ${field}`);
    }
  }
  let statusUpdates: JobStatus["statusUpdates"];
  if (body.statusUpdates !== undefined) {
    if (!Array.isArray(body.statusUpdates) || body.statusUpdates.length > 200) {
      throw new BankrApiError("Bankr returned invalid job status updates");
    }
    statusUpdates = body.statusUpdates.map((update) => {
      if (!update || typeof update !== "object" || Array.isArray(update)) {
        throw new BankrApiError("Bankr returned an invalid job status update");
      }
      const item = update as Record<string, unknown>;
      if (!boundedString(item.message, 10_000) || !boundedString(item.timestamp, 128)) {
        throw new BankrApiError("Bankr returned an invalid job status update");
      }
      return { message: item.message, timestamp: item.timestamp };
    });
  }
  let result: JobStatus["result"];
  if (body.result !== undefined) {
    if (!body.result || typeof body.result !== "object" || Array.isArray(body.result)) {
      throw new BankrApiError("Bankr returned an invalid job result");
    }
    const raw = body.result as Record<string, unknown>;
    if (raw.txHash !== undefined && !isEvmTransactionHash(raw.txHash)) {
      throw new BankrApiError("Bankr returned an invalid job transaction hash");
    }
    if (raw.error !== undefined && !boundedString(raw.error, 1_000)) {
      throw new BankrApiError("Bankr returned an invalid job error");
    }
    result = {
      ...(typeof raw.txHash === "string" ? { txHash: raw.txHash } : {}),
      ...(typeof raw.error === "string" ? { error: raw.error } : {}),
    };
  }
  return {
    ...(typeof body.success === "boolean" ? { success: body.success } : {}),
    ...(typeof body.jobId === "string" ? { jobId: body.jobId } : {}),
    status: body.status,
    ...(typeof body.prompt === "string" ? { prompt: body.prompt } : {}),
    ...(typeof body.response === "string" ? { response: body.response } : {}),
    ...(statusUpdates ? { statusUpdates } : {}),
    ...(result ? { result } : {}),
  };
}
