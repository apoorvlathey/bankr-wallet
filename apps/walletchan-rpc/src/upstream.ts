import type { RuntimeChain } from "./chains.js";
import type { JsonRpcRequest, JsonRpcResponse } from "./rpcTypes.js";
import { errorResponse } from "./rpcTypes.js";

export async function forwardToUpstream(
  request: JsonRpcRequest,
  chain: RuntimeChain,
  timeoutMs: number,
): Promise<JsonRpcResponse> {
  try {
    const response = await fetch(chain.rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...request, jsonrpc: "2.0" }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    const data = (await response.json()) as JsonRpcResponse;
    if (!response.ok) {
      return errorResponse(
        request.id ?? null,
        -32603,
        `Upstream RPC error on ${chain.name}: ${response.status} ${response.statusText}`,
      );
    }

    return data;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to reach upstream RPC";
    return errorResponse(request.id ?? null, -32603, `Upstream RPC error on ${chain.name}: ${message}`);
  }
}
