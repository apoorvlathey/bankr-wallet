/** Master-only approval and first-action-safe rejection of permission prompts. */

import { assertErc7715PermissionEditIsAllowed } from "@/lib/erc7715PermissionEditing";
import { getAccountById } from "../accountStorage";
import {
  assertDelegatedAuthorityMasterAuthorization,
  captureDelegatedAuthorityMasterAuthorization,
} from "../delegatedAuthorityPolicy";
import { ERC7710_DELEGATION_MANAGER } from "./caveatDefinitions";
import {
  buildErc7710DelegationTypedData,
  buildSignedErc7710Delegation,
  encodeErc7710DelegationContext,
  hashErc7715PermissionContext,
  randomSaltHex,
} from "./delegationSigning";
import { commitErc7715GrantForPinnedAccount } from "./grantBoundary";
import { assertRequestExecutionPermissionsEligible } from "./preflightEligibility";
import { getPermissionExpirySeconds } from "./preflightNormalization";
import { runErc7715PermissionResolution } from "./resolution";
import { getLocalPrivateKeyForAccount } from "../localAccountKeyResolver";
import { signTypedData } from "../localSigner";
import { enforcePendingRequestAuthorizationAtConfirmation } from "../pendingRequestLifecycle";
import {
  ERC7715_PERMISSION_EXPIRY_MS,
  type Erc7715PermissionRequest,
  type Erc7715PermissionResponse,
  type Erc7715PermissionResult,
  type Hex,
} from "./types";
import { commitErc7715PermissionGrantApproval } from "./grantStorage";
import {
  getPendingErc7715PermissionRequestById,
  removePendingErc7715PermissionRequest,
} from "./pendingRequestStorage";
import { writeErc7715PermissionResult } from "./resultStorage";

export async function handleConfirmErc7715PermissionRequest(
  requestId: string,
  password: string,
  editedRequest?: Erc7715PermissionRequest,
): Promise<Erc7715PermissionResult> {
  return runErc7715PermissionResolution(requestId, async () => {
    const pending = await getPendingErc7715PermissionRequestById(requestId);
    if (!pending) {
      return { success: false, error: "Permission request is no longer pending" };
    }
    if (Date.now() - pending.timestamp > ERC7715_PERMISSION_EXPIRY_MS) {
      await removePendingErc7715PermissionRequest(requestId);
      const expired: Erc7715PermissionResult = {
        success: false,
        error: "Permission request expired",
      };
      await writeErc7715PermissionResult(requestId, expired);
      return expired;
    }

    try {
      const account = await getAccountById(pending.accountId);
      if (!account || account.address.toLowerCase() !== pending.accountAddress) {
        throw new Error("Pending permission request is no longer valid");
      }
      if (account.type !== "privateKey" && account.type !== "seedPhrase") {
        throw new Error(
          "wallet_requestExecutionPermissions requires a private key or seed phrase account",
        );
      }

      const expectedMasterAuthEpoch =
        await captureDelegatedAuthorityMasterAuthorization();
      const requestToApprove = editedRequest || pending.request;
      if (editedRequest) {
        assertErc7715PermissionEditIsAllowed(pending.request, editedRequest);
      }
      const eligibility = await assertRequestExecutionPermissionsEligible(
        [requestToApprove],
        account,
      );
      const approved = eligibility.requests[0];
      const privateKey = await getLocalPrivateKeyForAccount(account.id, password);
      if (!privateKey) throw new Error("Private key not found for account");

      const salt = randomSaltHex();
      const typedData = buildErc7710DelegationTypedData({
        chainId: pending.chainId,
        delegator: approved.request.from,
        delegate: approved.request.to,
        caveats: approved.caveats,
        salt,
      });
      const authorization =
        await enforcePendingRequestAuthorizationAtConfirmation(
          "erc7715Permission",
          pending,
        );
      if (!authorization.authorized) {
        return { success: false, error: authorization.error };
      }
      assertDelegatedAuthorityMasterAuthorization(expectedMasterAuthEpoch);
      const signature = (await signTypedData(
        privateKey,
        typedData,
        pending.chainId,
      )) as Hex;
      const delegation = buildSignedErc7710Delegation({
        typedData,
        caveats: approved.caveats,
        salt,
        signature,
      });
      const context = encodeErc7710DelegationContext([delegation]);
      const contextHash = hashErc7715PermissionContext(context);
      const response: Erc7715PermissionResponse = {
        ...approved.request,
        context,
        dependencies: [],
        delegationManager: ERC7710_DELEGATION_MANAGER,
      };

      const finalAuthorization =
        await enforcePendingRequestAuthorizationAtConfirmation(
          "erc7715Permission",
          pending,
        );
      if (!finalAuthorization.authorized) {
        return { success: false, error: finalAuthorization.error };
      }

      const result: Erc7715PermissionResult = {
        success: true,
        result: [response],
      };
      await commitErc7715GrantForPinnedAccount({
        pinned: {
          accountId: pending.accountId,
          accountAddress: pending.accountAddress,
          accountType: pending.accountType,
        },
        loadAccount: getAccountById,
        commit: () =>
          commitErc7715PermissionGrantApproval({
            grant: {
              id: `${pending.origin}:${pending.accountId}:${pending.chainId}:${contextHash}`,
              origin: pending.origin,
              favicon: pending.favicon,
              senderOrigin: pending.senderOrigin,
              createdAt: Date.now(),
              expiresAt: getPermissionExpirySeconds(approved.request),
              status: "active",
              accountId: pending.accountId,
              accountAddress: pending.accountAddress,
              accountType: pending.accountType,
              chainId: pending.chainId,
              chainName: pending.chainName,
              permissionType: approved.permissionType,
              request: approved.request,
              response,
              caveats: approved.caveats,
              delegation,
              typedData,
              contextHash,
            },
            requestId,
            result,
            expectedMasterAuthEpoch,
          }),
      });
      await writeErc7715PermissionResult(requestId, result).catch((error) => {
        console.warn("[erc7715] Grant committed; result bridge deferred", error);
      });
      return result;
    } catch (error) {
      await removePendingErc7715PermissionRequest(requestId);
      const result: Erc7715PermissionResult = {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Permission request approval failed",
      };
      await writeErc7715PermissionResult(requestId, result);
      return result;
    }
  });
}

export async function handleRejectErc7715PermissionRequest(
  requestId: string,
): Promise<Erc7715PermissionResult> {
  return runErc7715PermissionResolution(requestId, async () => {
    const pending = await getPendingErc7715PermissionRequestById(requestId);
    if (!pending) {
      return { success: false, error: "Permission request is no longer pending" };
    }
    await removePendingErc7715PermissionRequest(requestId);
    const result: Erc7715PermissionResult = {
      success: false,
      error: "Permission request cancelled by user",
    };
    await writeErc7715PermissionResult(requestId, result);
    return result;
  });
}
