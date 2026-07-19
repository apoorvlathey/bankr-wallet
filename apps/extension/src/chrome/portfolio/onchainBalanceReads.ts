import { erc20Abi, formatUnits, type Address, type PublicClient } from "viem";
import type { PortfolioToken } from "./api";

export const MULTICALL3_ADDRESS: Address =
  "0xcA11bde05977b3631167028862bE2a173976CA11";

export const multicall3Abi = [
  {
    type: "function",
    name: "getEthBalance",
    stateMutability: "view",
    inputs: [{ name: "addr", type: "address" }],
    outputs: [{ name: "balance", type: "uint256" }],
  },
] as const;

export interface OnchainBalanceCall {
  entryIndex: number;
  token: PortfolioToken;
  contract: any;
}

export async function fetchChunkBalancesIndividually(
  client: PublicClient,
  tokens: PortfolioToken[],
  chunk: OnchainBalanceCall[],
  address: Address,
): Promise<boolean[]> {
  return Promise.all(
    chunk.map(({ entryIndex, token }) =>
      fetchSingleBalanceDirectly(client, tokens, entryIndex, token, address),
    ),
  );
}

export async function fetchSingleBalanceDirectly(
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
  } catch {
    return false;
  }
}

export function applyBalance(
  tokens: PortfolioToken[],
  index: number,
  rawBalance: bigint,
  originalToken: PortfolioToken,
): void {
  const balanceStr = formatUnits(rawBalance, originalToken.decimals);
  const balanceNum = parseFloat(balanceStr);
  tokens[index].balance = balanceStr;
  tokens[index].balanceFormatted = formatBalance(balanceNum);
  tokens[index].valueUsd = balanceNum * originalToken.priceUsd;
}

function formatBalance(value: number): string {
  if (value === 0) return "0";
  if (value < 0.000001) return "<0.000001";
  if (value >= 1_000_000) {
    return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
  return parseFloat(value.toPrecision(6)).toString();
}
