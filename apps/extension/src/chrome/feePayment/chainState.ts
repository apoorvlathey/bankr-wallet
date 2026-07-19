import { createPublicClient } from "viem";

import { getStoredResolvedChainById } from "@/lib/chains";
import { readOnchainDelegate } from "@/utils/delegationResolution";
import { secureHttpTransport } from "../network/rpcClient";
import { ENTRY_POINT_V07, WALLETCHAN_OFFICIAL_DELEGATE } from "./constants";
import type { Address, Hex } from "./pimlicoTypes";

const ENTRY_POINT_ABI = [
  {
    type: "function",
    name: "getNonce",
    stateMutability: "view",
    inputs: [
      { name: "sender", type: "address" },
      { name: "key", type: "uint192" },
    ],
    outputs: [{ name: "nonce", type: "uint256" }],
  },
] as const;

const ERC20_READ_ABI = [
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

function createFeePaymentPublicClient(rpcUrl: string) {
  return createPublicClient({
    transport: secureHttpTransport(rpcUrl, {
      timeout: 12_000,
      retryCount: 1,
    }),
  });
}

export function assertNoPendingEoaNonceRace(
  latestNonce: number,
  pendingNonce: number,
): void {
  if (latestNonce !== pendingNonce) {
    throw new Error(
      "Wait for the account's pending transaction before the one-time smart-account upgrade",
    );
  }
}

export async function getFeePaymentChainContext(
  chainId: number,
  sender: Address,
) {
  const chain = await getStoredResolvedChainById(chainId);
  if (!chain?.rpcUrl) throw new Error("No RPC is configured for this chain");
  const client = createFeePaymentPublicClient(chain.rpcUrl);
  const delegateRead = await readOnchainDelegate(chain.rpcUrl, chainId, sender);
  if (!delegateRead.ok) {
    throw new Error("Could not verify the account's smart-account delegation");
  }
  if (
    delegateRead.delegate &&
    delegateRead.delegate.toLowerCase() !==
      WALLETCHAN_OFFICIAL_DELEGATE.toLowerCase()
  ) {
    throw new Error(
      "Token gas payment requires WalletChan's official smart-account delegation",
    );
  }
  const [userOperationNonce, eoaNonces] = await Promise.all([
    client.readContract({
      address: ENTRY_POINT_V07,
      abi: ENTRY_POINT_ABI,
      functionName: "getNonce",
      args: [sender, 0n],
    }),
    delegateRead.delegate
      ? Promise.resolve(null)
      : Promise.all([
          client.getTransactionCount({ address: sender, blockTag: "latest" }),
          client.getTransactionCount({ address: sender, blockTag: "pending" }),
        ]),
  ]);
  if (eoaNonces) assertNoPendingEoaNonceRace(eoaNonces[0], eoaNonces[1]);
  return {
    chain,
    client,
    delegate: delegateRead.delegate,
    needsAuthorization: delegateRead.delegate === null,
    eoaNonce: eoaNonces?.[0] ?? null,
    userOperationNonce: `0x${userOperationNonce.toString(16)}` as Hex,
  };
}

export async function getFeeTokenAllowance(
  client: ReturnType<typeof createPublicClient>,
  token: Address,
  owner: Address,
  paymaster: Address,
): Promise<bigint> {
  return client.readContract({
    address: token,
    abi: ERC20_READ_ABI,
    functionName: "allowance",
    args: [owner, paymaster],
  });
}

export async function getFeeTokenBalance(
  client: ReturnType<typeof createPublicClient>,
  token: Address,
  owner: Address,
): Promise<bigint> {
  return client.readContract({
    address: token,
    abi: ERC20_READ_ABI,
    functionName: "balanceOf",
    args: [owner],
  });
}

export async function getFeeTokenBalanceAtRpc(
  rpcUrl: string,
  token: Address,
  owner: Address,
): Promise<bigint> {
  return getFeeTokenBalance(createFeePaymentPublicClient(rpcUrl), token, owner);
}

export const getUsdcAllowance = getFeeTokenAllowance;
export const getUsdcBalance = getFeeTokenBalance;
export const getUsdcBalanceAtRpc = getFeeTokenBalanceAtRpc;
