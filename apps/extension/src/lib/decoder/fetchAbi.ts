import { InterfaceAbi } from "ethers";
import { SOURCIFY_BASE } from "@/constants/externalUrls";

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
  const url = `${SOURCIFY_BASE}/${chainId}/${address}?fields=abi,compilation.name,proxyResolution`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Failed to fetch ABI for ${address} on chain ${chainId}`);
  }

  const data: SourcifyResponse = await res.json();

  if (!data.abi || data.abi.length === 0) {
    throw new Error(`No ABI found for ${address} on chain ${chainId}`);
  }

  const name = data.compilation?.name ?? "";

  // If proxy, fetch the implementation's ABI
  if (data.proxyResolution?.isProxy && data.proxyResolution.implementations?.length) {
    const impl = data.proxyResolution.implementations[0];
    try {
      const implUrl = `${SOURCIFY_BASE}/${chainId}/${impl.address}?fields=abi,compilation.name`;
      const implRes = await fetch(implUrl);
      if (implRes.ok) {
        const implData: SourcifyResponse = await implRes.json();
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

  return { abi: data.abi, name };
}
