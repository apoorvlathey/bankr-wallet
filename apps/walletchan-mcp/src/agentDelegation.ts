import { randomUUID } from "node:crypto";
import {
  CaveatType,
  createDelegation,
  getSmartAccountsEnvironment,
  ScopeType,
  type CreateDelegationOptions,
  type Delegation,
} from "@metamask/smart-accounts-kit";
import {
  getAddress,
  hexToBigInt,
  parseUnits,
  recoverTypedDataAddress,
  type Address,
  type Hex,
  type TypedData,
} from "viem";
import type {
  AgentDelegationMetadata,
  AgentDelegationRecord,
  AgentDelegationScope,
  AgentWalletStore,
  ExecutionProfile,
} from "./agentWallets.js";
import { findConfiguredChain, formatConfiguredChains, type RuntimeChainSummary } from "./chains.js";

const BASE_CHAIN_ID = 8453;
const BASE_USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const DEFAULT_USDC_DECIMALS = 6;
const DEFAULT_PERIOD_SECONDS = 86_400;
type AgentSdkScope = NonNullable<CreateDelegationOptions["scope"]>;
type AgentSdkCaveatArray = Extract<NonNullable<CreateDelegationOptions["caveats"]>, unknown[]>;

export interface PrepareAgentDelegationInput {
  profileId?: string;
  walletId?: string;
  chain?: unknown;
  delegator: string;
  delegateAddress?: string;
  label?: string;
  scopeType?: string;
  tokenAddress?: string;
  tokenDecimals?: number;
  amount?: string;
  amountUnits?: string;
  maxAmount?: string;
  maxAmountUnits?: string;
  periodDurationSeconds?: number;
  startDate?: number;
  validForSeconds?: number;
  allowedTargets?: string[];
  allowedSelectors?: string[];
  valueLimitWei?: string;
}

export class AgentDelegationManager {
  constructor(private readonly store: AgentWalletStore) {}

  prepare(
    input: PrepareAgentDelegationInput,
    chains: RuntimeChainSummary[],
  ): {
    delegation: AgentDelegationMetadata;
    typedData: Record<string, unknown>;
    rawDelegation: Record<string, unknown>;
    profile: ExecutionProfile;
    message: string;
  } {
    const profile = this.resolveAgentProfile(input.profileId, input.walletId);
    const chain = resolveConfiguredChain(chains, input.chain);
    const environment = getSmartAccountsEnvironment(chain.chainId);
    const delegator = normalizeAddress(input.delegator, "delegator");
    const delegate = input.delegateAddress
      ? normalizeAddress(input.delegateAddress, "delegateAddress")
      : normalizeAddress(profile.address, "agent profile address");
    const scope = buildScope(input, chain.chainId);
    const caveats = buildExtraCaveats(input);
    const delegationOptions: CreateDelegationOptions = {
      environment,
      from: delegator,
      to: delegate,
      scope: scope.sdkScope,
      ...(caveats.length > 0 ? { caveats } : {}),
    };
    const delegation = createDelegation(delegationOptions);
    const typedData = buildDelegationTypedData({
      chainId: chain.chainId,
      delegationManager: environment.DelegationManager,
      delegation,
    });
    const now = new Date().toISOString();
    const record: AgentDelegationRecord = {
      id: `delegation-${randomUUID()}`,
      walletId: profile.walletId!,
      profileId: profile.id as `agent:${string}`,
      label: normalizeLabel(input.label, `${profile.label} ${scope.metadata.type}`),
      status: "pending_signature",
      chainId: chain.chainId,
      chainName: chain.name,
      delegator,
      delegate,
      delegationManager: normalizeAddress(environment.DelegationManager, "delegation manager"),
      scope: scope.metadata,
      createdAt: now,
      updatedAt: now,
      expiresAt: expirationFromInput(input),
      delegation: delegation as unknown as Record<string, unknown>,
      typedData,
    };
    const metadata = this.store.upsertDelegation(record);
    return {
      delegation: metadata,
      typedData,
      rawDelegation: record.delegation,
      profile,
      message:
        "Prepared an agent delegation. Call agent_request_delegation_signature with delegationId to open the WalletChan signature request.",
    };
  }

