import type { PendingTxRequest } from "../requests/pendingTxStorage";

export type Address = `0x${string}`;

export type Delegation7702Meta = PendingTxRequest["delegation7702Meta"];

export interface DelegationStatusResponse {
  success: true;
  delegate: Address | null;
  source: "onchain" | "default" | "none";
  needsAuthorization: boolean;
  onchainDelegate: Address | null;
  customDelegate: Address | null;
}

export interface DelegationStatusFailure {
  success: false;
  error: string;
}

export interface DelegationActionResult {
  success: boolean;
  txId?: string;
  error?: string;
}

export interface DelegateProbeResult {
  success: boolean;
  supports7821?: boolean;
  error?: string;
}
