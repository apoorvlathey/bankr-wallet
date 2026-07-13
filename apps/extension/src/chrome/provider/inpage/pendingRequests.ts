type Resolver<T> = { resolve: (value: T) => void; reject: (error: Error) => void };

export const pendingTxCallbacks = new Map<string, Resolver<string>>();
export const pendingSignatureCallbacks = new Map<string, Resolver<string>>();
export const pendingRpcCallbacks = new Map<string, Resolver<any>>();
export const pendingWatchAssetCallbacks = new Map<string, Resolver<boolean>>();
export const pendingCapabilitiesCallbacks = new Map<string, Resolver<any>>();
export const pendingCallsStatusCallbacks = new Map<string, Resolver<any>>();

export const pendingAccountCallbacks = new Map<
  string,
  Resolver<string[]> & { method: "eth_accounts" | "eth_requestAccounts" }
>();

export const pendingBatchCallbacks = new Map<
  string,
  Resolver<any> & { params: unknown }
>();

export const pendingExecutionPermissionCallbacks = new Map<
  string,
  Resolver<any> & { method: string }
>();

let executionPermissionRequestInProgress = false;

export function isExecutionPermissionRequestInProgress(): boolean {
  return executionPermissionRequestInProgress;
}

export function setExecutionPermissionRequestInProgress(value: boolean): void {
  executionPermissionRequestInProgress = value;
}
