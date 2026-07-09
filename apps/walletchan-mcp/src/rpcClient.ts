import {
  findConfiguredChain,
  formatConfiguredChains,
  parseChainId,
  toHexChainId,
  type RuntimeChainSummary,
} from "./chains.js";
import { getEnvelopeMessage, normalizePersonalSignMessage } from "./siwe.js";

export interface WalletChanRpcHealth {
  ok: boolean;
  connected: boolean;
  accounts?: string[];
  batching?: WalletChanRpcBatching;
  transport?: "walletconnect" | "metamask-connect";
  activeChainId: number;
  chains: RuntimeChainSummary[];
}

export interface WalletChanRpcBatching {
  requested: boolean;
  supported: boolean;
  mode: "erc5792" | "sequential_fallback" | "disconnected";
  approvedMethods: string[];
  missingMethods: string[];
}

export interface WalletChanRpcSession {
  connected: boolean;
  batching?: WalletChanRpcBatching;
  transport?: "walletconnect" | "metamask-connect";
  activeChainId: number;
  chains: string;
  session: {
    accounts: string[];
    batching?: WalletChanRpcBatching;
    methods?: string[];
    peerName: string;
    peerUrl: string;
    topic: string;
  } | null;
}

export interface WalletChanRpcPairing {
  connected: boolean;
  accounts?: string[];
  pairingUri: string | null;
  pairingUrl?: string;
  pairingLabel?: string;
  transport?: "walletconnect" | "metamask-connect";
  batching?: WalletChanRpcBatching;
  activeChainId: number;
  chains: RuntimeChainSummary[];
  error?: string;
}

export interface JsonRpcResponse<T = unknown> {
  jsonrpc: "2.0";
  id: number;
  result?: T;
  error?: { code: number; message: string; data?: unknown };
}

export class WalletChanRpcError extends Error {
  constructor(
    public readonly method: string,
    public readonly code: number | null,
    message: string,
    public readonly data?: unknown,
  ) {
    super(message);
  }
}

export interface WalletCall {
  to: `0x${string}`;
  value?: `0x${string}`;
  data?: `0x${string}`;
}

export interface SendCallsArgs {
  chain?: unknown;
  from?: string;
  atomicRequired?: boolean;
  calls: WalletCall[];
}

export interface SendTransactionArgs {
  chain?: unknown;
  from?: string;
  to?: string;
  value?: string;
  data?: string;
}

export interface SignArgs {
  type?: string;
  chain?: unknown;
  address?: string;
  message?: unknown;
  data?: unknown;
}

export interface EthCallArgs {
  chain?: unknown;
  from?: string;
  to: string;
  data?: string;
  value?: string;
}

export class WalletChanRpcClient {
  private id = 1;

  constructor(private readonly baseUrl: string) {}

  async health(): Promise<WalletChanRpcHealth> {
    return this.fetchJson<WalletChanRpcHealth>("/health");
  }

  async session(): Promise<WalletChanRpcSession> {
    return this.fetchJson<WalletChanRpcSession>("/session");
  }

  async pairing(
    args: {
      account?: string;
      forceRequest?: boolean;
      forceNewSession?: boolean;
      walletTransport?: "walletconnect" | "metamask-connect";
    } = {},
  ): Promise<WalletChanRpcPairing> {
    const params = new URLSearchParams();
    if (args.account) params.set("account", args.account);
    if (args.forceRequest) params.set("forceRequest", "true");
    if (args.forceNewSession) params.set("force", "true");
    if (args.walletTransport) params.set("transport", args.walletTransport);
    const query = params.toString();
    return this.fetchJson<WalletChanRpcPairing>(query ? `/pairing?${query}` : "/pairing");
  }

  async accounts(): Promise<string[]> {
    return this.rpc<string[]>("eth_accounts", []);
  }

  async chainId(): Promise<number> {
    const hex = await this.rpc<string>("eth_chainId", []);
    const chainId = parseChainId(hex);
    if (!chainId) throw new Error(`WalletChan RPC returned invalid chainId: ${hex}`);
    return chainId;
  }

