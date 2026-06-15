import { createx402DelegationProvider } from "@metamask/smart-accounts-kit/experimental";
import type { Delegation } from "@metamask/smart-accounts-kit";
import { getSmartAccountsEnvironment } from "@metamask/smart-accounts-kit";
import { x402Erc7710Client, type x402PaymentRequirements } from "@metamask/x402";
import {
  decodePaymentResponseHeader,
  wrapFetchWithPaymentFromConfig,
  x402Client,
  x402HTTPClient,
  type PaymentRequired,
  type PaymentRequirements,
} from "@x402/fetch";
import { ExactEvmScheme, toClientEvmSigner } from "@x402/evm";
import {
  createPublicClient,
  http,
  type Chain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, mainnet, optimism, polygon, arbitrum } from "viem/chains";
import type { AgentDelegationRecord, AgentWalletStore, ExecutionProfile } from "./agentWallets.js";
import { findConfiguredChain, formatConfiguredChains, type RuntimeChainSummary } from "./chains.js";
import { WALLETCHAN_BASE_RPC_URL } from "./walletchanRpcDefaults.js";

const BASE_CHAIN_ID = 8453;
const DEFAULT_MAX_RESPONSE_BYTES = 1_000_000;

export interface AgentX402Config {
  baseRpcUrl?: string;
}

export interface AgentX402RequestInput {
  profileId?: string;
  walletId?: string;
  url: string;
  method?: string;
  headers?: unknown;
  body?: unknown;
  chain?: unknown;
  maxPayment?: string;
  maxPaymentUnits?: string;
  tokenDecimals?: number;
  timeoutMs?: number;
  maxResponseBytes?: number;
}

export class AgentX402Client {
  constructor(
    private readonly store: AgentWalletStore,
    private readonly config: AgentX402Config,
  ) {}

  async quote(input: AgentX402RequestInput): Promise<Record<string, unknown>> {
    const request = buildHttpRequest(input);
    const response = await fetchWithTimeout(request.url, request.init, input.timeoutMs);
    const body = await readBoundedResponse(response, input.maxResponseBytes);
    if (response.status !== 402) {
      return {
        status: "no_payment_required",
        httpStatus: response.status,
        headers: publicHeaders(response.headers),
        body,
        message: "The endpoint did not return HTTP 402 Payment Required.",
      };
    }
    const paymentRequired = parsePaymentRequiredResponse(response, body);
    const delegatedOptions = paymentRequired
      ? paymentRequired.accepts.filter(isErc7710PaymentRequirement).map(publicPaymentRequirement)
      : [];
    return {
      status: "payment_required",
      httpStatus: response.status,
      headers: publicHeaders(response.headers),
      paymentRequired: paymentRequired ?? (typeof body.text === "string" ? parseMaybeJson(body.text) : undefined),
      delegatedPaymentSupported: delegatedOptions.length > 0,
      delegatedPaymentOptions: delegatedOptions,
      body,
      message: delegatedOptions.length > 0
        ? "Quote only. The endpoint offers ERC-7710 x402 payment options; no payment was signed or submitted."
        : "Quote only. The endpoint did not advertise an ERC-7710 x402 payment option for delegated agent payment.",
    };
  }

  async pay(input: AgentX402RequestInput): Promise<Record<string, unknown>> {
    const profile = this.resolveAgentProfile(input.profileId, input.walletId);
    const chain = resolveConfiguredChain(defaultChains(), input.chain);
    if (profile.kind === "agent") {
      return this.payWithDelegation(input, profile, chain);
    }
    return this.payWithRawAgentEoa(input, profile, chain);
  }

