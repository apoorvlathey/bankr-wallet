/**
 * Tool definitions, parsing, and execution for local Ollama AI chat.
 * Implements the tools the nani-qwen model was trained on.
 */

import {
  createPublicClient,
  http,
  formatUnits,
  erc20Abi,
  parseUnits,
  encodeFunctionData,
  type Address,
  type PublicClient,
} from "viem";
import { getStoredRpcUrl } from "@/lib/chains";
import { resolveNameToAddress, resolveAddressToName } from "@/lib/ensUtils";
import { fetchNativeCoinGeckoPrice } from "@/chrome/coingeckoService";
import { savePendingTxRequest } from "@/chrome/pendingTxStorage";
import { CHAIN_NAMES } from "@/constants/chainRegistry";
import { CHAIN_REGISTRY } from "@/constants/chainRegistry";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolCall {
  functionName: string;
  parameters: Record<string, string>;
}

export interface ToolContext {
  address: string;
  chainId: number;
}

// ---------------------------------------------------------------------------
// Viem client cache (matches onchainBalances.ts pattern)
// ---------------------------------------------------------------------------

const RPC_TIMEOUT = 8_000;
const clientCache = new Map<number, { rpcUrl: string; client: PublicClient }>();

async function getClient(chainId: number): Promise<PublicClient | null> {
  const rpcUrl = await getStoredRpcUrl(chainId);
  if (!rpcUrl) return null;

  const cached = clientCache.get(chainId);
  if (cached && cached.rpcUrl === rpcUrl) return cached.client;

  const client = createPublicClient({
    transport: http(rpcUrl, { timeout: RPC_TIMEOUT, retryCount: 0 }),
  });
  clientCache.set(chainId, { rpcUrl, client });
  return client;
}

// ---------------------------------------------------------------------------
// System prompt builder
// ---------------------------------------------------------------------------

export function buildSystemPrompt(address: string, chainId: number): string {
  const chainName = CHAIN_NAMES[chainId] || `Chain ${chainId}`;
  const chainEntry = CHAIN_REGISTRY.find((c) => c.chainId === chainId);
  const nativeSymbol = chainEntry?.nativeCurrency.symbol || "ETH";

  return `# Tools

You have access to the following functions:

<tools>
{"type":"function","function":{"name":"getBalance","description":"Get the native token (${nativeSymbol}) balance for an address on a specific chain","parameters":{"type":"object","properties":{"address":{"type":"string","description":"The wallet address (0x...)"},"chainId":{"type":"number","description":"Chain ID (default: ${chainId})"}},"required":["address"]}}}
{"type":"function","function":{"name":"getBalanceOf","description":"Get an ERC20 token balance for an address","parameters":{"type":"object","properties":{"address":{"type":"string","description":"The wallet address (0x...)"},"tokenAddress":{"type":"string","description":"The ERC20 token contract address (0x...)"},"chainId":{"type":"number","description":"Chain ID (default: ${chainId})"}},"required":["address","tokenAddress"]}}}
{"type":"function","function":{"name":"resolveENS","description":"Resolves an ENS name (or Basename, WNS, MegaName) to an Ethereum address","parameters":{"type":"object","properties":{"name":{"type":"string","description":"The name to resolve (e.g. vitalik.eth, jesse.base.eth, nani.wei)"}},"required":["name"]}}}
{"type":"function","function":{"name":"lookupENS","description":"Reverse-resolves an Ethereum address to its primary name (ENS, Basename, WNS, or MegaName)","parameters":{"type":"object","properties":{"address":{"type":"string","description":"The wallet address (0x...)"}},"required":["address"]}}}
{"type":"function","function":{"name":"getCryptoPrice","description":"Get the current price of the chain's native token in USD","parameters":{"type":"object","properties":{"chainId":{"type":"number","description":"Chain ID (default: ${chainId})"}},"required":[]}}}
{"type":"function","function":{"name":"intentTransfer","description":"Send native tokens or ERC20 tokens to an address. The user will be asked to confirm the transaction.","parameters":{"type":"object","properties":{"to":{"type":"string","description":"Recipient address (0x...) or ENS name"},"amount":{"type":"string","description":"Amount to send (human-readable, e.g. '0.1')"},"tokenAddress":{"type":"string","description":"ERC20 token contract address. Omit for native token transfer."},"chainId":{"type":"number","description":"Chain ID (default: ${chainId})"}},"required":["to","amount"]}}}
</tools>

If you choose to call a function ONLY reply in the following format with NO suffix:

<tool_call>
<function=example_function_name>
<parameter=example_parameter_1>value_1</parameter>
</function>
</tool_call>

<IMPORTANT>
Reminder:
- Function calls MUST follow the specified format
- Required parameters MUST be specified
- You may provide optional reasoning BEFORE the function call, but NOT after
- If there is no function call available, answer the question like normal
</IMPORTANT>

You are Nani, a crypto wallet assistant. You help the user manage their wallet and interact with blockchain networks.

The user's wallet address is: ${address}
Current chain: ${chainName} (Chain ID: ${chainId})
Native token: ${nativeSymbol}

When the user asks about their balance without specifying an address, use their wallet address.
When the user asks about a chain without specifying, use the current chain.`;
}