  async getWallets(): Promise<{
    connected: boolean;
    status: "connected" | "needs_pairing";
    needsPairing: boolean;
    activeChainId: number;
    batching?: WalletChanRpcBatching;
    batchingSupported: boolean;
    accounts: string[];
    baseAccount: { address: string; chainId: number } | null;
    wallets: Array<{ address: string; chainId: number }>;
    chains: RuntimeChainSummary[];
    rpcUrl: string;
    recommendedNextTool: string | null;
    message: string;
  }> {
    const [health, rpcAccounts] = await Promise.all([
      this.health(),
      this.accounts().catch(() => []),
    ]);
    let normalizedAccounts = normalizeAccounts(health.accounts);
    if (normalizedAccounts.length === 0) {
      normalizedAccounts = normalizeAccounts(rpcAccounts);
    }
    if (health.connected && normalizedAccounts.length === 0) {
      await sleep(500);
      normalizedAccounts = normalizeAccounts(await this.accounts().catch(() => []));
    }
    const connected = health.connected && normalizedAccounts.length > 0;
    return {
      connected,
      status: connected ? "connected" : "needs_pairing",
      needsPairing: !connected,
      activeChainId: health.activeChainId,
      batching: health.batching,
      batchingSupported: health.batching?.supported === true,
      accounts: normalizedAccounts,
      baseAccount: normalizedAccounts[0]
        ? { address: normalizedAccounts[0], chainId: health.activeChainId }
        : null,
      wallets: normalizedAccounts.map((address) => ({
        address,
        chainId: health.activeChainId,
      })),
      chains: health.chains,
      rpcUrl: this.baseUrl,
      recommendedNextTool: connected ? null : "get_pairing_uri",
      message: connected
        ? health.batching?.supported
          ? "WalletChan RPC is paired and has approved accounts. The wallet supports ERC-5792 batching."
          : "WalletChan RPC is paired and has approved accounts. The wallet does not support ERC-5792 batching, so send_calls will use sequential transaction fallback."
        : `WalletChan RPC is running, but ${formatTransportLabel(health.transport)} is not paired or has no approved accounts. Call get_pairing_uri before sending wallet requests.`,
    };
  }

  async sendCalls(args: SendCallsArgs): Promise<unknown> {
    const [chain, from] = await Promise.all([
      this.resolveChain(args.chain),
      this.resolveFrom(args.from),
    ]);
    const calls = args.calls.map(normalizeCall);
    if (calls.length === 0) {
      throw new Error("send_calls requires at least one call");
    }

    return this.rpc("wallet_sendCalls", [
      {
        version: "2.0.0",
        chainId: toHexChainId(chain.chainId),
        from,
        atomicRequired: args.atomicRequired ?? true,
        calls,
      },
    ]);
  }

  async getCallsStatus(requestId: string): Promise<unknown> {
    return this.rpc("wallet_getCallsStatus", [requestId]);
  }

  async sendTransaction(args: SendTransactionArgs): Promise<string> {
    const [chain, from] = await Promise.all([
      this.resolveChain(args.chain),
      this.resolveFrom(args.from),
    ]);
    return this.rpc<string>("eth_sendTransaction", [
      {
        from,
        chainId: toHexChainId(chain.chainId),
        to: normalizeOptionalAddress(args.to),
        value: normalizeHex(args.value ?? "0x0", "value"),
        data: normalizeHex(args.data ?? "0x", "data"),
      },
    ]);
  }

  async sign(args: SignArgs): Promise<string> {
    const method = args.type || "personal_sign";
    const chain = await this.resolveChain(args.chain);
    const address = await this.resolveFrom(args.address);

    if (method === "personal_sign") {
      const message = extractPersonalSignMessage(args);
      return this.rpc<string>("personal_sign", [message, address], chain.chainId);
    }

    if (method === "eth_signTypedData_v3" || method === "eth_signTypedData_v4") {
      const typedData = args.data ?? args.message;
      if (typedData === undefined) {
        throw new Error(`${method} requires data`);
      }
      return this.rpc<string>(method, [address, typedData], chain.chainId);
    }

    throw new Error(`Unsupported sign type: ${method}`);
  }

  async ethCall(args: EthCallArgs): Promise<string> {
    const [chain, from] = await Promise.all([
      this.resolveChain(args.chain),
      args.from ? this.resolveFrom(args.from) : Promise.resolve(undefined),
    ]);
    return this.rpc<string>("eth_call", [
      {
        ...(from ? { from } : {}),
        to: normalizeAddress(args.to),
        data: normalizeHex(args.data ?? "0x", "data"),
        value: normalizeHex(args.value ?? "0x0", "value"),
      },
      "latest",
    ], chain.chainId);
  }

  async resolveChain(value: unknown): Promise<RuntimeChainSummary> {
    const health = await this.health();
    if (!health.connected) {
      throw new Error(
        `WalletChan RPC is not connected. Start walletchan-rpc and pair a wallet first.`,
      );
    }

    const configured = value === undefined || value === null || value === ""
      ? health.chains.find((chain) => chain.chainId === health.activeChainId)
      : findConfiguredChain(health.chains, value);

    if (!configured) {
      throw new Error(
        `Chain ${String(value)} is not configured in WalletChan RPC. Configured chains: ${formatConfiguredChains(health.chains)}.`,
      );
    }
    return configured;
  }