  private async payWithDelegation(
    input: AgentX402RequestInput,
    profile: ExecutionProfile,
    chain: RuntimeChainSummary,
  ): Promise<Record<string, unknown>> {
    const maxPaymentUnits = maxPaymentUnitsFromInput(input);
    const privateKey = this.requirePrivateKey(profile);
    const account = privateKeyToAccount(privateKey);
    const network = `eip155:${chain.chainId}` as const;
    let selectedRequirement: PaymentRequirements | null = null;
    let selectedDelegation: AgentDelegationRecord | null = null;
    const delegationClient = new x402Erc7710Client({
      delegationProvider: createx402DelegationProvider({
        account,
        environment: () => getSmartAccountsEnvironment(chain.chainId),
        parentPermissionContext: (requirements) => {
          selectedDelegation = this.requireX402Delegation(profile, chain, requirements);
          return [
            selectedDelegation.delegation as unknown as Delegation,
          ];
        },
        expirySeconds: (requirements) => requirements.maxTimeoutSeconds,
      }),
    });
    const fetchWithPayment = wrapFetchWithPaymentFromConfig(fetch, {
      schemes: [
        {
          network,
          client: delegationClient,
        },
      ],
      paymentRequirementsSelector: (version, accepts) => {
        if (version !== 2) {
          throw new Error(
            `Delegated agent x402 requires x402 v2 ERC-7710 payment requirements; endpoint returned version ${version}.`,
          );
        }
        const supported = accepts
          .filter((accept) => accept.network === network)
          .filter(isErc7710PaymentRequirement)
          .filter((accept) => BigInt(paymentRequirementAmount(accept)) <= BigInt(maxPaymentUnits))
          .sort((a, b) => bigintSort(paymentRequirementAmount(a), paymentRequirementAmount(b)));
        if (supported.length === 0) {
          throw new Error(
            `No delegated ERC-7710 x402 payment option for ${network} is within maxPaymentUnits=${maxPaymentUnits}. ` +
            `Offered: ${JSON.stringify(accepts.map(publicPaymentRequirement))}. ` +
            "The agent profile no longer falls back to agent-wallet USDC; use an x402 endpoint that advertises extra.assetTransferMethod=\"erc7710\", or explicitly use profileId agent-eoa:<walletId> for raw agent-wallet payment.",
          );
        }
        selectedRequirement = supported[0]!;
        return selectedRequirement;
      },
    });
    const request = buildHttpRequest(input);
    const response = await fetchWithTimeout(
      request.url,
      request.init,
      input.timeoutMs,
      fetchWithPayment,
    );
    const body = await readBoundedResponse(response, input.maxResponseBytes);
    const paymentResponseHeader = getPaymentResponseHeader(response.headers);
    const paymentResponse = paymentResponseHeader
      ? decodePaymentResponseHeader(paymentResponseHeader)
      : null;
    const paid = response.ok && !!paymentResponseHeader;
    const usedDelegation = selectedDelegation as AgentDelegationRecord | null;
    const usedRequirement = selectedRequirement as PaymentRequirements | null;
    return {
      status: response.ok
        ? paid ? "paid" : "payment_not_required"
        : "failed",
      httpStatus: response.status,
      profile,
      chain,
      payer: usedDelegation?.delegator ?? paymentResponse?.payer ?? null,
      paymentSigner: account.address,
      fundingSource: paid ? "delegated_main_wallet_usdc" : "none",
      maxPaymentUnits,
      selectedPaymentRequirement: usedRequirement
        ? publicPaymentRequirement(usedRequirement)
        : null,
      delegation: usedDelegation
        ? delegationMetadata(usedDelegation)
        : null,
      headers: publicHeaders(response.headers),
      paymentResponse,
      body,
      approvalMode: "agent_auto",
      executionMode: "delegated_erc7710_x402",
      delegationUsed: paid,
      message: paid
        ? "x402 request was paid through the active ERC-7710 delegation. The main WalletChan wallet is the payer; the agent wallet only signed the redelegated permission context."
        : "x402 request completed without submitting a delegated payment.",
    };
  }

