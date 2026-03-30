import {
  createPublicClient,
  createWalletClient,
  http,
} from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.NEXT_PUBLIC_BASE_RPC_URL || undefined),
});

/**
 * Creates a wallet client for the sponsor relayer.
 * Uses SPONSOR_RELAYER_PRIVATE_KEY env var to sign and broadcast txs on Base.
 */
export function createRelayerWalletClient() {
  const pk = process.env.SPONSOR_RELAYER_PRIVATE_KEY;
  if (!pk) {
    throw new Error("SPONSOR_RELAYER_PRIVATE_KEY not configured");
  }
  const account = privateKeyToAccount(pk as `0x${string}`);
  return createWalletClient({
    account,
    chain: base,
    transport: http(process.env.NEXT_PUBLIC_BASE_RPC_URL || undefined),
  });
}

/**
 * Verify a plain message signature.
 * Supports both EOA and smart contract wallets (ERC-1271).
 */
export async function verifyMessageSignature({
  address,
  message,
  signature,
}: {
  address: `0x${string}`;
  message: string;
  signature: `0x${string}`;
}): Promise<boolean> {
  return publicClient.verifyMessage({
    address,
    message,
    signature,
  });
}