  async resolveFrom(value?: string): Promise<string> {
    const accounts = (await this.accounts()).map((account) => account.toLowerCase());
    if (accounts.length === 0) {
      throw new Error("No approved WalletChan RPC account. Pair a wallet first.");
    }
    if (!value) return accounts[0];
    const normalized = value.toLowerCase();
    if (!accounts.includes(normalized)) {
      throw new Error(`Account ${value} is not approved in WalletChan RPC`);
    }
    return normalized;
  }

  private async rpc<T>(
    method: string,
    params: unknown[],
    chainId?: number,
  ): Promise<T> {
    if (chainId) {
      await this.switchChain(chainId);
    }
    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: this.id++,
        method,
        params,
      }),
    });
    const payload = (await response.json()) as JsonRpcResponse<T>;
    if (!response.ok || payload.error) {
      throw new WalletChanRpcError(
        method,
        payload.error?.code ?? null,
        payload.error?.message || `WalletChan RPC ${method} failed`,
        payload.error?.data,
      );
    }
    return payload.result as T;
  }

  private async switchChain(chainId: number): Promise<void> {
    const current = await this.chainId().catch(() => null);
    if (current === chainId) return;
    await this.rpc("wallet_switchEthereumChain", [{ chainId: toHexChainId(chainId) }]);
  }

  private async fetchJson<T>(path: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`);
    if (!response.ok) {
      throw new Error(`WalletChan RPC ${path} failed: ${response.status}`);
    }
    return response.json() as Promise<T>;
  }
}

function formatTransportLabel(value: unknown): string {
  return value === "metamask-connect" ? "MetaMask Connect" : "WalletConnect";
}

function normalizeAccounts(accounts: unknown): string[] {
  return Array.isArray(accounts)
    ? accounts
      .filter((account): account is string => typeof account === "string")
      .map((account) => account.toLowerCase())
    : [];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeCall(call: WalletCall): WalletCall {
  return {
    to: normalizeAddress(call.to),
    value: normalizeHex(call.value ?? "0x0", "value"),
    data: normalizeHex(call.data ?? "0x", "data"),
  };
}

function normalizeAddress(value: unknown): `0x${string}` {
  if (typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value)) {
    return value as `0x${string}`;
  }
  throw new Error(`Invalid address: ${String(value)}`);
}

function normalizeOptionalAddress(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  return normalizeAddress(value);
}

function normalizeHex(value: unknown, label: string): `0x${string}` {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return `0x${value.toString(16)}`;
  }
  if (typeof value === "bigint" && value >= 0n) {
    return `0x${value.toString(16)}`;
  }
  if (typeof value === "string") {
    if (/^0x[0-9a-fA-F]*$/.test(value)) return value as `0x${string}`;
    if (/^[0-9]+$/.test(value)) return `0x${BigInt(value).toString(16)}`;
  }
  throw new Error(`Invalid ${label} hex value`);
}

function extractPersonalSignMessage(args: SignArgs): string {
  const message = getEnvelopeMessage(args.message) || getEnvelopeMessage(args.data);
  if (message) return normalizePersonalSignMessage(message);
  throw new Error("personal_sign requires message or data.message");
}

export function isWalletConnectionError(error: unknown): boolean {
  if (error instanceof WalletChanRpcError) {
    if (error.code === 4900) return true;
    if (isRecord(error.data)) {
      if (error.data.needsPairing === true) return true;
      if (error.data.code === "walletconnect_disconnected") return true;
    }
  }

  const message = error instanceof Error ? error.message : String(error);
  return /WalletChan RPC is not connected/i.test(message) ||
    /No approved WalletChan RPC account/i.test(message) ||
    /Pair (WalletChan|a wallet) first/i.test(message) ||
    /WalletConnect is not paired/i.test(message) ||
    /WalletConnect session is not connected/i.test(message) ||
    /WalletConnect session .*disconnected/i.test(message) ||
    /WalletConnect session .*closed/i.test(message) ||
    /WalletConnect session .*expired/i.test(message) ||
    /WalletConnect session .*removed/i.test(message) ||
    /MetaMask Connect session is not connected/i.test(message) ||
    /MetaMask Connect session .*disconnected/i.test(message) ||
    /MetaMask Connect session .*closed/i.test(message) ||
    /session topic/i.test(message) ||
    /No matching key/i.test(message);
}

export function walletConnectionErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
