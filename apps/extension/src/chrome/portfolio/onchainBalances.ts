import {
  createPublicClient,
  erc20Abi,
  type Address,
  type PublicClient,
} from "viem";
import { PortfolioToken } from "./api";
import { getPortfolioTokenKey } from "./hiddenTokens";
import { getStoredRpcUrl } from "@/lib/chains";
import { secureHttpTransport } from "../network/rpcClient";
import { chainHasNativeToken } from "@/constants/chainRegistry";
import type { RpcHealthReport } from "@/types";

import {
  applyBalance,
  fetchChunkBalancesIndividually,
  fetchSingleBalanceDirectly,
  MULTICALL3_ADDRESS,
  multicall3Abi,
  type OnchainBalanceCall,
} from "./onchainBalanceReads";

/** Max calls per multicall batch to avoid oversized RPC requests */
const MULTICALL_BATCH_SIZE = 100;

/** Prevent all-network portfolios from opening an RPC burst across every chain. */
const MAX_CONCURRENT_CHAINS = 4;

/** RPC request timeout in ms – short enough to not block UI on rate limits */
const RPC_TIMEOUT = 8_000;

/** Avoid classifying a single transient timeout/rate-limit burst as downtime. */
const RPC_HEALTH_CONFIRMATION_DELAY_MS = 2_000;

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
  rpcHealth: RpcHealthReport;
  verifiedTokenKeys: Set<string>;
}> {
  // Some EVM-compatible chains expose an eth_getBalance sentinel even though
  // they have no native token. Drop those synthetic rows before any RPC work.
  const eligibleTokens = tokens.filter((token) => {
    const isNative =
      token.contractAddress === "native" ||
      token.contractAddress === "0x0000000000000000000000000000000000000000";
    return !isNative || chainHasNativeToken(token.chainId);
  });

  // Group tokens by chainId
  const byChain = new Map<number, { index: number; token: PortfolioToken }[]>();
  eligibleTokens.forEach((token, index) => {
    const group = byChain.get(token.chainId) || [];
    group.push({ index, token });
    byChain.set(token.chainId, group);
  });

  // Clone tokens so we can mutate
  const updated = eligibleTokens.map((t) => ({ ...t }));
  const rpcIssueChainIds = new Set<number>();
  const checkedChainIds = new Set<number>();
  const verifiedTokenKeys = new Set<string>();

  const fetchChainBalances = async (
    [chainId, entries]: [
      number,
      { index: number; token: PortfolioToken }[],
    ],
  ) => {
      const client = await getClient(chainId);
      if (!client) {
        // No RPC configured for this chain (e.g. portfolio API returned a
        // token on a chain the user hasn't added). Skip silently — there's
        // nothing to "fix" and surfacing it as an RPC issue would point the
        // user to a chain entry that doesn't exist.
        return;
      }

      const addr = address as Address;
      let successfulBalanceReads = 0;
      let failedBalanceReads = 0;

      // Build unified call list – native uses Multicall3.getEthBalance,
      // ERC20 uses balanceOf, all batched into a single multicall
      const calls: OnchainBalanceCall[] = [];

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
      checkedChainIds.add(chainId);

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
              successfulBalanceReads += 1;
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
                successfulBalanceReads += 1;
                verifiedTokenKeys.add(
                  getPortfolioTokenKey(chainId, chunk[j].token.contractAddress),
                );
              } else {
                failedBalanceReads += 1;
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
              successfulBalanceReads += 1;
              verifiedTokenKeys.add(
                getPortfolioTokenKey(
                  chainId,
                  chunk[index].token.contractAddress,
                ),
              );
            } else {
              failedBalanceReads += 1;
            }
          });
        }
      }

      if (successfulBalanceReads === 0 && failedBalanceReads > 0) {
        if (await confirmRpcUnavailable(client)) {
          rpcIssueChainIds.add(chainId);
        }
      }
    };

  const chainEntries = Array.from(byChain.entries());
  let nextChainIndex = 0;
  const workerCount = Math.min(MAX_CONCURRENT_CHAINS, chainEntries.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextChainIndex < chainEntries.length) {
        const entry = chainEntries[nextChainIndex];
        nextChainIndex += 1;
        await fetchChainBalances(entry);
      }
    }),
  );

  // Filter out tokens with zero onchain balance and sort by USD value descending
  const filtered = options?.preserveZeroBalanceTokens
    ? updated
    : updated.filter((t) => parseFloat(t.balance) > 0);
  filtered.sort((a, b) => b.valueUsd - a.valueUsd);

  const totalValueUsd = filtered.reduce((sum, t) => sum + t.valueUsd, 0);

  return {
    tokens: filtered,
    totalValueUsd,
    rpcHealth: {
      checkedChainIds: Array.from(checkedChainIds),
      unhealthyChainIds: Array.from(rpcIssueChainIds),
    },
    verifiedTokenKeys,
  };
}

async function confirmRpcUnavailable(client: PublicClient): Promise<boolean> {
  try {
    await client.getBlockNumber();
    return false;
  } catch {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, RPC_HEALTH_CONFIRMATION_DELAY_MS);
    });
    try {
      await client.getBlockNumber();
      return false;
    } catch {
      return true;
    }
  }
}
