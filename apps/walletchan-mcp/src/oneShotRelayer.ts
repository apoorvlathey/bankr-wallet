import { encodeFunctionData, erc20Abi, getAddress } from "viem";
import type { AgentWalletStore, AgentDelegationRecord, ExecutionProfile } from "./agentWallets.js";
import { findConfiguredChain, formatConfiguredChains, type RuntimeChainSummary } from "./chains.js";
import type { WalletCall } from "./rpcClient.js";

const DEFAULT_RELAYER_URL = "https://relayer.1shotapi.com/relayers";
const BASE_CHAIN_ID = 8453;
const BASE_USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const ERC20_TRANSFER_SELECTOR = "0xa9059cbb";
const MAX_FEE_ESTIMATE_ATTEMPTS = 3;
const DEFAULT_FEE_BUFFER_BPS = 25n;
const DEFAULT_FEE_BUFFER_MIN_UNITS = 10n;
const BPS_DENOMINATOR = 10_000n;

export interface OneShotRelayerOptions {
  relayerUrl?: string;
}

export interface OneShotRelayCallsInput {
  profileId?: string;
  walletId?: string;
  delegationId?: string;
  chain?: unknown;
  calls: WalletCall[];
  paymentToken?: string;
  paymentAmountUnits?: string;
  includeFeePayment?: boolean;
  estimateOnly?: boolean;
  submit?: boolean;
  confirm?: boolean;
  skipEstimate?: boolean;
  context?: string;
  taskId?: string;
  destinationUrl?: string;
  memo?: string;
  validateDelegate?: boolean;
}

export interface OneShotDelegationPreflightInput {
  profileId?: string;
  walletId?: string;
  chain?: unknown;
  calls: WalletCall[];
  paymentToken?: string;
  includeFeePayment?: boolean;
}

export class OneShotRelayer {
  private id = 1;
  private readonly relayerUrl: string;

  constructor(
    private readonly store: AgentWalletStore,
    options: OneShotRelayerOptions = {},
  ) {
    this.relayerUrl = normalizeRelayerUrl(
      options.relayerUrl || process.env.WALLETCHAN_MCP_ONESHOT_RELAYER_URL || DEFAULT_RELAYER_URL,
    );
  }

  getInfo(): Record<string, unknown> {
    return {
      relayerUrl: this.relayerUrl,
      defaultRelayerUrl: DEFAULT_RELAYER_URL,
      feeBuffer: {
        bps: DEFAULT_FEE_BUFFER_BPS.toString(),
        minUnits: DEFAULT_FEE_BUFFER_MIN_UNITS.toString(),
      },
    };
  }

  async getCapabilities(chainIds: Array<string | number>): Promise<unknown> {
    const params = chainIds.map((chainId) => String(chainId));
    return this.rpc("relayer_getCapabilities", params);
  }

  async getTargetAddress(chainId: number): Promise<`0x${string}`> {
    const capabilities = await this.getCapabilities([chainId]);
    const capability = capabilityForChain(capabilities, chainId);
    if (!capability.targetAddress) {
      throw new Error(`1Shot relayer did not return targetAddress for chain ${chainId}`);
    }
    return normalizeAddress(capability.targetAddress, "1Shot targetAddress");
  }

  async getFeeData(input: {
    chainId: string | number;
    token: string;
  }): Promise<unknown> {
    return this.rpc("relayer_getFeeData", {
      chainId: String(input.chainId),
      token: normalizeAddress(input.token, "payment token"),
    });
  }

  async getStatus(input: { taskId: string; logs?: boolean }): Promise<unknown> {
    return this.rpc("relayer_getStatus", {
      id: requireTaskId(input.taskId),
      logs: input.logs === true,
    });
  }

