export type JsonRpcId = string | number | null;

export interface JsonRpcRequest {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: unknown;
  params?: unknown;
}

export interface JsonRpcErrorPayload {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result?: unknown;
  error?: JsonRpcErrorPayload;
}

export class RpcError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly data?: unknown,
  ) {
    super(message);
  }
}

export function successResponse(id: JsonRpcId, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

export function errorResponse(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse {
  return {
    jsonrpc: "2.0",
    id,
    error: data === undefined ? { code, message } : { code, message, data },
  };
}

export function getErrorCode(error: unknown, fallback = -32000): number {
  if (error instanceof RpcError) return error.code;
  const code = (error as { code?: unknown })?.code;
  return typeof code === "number" && Number.isInteger(code) ? code : fallback;
}

export function getErrorMessage(error: unknown, fallback = "Request failed"): string {
  if (error instanceof Error && error.message) return error.message;
  const message = (error as { message?: unknown })?.message;
  return typeof message === "string" && message ? message : fallback;
}

export function getParamsArray(request: JsonRpcRequest): unknown[] {
  if (request.params === undefined) return [];
  if (Array.isArray(request.params)) return request.params;
  throw new RpcError(-32602, "params must be an array");
}