  async verifySignature(
    delegationId: string,
    signature: string,
  ): Promise<AgentDelegationMetadata> {
    const record = this.store.getDelegation(delegationId);
    const normalizedSignature = normalizeHex(signature, "delegation signature");
    const recovered = await recoverTypedDataAddress({
      ...(record.typedData as unknown as {
        domain: Record<string, unknown>;
        types: TypedData;
        primaryType: string;
        message: Record<string, unknown>;
      }),
      signature: normalizedSignature,
    });
    if (recovered.toLowerCase() !== record.delegator.toLowerCase()) {
      throw new Error(
        `Delegation signature recovered ${recovered}, expected delegator ${record.delegator}`,
      );
    }
    return this.store.completeDelegation(delegationId, normalizedSignature);
  }

  private resolveAgentProfile(profileId?: string, walletId?: string): ExecutionProfile {
    const profile = walletId
      ? this.store.resolveExecutionProfile(`agent:${walletId}`)
      : this.store.resolveExecutionProfile(profileId || "agent");
    if (profile.kind !== "agent" || !profile.walletId || !profile.address) {
      throw new Error(`Execution profile ${profile.id} is not a delegated agent profile`);
    }
    return profile;
  }
}

function buildScope(input: PrepareAgentDelegationInput, chainId: number): {
  sdkScope: AgentSdkScope;
  metadata: AgentDelegationScope;
} {
  const scopeType = normalizeScopeType(input.scopeType);
  if (scopeType === "erc20-period-transfer") {
    const tokenAddress = normalizeTokenAddress(input.tokenAddress, chainId);
    const decimals = normalizeDecimals(input.tokenDecimals, defaultTokenDecimals(tokenAddress, chainId));
    const amount = requiredAmount(input);
    const amountUnits = amountUnitsFromInput(input, amount, decimals);
    const periodDurationSeconds = normalizePeriodDuration(input.periodDurationSeconds);
    const startDate = normalizeStartDate(input.startDate);
    return {
      sdkScope: {
        type: ScopeType.Erc20PeriodTransfer,
        tokenAddress,
        periodAmount: BigInt(amountUnits),
        periodDuration: periodDurationSeconds,
        startDate,
      } satisfies AgentSdkScope,
      metadata: {
        type: "erc20-period-transfer",
        tokenAddress,
        amount,
        amountUnits,
        periodDurationSeconds,
        startDate,
      },
    };
  }
  if (scopeType === "erc20-transfer-amount") {
    const tokenAddress = normalizeTokenAddress(input.tokenAddress, chainId);
    const decimals = normalizeDecimals(input.tokenDecimals, defaultTokenDecimals(tokenAddress, chainId));
    const amount = requiredAmount(input);
    const amountUnits = amountUnitsFromInput(input, amount, decimals);
    return {
      sdkScope: {
        type: ScopeType.Erc20TransferAmount,
        tokenAddress,
        maxAmount: BigInt(amountUnits),
      } satisfies AgentSdkScope,
      metadata: {
        type: "erc20-transfer-amount",
        tokenAddress,
        amount,
        amountUnits,
      },
    };
  }
  if (scopeType === "native-token-period-transfer") {
    const amount = requiredAmount(input);
    const amountUnits = amountUnitsFromInput(input, amount, 18);
    const periodDurationSeconds = normalizePeriodDuration(input.periodDurationSeconds);
    const startDate = normalizeStartDate(input.startDate);
    return {
      sdkScope: {
        type: ScopeType.NativeTokenPeriodTransfer,
        periodAmount: BigInt(amountUnits),
        periodDuration: periodDurationSeconds,
        startDate,
      } satisfies AgentSdkScope,
      metadata: {
        type: "native-token-period-transfer",
        amount,
        amountUnits,
        periodDurationSeconds,
        startDate,
      },
    };
  }
  if (scopeType === "native-token-transfer-amount") {
    const amount = requiredAmount(input);
    const amountUnits = amountUnitsFromInput(input, amount, 18);
    return {
      sdkScope: {
        type: ScopeType.NativeTokenTransferAmount,
        maxAmount: BigInt(amountUnits),
      } satisfies AgentSdkScope,
      metadata: {
        type: "native-token-transfer-amount",
        amount,
        amountUnits,
      },
    };
  }

  const allowedTargets = normalizeAddressList(input.allowedTargets, "allowedTargets");
  const allowedSelectors = normalizeSelectorList(input.allowedSelectors);
  if (allowedTargets.length === 0 || allowedSelectors.length === 0) {
    throw new Error("function-call scope requires allowedTargets and allowedSelectors");
  }
  const sdkScope = {
    type: ScopeType.FunctionCall,
    targets: allowedTargets,
    selectors: allowedSelectors,
  } satisfies AgentSdkScope;
  const valueLimitWei = optionalDecimalInteger(input.valueLimitWei, "valueLimitWei");
  if (valueLimitWei) {
    return {
      sdkScope: {
        ...sdkScope,
        valueLte: { maxValue: BigInt(valueLimitWei) },
      },
      metadata: {
        type: "function-call",
        allowedTargets,
        allowedSelectors,
        amountUnits: valueLimitWei,
      },
    };
  }
  return {
    sdkScope,
    metadata: {
      type: "function-call",
      allowedTargets,
      allowedSelectors,
      amountUnits: valueLimitWei,
    },
  };
}