  async preflightDelegationForCalls(
    input: OneShotDelegationPreflightInput,
    chains: RuntimeChainSummary[],
  ): Promise<Record<string, unknown>> {
    const chain = resolveConfiguredChain(chains, input.chain);
    const profile = this.resolveAgentProfile(input.profileId, input.walletId);
    const capabilities = await this.getCapabilities([chain.chainId]);
    const capability = capabilityForChain(capabilities, chain.chainId);
    if (!capability.targetAddress) {
      throw new Error(`1Shot relayer did not return targetAddress for chain ${chain.chainId}`);
    }
    const targetAddress = normalizeAddress(capability.targetAddress, "1Shot targetAddress");
    const paymentToken = normalizeAddress(
      input.paymentToken || defaultPaymentToken(capability, chain.chainId),
      "payment token",
    );
    const includeFeePayment = input.includeFeePayment !== false;
    const permissionPaymentToken = includeFeePayment ? paymentToken : undefined;
    const activeDelegations = this.store
      .listDelegations({
        walletId: profile.walletId!,
        chainId: chain.chainId,
        status: "active",
      })
      .reverse()
      .map((metadata) => this.store.getDelegation(metadata.id))
      .filter((delegation) =>
        !!delegation.signature &&
        delegation.delegate.toLowerCase() === targetAddress.toLowerCase()
      );
    const compatible = activeDelegations.find((delegation) =>
      delegationSupportsCalls(delegation, input.calls, permissionPaymentToken)
    );
    if (compatible) {
      return {
        status: "ready",
        profile,
        chain,
        relayer: this.getInfo(),
        targetAddress,
        paymentToken,
        delegation: delegationMetadata(compatible),
        message: "An active 1Shot delegation already covers these prepared calls.",
      };
    }

    const permission = functionCallPermissionForCalls(input.calls, permissionPaymentToken);
    if (!permission) {
      return {
        status: "needs_manual_delegation_review",
        profile,
        chain,
        relayer: this.getInfo(),
        targetAddress,
        paymentToken,
        message:
          "The prepared calls include calldata that cannot be summarized as target/function selectors. Review and prepare a custom delegation manually.",
      };
    }

    return {
      status: "needs_function_call_delegation",
      profile,
      chain,
      relayer: this.getInfo(),
      targetAddress,
      paymentToken,
      existingDelegations: activeDelegations.map(delegationMetadata),
      requiredScope: {
        type: "function-call",
        allowedTargets: permission.allowedTargets,
        allowedSelectors: permission.allowedSelectors,
      },
      prepareDelegationArgs: {
        profileId: profile.id,
        chain: chain.chainId,
        delegateMode: "oneshot-relayer",
        delegateAddress: targetAddress,
        scopeType: "function-call",
        allowedTargets: permission.allowedTargets,
        allowedSelectors: permission.allowedSelectors,
        label: `${profile.label} DeFi calls`,
      },
      message:
        "No active reusable 1Shot function-call delegation covers these prepared DeFi calls.",
    };
  }

