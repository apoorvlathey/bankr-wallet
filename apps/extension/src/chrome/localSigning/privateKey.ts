/** Non-secret-format helpers for local private keys. */

import { privateKeyToAccount } from "viem/accounts";

export function deriveAddress(privateKey: `0x${string}`): string {
  return privateKeyToAccount(privateKey).address;
}

export function isValidPrivateKey(key: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(key);
}
