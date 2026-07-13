import { InterfaceAbi } from "ethers";
import { SOURCIFY_BASE } from "@/constants/externalUrls";
import { fetchJsonBounded } from "@/chrome/network/boundedHttp";

interface SourcifyResponse {
  abi?: any[];
  compilation?: { name?: string };
  proxyResolution?: {
    isProxy: boolean;
    implementations?: { address: string; name?: string }[];
  };
}

/**
 * Fetch contract ABI from Sourcify v2 API.
 * No API key required. Supports 180+ chains.
 * For proxies, auto-resolves to the implementation ABI.
 */
export async function fetchContractAbi({
  address,
  chainId,
}: {
  address: string;
  chainId: number;
}): Promise<{ abi: InterfaceAbi; name: string }> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address) || !Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new Error("Invalid contract ABI lookup target");
  }
  const url = `${SOURCIFY_BASE}/${chainId}/${address}?fields=abi,compilation.name,proxyResolution`;
  const { response: res, data } = await fetchJsonBounded(
    url,
    { method: "GET" },
    { timeoutMs: 8_000, maxBytes: 4 * 1024 * 1024 },
  );

  if (!res.ok) {
    throw new Error(`Failed to fetch ABI for ${address} on chain ${chainId}`);
  }

  const parsed = data as SourcifyResponse;

  if (!parsed.abi || parsed.abi.length === 0) {
    throw new Error(`No ABI found for ${address} on chain ${chainId}`);
  }

  const name = parsed.compilation?.name ?? "";

  // If proxy, fetch the implementation's ABI
  if (parsed.proxyResolution?.isProxy && parsed.proxyResolution.implementations?.length) {
    const impl = parsed.proxyResolution.implementations[0];
    try {
      if (!/^0x[0-9a-fA-F]{40}$/.test(impl.address)) {
        throw new Error("Invalid proxy implementation address");
      }
      const implUrl = `${SOURCIFY_BASE}/${chainId}/${impl.address}?fields=abi,compilation.name`;
      const { response: implRes, data: implPayload } = await fetchJsonBounded(
        implUrl,
        { method: "GET" },
        { timeoutMs: 8_000, maxBytes: 4 * 1024 * 1024 },
      );
      if (implRes.ok) {
        const implData = implPayload as SourcifyResponse;
        if (implData.abi && implData.abi.length > 0) {
          return {
            abi: implData.abi,
            name: implData.compilation?.name ?? impl.name ?? name,
          };
        }
      }
    } catch {
      // Fall through to return proxy ABI
    }
  }

  return { abi: parsed.abi, name };
}
