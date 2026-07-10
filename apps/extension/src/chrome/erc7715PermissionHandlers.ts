import { createPublicClient, http } from "viem";
import {
  CHAIN_REGISTRY,
  EIP_7702_DEFAULT_DELEGATE,
  VIEM_CHAINS,
} from "@/constants/chainRegistry";
import { getStoredResolvedChainById } from "@/lib/chains";
import {
  hasDefaultDelegateForChain,
  readOnchainDelegate,
} from "@/utils/delegationResolution";
import { getAccountById, getActiveAccount } from "./accountStorage";
import type { Account } from "./types";
import {
  ERC7715_SUPPORTED_PERMISSION_TYPES,
  ERC7715_SUPPORTED_RULE_TYPES,
} from "./erc7715PermissionRegistry";
import {
  runWithErc7715PermissionRequestLock,
  syncErc7715PermissionRequestLockFromPendingRequests,
} from "./erc7715PermissionLock";
import {
  ERC7710_DELEGATION_MANAGER,
  METAMASK_DELEGATOR_V1_3_CAVEAT_ENFORCERS,
} from "./erc7715PermissionCaveats";
import {
  buildErc7710DelegationTypedData,
  buildSignedErc7710Delegation,
  encodeDisableErc7710Delegation,
  encodeErc7710DelegationContext,
  hashErc7710Delegation,
  hashErc7715PermissionContext,
  randomSaltHex,
} from "./erc7715DelegationSigning";
import {
  ERC7715_PERMISSION_EXPIRY_MS,
  type Erc7715PermissionGrant,
  getActiveErc7715PermissionGrants,
  getErc7715PermissionGrantById,
  getPendingErc7715PermissionRequestById,
  removePendingErc7715PermissionRequest,
  revokeErc7715PermissionGrant,
  saveErc7715PermissionGrant,
  savePendingErc7715PermissionRequest,
  waitForErc7715PermissionResult,
  writeErc7715PermissionResult,
  type Erc7715PermissionResponse,
  type Erc7715PermissionRequest,
  type Erc7715PermissionResult,
  type Hex,
} from "./pendingErc7715PermissionStorage";
import { signTypedData } from "./localSigner";
import {
  assertRequestExecutionPermissionsEligible,
  getPermissionExpirySeconds,
  makePendingPermissionRequest,
  parseHexChainId,
} from "./erc7715PermissionPreflight";
import { getLocalPrivateKeyForAccount } from "./localAccountKeyResolver";
import {
  assertErc7715PermissionEditIsAllowed,
  isErc7715StreamPermissionType,
  isErc7715PeriodicPermissionType,
  isErc7715TokenApprovalRevocationPermissionType,
} from "@/lib/erc7715PermissionEditing";
import { displayGrantOrigin } from "@/lib/erc7715PermissionDisplay";
import { enabledApprovalRevocationMethods } from "@/lib/erc7715ApprovalRevocation";
import { getPendingTxRequests, savePendingTxRequest } from "./pendingTxStorage";
import { pinnedTxRequest } from "./pinnedRequest";

export const ERC7715_PERMISSION_METHODS = [
  "wallet_getSupportedExecutionPermissions",
  "wallet_requestExecutionPermissions",
  "wallet_getGrantedExecutionPermissions",
] as const;

export type Erc7715PermissionMethod =
  (typeof ERC7715_PERMISSION_METHODS)[number];

type SupportedExecutionPermission = {
  chainIds: Hex[];
  ruleTypes: string[];
};

const DELEGATION_MANAGER_DISABLED_ABI = [
  {
    type: "function",
    name: "disabledDelegations",
    stateMutability: "view",
    inputs: [{ name: "delegationHash", type: "bytes32" }],
    outputs: [{ type: "bool" }],
  },
] as const;