  private async payWithRawAgentEoa(
    input: AgentX402RequestInput,
    profile: ExecutionProfile,
    chain: RuntimeChainSummary,
  ): Promise<Record<string, unknown>> {
    const maxPaymentUnits = maxPaymentUnitsFromInput(input);
    const privateKey = this.requirePrivateKey(profile);
    const account = privateKeyToAccount(privateKey);
    const publicClient = createPublicClient({
      chain: viemChain(chain),
      transport: http(this.rpcUrl(chain)),
    });
    const signer = toClientEvmSigner(account, publicClient);
    const network = `eip155:${chain.chainId}` as const;
    const fetchWithPayment = wrapFetchWithPaymentFromConfig(fetch, {
      schemes: [
        {
          network,
          client: new ExactEvmScheme(signer, {
            [chain.chainId]: { rpcUrl: this.rpcUrl(chain) },
          }),
        },
      ],
      paymentRequirementsSelector: (_version, accepts) => {
        const supported = accepts
          .filter((accept) => accept.network === network)
          .filter((accept) => BigInt(accept.amount) <= BigInt(maxPaymentUnits))
          .sort((a, b) => Number(BigInt(a.amount) - BigInt(b.amount)));
        if (supported.length === 0) {
          const offered = accepts.map((accept) => ({
            network: accept.network,
            scheme: accept.scheme,
            asset: accept.asset,
            amount: accept.amount,
            payTo: accept.payTo,
          }));
          throw new Error(
            `No x402 payment option for ${network} is within maxPaymentUnits=${maxPaymentUnits}. Offered: ${JSON.stringify(offered)}`,
          );
        }
        return supported[0]!;
      },
    });
    const request = buildHttpRequest(input);
    const response = await fetchWithTimeout(
      request.url,
      request.init,
      input.timeoutMs,
      fetchWithPayment,
    );
    const body = await readBoundedResponse(response, input.maxResponseBytes);
    const paymentResponseHeader = getPaymentResponseHeader(response.headers);
    return {
      status: response.ok
        ? paymentResponseHeader ? "paid" : "payment_not_required"
        : "failed",
      httpStatus: response.status,
      profile,
      chain,
      payer: account.address,
      paymentSigner: account.address,
      fundingSource: "agent_wallet_usdc",
      maxPaymentUnits,
      headers: publicHeaders(response.headers),
      paymentResponse: paymentResponseHeader ? decodePaymentResponseHeader(paymentResponseHeader) : null,
      body,
      approvalMode: "agent_auto",
      executionMode: "agent_x402_direct",
      delegationUsed: false,
      message:
        "x402 request was paid directly by the raw local agent EOA. Main-wallet ERC-7710 delegation and WalletChan popup approval were not used.",
    };
  }

  private resolveAgentProfile(profileId?: string, walletId?: string): ExecutionProfile {
    const profile = profileId
      ? this.store.resolveExecutionProfile(profileId)
      : walletId
        ? this.store.resolveExecutionProfile(`agent:${walletId}`)
        : this.store.resolveExecutionProfile("agent");
    if ((profile.kind !== "agent" && profile.kind !== "agent-eoa") || !profile.walletId) {
      throw new Error(`Execution profile ${profile.id} is not an agent wallet profile`);
    }
    return profile;
  }

  private requirePrivateKey(profile: ExecutionProfile): `0x${string}` {
    if (!profile.walletId) throw new Error(`Execution profile ${profile.id} has no walletId`);
    return this.store.getPrivateKey(profile.walletId);
  }

  private requireX402Delegation(
    profile: ExecutionProfile,
    chain: RuntimeChainSummary,
    requirements: x402PaymentRequirements,
  ): AgentDelegationRecord {
    if (!profile.walletId || !profile.address) {
      throw new Error(`Execution profile ${profile.id} has no agent wallet address`);
    }
    const amount = paymentRequirementAmount(requirements);
    const asset = normalizeAddress(requirements.asset, "x402 payment asset");
    const candidates = this.store
      .listDelegations({
        walletId: profile.walletId,
        chainId: chain.chainId,
        status: "active",
      })
      .map((metadata) => this.store.getDelegation(metadata.id))
      .reverse();
    const match = candidates.find((delegation) =>
      delegation.status === "active" &&
      !!delegation.signature &&
      delegation.delegate.toLowerCase() === profile.address!.toLowerCase() &&
      delegation.delegationManager.toLowerCase() === getSmartAccountsEnvironment(chain.chainId).DelegationManager.toLowerCase() &&
      delegationCoversPayment(delegation, asset, amount)
    );
    if (!match) {
      throw new Error(
        `No active ERC-7710 x402-compatible delegation found for ${profile.id} on ${chain.name}. ` +
        `Prepare a delegation to agent wallet ${profile.address} with token ${asset} and amountUnits >= ${amount}; ` +
        "do not use the 1Shot targetAddress for x402 delegations.",
      );
    }
    return match;
  }

