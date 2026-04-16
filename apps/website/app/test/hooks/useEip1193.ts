"use client";

import { useWalletClient } from "wagmi";

type RpcRequest = (args: {
  method: string;
  params?: readonly unknown[] | Record<string, unknown>;
}) => Promise<unknown>;

/**
 * Returns a raw EIP-1193 `request(...)` function for the currently connected wallet.
 * Used for RPC methods that wagmi doesn't wrap with a dedicated hook
 * (wallet_sendCalls, wallet_watchAsset, wallet_addEthereumChain, wallet_getCapabilities, etc.).
 *
 * The wagmi WalletClient exposes `.transport.request` which speaks EIP-1193.
 */
export function useEip1193(): RpcRequest | null {
  const { data: walletClient } = useWalletClient();
  if (!walletClient) return null;
  return ((args) =>
    walletClient.transport.request(args as never)) as RpcRequest;
}
