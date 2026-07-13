import { encodeFunctionData, erc20Abi, type Address } from "viem";
import { createSwapPublicClient } from "./rpcClient";

export async function getTokenBalanceWei(
  tokenAddress: string,
  owner: string,
  chainId: number,
): Promise<bigint> {
  const client = await createSwapPublicClient(chainId);
  if (!client) return 0n;
  try {
    return await client.readContract({
      address: tokenAddress as Address,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [owner as Address],
    });
  } catch {
    return 0n;
  }
}

export async function checkTokenAllowance(
  tokenAddress: string,
  owner: string,
  spender: string,
  chainId: number,
): Promise<bigint> {
  const client = await createSwapPublicClient(chainId);
  if (!client) return 0n;
  try {
    return await client.readContract({
      address: tokenAddress as Address,
      abi: erc20Abi,
      functionName: "allowance",
      args: [owner as Address, spender as Address],
    });
  } catch {
    return 0n;
  }
}

export function buildApprovalTx(
  tokenAddress: string,
  spender: string,
  amount: bigint,
): { to: string; data: string; value: string } {
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: "approve",
    args: [spender as Address, amount],
  });
  return { to: tokenAddress, data, value: "0x0" };
}
