import {
  createPublicClient,
  createWalletClient,
  formatUnits,
  http,
  parseAbi,
  type Chain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet, base, bsc, polygon, arbitrum, optimism } from "viem/chains";
import type { AgentWalletStore, ExecutionProfile } from "./agentWallets.js";
import { toHexChainId, type RuntimeChainSummary } from "./chains.js";
import type { WalletCall } from "./rpcClient.js";
import { WALLETCHAN_BASE_RPC_URL } from "./walletchanRpcDefaults.js";

export interface AgentEoaExecutorConfig {
  baseRpcUrl?: string;
}

export interface AgentEoaSendTransactionInput {
  profileId?: string;
  walletId?: string;
  chain?: unknown;
  to?: string;
  value?: string;
  data?: string;
  gas?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  gasPrice?: string;
  nonce?: number;
}

export interface AgentEoaSendCallsInput {
  profileId?: string;
  walletId?: string;
  chain?: unknown;
  calls: WalletCall[];
}

export interface AgentEoaBalanceInput {
  profileId?: string;
  walletId?: string;
  chain?: unknown;
  token?: string;
}

export class AgentEoaExecutor {
  constructor(
    private readonly store: AgentWalletStore,
    private readonly config: AgentEoaExecutorConfig,
  ) {}

  async getBalance(
    input: AgentEoaBalanceInput,
    chains: RuntimeChainSummary[],
  ): Promise<Record<string, unknown>> {
    const profile = this.resolveAgentEoaProfile(input.profileId, input.walletId);
    const chain = resolveConfiguredChain(chains, input.chain);
    const client = createPublicClient({
      chain: viemChain(chain),
      transport: http(this.rpcUrl(chain)),
    });
    const token = optionalAddress(input.token);
    if (!token) {
      const value = await client.getBalance({ address: requireAddress(profile.address, "agent profile address") });
      return {
        profile,
        chain,
        token: "native",
        balanceWei: value.toString(),
        balance: formatUnits(value, 18),
      };
    }

    const [balance, decimals, symbol] = await Promise.all([
      client.readContract({
        address: token,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [requireAddress(profile.address, "agent profile address")],
      }),
      client.readContract({
        address: token,
        abi: ERC20_ABI,
        functionName: "decimals",
      }).catch(() => 18),
      client.readContract({
        address: token,
        abi: ERC20_ABI,
        functionName: "symbol",
      }).catch(() => "TOKEN"),
    ]);
    return {
      profile,
      chain,
      token,
      symbol,
      decimals,
      balanceRaw: balance.toString(),
      balance: formatUnits(balance, decimals),
    };
  }

  async sendTransaction(
    input: AgentEoaSendTransactionInput,
    chains: RuntimeChainSummary[],
  ): Promise<Record<string, unknown>> {
    const profile = this.resolveAgentEoaProfile(input.profileId, input.walletId);
    const chain = resolveConfiguredChain(chains, input.chain);
    const privateKey = this.requirePrivateKey(profile);
    const account = privateKeyToAccount(privateKey);
    const walletClient = createWalletClient({
      account,
      chain: viemChain(chain),
      transport: http(this.rpcUrl(chain)),
    });
    const to = optionalAddress(input.to);
    const data = normalizeHex(input.data ?? "0x", "data");
    if (!to && data === "0x") {
      throw new Error("agent_eoa_send_transaction requires to or non-empty contract creation data");
    }
    const txParams: Parameters<typeof walletClient.sendTransaction>[0] = {
      account,
      chain: viemChain(chain),
      to,
      data,
      value: parseHexOrDecimal(input.value ?? "0x0", "value"),
    };
    applyOptionalBigint(txParams, "gas", input.gas);
    applyOptionalBigint(txParams, "maxFeePerGas", input.maxFeePerGas);
    applyOptionalBigint(txParams, "maxPriorityFeePerGas", input.maxPriorityFeePerGas);
    applyOptionalBigint(txParams, "gasPrice", input.gasPrice);
    if (input.nonce !== undefined) {
      txParams.nonce = input.nonce;
    }

    const txHash = await walletClient.sendTransaction(txParams);
    return {
      profile,
      chain,
      txHash,
      approvalMode: "agent_auto",
      executionMode: "raw_agent_eoa",
      message: "Raw agent EOA transaction was signed locally by WalletChan MCP and broadcast to the configured chain RPC.",
    };
  }

