import {
  createPublicClient,
  formatUnits,
  erc20Abi,
  type Address,
  type PublicClient,
} from "viem";
import { PortfolioToken } from "./api";
import { getPortfolioTokenKey } from "./hiddenTokens";
import { getStoredRpcUrl } from "@/lib/chains";
import { secureHttpTransport } from "../network/rpcClient";

/** Multicall3 is deployed at the same address on all supported chains */
const MULTICALL3_ADDRESS: Address =
  "0xcA11bde05977b3631167028862bE2a173976CA11";

/** Multicall3 ABI for batching native balance lookups */
const multicall3Abi = [
  {
    type: "function",
    name: "getEthBalance",
    stateMutability: "view",
    inputs: [{ name: "addr", type: "address" }],
    outputs: [{ name: "balance", type: "uint256" }],
  },
] as const;

/** Max calls per multicall batch to avoid oversized RPC requests */
const MULTICALL_BATCH_SIZE = 100;

/** RPC request timeout in ms – short enough to not block UI on rate limits */
const RPC_TIMEOUT = 8_000;

/** Cached viem clients keyed by chainId and invalidated when RPC URL changes */
const clientCache = new Map<number, { rpcUrl: string; client: PublicClient }>();

async function getClient(chainId: number): Promise<PublicClient | null> {
  const rpcUrl = await getStoredRpcUrl(chainId);
  if (!rpcUrl) return null;

  const cached = clientCache.get(chainId);
  if (cached && cached.rpcUrl === rpcUrl) {
    return cached.client;
  }

  const client = createPublicClient({
    transport: secureHttpTransport(rpcUrl, { timeout: RPC_TIMEOUT, retryCount: 0 }),
  });
  clientCache.set(chainId, { rpcUrl, client });
  return client;
}

/**
 * Fetch real onchain balances for all tokens via multicall.
 * Both native (via Multicall3.getEthBalance) and ERC20 (via balanceOf)
 * are batched into a single multicall per chain, chunked to avoid
 * oversized requests.
 * If a chain/batch fails, the original API balances are preserved.
 */
