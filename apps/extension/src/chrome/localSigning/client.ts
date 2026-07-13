/** Viem local-account client construction; contains no signing policy. */

import {
  createWalletClient,
  type Chain,
  type LocalAccount,
  type Transport,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  VIEM_CHAINS,
  RPC_URLS,
  buildCustomViemChain,
} from "@/constants/chainRegistry";
import { secureHttpTransport } from "../network/rpcClient";
import type { CustomChainMeta } from "./types";

export function createLocalSignerClient(
  chainId: number,
  privateKey: `0x${string}`,
  rpcUrl?: string,
  customChainMeta?: CustomChainMeta,
): {
  client: WalletClient<Transport, Chain, LocalAccount>;
  account: LocalAccount;
  chain: Chain;
} {
  let chain = VIEM_CHAINS[chainId];
  if (!chain) {
    const resolvedRpc = rpcUrl || RPC_URLS[chainId];
    if (!resolvedRpc) {
      throw new Error(`Unsupported chain: ${chainId}. No RPC URL available.`);
    }
    chain = buildCustomViemChain(
      chainId,
      customChainMeta?.name ?? `Chain ${chainId}`,
      resolvedRpc,
      customChainMeta?.nativeCurrency,
      customChainMeta?.explorer,
    );
  }

  const account = privateKeyToAccount(privateKey);
  const client = createWalletClient({
    account,
    chain,
    transport: secureHttpTransport(rpcUrl || RPC_URLS[chainId], {
      timeout: 30_000,
    }),
  });
  return { client, account, chain };
}
