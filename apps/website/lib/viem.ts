import { createPublicClient, http } from "viem";
import { base } from "viem/chains";

const publicClient = createPublicClient({
  chain: base,
  transport: http(),
});

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