function buildExtraCaveats(input: PrepareAgentDelegationInput): AgentSdkCaveatArray {
  if (!input.validForSeconds) return [];
  if (!Number.isInteger(input.validForSeconds) || input.validForSeconds <= 0) {
    throw new Error("validForSeconds must be a positive integer");
  }
  const afterThreshold = Math.floor(Date.now() / 1000);
  return [
    {
      type: CaveatType.Timestamp,
      afterThreshold,
      beforeThreshold: afterThreshold + input.validForSeconds,
    },
  ];
}

function buildDelegationTypedData(input: {
  chainId: number;
  delegationManager: Hex;
  delegation: Delegation;
}): Record<string, unknown> {
  return {
    domain: {
      chainId: input.chainId,
      name: "DelegationManager",
      version: "1",
      verifyingContract: input.delegationManager,
    },
    types: {
      Caveat: [
        { name: "enforcer", type: "address" },
        { name: "terms", type: "bytes" },
      ],
      Delegation: [
        { name: "delegate", type: "address" },
        { name: "delegator", type: "address" },
        { name: "authority", type: "bytes32" },
        { name: "caveats", type: "Caveat[]" },
        { name: "salt", type: "uint256" },
      ],
    },
    primaryType: "Delegation",
    message: {
      delegate: input.delegation.delegate,
      delegator: input.delegation.delegator,
      authority: input.delegation.authority,
      caveats: input.delegation.caveats.map((caveat) => ({
        enforcer: caveat.enforcer,
        terms: caveat.terms,
      })),
      salt: hexToBigInt(input.delegation.salt).toString(),
    },
  };
}

function resolveConfiguredChain(
  chains: RuntimeChainSummary[],
  value: unknown,
): RuntimeChainSummary {
  const requested = value === undefined || value === null || value === ""
    ? chains.find((chain) => chain.chainId === BASE_CHAIN_ID) || chains[0]
    : findConfiguredChain(chains, value);
  if (!requested) {
    throw new Error(
      `Chain ${String(value)} is not configured. Configured chains: ${formatConfiguredChains(chains)}.`,
    );
  }
  return requested;
}

