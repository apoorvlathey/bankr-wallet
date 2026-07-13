import type { Account } from "../types";
import type { Erc7715MappedCaveat } from "./caveatDefinitions";
import type { Erc7715SupportedPermissionType } from "./permissionTypes";
import type {
  Erc7715PermissionRequest,
  PendingErc7715PermissionRequest,
} from "./types";

type LocalSigningAccount = Extract<
  Account,
  { type: "privateKey" | "seedPhrase" }
>;

export function makePendingPermissionRequest({
  account,
  origin,
  favicon,
  chainId,
  chainName,
  request,
  permissionType,
  caveats,
  tabId,
  frameId,
  senderOrigin,
  id,
}: {
  account: LocalSigningAccount;
  origin: string;
  favicon?: string | null;
  chainId: number;
  chainName: string;
  request: Erc7715PermissionRequest;
  permissionType: Erc7715SupportedPermissionType;
  caveats: Erc7715MappedCaveat[];
  tabId?: number;
  frameId?: number;
  senderOrigin?: string;
  id?: string;
}): PendingErc7715PermissionRequest {
  return {
    id: id || crypto.randomUUID(),
    origin,
    favicon: favicon || null,
    timestamp: Date.now(),
    chainName,
    chainId,
    request,
    permissionType,
    caveats,
    accountId: account.id,
    accountAddress: account.address.toLowerCase(),
    accountType: account.type,
    tabId,
    frameId,
    senderOrigin,
    requestChainId: chainId,
  };
}