  async relayCalls(
    input: OneShotRelayCallsInput,
    chains: RuntimeChainSummary[],
  ): Promise<Record<string, unknown>> {
    const chain = resolveConfiguredChain(chains, input.chain);
    const profile = this.resolveAgentProfile(input.profileId, input.walletId);
    let delegation = input.delegationId
      ? this.store.getDelegation(input.delegationId)
      : this.store.getActiveDelegation({ walletId: profile.walletId!, chainId: chain.chainId });
    if (!delegation) {
      throw new Error(
        `No active agent delegation found for ${profile.id} on chain ${chain.chainId}. Complete agent delegation authorization first.`,
      );
    }
    if (delegation.status !== "active" || !delegation.signature) {
      throw new Error(`Agent delegation ${delegation.id} is not active`);
    }
    if (delegation.chainId !== chain.chainId) {
      throw new Error(`Agent delegation ${delegation.id} is for chain ${delegation.chainId}, not ${chain.chainId}`);
    }

    const capabilities = await this.getCapabilities([chain.chainId]);
    const capability = capabilityForChain(capabilities, chain.chainId);
    const targetAddress = capability.targetAddress
      ? normalizeAddress(capability.targetAddress, "1Shot targetAddress")
      : undefined;
    if ((input.validateDelegate ?? true) && capability.targetAddress) {
      if (delegation.delegate.toLowerCase() !== targetAddress!.toLowerCase()) {
        const matchingDelegation = input.delegationId
          ? null
          : this.findActiveDelegationForDelegate({
              walletId: profile.walletId!,
              chainId: chain.chainId,
              delegate: targetAddress!,
            });
        if (matchingDelegation) {
          delegation = matchingDelegation;
        } else {
        return {
          status: "needs_oneshot_delegation",
          profile,
          delegation: delegationMetadata(delegation),
          chain,
          relayer: this.getInfo(),
          targetAddress,
          message:
            `The active delegation delegate is ${delegation.delegate}, but 1Shot requires ${targetAddress}. ` +
            "Prepare and complete a new agent delegation with delegateAddress set to this targetAddress.",
        };
        }
      }
    }

    const paymentToken = normalizeAddress(
      input.paymentToken || defaultPaymentToken(capability, chain.chainId),
      "payment token",
    );
    const includeFeePayment = input.includeFeePayment !== false;
    const compatibleDelegation = this.findCompatibleDelegation({
      current: delegation,
      profile,
      chainId: chain.chainId,
      calls: input.calls,
      paymentToken: includeFeePayment ? paymentToken : undefined,
      targetAddress,
      explicitDelegation: !!input.delegationId,
    });
    if (compatibleDelegation) {
      delegation = compatibleDelegation;
    } else {
      const repair = this.functionCallDelegationRepair({
        delegation,
        profile,
        chain,
        calls: input.calls,
        paymentToken: includeFeePayment ? paymentToken : undefined,
      });
      if (repair) return repair;
    }
    const paymentAmountUnits = includeFeePayment
      ? await this.resolvePaymentAmountUnits({
          chainId: chain.chainId,
          token: paymentToken,
          explicitAmountUnits: input.paymentAmountUnits,
        })
      : undefined;
    const payload = buildSend7710Payload({
      chainId: chain.chainId,
      delegation,
      calls: input.calls,
      payment:
        includeFeePayment && paymentAmountUnits
          ? {
              token: paymentToken,
              feeCollector: normalizeAddress(capability.feeCollector, "1Shot feeCollector"),
              amountUnits: paymentAmountUnits,
            }
          : undefined,
      context: input.context,
      taskId: input.taskId,
      destinationUrl: input.destinationUrl,
      memo: input.memo,
    });

    if (input.estimateOnly === true || input.submit === false) {
      const estimate = await this.estimate7710(payload);
      return {
        status: "estimated",
        profile,
        delegation: delegationMetadata(delegation),
        relayer: this.getInfo(),
        payload,
        estimate,
        message: "1Shot relayer estimate completed. Pass confirm=true to submit.",
      };
    }

    if (input.confirm !== true) {
      return {
        status: "preview",
        profile,
        delegation: delegationMetadata(delegation),
        relayer: this.getInfo(),
        payload,
        message: "Preview only. Re-run with confirm=true to submit to the 1Shot relayer.",
      };
    }

    const preparedPayload = input.skipEstimate === true
      ? { ok: true as const, payload, estimates: [] }
      : await this.payloadWithFreshEstimateContext(payload, paymentToken, capability);
    if (!preparedPayload.ok) {
      return {
        status: "estimate_failed",
        submitted: false,
        profile,
        delegation: delegationMetadata(delegation),
        relayer: this.getInfo(),
        payload: preparedPayload.payload,
        estimate: preparedPayload.estimate,
        estimates: preparedPayload.estimates,
        approvalMode: "none",
        executionMode: "delegated_erc7710_oneshot",
        error: preparedPayload.error,
        message:
          "1Shot estimate failed, so WalletChan MCP did not submit the delegated transaction. " +
          "Fix the prepared call bundle or required fee payment, then retry.",
      };
    }
    const finalPayload = preparedPayload.payload;
    const taskId = await this.send7710(finalPayload);
    return {
      status: "submitted",
      taskId,
      profile,
      delegation: delegationMetadata(delegation),
      relayer: this.getInfo(),
      payload: finalPayload,
      approvalMode: "agent_auto",
      executionMode: "delegated_erc7710_oneshot",
      message: "Submitted delegated agent calls to the 1Shot public relayer. Poll agent_oneshot_get_status with taskId.",
    };
  }

  private async estimate7710(payload: Record<string, unknown>): Promise<unknown> {
    return this.rpc("relayer_estimate7710Transaction", payload);
  }

  private async send7710(payload: Record<string, unknown>): Promise<unknown> {
    return this.rpc("relayer_send7710Transaction", payload);
  }

