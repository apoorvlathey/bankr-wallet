import { WALLETCHAN_CLEAR_SIGNING_API } from "@/constants/externalUrls";
import type { Erc7730Descriptor } from "@/lib/clearSigning/types";
import { fetchJsonBounded } from "../network/boundedHttp";
import type { DescriptorLookup } from "./types";

export const CLEAR_SIGNING_REQUEST_TIMEOUT_MS = 10_000;
export const CLEAR_SIGNING_RESPONSE_MAX_BYTES = 512 * 1024;

/** The only clear-signing descriptor network egress. */
export async function fetchClearSigningDescriptor(
  lookup: DescriptorLookup,
): Promise<Erc7730Descriptor | null> {
  const url = new URL(WALLETCHAN_CLEAR_SIGNING_API);
  url.searchParams.set("chainId", String(lookup.chainId));
  url.searchParams.set("address", lookup.address);
  url.searchParams.set("kind", lookup.kind);
  if (
    lookup.selector &&
    /^0x[0-9a-fA-F]{8}$/.test(lookup.selector)
  ) {
    url.searchParams.set("selector", lookup.selector.toLowerCase());
  }
  if (lookup.formatKey) url.searchParams.set("formatKey", lookup.formatKey);

  let response: Response;
  let data: unknown;
  try {
    const fetched = await fetchJsonBounded(
      url,
      { method: "GET" },
      {
        timeoutMs: CLEAR_SIGNING_REQUEST_TIMEOUT_MS,
        maxBytes: CLEAR_SIGNING_RESPONSE_MAX_BYTES,
        invalidMessage: "Clear-signing service returned invalid JSON",
      },
    );
    response = fetched.response;
    data = fetched.data;
  } catch (error) {
    console.warn("[clear-signing] network error:", error);
    return null;
  }
  if (response.status === 404) return null;
  if (!response.ok) {
    console.warn(
      `[clear-signing] fetch ${url.toString()} -> ${response.status}`,
    );
    return null;
  }
  if (data && typeof data === "object" && "descriptor" in data) {
    return (data as { descriptor: Erc7730Descriptor }).descriptor;
  }
  return null;
}
