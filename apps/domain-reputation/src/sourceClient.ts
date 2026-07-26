import { parsePhishingConfig } from "./validation.js";
import type { LegacyPhishingConfig } from "./types.js";

export const SOURCE_URL =
  "https://raw.githubusercontent.com/MetaMask/eth-phishing-detect/main/src/config.json";
const SOURCE_TIMEOUT_MS = 15_000;
const SOURCE_MAX_BYTES = 8 * 1024 * 1024;

export type SourceFetchResult =
  | { kind: "not-modified" }
  | { kind: "updated"; config: LegacyPhishingConfig; etag: string | null };

async function readTextBounded(response: Response): Promise<string> {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > SOURCE_MAX_BYTES) throw new Error("source response is too large");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > SOURCE_MAX_BYTES) {
      await reader.cancel();
      throw new Error("source response is too large");
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

export async function fetchSourceConfig(
  etag: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<SourceFetchResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SOURCE_TIMEOUT_MS);
  try {
    const response = await fetchImpl(SOURCE_URL, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": "walletchan-domain-reputation",
        ...(etag ? { "if-none-match": etag } : {}),
      },
      redirect: "error",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
    });
    if (response.status === 304) return { kind: "not-modified" };
    if (!response.ok) throw new Error(`source returned HTTP ${response.status}`);
    let payload: unknown;
    try {
      payload = JSON.parse(await readTextBounded(response));
    } catch (error) {
      if (error instanceof SyntaxError) throw new Error("source returned invalid JSON");
      throw error;
    }
    const config = parsePhishingConfig(payload);
    if (!config) throw new Error("source returned an unsupported configuration");
    return {
      kind: "updated",
      config,
      etag: response.headers.get("etag"),
    };
  } finally {
    clearTimeout(timeout);
  }
}
