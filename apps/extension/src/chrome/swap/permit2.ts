import { encodeFunctionData, type Address } from "viem";
import { createSwapPublicClient } from "./rpcClient";

export const PERMIT2_ABI = [
  {
    inputs: [
      { name: "owner", type: "address" },
      { name: "token", type: "address" },
      { name: "spender", type: "address" },
    ],
    name: "allowance",
    outputs: [
      { name: "amount", type: "uint160" },
      { name: "expiration", type: "uint48" },
      { name: "nonce", type: "uint48" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "token", type: "address" },
      { name: "spender", type: "address" },
      { name: "amount", type: "uint160" },
      { name: "expiration", type: "uint48" },
    ],
    name: "approve",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

export const PERMIT2_ADDRESS =
  "0x000000000022D473030F116dDEE9F6B43aC78BA3";

export async function checkPermit2Allowance(
  token: string,
  owner: string,
  spender: string,
  chainId: number,
): Promise<{ amount: bigint; expiration: number }> {
  const client = await createSwapPublicClient(chainId);
  if (!client) return { amount: 0n, expiration: 0 };
  try {
    const [amount, expiration] = await client.readContract({
      address: PERMIT2_ADDRESS as Address,
      abi: PERMIT2_ABI,
      functionName: "allowance",
      args: [owner as Address, token as Address, spender as Address],
    });
    return { amount, expiration };
  } catch {
    return { amount: 0n, expiration: 0 };
  }
}

export function buildPermit2ApproveTx(
  permit2Address: string,
  token: string,
  spender: string,
  amount: bigint,
): { to: string; data: string; value: string } {
  const expiration = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
  const maxUint160 = (1n << 160n) - 1n;
  const approveAmount = amount > maxUint160 ? maxUint160 : amount;
  const data = encodeFunctionData({
    abi: PERMIT2_ABI,
    functionName: "approve",
    args: [token as Address, spender as Address, approveAmount, expiration],
  });
  return { to: permit2Address, data, value: "0x0" };
}