  private rpcUrl(chain: RuntimeChainSummary): string {
    if (chain.chainId === BASE_CHAIN_ID) return this.config.baseRpcUrl || WALLETCHAN_BASE_RPC_URL;
    return DEFAULT_RPC_URLS[chain.chainId] || this.config.baseRpcUrl || WALLETCHAN_BASE_RPC_URL;
  }
}

function buildHttpRequest(input: AgentX402RequestInput): {
  url: string;
  init: RequestInit;
} {
  const url = normalizeHttpsUrl(input.url);
  const method = normalizeMethod(input.method, input.body);
  const headers = normalizeHeaders(input.headers);
  const init: RequestInit = { method, headers };
  if (input.body !== undefined && input.body !== null) {
    if (method !== "POST") throw new Error("x402 request body is only allowed with POST.");
    init.body = typeof input.body === "string" ? input.body : JSON.stringify(input.body);
    if (!hasHeader(headers, "content-type")) {
      headers["content-type"] = typeof input.body === "string"
        ? "text/plain"
        : "application/json";
    }
  }
  return { url, init };
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 30_000,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const timeout = Number.isFinite(timeoutMs) ? Math.max(1_000, Math.min(timeoutMs, 120_000)) : 30_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function readBoundedResponse(
  response: Response,
  maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES,
): Promise<Record<string, unknown>> {
  const limit = Number.isFinite(maxResponseBytes)
    ? Math.max(1_024, Math.min(maxResponseBytes, 5_000_000))
    : DEFAULT_MAX_RESPONSE_BYTES;
  const text = await response.text();
  const bytes = Buffer.byteLength(text, "utf8");
  return {
    contentType: response.headers.get("content-type"),
    bytes,
    truncated: bytes > limit,
    text: bytes > limit ? text.slice(0, limit) : text,
    json: bytes <= limit ? parseMaybeJson(text) : undefined,
  };
}

function maxPaymentUnitsFromInput(input: AgentX402RequestInput): string {
  if (input.maxPaymentUnits) return requireDecimalInteger(input.maxPaymentUnits, "maxPaymentUnits");
  if (!input.maxPayment) {
    throw new Error("agent_x402_pay requires maxPayment or maxPaymentUnits");
  }
  const decimals = normalizeDecimals(input.tokenDecimals, 6);
  return parseDecimalUnits(input.maxPayment, decimals);
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

function parsePaymentRequiredResponse(
  response: Response,
  body: Record<string, unknown>,
): PaymentRequired | undefined {
  try {
    const client = new x402HTTPClient(new x402Client());
    return client.getPaymentRequiredResponse(
      (name) => response.headers.get(name),
      body.json ?? (typeof body.text === "string" ? parseMaybeJson(body.text) : undefined),
    );
  } catch {
    return undefined;
  }
}

function getPaymentResponseHeader(headers: Headers): string | null {
  return headers.get("PAYMENT-RESPONSE") ||
    headers.get("X-PAYMENT-RESPONSE") ||
    headers.get("payment-response") ||
    headers.get("x-payment-response");
}

function isErc7710PaymentRequirement(requirement: PaymentRequirements): boolean {
  return requirement.scheme === "exact" &&
    asRecord(requirement.extra).assetTransferMethod === "erc7710";
}

function paymentRequirementAmount(requirement: PaymentRequirements | x402PaymentRequirements): string {
  const amount = "amount" in requirement
    ? requirement.amount
    : (requirement as { maxAmountRequired?: string }).maxAmountRequired;
  return requireDecimalInteger(amount, "x402 payment amount");
}

function publicPaymentRequirement(requirement: PaymentRequirements): Record<string, unknown> {
  return {
    network: requirement.network,
    scheme: requirement.scheme,
    asset: requirement.asset,
    amount: paymentRequirementAmount(requirement),
    payTo: requirement.payTo,
    maxTimeoutSeconds: requirement.maxTimeoutSeconds,
    assetTransferMethod: asRecord(requirement.extra).assetTransferMethod,
  };
}

function delegationCoversPayment(
  delegation: AgentDelegationRecord,
  asset: `0x${string}`,
  amount: string,
): boolean {
  const scope = delegation.scope;
  if (
    scope.type !== "erc20-period-transfer" &&
    scope.type !== "erc20-transfer-amount"
  ) {
    return false;
  }
  if (!scope.tokenAddress || scope.tokenAddress.toLowerCase() !== asset.toLowerCase()) {
    return false;
  }
  if (!scope.amountUnits) return false;
  return BigInt(scope.amountUnits) >= BigInt(amount);
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

function bigintSort(a: string, b: string): number {
  const left = BigInt(a);
  const right = BigInt(b);
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function normalizeAddress(value: unknown, label: string): `0x${string}` {
  if (typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value)) {
    return value as `0x${string}`;
  }
  throw new Error(`Invalid ${label}: ${String(value)}`);
}

function defaultChains(): RuntimeChainSummary[] {
  return [
    { name: "base", chainId: 8453 },
    { name: "ethereum", chainId: 1 },
    { name: "optimism", chainId: 10 },
    { name: "polygon", chainId: 137 },
    { name: "arbitrum", chainId: 42161 },
  ];
}

function viemChain(chain: RuntimeChainSummary): Chain {
  if (chain.chainId === 1) return mainnet;
  if (chain.chainId === 10) return optimism;
  if (chain.chainId === 137) return polygon;
  if (chain.chainId === 42161) return arbitrum;
  if (chain.chainId === 8453) return base;
  return {
    id: chain.chainId,
    name: chain.name,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: {
      default: { http: [DEFAULT_RPC_URLS[chain.chainId] || WALLETCHAN_BASE_RPC_URL] },
    },
  };
}

const DEFAULT_RPC_URLS: Record<number, string> = {
  1: "https://eth.drpc.org",
  10: "https://mainnet.optimism.io",
  137: "https://polygon.drpc.org",
  42161: "https://arb1.arbitrum.io/rpc",
  8453: WALLETCHAN_BASE_RPC_URL,
};

function normalizeHttpsUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("x402 url is required");
  const parsed = new URL(value);
  if (parsed.protocol !== "https:") throw new Error("x402 requests must use HTTPS URLs");
  return parsed.toString();
}

function normalizeMethod(value: unknown, body: unknown): "GET" | "POST" {
  if ((value === undefined || value === null || value === "") && body !== undefined && body !== null) {
    return "POST";
  }
  const method = typeof value === "string" && value.trim()
    ? value.trim().toUpperCase()
    : "GET";
  if (method === "GET" || method === "POST") return method;
  throw new Error("x402 method must be GET or POST.");
}

function normalizeHeaders(value: unknown): Record<string, string> {
  if (value === undefined || value === null) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("headers must be an object");
  }
  const headers: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw !== "string") throw new Error(`Header ${key} must be a string`);
    const normalized = key.toLowerCase();
    if (BLOCKED_HEADERS.has(normalized)) {
      throw new Error(`Header ${key} is not allowed for agent_x402 requests`);
    }
    headers[normalized] = raw;
  }
  return headers;
}

