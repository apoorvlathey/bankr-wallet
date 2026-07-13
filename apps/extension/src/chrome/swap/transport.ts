import { fetchTextBounded } from "../network/boundedHttp";

export async function fetchSwapJson<T>(
  url: string,
  options: { timeoutMs: number; maxBytes: number },
): Promise<{ response: Response; data: T }> {
  const { response, text } = await fetchTextBounded(
    url,
    { method: "GET" },
    options,
  );
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Swap API returned invalid JSON");
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Swap API returned an invalid response");
  }
  return { response, data: data as T };
}

export function swapApiError(
  data: { error?: unknown; reason?: unknown },
  status: number,
): string {
  const remote =
    typeof data.error === "string"
      ? data.error
      : typeof data.reason === "string"
        ? data.reason
        : `API error ${status}`;
  return remote.slice(0, 1_000);
}
