/**
 * Bankr API client for transaction submission, message signing, and job polling
 */

import { BANKR_API_BASE } from "@/constants/externalUrls";

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

/**
 * Submits a transaction directly via /agent/submit (synchronous, no polling)
 */
export async function submitTransactionDirect(
  apiKey: string,
  tx: TransactionParams,
  signal?: AbortSignal
): Promise<SubmitTransactionDirectResponse> {
  const body: Record<string, any> = {
    transaction: {
      to: tx.to || undefined,
      chainId: tx.chainId,
      value: hexToDecimalString(tx.value),
      data: tx.data && tx.data !== "0x" ? tx.data : undefined,
      gasPrice: tx.gasPrice || undefined,
      maxFeePerGas: tx.maxFeePerGas || undefined,
      maxPriorityFeePerGas: tx.maxPriorityFeePerGas || undefined,
    },
    waitForConfirmation: true,
  };

  // Remove undefined fields from transaction
  body.transaction = Object.fromEntries(
    Object.entries(body.transaction).filter(([_, v]) => v !== undefined)
  );

  const response = await fetch(`${API_BASE_URL}/agent/submit`, {
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
    throw new BankrApiError(
      `Failed to submit transaction: ${text}`,
      response.status
    );
  }

  return response.json();
}

/**
 * Signs a message or typed data via /agent/sign (synchronous)
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
    // params[0] is address, params[1] is the data hash — best-effort as personal_sign
    body = { signatureType: "personal_sign", message: params[1] };
  } else if (method.startsWith("eth_signTypedData")) {
    // params[0] is address, params[1] is typed data (may be stringified JSON)
    let typedData = params[1];
    if (typeof typedData === "string") {
      typedData = JSON.parse(typedData);
    }
    body = { signatureType: "eth_signTypedData_v4", typedData };
  } else {
    throw new BankrApiError(`Unsupported signing method: ${method}`);
  }

  const response = await fetch(`${API_BASE_URL}/agent/sign`, {
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
    throw new BankrApiError(`Signing failed: ${text}`, response.status);
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
