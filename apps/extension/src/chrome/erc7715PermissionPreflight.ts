import { createPublicClient, http } from "viem";
import {
  CHAIN_REGISTRY,
  EIP_7702_DEFAULT_DELEGATE,
  VIEM_CHAINS,
} from "@/constants/chainRegistry";
import { getStoredResolvedChainById } from "@/lib/chains";
import {
  hasPermit2ApprovalRevocationMethod,
  isErc7715TokenApprovalRevocationPermissionType,
} from "@/lib/erc7715ApprovalRevocation";
import {
  hasDefaultDelegateForChain,
  readOnchainDelegate,
} from "@/utils/delegationResolution";
import { getActiveAccount } from "./accountStorage";
import type { Account } from "./types";
import {
  getErc7715PermissionJustification,
  type Erc7715SupportedPermissionType,
  validateErc7715PermissionRequestPayload,
} from "./erc7715PermissionRegistry";
import { normalizeErc7715Address } from "./erc7715PermissionAddress";
import {
  buildErc7715PermissionCaveats,
  ERC7710_DELEGATION_MANAGER,
  METAMASK_DELEGATOR_V1_3_CAVEAT_ENFORCERS,
} from "./erc7715PermissionCaveats";
import type {
  Address,
  Erc7715PermissionRequest,
  Hex,
  PendingErc7715PermissionRequest,
} from "./pendingErc7715PermissionStorage";

export type LocalSigningAccount = Extract<
  Account,
  { type: "privateKey" | "seedPhrase" }
>;

type NormalizedPermissionPreflight = {
  request: Erc7715PermissionRequest;
  permissionType: Erc7715SupportedPermissionType;
  caveats: ReturnType<typeof buildErc7715PermissionCaveats>;
};

const PERMIT2_ADDRESS =
  "0x000000000022D473030F116dDEE9F6B43aC78BA3" as const;
const BUILT_IN_CHAIN_IDS = new Set(CHAIN_REGISTRY.map((chain) => chain.chainId));

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

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseHexChainId(value: unknown): number | null {
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/iu.test(value)) {
    return null;
  }
  const chainId = Number.parseInt(value, 16);
  return Number.isSafeInteger(chainId) && chainId > 0 ? chainId : null;
}

function normalizeAddress(value: unknown, label: string): Address {
  return normalizeErc7715Address(value, label) as Address;
}

function cloneRecord(value: unknown): Record<string, unknown> {
  return isObject(value) ? { ...value } : {};
}

function clonePermissionData(value: unknown): Record<string, unknown> {
  const data = cloneRecord(value);
  delete data.justification;
  return data;
}

function isNativePermissionType(
  permissionType: Erc7715SupportedPermissionType,
): boolean {
  return permissionType.startsWith("native-token-");
}

function normalizePermissionData({
  data,
  permissionType,
  rules,
  nowSeconds,
}: {
  data: Record<string, unknown>;
  permissionType: Erc7715SupportedPermissionType;
  rules?: Erc7715PermissionRequest["rules"];
  nowSeconds: number;
}): Record<string, unknown> {
  const normalized = { ...data };

  if (!isNativePermissionType(permissionType)) {
    const tokenAddress = data.tokenAddress;
    if (tokenAddress !== undefined) {
      normalized.tokenAddress = normalizeAddress(
        tokenAddress,
        `${permissionType}.data.tokenAddress`,
      );
    }
  }

  if (
    !isErc7715TokenApprovalRevocationPermissionType(permissionType) &&
    normalized.startTime === undefined
  ) {
    normalized.startTime = nowSeconds;
  }

  const expiry = rules?.find((rule) => rule.type === "expiry")?.data.timestamp;
  if (
    typeof normalized.startTime === "number" &&
    typeof expiry === "number" &&
    normalized.startTime >= expiry
  ) {
    throw new Error(`${permissionType}.data.startTime must be before expiry`);
  }

  return normalized;
}

function makePreflightClient(rpcUrl: string, chainId: number) {
  return createPublicClient({
    chain: VIEM_CHAINS[chainId],
    transport: http(rpcUrl, { timeout: 8000, retryCount: 1 }),
  });
}

async function readDelegationNonce({
  rpcUrl,
  chainId,
  delegator,
}: {
  rpcUrl: string;
  chainId: number;
  delegator: Address;
}): Promise<bigint> {
  const client = makePreflightClient(rpcUrl, chainId);
  return client.readContract({
    address: METAMASK_DELEGATOR_V1_3_CAVEAT_ENFORCERS.NonceEnforcer,
    abi: NONCE_ENFORCER_ABI,
    functionName: "currentNonce",
    args: [ERC7710_DELEGATION_MANAGER, delegator],
  });
}

async function assertPermit2RevocationAvailable({
  request,
  rpcUrl,
  chainId,
}: {
  request: Record<string, unknown>;
  rpcUrl: string;
  chainId: number;
}) {
  const permission = request.permission as Record<string, unknown>;
  const data = cloneRecord(permission.data);
  if (!hasPermit2ApprovalRevocationMethod(data)) return;

  if (!BUILT_IN_CHAIN_IDS.has(chainId)) {
    throw new Error(
      "Permit2 approval revocation is only supported on WalletChan built-in chains",
    );
  }

  const client = makePreflightClient(rpcUrl, chainId);
  const code = await client.getCode({ address: PERMIT2_ADDRESS });
  if (!code || code === "0x") {
    throw new Error(
      "Permit2 approval revocation is not available on this chain",
    );
  }
}

function normalizeErc7715PermissionRequest(
  request: Record<string, unknown>,
  permissionType: Erc7715SupportedPermissionType,
  activeAccountAddress: string,
  nowSeconds: number,
): Erc7715PermissionRequest {
  const permission = request.permission as Record<string, unknown>;
  const justification = getErc7715PermissionJustification(permission);
  const rules = Array.isArray(request.rules)
    ? request.rules.map((rule) => {
        const ruleObject = rule as Record<string, unknown>;
        return {
          type: String(ruleObject.type),
          data: cloneRecord(ruleObject.data),
        };
      })
    : undefined;

  return {
    chainId: request.chainId as Hex,
    from: normalizeAddress(
      request.from ?? activeAccountAddress,
      "Permission request from address",
    ),
    to: normalizeAddress(request.to, "Permission request to address"),
    permission: {
      type: permissionType,
      isAdjustmentAllowed: permission.isAdjustmentAllowed === true,
      ...(justification ? { justification } : {}),
      data: normalizePermissionData({
        data: clonePermissionData(permission.data),
        permissionType,
        rules,
        nowSeconds,
      }),
    },
    ...(rules ? { rules } : {}),
  };
}

export function getPermissionExpirySeconds(
  request: Erc7715PermissionRequest,
): number | null {
  for (const rule of request.rules || []) {
    if (rule.type !== "expiry") continue;
    const timestamp = rule.data.timestamp;
    return typeof timestamp === "number" ? timestamp : null;
  }
  return null;
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
      const requestFrom = normalizeAddress(
        request.from,
        `Permission request ${index} from address`,
      );
      if (requestFrom.toLowerCase() !== activeAccount.address.toLowerCase()) {
        throw new Error(
          "Permission request from address does not match active account",
        );
      }
    }

    normalizeAddress(request.to, `Permission request ${index} to address`);

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
  caveats: ReturnType<typeof buildErc7715PermissionCaveats>;
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