const NONCE_ENFORCER_ABI = [
  {
    type: "function",
    name: "currentNonce",
    stateMutability: "view",
    inputs: [
      { name: "delegationManager", type: "address" },
      { name: "delegator", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
] as const;

export type SupportedExecutionPermissionsResult = Record<
  string,
  SupportedExecutionPermission
>;

export function isErc7715PermissionMethod(
  method: string,
): method is Erc7715PermissionMethod {
  return (ERC7715_PERMISSION_METHODS as readonly string[]).includes(method);
}

function toHexChainId(chainId: number): Hex {
  return `0x${chainId.toString(16)}`;
}

function getPermissionAmountSnapshot(
  grant: Erc7715PermissionGrant,
): Hex | undefined {
  if (isErc7715StreamPermissionType(grant.permissionType)) {
    const value = grant.request.permission.data.amountPerSecond;
    if (typeof value !== "string" || !/^0x[0-9a-f]+$/iu.test(value)) {
      return undefined;
    }
    return `0x${(BigInt(value) * 86400n).toString(16)}`;
  }

  const field =
    isErc7715PeriodicPermissionType(grant.permissionType)
      ? "periodAmount"
      : "allowanceAmount";
  const value = grant.request.permission.data[field];
  return typeof value === "string" && /^0x[0-9a-f]+$/iu.test(value)
    ? (value as Hex)
    : undefined;
}

function getTokenAddressSnapshot(
  grant: Erc7715PermissionGrant,
): Hex | undefined {
  const value = grant.request.permission.data.tokenAddress;
  return typeof value === "string" && /^0x[0-9a-f]{40}$/iu.test(value)
    ? (value as Hex)
    : undefined;
}

function getPeriodDurationSnapshot(
  grant: Erc7715PermissionGrant,
): number | undefined {
  if (isErc7715StreamPermissionType(grant.permissionType)) {
    return 86400;
  }

  const value = grant.request.permission.data.periodDuration;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;

  try {
    const parsed = value.startsWith("0x")
      ? Number(BigInt(value))
      : Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function getApprovalRevocationMethodSnapshot(
  grant: Erc7715PermissionGrant,
): string[] | undefined {
  if (!isErc7715TokenApprovalRevocationPermissionType(grant.permissionType)) {
    return undefined;
  }
  return enabledApprovalRevocationMethods(grant.request.permission.data).map(
    (method) => method.field,
  );
}

function nonceCaveatTerm(grant: Erc7715PermissionGrant): bigint | null {
  const caveat = grant.caveats.find(
    (entry) => entry.enforcerName === "NonceEnforcer",
  );
  if (!caveat || !/^0x[0-9a-f]+$/iu.test(caveat.terms)) return null;
  try {
    return BigInt(caveat.terms);
  } catch {
    return null;
  }
}

function getSupportedPermissionChainIds(): Hex[] {
  return CHAIN_REGISTRY.filter((chain) =>
    hasDefaultDelegateForChain(chain.chainId),
  ).map((chain) => toHexChainId(chain.chainId));
}

export function getSupportedExecutionPermissions(): SupportedExecutionPermissionsResult {
  const chainIds = getSupportedPermissionChainIds();

  return Object.fromEntries(
    ERC7715_SUPPORTED_PERMISSION_TYPES.map((permissionType) => [
      permissionType,
      {
        chainIds,
        ruleTypes: [...ERC7715_SUPPORTED_RULE_TYPES],
      },
    ]),
  );
}

export async function getGrantedExecutionPermissions({
  origin,
  chainId,
  account,
}: {
  origin?: string;
  chainId?: number;
  account?: Account;
} = {}): Promise<Erc7715PermissionResponse[]> {
  const activeAccount = account ?? (await getActiveAccount());
  if (!activeAccount) return [];

  const grants = await getActiveErc7715PermissionGrantsWithOnchainSync({
    origin,
    chainId,
    accountId: activeAccount.id,
  });

  return grants.map((grant) => grant.response);
}

type GrantOnchainStatus = "active" | "disabled" | "unknown";

async function getGrantOnchainStatus(
  grant: Erc7715PermissionGrant,
): Promise<GrantOnchainStatus> {
  if (
    grant.response.delegationManager.toLowerCase() !==
      ERC7710_DELEGATION_MANAGER.toLowerCase() ||
    grant.typedData.domain.verifyingContract.toLowerCase() !==
      ERC7710_DELEGATION_MANAGER.toLowerCase()
  ) {
    return "unknown";
  }

  const resolvedChain = await getStoredResolvedChainById(grant.chainId);
  if (!resolvedChain?.rpcUrl) return "unknown";

  try {
    const delegateRead = await readOnchainDelegate(
      resolvedChain.rpcUrl,
      grant.chainId,
      grant.delegation.delegator,
    );
    if (!delegateRead.ok) return "unknown";
    if (
      !delegateRead.delegate ||
      delegateRead.delegate.toLowerCase() !==
        EIP_7702_DEFAULT_DELEGATE.toLowerCase()
    ) {
      return "disabled";
    }

    const client = createPublicClient({
      chain: VIEM_CHAINS[grant.chainId],
      transport: http(resolvedChain.rpcUrl, { timeout: 8000, retryCount: 1 }),
    });
    const disabled = await client.readContract({
      address: ERC7710_DELEGATION_MANAGER,
      abi: DELEGATION_MANAGER_DISABLED_ABI,
      functionName: "disabledDelegations",
      args: [hashErc7710Delegation(grant.delegation)],
    });
    if (disabled) return "disabled";

    const expectedNonce = nonceCaveatTerm(grant);
    if (expectedNonce === null) return "active";

    const currentNonce = await client.readContract({
      address: METAMASK_DELEGATOR_V1_3_CAVEAT_ENFORCERS.NonceEnforcer,
      abi: NONCE_ENFORCER_ABI,
      functionName: "currentNonce",
      args: [ERC7710_DELEGATION_MANAGER, grant.delegation.delegator],
    });
    return currentNonce !== expectedNonce ? "disabled" : "active";
  } catch (err) {
    console.warn("[erc7715] onchain grant status check failed", err);
    return "unknown";
  }
}

export async function getActiveErc7715PermissionGrantsWithOnchainSync(
  filters: {
    origin?: string;
    accountId?: string;
    chainId?: number;
  } = {},
): Promise<Erc7715PermissionGrant[]> {
  const grants = await getActiveErc7715PermissionGrants(filters);
  const checked = await Promise.all(
    grants.map(async (grant) => {
      const status = await getGrantOnchainStatus(grant);
      if (status === "active") return grant;
      if (status === "unknown") {
        throw new Error(
          "Could not verify delegated permission status onchain",
        );
      }
      try {
        await revokeErc7715PermissionGrant({
          grantId: grant.id,
          accountId: grant.accountId,
        });
      } catch (err) {
        console.warn("[erc7715] failed to mark disabled grant revoked", err);
      }
      return null;
    }),
  );

  return checked.filter(
    (grant): grant is Erc7715PermissionGrant => grant !== null,
  );
}

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

  if (grant.delegation.delegator.toLowerCase() !== account.address.toLowerCase()) {
    return {
      success: false,
      error: "Delegation signer does not match this account",
    };
  }

  const resolvedChain = await getStoredResolvedChainById(grant.chainId);
  if (!resolvedChain?.rpcUrl) {
    return { success: false, error: "Chain has no RPC URL configured" };
  }

  const onchainStatus = await getGrantOnchainStatus(grant);
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

  const from = account.address as `0x${string}`;
  const txId = `revokeErc7715:${accountId}:${grant.chainId}:${Date.now()}`;
  const request = pinnedTxRequest(account, {
    id: txId,
    tx: {
      from,
      to: ERC7710_DELEGATION_MANAGER,
      data: encodeDisableErc7710Delegation(grant.delegation),
      value: "0x0",
      chainId: grant.chainId,
    },
    origin: "WalletChan",
    favicon: null,
    chainName: resolvedChain.name || grant.chainName,
    timestamp: Date.now(),
    erc7715PermissionRevokeMeta: {
      grantId,
      origin: displayGrantOrigin(grant),
      favicon: grant.favicon,
      permissionType: grant.permissionType,
      delegate: grant.request.to,
      tokenAddress: getTokenAddressSnapshot(grant),
      amount: getPermissionAmountSnapshot(grant),
      periodDuration: getPeriodDurationSnapshot(grant),
      expiresAt: grant.expiresAt,
      approvalRevocationMethods: getApprovalRevocationMethodSnapshot(grant),
    },
  });

  await savePendingTxRequest(request);
  chrome.runtime
    .sendMessage({ type: "newPendingTxRequest", txRequest: request })
    .catch(() => {});

  return { success: true, txId };
}

export async function handleConfirmErc7715PermissionRequest(
  requestId: string,
  password: string,
  editedRequest?: Erc7715PermissionRequest,
): Promise<Erc7715PermissionResult> {
  const pending = await getPendingErc7715PermissionRequestById(requestId);
  if (!pending || Date.now() - pending.timestamp > ERC7715_PERMISSION_EXPIRY_MS) {
    if (pending) await removePendingErc7715PermissionRequest(requestId);
    const result: Erc7715PermissionResult = {
      success: false,
      error: "Permission request expired",
    };
    await writeErc7715PermissionResult(requestId, result);
    return result;
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

    const requestToApprove = editedRequest || pending.request;
    if (editedRequest) {
      assertErc7715PermissionEditIsAllowed(
        pending.request,
        editedRequest,
      );
    }

    const eligibility = await assertRequestExecutionPermissionsEligible(
      [requestToApprove],
      account,
    );
    const approved = eligibility.requests[0];

    const privateKey = await getLocalPrivateKeyForAccount(
      account.id,
      password,
    );
    if (!privateKey) {
      throw new Error("Private key not found for account");
    }

    const salt = randomSaltHex();
    const typedData = buildErc7710DelegationTypedData({
      chainId: pending.chainId,
      delegator: approved.request.from,
      delegate: approved.request.to,
      caveats: approved.caveats,
      salt,
    });
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

    await saveErc7715PermissionGrant({
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
    });

    await removePendingErc7715PermissionRequest(requestId);

    const result: Erc7715PermissionResult = {
      success: true,
      result: [response],
    };
    await writeErc7715PermissionResult(requestId, result);
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
}

export async function handleRejectErc7715PermissionRequest(
  requestId: string,
): Promise<Erc7715PermissionResult> {
  await removePendingErc7715PermissionRequest(requestId);
  const result: Erc7715PermissionResult = {
    success: false,
    error: "Permission request cancelled by user",
  };
  await writeErc7715PermissionResult(requestId, result);
  return result;
}

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

        const pendingRequests =
          await savePendingErc7715PermissionRequest(pending);
        syncErc7715PermissionRequestLockFromPendingRequests(pendingRequests);
        chrome.runtime
          .sendMessage({
            type: "newPendingErc7715PermissionRequest",
            request: pending,
          })
          .catch(() => {});

        const { openExtensionPopup } = await import("./txHandlers");
        await openExtensionPopup(senderWindowId);

        if (!waitForResult) {
          return { id: pending.id };
        }

        const result = await waitForErc7715PermissionResult(pending.id);
        if (!result.success) {
          throw new Error(result.error);
        }
        return result.result;
      });
  }
}
