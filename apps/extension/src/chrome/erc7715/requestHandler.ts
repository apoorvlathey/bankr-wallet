/** Provider-method dispatch and durable ERC-7715 prompt intake. */

import { getStoredResolvedChainById } from "@/lib/chains";
import type { Account } from "../types";
import {
  getSupportedExecutionPermissions,
  type Erc7715PermissionMethod,
} from "./methods";
import { getGrantedExecutionPermissions } from "./queries";
import {
  runWithErc7715PermissionRequestLock,
  syncErc7715PermissionRequestLockFromPendingRequests,
} from "./requestLock";
import { makePendingPermissionRequest } from "./pendingPermissionRequest";
import { assertRequestExecutionPermissionsEligible } from "./preflightEligibility";
import { parseHexChainId } from "./preflightNormalization";
import {
  savePendingErc7715PermissionRequest,
} from "./pendingRequestStorage";
import { waitForErc7715PermissionResult } from "./resultStorage";

export async function handleErc7715PermissionMethod({
  method,
  params,
  origin,
  chainId,
  favicon,
  senderWindowId,
  senderOrigin,
  tabId,
  frameId,
  account,
  requestId,
  waitForResult = true,
}: {
  method: Erc7715PermissionMethod;
  params: unknown[];
  origin?: string;
  chainId?: number;
  favicon?: string | null;
  senderWindowId?: number;
  senderOrigin?: string;
  tabId?: number;
  frameId?: number;
  account?: Account;
  requestId?: string;
  waitForResult?: boolean;
}): Promise<unknown> {
  switch (method) {
    case "wallet_getSupportedExecutionPermissions":
      return getSupportedExecutionPermissions();
    case "wallet_getGrantedExecutionPermissions":
      return getGrantedExecutionPermissions({ origin, chainId, account });
    case "wallet_requestExecutionPermissions":
      return runWithErc7715PermissionRequestLock(async () => {
        const eligibility = await assertRequestExecutionPermissionsEligible(
          params,
          account,
        );
        const requested = eligibility.requests[0];
        const requestChainId = parseHexChainId(requested.request.chainId);
        if (!requestChainId) {
          throw new Error("Permission request has invalid chainId");
        }
        if (chainId && chainId !== requestChainId) {
          throw new Error(
            `Permission request chainId ${requested.request.chainId} does not match the active chain`,
          );
        }

        const resolvedChain = await getStoredResolvedChainById(requestChainId);
        const pending = makePendingPermissionRequest({
          account: eligibility.account,
          origin: origin || "unknown",
          favicon,
          chainId: requestChainId,
          chainName: resolvedChain?.name || `Chain ${requestChainId}`,
          request: requested.request,
          permissionType: requested.permissionType,
          caveats: requested.caveats,
          tabId,
          frameId,
          senderOrigin,
          id: requestId,
        });
        const pendingRequests = await savePendingErc7715PermissionRequest(pending);
        syncErc7715PermissionRequestLockFromPendingRequests(pendingRequests);
        chrome.runtime
          .sendMessage({
            type: "newPendingErc7715PermissionRequest",
            request: pending,
          })
          .catch(() => {});

        const { openExtensionPopup } = await import("../txHandlers");
        await openExtensionPopup(senderWindowId).catch((error) => {
          console.warn(
            "[WalletChan] Failed to open permission confirmation",
            error,
          );
        });
        if (!waitForResult) return { id: pending.id };
        const result = await waitForErc7715PermissionResult(pending.id);
        if (!result.success) throw new Error(result.error);
        return result.result;
      });
  }
}