export async function fetchOnchainBalances(
  address: string,
  tokens: PortfolioToken[],
  options?: { preserveZeroBalanceTokens?: boolean },
): Promise<{
  tokens: PortfolioToken[];
  totalValueUsd: number;
  rpcIssueChainIds: number[];
  verifiedTokenKeys: Set<string>;
}> {
  // Group tokens by chainId
  const byChain = new Map<number, { index: number; token: PortfolioToken }[]>();
  tokens.forEach((token, index) => {
    const group = byChain.get(token.chainId) || [];
    group.push({ index, token });
    byChain.set(token.chainId, group);
  });

  // Clone tokens so we can mutate
  const updated = tokens.map((t) => ({ ...t }));
  const rpcIssueChainIds = new Set<number>();
  const verifiedTokenKeys = new Set<string>();

  // Fetch balances per chain in parallel
  const chainPromises = Array.from(byChain.entries()).map(
    async ([chainId, entries]) => {
      const client = await getClient(chainId);
      if (!client) {
        // No RPC configured for this chain (e.g. portfolio API returned a
        // token on a chain the user hasn't added). Skip silently — there's
        // nothing to "fix" and surfacing it as an RPC issue would point the
        // user to a chain entry that doesn't exist.
        return;
      }

      const addr = address as Address;

      // Build unified call list – native uses Multicall3.getEthBalance,
      // ERC20 uses balanceOf, all batched into a single multicall
      const calls: { entryIndex: number; token: PortfolioToken; contract: any }[] = [];

      for (const entry of entries) {
        const isNative =
          entry.token.contractAddress === "native" ||
          entry.token.contractAddress === "0x0000000000000000000000000000000000000000";

        calls.push({
          entryIndex: entry.index,
          token: entry.token,
          contract: isNative
            ? {
                address: MULTICALL3_ADDRESS,
                abi: multicall3Abi,
                functionName: "getEthBalance" as const,
                args: [addr] as const,
              }
            : {
                address: entry.token.contractAddress as Address,
                abi: erc20Abi,
                functionName: "balanceOf" as const,
                args: [addr] as const,
              },
        });
      }

      if (calls.length === 0) return;

      // Process in chunks to avoid oversized RPC requests
      for (let i = 0; i < calls.length; i += MULTICALL_BATCH_SIZE) {
        const chunk = calls.slice(i, i + MULTICALL_BATCH_SIZE);
        try {
          const results = await client.multicall({
            contracts: chunk.map((c) => c.contract),
            multicallAddress: MULTICALL3_ADDRESS,
          });

          await Promise.all(results.map(async (result: any, j: number) => {
            if (result.status === "success") {
              applyBalance(
                updated,
                chunk[j].entryIndex,
                result.result as bigint,
                chunk[j].token
              );
              verifiedTokenKeys.add(
                getPortfolioTokenKey(chainId, chunk[j].token.contractAddress),
              );
            } else {
              const succeeded = await fetchSingleBalanceDirectly(
                client,
                updated,
                chunk[j].entryIndex,
                chunk[j].token,
                addr,
              );
              if (succeeded) {
                verifiedTokenKeys.add(
                  getPortfolioTokenKey(chainId, chunk[j].token.contractAddress),
                );
              } else {
                rpcIssueChainIds.add(chainId);
              }
            }
          }));
        } catch (err) {
          const results = await fetchChunkBalancesIndividually(
            client,
            updated,
            chunk,
            addr,
          );
          results.forEach((succeeded, index) => {
            if (succeeded) {
              verifiedTokenKeys.add(
                getPortfolioTokenKey(
                  chainId,
                  chunk[index].token.contractAddress,
                ),
              );
            } else {
              rpcIssueChainIds.add(chainId);
            }
          });
        }
      }
    }
  );

  await Promise.all(chainPromises);

  // Filter out tokens with zero onchain balance and sort by USD value descending
  const filtered = options?.preserveZeroBalanceTokens
    ? updated
    : updated.filter((t) => parseFloat(t.balance) > 0);
  filtered.sort((a, b) => b.valueUsd - a.valueUsd);

  const totalValueUsd = filtered.reduce((sum, t) => sum + t.valueUsd, 0);

  return {
    tokens: filtered,
    totalValueUsd,
    rpcIssueChainIds: Array.from(rpcIssueChainIds),
    verifiedTokenKeys,
  };
}

async function fetchChunkBalancesIndividually(
  client: PublicClient,
  tokens: PortfolioToken[],
  chunk: { entryIndex: number; token: PortfolioToken; contract: any }[],
  address: Address,
): Promise<boolean[]> {
  return Promise.all(
    chunk.map(({ entryIndex, token }) =>
      fetchSingleBalanceDirectly(client, tokens, entryIndex, token, address),
    ),
  );
}

async function fetchSingleBalanceDirectly(
  client: PublicClient,
  tokens: PortfolioToken[],
  entryIndex: number,
  token: PortfolioToken,
  address: Address,
): Promise<boolean> {
  try {
    const isNative =
      token.contractAddress === "native" ||
      token.contractAddress === "0x0000000000000000000000000000000000000000";

    const rawBalance = isNative
      ? await client.getBalance({ address })
      : await client.readContract({
          address: token.contractAddress as Address,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [address],
        });

    applyBalance(tokens, entryIndex, rawBalance as bigint, token);
    return true;
  } catch (fallbackErr) {
    return false;
  }
}

/** Apply a raw bigint balance to a token entry, recomputing derived fields */
function applyBalance(
  tokens: PortfolioToken[],
  index: number,
  rawBalance: bigint,
  originalToken: PortfolioToken
) {
  const balanceStr = formatUnits(rawBalance, originalToken.decimals);
  const balanceNum = parseFloat(balanceStr);

  tokens[index].balance = balanceStr;
  tokens[index].balanceFormatted = formatBalance(balanceNum);
  tokens[index].valueUsd = balanceNum * originalToken.priceUsd;
}

/** Format a numeric balance to a human-readable string (max 6 significant digits) */
function formatBalance(value: number): string {
  if (value === 0) return "0";
  if (value < 0.000001) return "<0.000001";
  if (value >= 1_000_000) {
    return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
  // Show up to 6 significant digits
  return parseFloat(value.toPrecision(6)).toString();
}
