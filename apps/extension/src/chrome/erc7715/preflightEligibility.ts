import { EIP_7702_DEFAULT_DELEGATE } from "@/constants/chainRegistry";
import { getStoredResolvedChainById } from "@/lib/chains";
import { isErc7715TokenApprovalRevocationPermissionType } from "@/lib/erc7715ApprovalRevocation";
import {
  hasDefaultDelegateForChain,
  readOnchainDelegate,
} from "@/utils/delegationResolution";
import { getActiveAccount } from "../accountStorage";
import type { Account } from "../types";
import { buildErc7715PermissionCaveats } from "./caveatBuilder";
import { validateErc7715PermissionRequestPayload } from "./permissionValidation";
import type { Erc7715SupportedPermissionType } from "./permissionTypes";
import {
  normalizeErc7715PermissionRequest,
  normalizePreflightAddress,
  parseHexChainId,
} from "./preflightNormalization";
import {
  assertPermit2RevocationAvailable,
  readDelegationNonce,
} from "./preflightRpc";
import type { Address, Erc7715PermissionRequest } from "./types";

export type LocalSigningAccount = Extract<
  Account,
  { type: "privateKey" | "seedPhrase" }
>;

type NormalizedPermissionPreflight = {
  request: Erc7715PermissionRequest;
  permissionType: Erc7715SupportedPermissionType;
  caveats: ReturnType<typeof buildErc7715PermissionCaveats>;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function assertRequestExecutionPermissionsEligible(
  params: unknown[],
  account?: Account,
): Promise<{
  account: LocalSigningAccount;
  requests: NormalizedPermissionPreflight[];
}> {
  if (params.length === 0) {
    throw new Error("No permission request provided");
  }
  if (params.length > 1) {
    throw new Error(
      "Only one wallet_requestExecutionPermissions request is supported at a time",
    );
  }

  const activeAccount = account ?? (await getActiveAccount());
  if (!activeAccount) {
    throw new Error("No active account");
  }
  if (
    activeAccount.type !== "privateKey" &&
    activeAccount.type !== "seedPhrase"
  ) {
    throw new Error(
      "wallet_requestExecutionPermissions requires a private key or seed phrase account",
    );
  }

  const delegateReads = new Map<number, Promise<Address | null>>();
  const normalizedRequests: NormalizedPermissionPreflight[] = [];
  const nowSeconds = Math.floor(Date.now() / 1000);

  for (const [index, request] of params.entries()) {
    if (!isObject(request)) {
      throw new Error(`Permission request ${index} is invalid`);
    }

    const chainId = parseHexChainId(request.chainId);
    if (!chainId) {
      throw new Error(`Permission request ${index} has invalid chainId`);
    }
    if (!hasDefaultDelegateForChain(chainId)) {
      throw new Error(
        `wallet_requestExecutionPermissions is not supported on chain '${request.chainId}'`,
      );
    }

    if (request.from !== undefined) {
      const requestFrom = normalizePreflightAddress(
        request.from,
        `Permission request ${index} from address`,
      );
      if (requestFrom.toLowerCase() !== activeAccount.address.toLowerCase()) {
        throw new Error(
          "Permission request from address does not match active account",
        );
      }
    }

    normalizePreflightAddress(
      request.to,
      `Permission request ${index} to address`,
    );

    const permissionType = validateErc7715PermissionRequestPayload(
      request,
      index,
    );
    const normalizedRequest = normalizeErc7715PermissionRequest(
      request,
      permissionType,
      activeAccount.address,
      nowSeconds,
    );

    const resolvedChain = await getStoredResolvedChainById(chainId);
    if (!resolvedChain?.rpcUrl) {
      throw new Error(`Chain ${chainId} has no RPC URL configured`);
    }

    if (!delegateReads.has(chainId)) {
      delegateReads.set(
        chainId,
        (async () => {
          const read = await readOnchainDelegate(
            resolvedChain.rpcUrl,
            chainId,
            activeAccount.address as Address,
          );
          if (!read.ok) {
            throw new Error(
              `Could not verify current account delegation: ${read.error}`,
            );
          }
          return read.delegate;
        })(),
      );
    }

    const delegate = await delegateReads.get(chainId);
    if (!delegate) {
      throw new Error(
        "Account must be delegated to WalletChan's default MetaMask DeleGator before requesting permissions",
      );
    }
    if (delegate.toLowerCase() !== EIP_7702_DEFAULT_DELEGATE.toLowerCase()) {
      throw new Error(
        "Account is not delegated to WalletChan's default MetaMask DeleGator",
      );
    }

    if (isErc7715TokenApprovalRevocationPermissionType(permissionType)) {
      await assertPermit2RevocationAvailable({
        request,
        rpcUrl: resolvedChain.rpcUrl,
        chainId,
      });
    }

    const delegationNonce = await readDelegationNonce({
      rpcUrl: resolvedChain.rpcUrl,
      chainId,
      delegator: activeAccount.address as Address,
    });

    const caveats = buildErc7715PermissionCaveats(normalizedRequest, index, {
      delegationNonce,
    });

    normalizedRequests.push({
      request: normalizedRequest,
      permissionType,
      caveats,
    });
  }

  return {
    account: activeAccount as LocalSigningAccount,
    requests: normalizedRequests,
  };
}
