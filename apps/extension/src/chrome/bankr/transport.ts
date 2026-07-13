import { BANKR_API_BASE } from "@/constants/externalUrls";
import {
  fetchTextBounded,
  HttpRequestTimeoutError,
  HttpResponseTooLargeError,
} from "../network/boundedHttp";
import { BankrApiError } from "./response";

const BANKR_SIGNER_TIMEOUT_MS = 45_000;
const BANKR_RESPONSE_MAX_BYTES = 256 * 1024;

export async function bankrFetchText(
  path: string,
  init: RequestInit,
  options: { timeoutMs?: number; maxBytes?: number; action: string },
): Promise<{ response: Response; text: string }> {
  try {
    return await fetchTextBounded(
      `${BANKR_API_BASE}${path}`,
      { ...init, redirect: "error" },
      {
        timeoutMs: options.timeoutMs ?? BANKR_SIGNER_TIMEOUT_MS,
        maxBytes: options.maxBytes ?? BANKR_RESPONSE_MAX_BYTES,
      },
    );
  } catch (error) {
    if (error instanceof HttpRequestTimeoutError) {
      throw new BankrApiError(`Bankr ${options.action} timed out`);
    }
    if (error instanceof HttpResponseTooLargeError) {
      throw new BankrApiError(
        `Bankr returned an oversized ${options.action} response`,
      );
    }
    throw error;
  }
}
