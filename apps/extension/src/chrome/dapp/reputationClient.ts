import { WALLETCHAN_DOMAIN_REPUTATION_API } from "@/constants/externalUrls";
import { searchDappDirectory } from "../ensBrowsing/dappDirectorySearch";
import { fetchJsonBounded } from "../network/boundedHttp";
import { getPendingDappConnectionRequests } from "../requests/dappPermissionStorage";
import {
  combineDappReputation,
  parseMetaMaskReputationResult,
  type DappConnectionReputation,
  type MetaMaskReputationResult,
} from "./reputationModel";

const REPUTATION_TIMEOUT_MS = 4_000;
const REPUTATION_MAX_BYTES = 16 * 1_024;

async function fetchMetaMaskReputation(
  hostname: string,
): Promise<MetaMaskReputationResult | null> {
  try {
    const { response, data } = await fetchJsonBounded(
      WALLETCHAN_DOMAIN_REPUTATION_API,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hostname }),
      },
      {
        timeoutMs: REPUTATION_TIMEOUT_MS,
        maxBytes: REPUTATION_MAX_BYTES,
        invalidMessage: "Domain reputation service returned invalid JSON",
      },
    );
    return response.ok ? parseMetaMaskReputationResult(data) : null;
  } catch {
    return null;
  }
}

export async function getDappConnectionReputation(
  requestId: unknown,
): Promise<
  | { success: true; reputation: DappConnectionReputation }
  | { success: false; error: string }
> {
  if (
    typeof requestId !== "string" ||
    requestId.length === 0 ||
    requestId.length > 256
  ) {
    return { success: false, error: "Invalid connection request" };
  }
  const pending = (await getPendingDappConnectionRequests()).find(
    (request) => request.id === requestId,
  );
  if (!pending) {
    return { success: false, error: "Connection request not found" };
  }

  const [metaMaskResult, directoryResult] = await Promise.allSettled([
    fetchMetaMaskReputation(pending.hostname),
    searchDappDirectory(pending.hostname),
  ]);
  const metaMask =
    metaMaskResult.status === "fulfilled" ? metaMaskResult.value : null;
  const directory =
    directoryResult.status === "fulfilled" ? directoryResult.value : null;
  return {
    success: true,
    reputation: combineDappReputation(
      pending.hostname,
      metaMask,
      directory,
    ),
  };
}
