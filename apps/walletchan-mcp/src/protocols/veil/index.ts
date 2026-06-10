import { buildVeilMcpProcessConfig, type VeilRuntimeConfig } from "./env.js";
import {
  StdioMcpClient,
  type ProtocolMcpTool,
  type ProtocolToolResult,
} from "../stdioMcpClient.js";
import {
  VEIL_WRAPPED_TOOLS,
  type ProtocolToolDefinition,
} from "./toolDefinitions.js";

const VEIL_PRIVATE_TOOLS = new Set([
  "veil_withdraw",
  "veil_transfer",
  "veil_consolidate_utxos",
  "veil_pay_x402",
]);

const VEIL_PREPARE_TOOLS = new Set([
  "veil_prepare_register",
  "veil_prepare_deposit",
]);

const VEIL_OWNER_TOOLS = new Set([
  "veil_get_balances",
  "veil_deposit_status",
  "veil_wait_for_deposit",
  "veil_prepare_register",
  "veil_prepare_deposit",
]);

const VEIL_WITHDRAW_MINIMUMS = {
  ETH: {
    decimals: 18,
    minUnits: 1_000_000_000_000_000n,
    minLabel: "0.001 ETH",
  },
  USDC: {
    decimals: 6,
    minUnits: 10_000n,
    minLabel: "0.01 USDC",
  },
} as const;

export class VeilProtocol {
  private readonly client: StdioMcpClient;

  constructor(private readonly config: VeilRuntimeConfig) {
    this.client = new StdioMcpClient(buildVeilMcpProcessConfig(config));
  }

  listProfile(): Record<string, unknown> {
    return {
      id: "veil",
      name: "Veil Cash",
      enabled: this.config.enabled,
      transport: "stdio-mcp",
      privateActionsEnabled: this.config.privateActionsEnabled,
      defaultDataDir: buildVeilMcpProcessConfig(this.config).cwd,
      package: "@veil-cash/mcp@0.2.1",
    };
  }

  listWrappedToolDefinitions(): ProtocolToolDefinition[] {
    return VEIL_WRAPPED_TOOLS;
  }

  hasWrappedTool(toolName: string): boolean {
    return VEIL_WRAPPED_TOOLS.some((tool) => tool.name === toolName);
  }

  isPrepareTool(toolName: string): boolean {
    return VEIL_PREPARE_TOOLS.has(toolName);
  }

  needsOwner(toolName: string): boolean {
    return VEIL_OWNER_TOOLS.has(toolName);
  }

  async listTools(): Promise<ProtocolMcpTool[]> {
    this.ensureEnabled();
    return this.client.listTools();
  }

