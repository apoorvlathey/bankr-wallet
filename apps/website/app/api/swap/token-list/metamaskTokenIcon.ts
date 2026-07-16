const METAMASK_TOKEN_ICON_BASE =
  "https://static.cx.metamask.io/api/v2/tokenIcons/assets/eip155";
const TOKEN_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

export function getMetaMaskTokenIconUrl(
  chainId: number,
  address: string,
): string | null {
  if (!Number.isSafeInteger(chainId) || chainId <= 0) return null;
  if (!TOKEN_ADDRESS_PATTERN.test(address)) return null;
  return `${METAMASK_TOKEN_ICON_BASE}/${chainId}/erc20/${address.toLowerCase()}.png`;
}

export async function resolveMetaMaskTokenIcon(
  chainId: number,
  address: string,
): Promise<string | null> {
  const url = getMetaMaskTokenIconUrl(chainId, address);
  if (!url) return null;

  try {
    const response = await fetch(url, {
      method: "HEAD",
      redirect: "error",
      signal: AbortSignal.timeout(5_000),
    });
    const contentType = response.headers.get("content-type")?.toLowerCase();
    return response.ok && contentType?.startsWith("image/png") ? url : null;
  } catch {
    return null;
  }
}