function normalizeScopeType(value: unknown): string {
  const normalized = typeof value === "string" && value.trim()
    ? value.trim().toLowerCase().replaceAll("_", "-")
    : "erc20-period-transfer";
  if (
    normalized === "erc20-period-transfer" ||
    normalized === "erc20-transfer-amount" ||
    normalized === "native-token-period-transfer" ||
    normalized === "native-token-transfer-amount" ||
    normalized === "function-call"
  ) {
    return normalized;
  }
  throw new Error(`Unsupported agent delegation scopeType: ${String(value)}`);
}

function normalizeTokenAddress(value: unknown, chainId: number): Address {
  if ((value === undefined || value === null || value === "") && chainId === BASE_CHAIN_ID) {
    return getAddress(BASE_USDC_ADDRESS);
  }
  return normalizeAddress(value, "tokenAddress");
}

function defaultTokenDecimals(tokenAddress: Address, chainId: number): number | undefined {
  return chainId === BASE_CHAIN_ID && tokenAddress.toLowerCase() === BASE_USDC_ADDRESS.toLowerCase()
    ? DEFAULT_USDC_DECIMALS
    : undefined;
}

function requiredAmount(input: PrepareAgentDelegationInput): string {
  const amount = input.amount || input.maxAmount;
  if (amount && /^\d+(?:\.\d+)?$/.test(amount)) return amount;
  if (input.amountUnits || input.maxAmountUnits) return "raw-units";
  throw new Error("Agent delegation scope requires amount or amountUnits");
}

function amountUnitsFromInput(
  input: PrepareAgentDelegationInput,
  amount: string,
  decimals: number,
): string {
  const raw = input.amountUnits || input.maxAmountUnits;
  if (raw) return optionalDecimalInteger(raw, "amountUnits")!;
  return parseUnits(amount, decimals).toString();
}

function normalizeDecimals(value: unknown, fallback?: number): number {
  if (value === undefined || value === null) {
    if (fallback !== undefined) return fallback;
    throw new Error("tokenDecimals is required for non-default ERC-20 delegation scopes");
  }
  if (Number.isInteger(value) && typeof value === "number" && value >= 0 && value <= 36) {
    return value;
  }
  throw new Error("tokenDecimals must be an integer between 0 and 36");
}

function normalizePeriodDuration(value: unknown): number {
  if (value === undefined || value === null) return DEFAULT_PERIOD_SECONDS;
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  throw new Error("periodDurationSeconds must be a positive integer");
}

function normalizeStartDate(value: unknown): number {
  if (value === undefined || value === null) return Math.floor(Date.now() / 1000);
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  throw new Error("startDate must be a positive Unix timestamp in seconds");
}

function expirationFromInput(input: PrepareAgentDelegationInput): string | undefined {
  if (!input.validForSeconds || !Number.isInteger(input.validForSeconds) || input.validForSeconds <= 0) {
    return undefined;
  }
  return new Date(Date.now() + input.validForSeconds * 1000).toISOString();
}

function normalizeAddressList(value: unknown, label: string): Address[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => normalizeAddress(entry, label));
}

function normalizeSelectorList(value: unknown): Hex[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    if (typeof entry === "string" && /^0x[0-9a-fA-F]{8}$/.test(entry)) {
      return entry as Hex;
    }
    throw new Error(`Invalid function selector: ${String(entry)}`);
  });
}

function normalizeAddress(value: unknown, label: string): Address {
  if (typeof value === "string") {
    try {
      return getAddress(value);
    } catch {
      // fall through
    }
  }
  throw new Error(`Invalid ${label}: ${String(value)}`);
}

function normalizeHex(value: unknown, label: string): Hex {
  if (typeof value === "string" && /^0x[0-9a-fA-F]*$/.test(value)) {
    return value as Hex;
  }
  throw new Error(`Invalid ${label} hex value`);
}

function optionalDecimalInteger(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "string" && /^[0-9]+$/.test(value)) return value;
  throw new Error(`${label} must be a decimal integer string`);
}

function normalizeLabel(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback.slice(0, 80);
  const trimmed = value.trim();
  return (trimmed || fallback).slice(0, 80);
}