  private async payloadWithFreshEstimateContext(
    payload: Record<string, unknown>,
    paymentToken: `0x${string}`,
    capability: OneShotCapability,
  ): Promise<
    | {
        ok: true;
        payload: Record<string, unknown>;
        estimates: unknown[];
      }
    | {
        ok: false;
        payload: Record<string, unknown>;
        estimate: unknown;
        estimates: unknown[];
        error: string;
      }
  > {
    let currentPayload = payload;
    const estimates: unknown[] = [];

    for (let attempt = 0; attempt < MAX_FEE_ESTIMATE_ATTEMPTS; attempt++) {
      const estimate = await this.estimate7710(currentPayload);
      estimates.push(estimate);
      const estimateRecord = asRecord(estimate);
      if (estimateRecord.success === false) {
        return {
          ok: false,
          payload: currentPayload,
          estimate,
          estimates,
          error: optionalString(estimateRecord.error) || "1Shot estimate returned success=false",
        };
      }

      const feeCollector = normalizeAddress(capability.feeCollector, "1Shot feeCollector");
      const requiredPaymentAmount = optionalString(estimateRecord.requiredPaymentAmount);
      const bufferedPaymentAmount = requiredPaymentAmount
        ? addPaymentBuffer(requiredPaymentAmount, {
            bps: DEFAULT_FEE_BUFFER_BPS,
            minUnits: DEFAULT_FEE_BUFFER_MIN_UNITS,
          })
        : undefined;
      const currentPaymentAmount = extractPaymentAmount(currentPayload, {
        token: paymentToken,
        feeCollector,
      });
      const context = optionalString(estimateRecord.context) || optionalString(currentPayload.context);
      if (
        bufferedPaymentAmount &&
        currentPaymentAmount &&
        BigInt(currentPaymentAmount) < BigInt(bufferedPaymentAmount)
      ) {
        currentPayload = replacePaymentAmount(currentPayload, {
          token: paymentToken,
          feeCollector,
          amountUnits: bufferedPaymentAmount,
        });
        continue;
      }

      return {
        ok: true,
        payload: {
          ...currentPayload,
          ...(context ? { context } : {}),
          estimate,
        },
        estimates,
      };
    }

    return {
      ok: false,
      payload: currentPayload,
      estimate: estimates[estimates.length - 1],
      estimates,
      error:
        "1Shot requiredPaymentAmount did not stabilize after fee adjustment attempts",
    };
  }

  private async resolvePaymentAmountUnits(input: {
    chainId: number;
    token: `0x${string}`;
    explicitAmountUnits?: string;
  }): Promise<string> {
    if (input.explicitAmountUnits) {
      return requireDecimalInteger(input.explicitAmountUnits, "paymentAmountUnits");
    }
    const feeData = await this.getFeeData({ chainId: input.chainId, token: input.token });
    const record = asRecord(feeData);
    const token = asRecord(record.token);
    const decimals = parseTokenDecimals(token.decimals);
    const minFee = optionalString(record.minFee);
    if (!minFee) throw new Error("1Shot fee data did not include minFee");
    return decimalUnits(minFee, decimals);
  }

  private resolveAgentProfile(profileId?: string, walletId?: string): ExecutionProfile {
    const profile = walletId
      ? this.store.resolveExecutionProfile(`agent:${walletId}`)
      : this.store.resolveExecutionProfile(profileId || "agent");
    if (profile.kind !== "agent" || !profile.walletId) {
      throw new Error(`Execution profile ${profile.id} is not a delegated agent profile`);
    }
    return profile;
  }

  private findActiveDelegationForDelegate(input: {
    walletId: string;
    chainId: number;
    delegate: `0x${string}`;
  }): AgentDelegationRecord | null {
    const match = this.store
      .listDelegations({
        walletId: input.walletId,
        chainId: input.chainId,
        status: "active",
      })
      .reverse()
      .find((metadata) => metadata.delegate.toLowerCase() === input.delegate.toLowerCase());
    return match ? this.store.getDelegation(match.id) : null;
  }

  private findCompatibleDelegation(input: {
    current: AgentDelegationRecord;
    profile: ExecutionProfile;
    chainId: number;
    calls: WalletCall[];
    paymentToken?: `0x${string}`;
    targetAddress?: `0x${string}`;
    explicitDelegation: boolean;
  }): AgentDelegationRecord | null {
    if (delegationSupportsCalls(input.current, input.calls, input.paymentToken)) {
      return input.current;
    }
    if (input.explicitDelegation || !input.profile.walletId) return null;
    const candidates = this.store
      .listDelegations({
        walletId: input.profile.walletId,
        chainId: input.chainId,
        status: "active",
      })
      .reverse()
      .map((metadata) => this.store.getDelegation(metadata.id));
    return candidates.find((candidate) =>
      !!candidate.signature &&
      (!input.targetAddress || candidate.delegate.toLowerCase() === input.targetAddress.toLowerCase()) &&
      delegationSupportsCalls(candidate, input.calls, input.paymentToken)
    ) || null;
  }