  async sendCallsSequentially(
    input: AgentEoaSendCallsInput,
    chains: RuntimeChainSummary[],
  ): Promise<Record<string, unknown>> {
    if (!Array.isArray(input.calls) || input.calls.length === 0) {
      throw new Error("agent_eoa_send_calls requires at least one call");
    }
    const profile = this.resolveAgentEoaProfile(input.profileId, input.walletId);
    const chain = resolveConfiguredChain(chains, input.chain);
    const publicClient = createPublicClient({
      chain: viemChain(chain),
      transport: http(this.rpcUrl(chain)),
    });
    let nonce = await publicClient.getTransactionCount({
      address: requireAddress(profile.address, "agent profile address"),
      blockTag: "pending",
    });
    const txHashes: string[] = [];
    for (const call of input.calls) {
      const result = await this.sendTransaction(
        {
          profileId: profile.id,
          chain: chain.chainId,
          to: call.to,
          value: call.value,
          data: call.data,
          nonce,
        },
        [chain],
      );
      txHashes.push(String(result.txHash));
      nonce += 1;
    }
    return {
      profile,
      chain,
      txHashes,
      status: "submitted",
      approvalMode: "agent_auto",
      executionMode: "raw_agent_eoa_sequential",
      message: "Raw agent EOA calls were submitted sequentially. This path is not atomic.",
    };
  }

  private resolveAgentEoaProfile(profileId?: string, walletId?: string): ExecutionProfile {
    const profile = walletId
      ? this.store.resolveExecutionProfile(`agent-eoa:${walletId}`)
      : this.store.resolveExecutionProfile(profileId || "agent-eoa");
    if (profile.kind !== "agent-eoa" || !profile.walletId) {
      throw new Error(`Execution profile ${profile.id} is not a raw agent EOA profile`);
    }
    return profile;
  }

  private requirePrivateKey(profile: ExecutionProfile): `0x${string}` {
    if (!profile.walletId) throw new Error(`Execution profile ${profile.id} has no walletId`);
    return this.store.getPrivateKey(profile.walletId);
  }

  private rpcUrl(chain: RuntimeChainSummary): string {
    if (chain.chainId === 8453) return this.config.baseRpcUrl || WALLETCHAN_BASE_RPC_URL;
    return DEFAULT_RPC_URLS[chain.chainId] || this.config.baseRpcUrl || WALLETCHAN_BASE_RPC_URL;
  }
}

const ERC20_ABI = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
]);

const DEFAULT_RPC_URLS: Record<number, string> = {
  1: "https://eth.drpc.org",
  10: "https://mainnet.optimism.io",
  56: "https://bsc-dataseed.binance.org",
  137: "https://polygon.drpc.org",
  42161: "https://arb1.arbitrum.io/rpc",
  8453: WALLETCHAN_BASE_RPC_URL,
};

function resolveConfiguredChain(chains: RuntimeChainSummary[], value: unknown): RuntimeChainSummary {
  const requested = value === undefined || value === null || value === ""
    ? chains.find((chain) => chain.chainId === 8453) || chains[0]
    : findChain(chains, value);
  if (!requested) {
    throw new Error(
      `Chain ${String(value)} is not configured. Configured chains: ${chains.map((chain) => `${chain.name}(${chain.chainId})`).join(", ")}`,
    );
  }
  return requested;
}

function findChain(chains: RuntimeChainSummary[], value: unknown): RuntimeChainSummary | null {
  if (typeof value === "number" && Number.isInteger(value)) {
    return chains.find((chain) => chain.chainId === value) || null;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const numeric = trimmed.startsWith("0x") ? Number.parseInt(trimmed, 16) : Number(trimmed);
  if (Number.isInteger(numeric) && numeric > 0) {
    return chains.find((chain) => chain.chainId === numeric) || null;
  }
  const lowered = trimmed.toLowerCase();
  return chains.find((chain) => chain.name.toLowerCase() === lowered) ||
    (lowered === "base" ? chains.find((chain) => chain.chainId === 8453) || null : null);
}

function viemChain(chain: RuntimeChainSummary): Chain {
  if (chain.chainId === 1) return mainnet;
  if (chain.chainId === 10) return optimism;
  if (chain.chainId === 56) return bsc;
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

function normalizeHex(value: unknown, label: string): `0x${string}` {
  if (typeof value === "string" && /^0x[0-9a-fA-F]*$/.test(value)) {
    return value as `0x${string}`;
  }
  throw new Error(`Invalid ${label} hex value`);
}

function parseHexOrDecimal(value: unknown, label: string): bigint {
  if (typeof value === "bigint" && value >= 0n) return value;
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return BigInt(value);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^0x[0-9a-fA-F]+$/.test(trimmed)) return BigInt(trimmed);
    if (/^[0-9]+$/.test(trimmed)) return BigInt(trimmed);
  }
  throw new Error(`Invalid ${label} value`);
}

function applyOptionalBigint(
  target: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  if (value === undefined || value === null || value === "") return;
  target[key] = parseHexOrDecimal(value, key);
}

function optionalAddress(value: unknown): `0x${string}` | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return requireAddress(value, "address");
}

function requireAddress(value: unknown, label: string): `0x${string}` {
  if (typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value)) {
    return value as `0x${string}`;
  }
  throw new Error(`Invalid ${label}: ${String(value)}`);
}

export function agentEoaProfileId(walletId: string): `agent-eoa:${string}` {
  return `agent-eoa:${walletId}`;
}

export function nativeChainId(chain: RuntimeChainSummary): `0x${string}` {
  return toHexChainId(chain.chainId);
}
