/** Build an account-pinned transaction that disables an active ERC-7715 grant. */

import { getStoredResolvedChainById } from "@/lib/chains";
import { displayGrantOrigin } from "@/lib/erc7715PermissionDisplay";
import { getAccountById } from "../accountStorage";
import { ERC7710_DELEGATION_MANAGER } from "./caveatDefinitions";
import { encodeDisableErc7710Delegation } from "./delegationSigning";
import {
  getErc7715ApprovalRevocationMethodSnapshot,
  getErc7715PeriodDurationSnapshot,
  getErc7715PermissionAmountSnapshot,
  getErc7715TokenAddressSnapshot,
} from "./grantSnapshot";
import { getErc7715GrantOnchainStatus } from "./onchainStatus";
import {
  getErc7715PermissionGrantById,
  revokeErc7715PermissionGrant,
} from "./grantStorage";
import { getPendingTxRequests, savePendingTxRequest } from "../pendingTxStorage";
import { pinnedTxRequest } from "../pinnedRequest";

export async function handleInitiateErc7715PermissionRevoke({
  accountId,
  grantId,
}: {
  accountId: string;
  grantId: string;
}): Promise<{
  success: boolean;
  txId?: string;
  localOnly?: boolean;
  error?: string;
}> {
  const account = await getAccountById(accountId);
  if (!account) return { success: false, error: "Account not found" };
  if (account.type !== "privateKey" && account.type !== "seedPhrase") {
    return {
      success: false,
      error: "Only private key and seed phrase accounts can revoke permissions",
    };
  }

  const grant = await getErc7715PermissionGrantById(grantId);
  if (!grant || grant.accountId !== accountId) {
    return { success: false, error: "Permission grant not found" };
  }
  if (grant.accountAddress.toLowerCase() !== account.address.toLowerCase()) {
    return {
      success: false,
      error: "Permission grant does not belong to this account",
    };
  }
  if (grant.status !== "active" || grant.revokedAt) {
    return { success: false, error: "Permission grant is already revoked" };
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (grant.expiresAt !== null && grant.expiresAt <= nowSeconds) {
    await revokeErc7715PermissionGrant({ grantId, accountId });
    return { success: true, localOnly: true };
  }
  if (
    grant.response.delegationManager.toLowerCase() !==
      ERC7710_DELEGATION_MANAGER.toLowerCase() ||
    grant.typedData.domain.verifyingContract.toLowerCase() !==
      ERC7710_DELEGATION_MANAGER.toLowerCase()
  ) {
    return {
      success: false,
      error: "Unsupported delegation manager for this grant",
    };
  }
  if (
    grant.delegation.delegator.toLowerCase() !== account.address.toLowerCase()
  ) {
    return {
      success: false,
      error: "Delegation signer does not match this account",
    };
  }

  const resolvedChain = await getStoredResolvedChainById(grant.chainId);
  if (!resolvedChain?.rpcUrl) {
    return { success: false, error: "Chain has no RPC URL configured" };
  }
  const onchainStatus = await getErc7715GrantOnchainStatus(grant);
  if (onchainStatus === "unknown") {
    return {
      success: false,
      error: "Could not verify delegated permission status onchain",
    };
  }
  if (onchainStatus === "disabled") {
    await revokeErc7715PermissionGrant({ grantId, accountId });
    return { success: true, localOnly: true };
  }

  const existingPendingRevoke = (await getPendingTxRequests()).find(
    (pending) => pending.erc7715PermissionRevokeMeta?.grantId === grantId,
  );
  if (existingPendingRevoke) {
    return { success: true, txId: existingPendingRevoke.id };
  }

  const txId = `revokeErc7715:${accountId}:${grant.chainId}:${Date.now()}`;
  const request = pinnedTxRequest(account, {
    id: txId,
    tx: {
      from: account.address as `0x${string}`,
      to: ERC7710_DELEGATION_MANAGER,
      data: encodeDisableErc7710Delegation(grant.delegation),
      value: "0x0",
      chainId: grant.chainId,
    },
    origin: "WalletChan",
    favicon: null,
    chainName: resolvedChain.name || grant.chainName,
    timestamp: Date.now(),
    trustedInternal: true,
    erc7715PermissionRevokeMeta: {
      grantId,
      origin: displayGrantOrigin(grant),
      favicon: grant.favicon,
      permissionType: grant.permissionType,
      delegate: grant.request.to,
      tokenAddress: getErc7715TokenAddressSnapshot(grant),
      amount: getErc7715PermissionAmountSnapshot(grant),
      periodDuration: getErc7715PeriodDurationSnapshot(grant),
      expiresAt: grant.expiresAt,
      approvalRevocationMethods:
        getErc7715ApprovalRevocationMethodSnapshot(grant),
    },
  });
  await savePendingTxRequest(request);
  chrome.runtime
    .sendMessage({ type: "newPendingTxRequest", txRequest: request })
    .catch(() => {});
  return { success: true, txId };
}