  private functionCallDelegationRepair(input: {
    delegation: AgentDelegationRecord;
    profile: ExecutionProfile;
    chain: RuntimeChainSummary;
    calls: WalletCall[];
    paymentToken?: `0x${string}`;
  }): Record<string, unknown> | null {
    const permission = functionCallPermissionForCalls(input.calls, input.paymentToken);
    if (!permission) return null;
    if (!needsFunctionCallDelegation(input.delegation, input.calls, input.paymentToken)) return null;
    return {
      status: "needs_function_call_delegation",
      profile: input.profile,
      delegation: delegationMetadata(input.delegation),
      chain: input.chain,
      relayer: this.getInfo(),
      requiredScope: {
        type: "function-call",
        allowedTargets: permission.allowedTargets,
        allowedSelectors: permission.allowedSelectors,
      },
      prepareDelegationArgs: {
        profileId: input.profile.id,
        chain: input.chain.chainId,
        delegateMode: "oneshot-relayer",
        scopeType: "function-call",
        allowedTargets: permission.allowedTargets,
        allowedSelectors: permission.allowedSelectors,
        label: `${input.profile.label} DeFi calls`,
      },
      recommendedNextTools: [
        "agent_prepare_delegation",
        "agent_request_delegation_signature",
        "agent_complete_delegation",
        "retry_original_call",
      ],
      message:
        `The active delegation scope is ${input.delegation.scope.type}, which does not authorize these prepared DeFi calls. ` +
        "Prepare and complete a function-call delegation using prepareDelegationArgs, then retry the original transaction.",
    };
  }

  private async rpc(method: string, params: unknown): Promise<unknown> {
    const response = await fetch(this.relayerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: this.id++,
        method,
        params,
      }),
    });
    const payload = await response.json() as {
      result?: unknown;
      error?: { code?: number; message?: string; data?: unknown };
    };
    if (!response.ok || payload.error) {
      const message = payload.error?.message || `1Shot relayer ${method} failed`;
      const error = new Error(message) as Error & { code?: number; data?: unknown };
      error.code = payload.error?.code;
      error.data = payload.error?.data;
      throw error;
    }
    return payload.result;
  }
}

interface OneShotCapability {
  feeCollector?: unknown;
  targetAddress?: unknown;
  tokens?: unknown;
}

function buildSend7710Payload(input: {
  chainId: number;
  delegation: AgentDelegationRecord;
  calls: WalletCall[];
  payment?: {
    token: `0x${string}`;
    feeCollector: `0x${string}`;
    amountUnits: string;
  };
  context?: string;
  taskId?: string;
  destinationUrl?: string;
  memo?: string;
}): Record<string, unknown> {
  const executions = [
    ...(input.payment ? [feePaymentExecution(input.payment)] : []),
    ...input.calls.map(callToExecution),
  ];
  if (executions.length === 0) throw new Error("1Shot relay requires at least one execution");
  return {
    chainId: String(input.chainId),
    transactions: [
      {
        permissionContext: [input.delegation.delegation],
        executions,
      },
    ],
    ...(input.context ? { context: input.context } : {}),
    ...(input.taskId ? { taskId: requireTaskId(input.taskId) } : {}),
    ...(input.destinationUrl ? { destinationUrl: input.destinationUrl } : {}),
    ...(input.memo ? { memo: input.memo } : {}),
  };
}

function feePaymentExecution(input: {
  token: `0x${string}`;
  feeCollector: `0x${string}`;
  amountUnits: string;
}): Record<string, unknown> {
  return {
    target: input.token,
    value: "0x0",
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "transfer",
      args: [input.feeCollector, BigInt(input.amountUnits)],
    }),
  };
}