const BLOCKED_HEADERS = new Set([
  "authorization",
  "cookie",
  "host",
  "proxy-authorization",
  "payment-signature",
  "payment-required",
  "x-payment",
  "x-payment-response",
  "payment",
  "payment-response",
]);

function hasHeader(headers: Record<string, string>, name: string): boolean {
  return Object.keys(headers).some((key) => key.toLowerCase() === name.toLowerCase());
}

function publicHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of headers.entries()) {
    const normalized = key.toLowerCase();
    if (normalized === "set-cookie") continue;
    result[normalized] = value;
  }
  return result;
}

function parseDecimalUnits(value: string, decimals: number): string {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) throw new Error(`Invalid decimal amount: ${value}`);
  const fraction = match[2] || "";
  if (fraction.length > decimals) {
    throw new Error(`Amount ${value} has too many decimal places; max is ${decimals}`);
  }
  return `${match[1]}${fraction.padEnd(decimals, "0")}`.replace(/^0+(?=\d)/, "") || "0";
}

function normalizeDecimals(value: unknown, fallback: number): number {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 36) {
    return value;
  }
  throw new Error("tokenDecimals must be an integer between 0 and 36");
}

function requireDecimalInteger(value: unknown, label: string): string {
  if (typeof value === "string" && /^[0-9]+$/.test(value)) return value;
  throw new Error(`${label} must be a decimal integer string`);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function parseMaybeJson(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) return undefined;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return undefined;
  }
}
