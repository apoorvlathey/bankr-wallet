export interface PreviewJsonRpcRequest {
  id?: unknown;
  method?: string;
  params?: unknown[];
}

const MULTICALL3_ADDRESS = "0xca11bde05977b3631167028862be2a173976ca11";
const PREVIEW_ETH_BALANCE = 2_812_260_000_000_000_000n;
const PREVIEW_USDC_BALANCE = 321_123_000n;
const PREVIEW_WCHAN_BALANCE = 120_456_000_000_000_000_000n;

function quantity(value: bigint): `0x${string}` {
  return `0x${value.toString(16)}`;
}

function uint256(value: bigint): `0x${string}` {
  return `0x${value.toString(16).padStart(64, "0")}`;
}

export function previewRpcResponse(
  request: PreviewJsonRpcRequest,
  customTokenAddress: string,
) {
  const base = { jsonrpc: "2.0", id: request.id ?? null };
  if (request.method === "eth_getBalance") {
    return { ...base, result: quantity(PREVIEW_ETH_BALANCE) };
  }
  if (request.method === "eth_call") {
    const call = request.params?.[0] as { to?: string } | undefined;
    if (call?.to?.toLowerCase() === MULTICALL3_ADDRESS) {
      return {
        ...base,
        error: { code: -32000, message: "Preview multicall fallback" },
      };
    }
    if (call?.to?.toLowerCase() === customTokenAddress.toLowerCase()) {
      return { ...base, result: uint256(PREVIEW_WCHAN_BALANCE) };
    }
    return { ...base, result: uint256(PREVIEW_USDC_BALANCE) };
  }
  if (request.method === "eth_chainId") {
    return { ...base, result: "0x2105" };
  }
  if (request.method === "eth_blockNumber") {
    return { ...base, result: "0x15f90a0" };
  }
  return { ...base, result: "0x0" };
}