function callToExecution(call: WalletCall): Record<string, unknown> {
  return {
    target: normalizeAddress(call.to, "call target"),
    value: normalizeHex(call.value ?? "0x0", "call value"),
    data: normalizeHex(call.data ?? "0x", "call data"),
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

function capabilityForChain(value: unknown, chainId: number): OneShotCapability {
  const capabilities = asRecord(value);
  const capability = asRecord(capabilities[String(chainId)]);
  if (!capability) throw new Error(`1Shot relayer did not return capabilities for chain ${chainId}`);
  return capability;
}

function defaultPaymentToken(capability: OneShotCapability, chainId: number): string {
  const tokens = Array.isArray(capability.tokens) ? capability.tokens : [];
  const baseUsdc = tokens.find((token) =>
    asRecord(token).address?.toString().toLowerCase() === BASE_USDC_ADDRESS.toLowerCase()
  );
  const selected = baseUsdc || tokens[0];
  const address = asRecord(selected).address;
  if (typeof address === "string") return address;
  if (chainId === BASE_CHAIN_ID) return BASE_USDC_ADDRESS;
  throw new Error("1Shot capabilities did not include a payment token. Pass paymentToken explicitly.");
}

function extractPaymentAmount(
  payload: Record<string, unknown>,
  payment: {
    token: `0x${string}`;
    feeCollector: `0x${string}`;
  },
): string | null {
  const execution = paymentExecution(payload, payment);
  if (!execution) return null;
  const data = optionalString(execution.data);
  if (!data || data.length < 138) return null;
  return BigInt(`0x${data.slice(74, 138)}`).toString();
}

function replacePaymentAmount(
  payload: Record<string, unknown>,
  payment: {
    token: `0x${string}`;
    feeCollector: `0x${string}`;
    amountUnits: string;
  },
): Record<string, unknown> {
  const transactions = Array.isArray(payload.transactions)
    ? payload.transactions.map((transaction) => {
        const record = asRecord(transaction);
        const executions = Array.isArray(record.executions)
          ? record.executions.map((execution) => {
              const executionRecord = asRecord(execution);
              if (isFeePaymentExecution(executionRecord, payment)) {
                return feePaymentExecution(payment);
              }
              return execution;
            })
          : record.executions;
        return { ...record, executions };
      })
    : payload.transactions;
  return { ...payload, transactions };
}

function paymentExecution(
  payload: Record<string, unknown>,
  payment: {
    token: `0x${string}`;
    feeCollector: `0x${string}`;
  },
): Record<string, unknown> | null {
  const transactions = Array.isArray(payload.transactions) ? payload.transactions : [];
  for (const transaction of transactions) {
    const executions = asRecord(transaction).executions;
    if (!Array.isArray(executions)) continue;
    for (const execution of executions) {
      const record = asRecord(execution);
      if (isFeePaymentExecution(record, payment)) {
        return record;
      }
    }
  }
  return null;
}

function isFeePaymentExecution(
  execution: Record<string, unknown>,
  payment: {
    token: `0x${string}`;
    feeCollector: `0x${string}`;
  },
): boolean {
  if (optionalString(execution.target)?.toLowerCase() !== payment.token.toLowerCase()) {
    return false;
  }
  const data = optionalString(execution.data);
  if (!data || !data.toLowerCase().startsWith(ERC20_TRANSFER_SELECTOR)) {
    return false;
  }
  const recipient = erc20TransferRecipient(data);
  return recipient?.toLowerCase() === payment.feeCollector.toLowerCase();
}

function erc20TransferRecipient(data: string): `0x${string}` | null {
  const normalized = data.toLowerCase();
  if (!/^0xa9059cbb[0-9a-f]{128}$/.test(normalized)) return null;
  try {
    return getAddress(`0x${normalized.slice(34, 74)}`);
  } catch {
    return null;
  }
}

function parseTokenDecimals(value: unknown): number {
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (Number.isInteger(numeric) && numeric >= 0 && numeric <= 36) return numeric;
  return 6;
}

function decimalUnits(value: string, decimals: number): string {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) throw new Error(`Invalid decimal amount from 1Shot fee data: ${value}`);
  const fraction = (match[2] || "").padEnd(decimals, "0").slice(0, decimals);
  return `${match[1]}${fraction}`.replace(/^0+(?=\d)/, "") || "0";
}

function addPaymentBuffer(
  amountUnits: string,
  buffer: {
    bps: bigint;
    minUnits: bigint;
  },
): string {
  const amount = BigInt(requireDecimalInteger(amountUnits, "requiredPaymentAmount"));
  const percentBuffer = buffer.bps === 0n
    ? 0n
    : (amount * buffer.bps + (BPS_DENOMINATOR - 1n)) / BPS_DENOMINATOR;
  const extra = percentBuffer > buffer.minUnits ? percentBuffer : buffer.minUnits;
  return (amount + extra).toString();
}

function delegationMetadata(value: AgentDelegationRecord): Record<string, unknown> {
  const {
    delegation: _delegation,
    typedData: _typedData,
    signature: _signature,
    ...metadata
  } = value;
  return metadata;
}

function needsFunctionCallDelegation(
  delegation: AgentDelegationRecord,
  calls: WalletCall[],
  paymentToken?: `0x${string}`,
): boolean {
  return !delegationSupportsCalls(delegation, calls, paymentToken) &&
    functionCallPermissionForCalls(calls, paymentToken) !== null;
}

function delegationSupportsCalls(
  delegation: AgentDelegationRecord,
  calls: WalletCall[],
  paymentToken?: `0x${string}`,
): boolean {
  const permission = functionCallPermissionForCalls(calls, paymentToken);
  if (!permission) return true;
  if (delegation.scope.type !== "function-call") {
    return !requiresFunctionCallScope(calls);
  }
  const allowedTargets = new Set(
    (delegation.scope.allowedTargets || []).map((target) => target.toLowerCase()),
  );
  const allowedSelectors = new Set(
    (delegation.scope.allowedSelectors || []).map((selector) => selector.toLowerCase()),
  );
  return permission.allowedTargets.every((target) => allowedTargets.has(target.toLowerCase())) &&
    permission.allowedSelectors.every((selector) => allowedSelectors.has(selector.toLowerCase()));
}

function requiresFunctionCallScope(calls: WalletCall[]): boolean {
  return calls.some((call) => {
    const selector = callSelector(call);
    return !!selector && selector.toLowerCase() !== ERC20_TRANSFER_SELECTOR;
  });
}

function functionCallPermissionForCalls(
  calls: WalletCall[],
  paymentToken?: `0x${string}`,
): {
  allowedTargets: `0x${string}`[];
  allowedSelectors: `0x${string}`[];
} | null {
  const targets: `0x${string}`[] = [];
  const selectors: `0x${string}`[] = [];
  for (const call of calls) {
    const selector = callSelector(call);
    if (!selector) return null;
    pushUniqueAddress(targets, normalizeAddress(call.to, "call target"));
    pushUniqueSelector(selectors, selector);
  }
  if (paymentToken) {
    pushUniqueAddress(targets, paymentToken);
    pushUniqueSelector(selectors, ERC20_TRANSFER_SELECTOR as `0x${string}`);
  }
  return targets.length > 0 && selectors.length > 0
    ? { allowedTargets: targets, allowedSelectors: selectors }
    : null;
}

function callSelector(call: WalletCall): `0x${string}` | null {
  const data = call.data || "0x";
  if (!/^0x[0-9a-fA-F]*$/.test(data) || data.length < 10) return null;
  return data.slice(0, 10) as `0x${string}`;
}

function pushUniqueAddress(values: `0x${string}`[], address: `0x${string}`): void {
  if (!values.some((value) => value.toLowerCase() === address.toLowerCase())) {
    values.push(address);
  }
}

function pushUniqueSelector(values: `0x${string}`[], selector: `0x${string}`): void {
  if (!values.some((value) => value.toLowerCase() === selector.toLowerCase())) {
    values.push(selector);
  }
}

function normalizeRelayerUrl(value: string): string {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
    throw new Error("WALLETCHAN_MCP_ONESHOT_RELAYER_URL must be HTTPS unless using localhost");
  }
  return parsed.toString();
}

function normalizeAddress(value: unknown, label: string): `0x${string}` {
  if (typeof value === "string") {
    try {
      return getAddress(value);
    } catch {
      // fall through
    }
  }
  throw new Error(`Invalid ${label}: ${String(value)}`);
}

function normalizeHex(value: unknown, label: string): `0x${string}` {
  if (typeof value === "string" && /^0x[0-9a-fA-F]*$/.test(value)) return value as `0x${string}`;
  throw new Error(`Invalid ${label} hex value`);
}

function requireTaskId(value: unknown): string {
  if (typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value)) return value;
  throw new Error(`Invalid 1Shot taskId: ${String(value)}`);
}

function requireDecimalInteger(value: unknown, label: string): string {
  if (typeof value === "string" && /^[0-9]+$/.test(value)) return value;
  throw new Error(`${label} must be a decimal integer string`);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
