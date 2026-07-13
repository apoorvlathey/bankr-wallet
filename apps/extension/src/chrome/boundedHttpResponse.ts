export class HttpRequestTimeoutError extends Error {
  constructor(message = "Request timed out") {
    super(message);
    this.name = "HttpRequestTimeoutError";
  }
}

export class HttpResponseTooLargeError extends Error {
  constructor(message = "Response exceeded the allowed size") {
    super(message);
    this.name = "HttpResponseTooLargeError";
  }
}

function timedAbortSignal(
  callerSignal: AbortSignal | undefined,
  timeoutMs: number,
): {
  signal: AbortSignal;
  didTimeout: () => boolean;
  cleanup: () => void;
} {
  const controller = new AbortController();
  let timeout = false;
  const forwardAbort = () => controller.abort(callerSignal?.reason);
  if (callerSignal?.aborted) {
    forwardAbort();
  } else {
    callerSignal?.addEventListener("abort", forwardAbort, { once: true });
  }
  const timer = setTimeout(() => {
    timeout = true;
    controller.abort(new DOMException("Request timed out", "TimeoutError"));
  }, timeoutMs);
  return {
    signal: controller.signal,
    didTimeout: () => timeout,
    cleanup: () => {
      clearTimeout(timer);
      callerSignal?.removeEventListener("abort", forwardAbort);
    },
  };
}

export async function readResponseTextBounded(
  response: Response,
  maxBytes: number,
): Promise<string> {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    const declared = Number(contentLength);
    if (Number.isFinite(declared) && declared > maxBytes) {
      await response.body?.cancel().catch(() => {});
      throw new HttpResponseTooLargeError();
    }
  }

  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new HttpResponseTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/**
 * Fetch and consume a response under one deadline and one byte ceiling. The
 * deadline covers response headers and body streaming; caller abort semantics
 * remain distinguishable from a locally enforced timeout.
 */
export async function fetchTextBounded(
  input: RequestInfo | URL,
  init: RequestInit,
  options: {
    timeoutMs: number;
    maxBytes: number;
  },
): Promise<{ response: Response; text: string }> {
  const deadline = timedAbortSignal(init.signal ?? undefined, options.timeoutMs);
  try {
    const response = await fetch(input, {
      ...init,
      // This primitive is reserved for privileged extension egress. Reject
      // redirects and ambient browser state by default so a caller cannot
      // accidentally leak an API key, signed authorization, wallet address,
      // or extension referrer to a second origin.
      redirect: "error",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      cache: "no-store",
      signal: deadline.signal,
    });
    const text = await readResponseTextBounded(response, options.maxBytes);
    return { response, text };
  } catch (error) {
    if (deadline.didTimeout()) throw new HttpRequestTimeoutError();
    throw error;
  } finally {
    deadline.cleanup();
  }
}

export async function fetchJsonBounded(
  input: RequestInfo | URL,
  init: RequestInit,
  options: {
    timeoutMs: number;
    maxBytes: number;
    invalidMessage?: string;
  },
): Promise<{ response: Response; data: unknown }> {
  const { response, text } = await fetchTextBounded(input, init, options);
  try {
    return { response, data: JSON.parse(text) };
  } catch {
    throw new Error(options.invalidMessage || "Remote service returned invalid JSON");
  }
}

export function parseJsonObjectBounded(
  text: string,
  invalidMessage: string,
): Record<string, unknown> {
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(invalidMessage);
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(invalidMessage);
  }
  return payload as Record<string, unknown>;
}