// ---------------------------------------------------------------------------
// Tool call parser
// ---------------------------------------------------------------------------

const TOOL_CALL_REGEX =
  /<tool_call>\s*<function=(\w+)>([\s\S]*?)<\/function>\s*(?:<\/tool_call>)?/g;
const PARAM_REGEX = /<parameter=(\w+)>([\s\S]*?)<\/parameter>/g;

export function parseToolCalls(content: string): ToolCall[] {
  const calls: ToolCall[] = [];
  let match: RegExpExecArray | null;

  TOOL_CALL_REGEX.lastIndex = 0;
  while ((match = TOOL_CALL_REGEX.exec(content)) !== null) {
    const functionName = match[1];
    const paramsBlock = match[2];
    const parameters: Record<string, string> = {};

    let paramMatch: RegExpExecArray | null;
    PARAM_REGEX.lastIndex = 0;
    while ((paramMatch = PARAM_REGEX.exec(paramsBlock)) !== null) {
      parameters[paramMatch[1]] = paramMatch[2].trim();
    }

    calls.push({ functionName, parameters });
  }

  return calls;
}

// ---------------------------------------------------------------------------
// Think tag stripper
// ---------------------------------------------------------------------------

export function stripThinkTags(content: string): string {
  return content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

// Also strip any remaining tool_call XML that wasn't caught
export function cleanDisplayContent(content: string): string {
  let cleaned = stripThinkTags(content);
  cleaned = cleaned
    .replace(/<tool_call>[\s\S]*?(?:<\/tool_call>|$)/g, "")
    .trim();
  return cleaned || content.trim();
}

// ---------------------------------------------------------------------------
// Status message helper
// ---------------------------------------------------------------------------

const STATUS_MESSAGES: Record<string, string> = {
  getBalance: "Checking balance...",
  getBalanceOf: "Checking token balance...",
  resolveENS: "Resolving name...",
  lookupENS: "Looking up address name...",
  getCryptoPrice: "Fetching price...",
  intentTransfer: "Preparing transfer...",
};

export function toolStatusMessage(functionName: string): string {
  return STATUS_MESSAGES[functionName] || `Running ${functionName}...`;
}

// ---------------------------------------------------------------------------
// Tool executor
// ---------------------------------------------------------------------------

export async function executeTool(
  call: ToolCall,
  ctx: ToolContext
): Promise<string> {
  try {
    switch (call.functionName) {
      case "getBalance":
        return await toolGetBalance(call.parameters, ctx);
      case "getBalanceOf":
        return await toolGetBalanceOf(call.parameters, ctx);
      case "resolveENS":
        return await toolResolveENS(call.parameters);
      case "lookupENS":
        return await toolLookupENS(call.parameters);
      case "getCryptoPrice":
        return await toolGetCryptoPrice(call.parameters, ctx);
      case "intentTransfer":
        return await toolIntentTransfer(call.parameters, ctx);
      default:
        return `Unknown tool: ${call.functionName}`;
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return `Error executing ${call.functionName}: ${msg}`;
  }
}

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

async function toolGetBalance(
  params: Record<string, string>,
  ctx: ToolContext
): Promise<string> {
  const address = (params.address || ctx.address) as Address;
  const chainId = params.chainId ? Number(params.chainId) : ctx.chainId;
  const chainEntry = CHAIN_REGISTRY.find((c) => c.chainId === chainId);
  const symbol = chainEntry?.nativeCurrency.symbol || "ETH";
  const decimals = chainEntry?.nativeCurrency.decimals || 18;

  const client = await getClient(chainId);
  if (!client) return `No RPC configured for chain ${chainId}`;

  const balance = await client.getBalance({ address });
  const formatted = formatUnits(balance, decimals);
  return `${formatted} ${symbol}`;
}

async function toolGetBalanceOf(
  params: Record<string, string>,
  ctx: ToolContext
): Promise<string> {
  const address = (params.address || ctx.address) as Address;
  const tokenAddress = params.tokenAddress as Address;
  const chainId = params.chainId ? Number(params.chainId) : ctx.chainId;

  if (!tokenAddress) return "tokenAddress is required";

  const client = await getClient(chainId);
  if (!client) return `No RPC configured for chain ${chainId}`;

  const [balance, decimals, symbol] = await Promise.all([
    client.readContract({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address],
    }),
    client.readContract({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: "decimals",
    }),
    client.readContract({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: "symbol",
    }),
  ]);

  const formatted = formatUnits(balance, decimals);
  return `${formatted} ${symbol}`;
}

async function toolResolveENS(
  params: Record<string, string>
): Promise<string> {
  const name = params.name;
  if (!name) return "name parameter is required";

  const address = await resolveNameToAddress(name);
  if (!address) return `Could not resolve "${name}" to an address`;
  return address;
}

async function toolLookupENS(
  params: Record<string, string>
): Promise<string> {
  const address = params.address;
  if (!address) return "address parameter is required";

  const name = await resolveAddressToName(address);
  if (!name) return `No name found for ${address}`;
  return name;
}

async function toolGetCryptoPrice(
  params: Record<string, string>,
  ctx: ToolContext
): Promise<string> {
  const chainId = params.chainId ? Number(params.chainId) : ctx.chainId;
  const chainEntry = CHAIN_REGISTRY.find((c) => c.chainId === chainId);
  const symbol = chainEntry?.nativeCurrency.symbol || "ETH";

  const price = await fetchNativeCoinGeckoPrice(chainId);
  if (price === null) return `Could not fetch price for ${symbol}`;
  return `$${price.toFixed(2)} USD per ${symbol}`;
}

async function toolIntentTransfer(
  params: Record<string, string>,
  ctx: ToolContext
): Promise<string> {
  let to = params.to;
  const amount = params.amount;
  const tokenAddress = params.tokenAddress;
  const chainId = params.chainId ? Number(params.chainId) : ctx.chainId;

  if (!to || !amount) return "to and amount parameters are required";

  // Resolve ENS name if needed
  if (!to.startsWith("0x")) {
    const resolved = await resolveNameToAddress(to);
    if (!resolved) return `Could not resolve "${to}" to an address`;
    to = resolved;
  }

  const chainEntry = CHAIN_REGISTRY.find((c) => c.chainId === chainId);
  const chainName = chainEntry?.name || `Chain ${chainId}`;

  if (tokenAddress) {
    // ERC20 transfer
    const client = await getClient(chainId);
    if (!client) return `No RPC configured for chain ${chainId}`;

    const decimals = await client.readContract({
      address: tokenAddress as Address,
      abi: erc20Abi,
      functionName: "decimals",
    });

    const parsedAmount = parseUnits(amount, decimals);
    const data = encodeFunctionData({
      abi: erc20Abi,
      functionName: "transfer",
      args: [to as Address, parsedAmount],
    });

    await savePendingTxRequest({
      id: crypto.randomUUID(),
      tx: {
        from: ctx.address,
        to: tokenAddress,
        data,
        value: "0x0",
        chainId,
      },
      origin: "Nani AI Chat",
      favicon: null,
      chainName,
      timestamp: Date.now(),
    });
  } else {
    // Native token transfer
    const decimals = chainEntry?.nativeCurrency.decimals || 18;
    const parsedAmount = parseUnits(amount, decimals);

    await savePendingTxRequest({
      id: crypto.randomUUID(),
      tx: {
        from: ctx.address,
        to,
        value: `0x${parsedAmount.toString(16)}`,
        chainId,
      },
      origin: "Nani AI Chat",
      favicon: null,
      chainName,
      timestamp: Date.now(),
    });
  }

  return `Transfer of ${amount} ${tokenAddress ? "tokens" : chainEntry?.nativeCurrency.symbol || "ETH"} to ${to} has been prepared. Please confirm the transaction in your wallet.`;
}
