import type { Erc7715MappedCaveat } from "./caveatDefinitions";
import type { Erc7715SupportedPermissionType } from "./permissionTypes";

export type Hex = `0x${string}`;
export type Address = Hex;

export type Erc7715PermissionRequest = {
  chainId: Hex;
  from: Address;
  to: Address;
  permission: {
    type: Erc7715SupportedPermissionType;
    isAdjustmentAllowed: boolean;
    justification?: string;
    data: Record<string, unknown>;
  };
  rules?: { type: string; data: Record<string, unknown> }[];
};

export type Erc7715PermissionResponse = Erc7715PermissionRequest & {
  context: Hex;
  dependencies: { factory: Hex; factoryData: Hex }[];
  delegationManager: Address;
};

export type Erc7710Delegation = {
  delegate: Address;
  delegator: Address;
  authority: Hex;
  caveats: { enforcer: Address; terms: Hex; args: Hex }[];
  salt: Hex;
  signature: Hex;
};

export type Erc7710DelegationTypedData = {
  types: Record<string, { name: string; type: string }[]>;
  primaryType: "Delegation";
  domain: {
    name: "DelegationManager";
    version: "1";
    chainId: number;
    verifyingContract: Address;
  };
  message: {
    delegate: Address;
    delegator: Address;
    authority: Hex;
    caveats: { enforcer: Address; terms: Hex }[];
    salt: string;
  };
};

export interface PendingErc7715PermissionRequest {
  id: string;
  origin: string;
  favicon: string | null;
  timestamp: number;
  chainName: string;
  chainId: number;
  request: Erc7715PermissionRequest;
  permissionType: Erc7715SupportedPermissionType;
  caveats: Erc7715MappedCaveat[];
  accountId: string;
  accountAddress: string;
  accountType: "privateKey" | "seedPhrase";
  tabId?: number;
  frameId?: number;
  senderOrigin?: string;
  requestChainId?: number;
}

export interface Erc7715PermissionGrant {
  id: string;
  origin: string;
  favicon: string | null;
  senderOrigin?: string;
  createdAt: number;
  expiresAt: number | null;
  revokedAt?: number;
  status: "active" | "revoked";
  accountId: string;
  accountAddress: string;
  accountType: "privateKey" | "seedPhrase";
  chainId: number;
  chainName: string;
  permissionType: Erc7715SupportedPermissionType;
  request: Erc7715PermissionRequest;
  response: Erc7715PermissionResponse;
  caveats: Erc7715MappedCaveat[];
  delegation: Erc7710Delegation;
  typedData: Erc7710DelegationTypedData;
  contextHash: Hex;
}

export type Erc7715PermissionResult =
  | { success: true; result: Erc7715PermissionResponse[] }
  | { success: false; error: string };

export const ERC7715_PERMISSION_RESULT_PREFIX = "erc7715PermissionResult:";