  async callTool(
    toolName: string,
    args: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<ProtocolToolResult> {
    this.ensureEnabled();
    const normalizedArgs = normalizeVeilToolArgs(toolName, args);
    this.ensureToolAllowed(toolName, normalizedArgs);
    if (toolName === "veil_withdraw") {
      assertVeilWithdrawMinimum(normalizedArgs);
    }
    if (toolName === "veil_pay_x402" && normalizedArgs.confirm === true) {
      await this.assertX402PaymentMinimum(normalizedArgs, timeoutMs);
    }
    let result: ProtocolToolResult;
    try {
      result = await this.client.callTool(toolName, normalizedArgs, timeoutMs);
    } catch (error) {
      throw normalizeVeilRelayError(toolName, error);
    }

    const resultError = normalizeVeilToolResultError(toolName, result);
    if (resultError) throw resultError;
    return result;
  }

  shutdown(): void {
    this.client.shutdown();
  }

  private ensureEnabled(): void {
    if (!this.config.enabled) {
      throw new Error("Veil MCP integration is disabled. Set WALLETCHAN_MCP_VEIL=true to enable it.");
    }
  }

  private ensureToolAllowed(toolName: string, args: Record<string, unknown>): void {
    if (VEIL_PRIVATE_TOOLS.has(toolName) && !this.config.privateActionsEnabled) {
      if (
        toolName === "veil_pay_x402" &&
        args.confirm === true &&
        typeof args.maxPayment === "string" &&
        args.maxPayment.trim()
      ) {
        return;
      }
      throw new Error(
        `${toolName} is disabled by default because it submits through the Veil relay without a WalletChan popup. ` +
          "For x402 payments, quote first and then call veil_pay_x402 with maxPayment and confirm=true after explicit user approval. " +
          "Set WALLETCHAN_MCP_VEIL_PRIVATE_ACTIONS=true only to enable broader relay-backed private actions such as withdraw, transfer, or consolidation.",
      );
    }
  }

  private async assertX402PaymentMinimum(
    args: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<void> {
    const quoteArgs = x402QuoteArgs(args);
    const quoteResult = await this.client.callTool("veil_x402_quote", quoteArgs, timeoutMs);
    const quote = quoteResult.parsed;
    if (!isRecord(quote) || quote.supported !== true) return;

    const amountUnits = quoteAmountUnits(quote);
    if (amountUnits === null || amountUnits >= VEIL_WITHDRAW_MINIMUMS.USDC.minUnits) {
      return;
    }

    const amount = typeof quote.amount === "string"
      ? quote.amount
      : formatDecimalUnits(amountUnits, VEIL_WITHDRAW_MINIMUMS.USDC.decimals);
    throw new Error(
      `Veil x402 payment price is ${amount} USDC, below the minimum Veil USDC relay withdrawal of ${VEIL_WITHDRAW_MINIMUMS.USDC.minLabel}. ` +
        `WalletChan MCP did not call veil_pay_x402, so no payer discovery, funding, or payment was attempted. ` +
        `Do not retry this x402 resource through Veil unless its quoted price is at least ${VEIL_WITHDRAW_MINIMUMS.USDC.minLabel}.`,
    );
  }
}

function normalizeVeilToolArgs(
  toolName: string,
  args: Record<string, unknown>,
): Record<string, unknown> {
  if (toolName !== "veil_x402_quote" && toolName !== "veil_pay_x402") {
    return args;
  }

  const normalized = { ...args };
  if (normalized.body === null) {
    delete normalized.body;
  }

  const rawMethod = typeof normalized.method === "string" ? normalized.method.trim() : "";
  const method = rawMethod ? rawMethod.toUpperCase() : normalized.body === undefined ? "" : "POST";
  if (method) {
    if (method !== "GET" && method !== "POST") {
      throw new Error("Veil x402 method must be GET or POST.");
    }
    normalized.method = method;
  }

  if (normalized.body !== undefined && normalized.method !== "POST") {
    throw new Error("Veil x402 body is only allowed with method POST.");
  }

  return normalized;
}

function assertVeilWithdrawMinimum(args: Record<string, unknown>): void {
  const asset = requiredAsset(args.asset, "veil_withdraw asset must be ETH or USDC");
  const amount = requiredString(args.amount, "veil_withdraw requires amount");
  const minimum = VEIL_WITHDRAW_MINIMUMS[asset];
  const amountUnits = parseDecimalUnits(amount, minimum.decimals);
  if (amountUnits >= minimum.minUnits) return;

  throw new Error(
    `Minimum Veil ${asset} withdrawal is ${minimum.minLabel}. ` +
      `Requested ${amount} ${asset}; WalletChan MCP did not call the Veil relay. ` +
      `Use at least ${minimum.minLabel}.`,
  );
}

function x402QuoteArgs(args: Record<string, unknown>): Record<string, unknown> {
  const quoteArgs: Record<string, unknown> = {};
  for (const key of ["url", "method", "body", "headers", "maxPayment"]) {
    if (args[key] !== undefined) quoteArgs[key] = args[key];
  }
  return quoteArgs;
}

function quoteAmountUnits(quote: Record<string, unknown>): bigint | null {
  const amountAtomic = quote.amountAtomic;
  if (typeof amountAtomic === "string" && /^\d+$/.test(amountAtomic)) {
    return BigInt(amountAtomic);
  }
  if (typeof amountAtomic === "number" && Number.isSafeInteger(amountAtomic) && amountAtomic >= 0) {
    return BigInt(amountAtomic);
  }
  const amount = quote.amount;
  if (typeof amount === "string") {
    return parseDecimalUnits(amount, VEIL_WITHDRAW_MINIMUMS.USDC.decimals);
  }
  if (typeof amount === "number" && Number.isFinite(amount) && amount >= 0) {
    return parseDecimalUnits(amount.toString(), VEIL_WITHDRAW_MINIMUMS.USDC.decimals);
  }
  return null;
}

function requiredAsset(value: unknown, message: string): keyof typeof VEIL_WITHDRAW_MINIMUMS {
  if (typeof value !== "string") throw new Error(message);
  const asset = value.trim().toUpperCase();
  if (asset !== "ETH" && asset !== "USDC") throw new Error(message);
  return asset;
}

function requiredString(value: unknown, message: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(message);
  return value.trim();
}

function parseDecimalUnits(value: string, decimals: number): bigint {
  const trimmed = value.trim();
  const match = /^(\d+)(?:\.(\d+))?$/.exec(trimmed);
  if (!match) {
    throw new Error(`Invalid decimal amount: ${value}`);
  }
  const whole = match[1];
  const fraction = match[2] ?? "";
  if (fraction.length > decimals) {
    throw new Error(`Amount ${value} has too many decimal places; max is ${decimals}`);
  }
  return BigInt(whole + fraction.padEnd(decimals, "0"));
}

function formatDecimalUnits(value: bigint, decimals: number): string {
  const padded = value.toString().padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals);
  const fraction = padded.slice(-decimals).replace(/0+$/, "");
  return `${whole}${fraction ? `.${fraction}` : ""}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeVeilRelayError(toolName: string, error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (isVeilRelayGasPriceError(message)) {
    return veilRelayGasPriceError(toolName);
  }
  return error instanceof Error ? error : new Error(message);
}

function normalizeVeilToolResultError(
  toolName: string,
  result: ProtocolToolResult,
): Error | null {
  const text = mcpToolErrorText(result.raw);
  if (text && isVeilRelayGasPriceError(text)) {
    return veilRelayGasPriceError(toolName);
  }
  return null;
}

function mcpToolErrorText(raw: unknown): string | null {
  if (!isRecord(raw) || raw.isError !== true || !Array.isArray(raw.content)) {
    return null;
  }

  const text = raw.content
    .filter(isRecord)
    .map((item) => (typeof item.text === "string" ? item.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
  return text || null;
}

function isVeilRelayGasPriceError(message: string): boolean {
  return /gas price too high/i.test(message);
}

function veilRelayGasPriceError(toolName: string): Error {
  const action = toolName === "veil_pay_x402"
    ? "x402 payer funding transaction"
    : `${toolName} private relay transaction`;
  return new Error(
    `Veil relay refused the ${action}: Base gas is above the Veil relay cap ("Gas price too high, try again later"). ` +
      `This private action is submitted by Veil's hosted relay, not by WalletChan or the configured Base RPC, so WalletChan MCP cannot raise the relay gas cap or force submission. ` +
      `Do not retry immediately. For x402, check veil_x402_payer_balances once; if a payer already has enough USDC, retry with that payerIndex. Otherwise wait for Base gas to fall and retry later.`,
  );
}
