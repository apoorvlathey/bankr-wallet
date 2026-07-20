export const SAFE_EXECUTION_RPC_WARNING =
  "RPC unavailable. WalletChan will keep checking automatically.";

export function isSafeExecutionRpcWarning(value: string | undefined): boolean {
  return value === SAFE_EXECUTION_RPC_WARNING;
}
