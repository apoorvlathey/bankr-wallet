import {
  BankrApiError,
  extractBankrErrorMessage,
  normalizeJobStatus,
  type JobStatus,
} from "./response";
import { bankrFetchText } from "./transport";

const BANKR_JOB_TIMEOUT_MS = 30_000;
const BANKR_JOB_RESPONSE_MAX_BYTES = 512 * 1024;

export async function getJobStatus(
  apiKey: string,
  jobId: string,
  signal?: AbortSignal,
): Promise<JobStatus> {
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(jobId)) {
    throw new BankrApiError("Invalid Bankr job ID");
  }
  const { response, text } = await bankrFetchText(
    `/agent/job/${jobId}`,
    {
      method: "GET",
      headers: { "X-API-Key": apiKey },
      signal,
    },
    {
      action: "job status",
      timeoutMs: BANKR_JOB_TIMEOUT_MS,
      maxBytes: BANKR_JOB_RESPONSE_MAX_BYTES,
    },
  );

  if (!response.ok) {
    throw new BankrApiError(
      `Failed to get job status: ${extractBankrErrorMessage(text)}`,
      response.status,
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new BankrApiError("Bankr returned invalid JSON for job status");
  }
  return normalizeJobStatus(payload);
}

export async function pollJobUntilComplete(
  apiKey: string,
  jobId: string,
  options: {
    pollInterval?: number;
    maxDuration?: number;
    onStatusUpdate?: (status: JobStatus) => void;
    signal?: AbortSignal;
  } = {},
): Promise<JobStatus> {
  const {
    pollInterval = 2000,
    maxDuration = 300000,
    onStatusUpdate,
    signal,
  } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < maxDuration) {
    if (signal?.aborted) {
      throw new DOMException("Transaction cancelled", "AbortError");
    }
    const status = await getJobStatus(apiKey, jobId, signal);
    onStatusUpdate?.(status);
    if (status.status === "completed" || status.status === "failed") {
      return status;
    }
    await sleep(pollInterval, signal);
  }
  throw new BankrApiError("Transaction timeout: exceeded maximum wait time");
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException("Cancelled", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, ms);
    const abort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new DOMException("Cancelled", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}
