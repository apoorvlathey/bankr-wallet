import { privateKeyToAccount } from "viem/accounts";

export interface ValidateResult {
  valid: boolean;
  address?: string;
  normalizedKey?: string;
  error?: string;
}

/**
 * Generates a cryptographically secure random private key
 */
export function generatePrivateKey(): `0x${string}` {
  // A uniformly random 256-bit integer can (with vanishing probability) fall
  // outside secp256k1's valid scalar range. Validate before returning so even
  // that edge case can never show the user an unusable backup.
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const privateKey = `0x${Array.from(bytes, (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("")}` as `0x${string}`;
    try {
      privateKeyToAccount(privateKey);
      return privateKey;
    } catch {
      // Draw again for zero or a scalar outside the curve order.
    }
  }
}

/**
 * Validates a private key format and derives address
 */
export function validateAndDeriveAddress(key: string): ValidateResult {
  if (!key) {
    return { valid: false, error: "Private key is required" };
  }

  // Normalize: trim whitespace and auto-prefix "0x" if missing
  let normalizedKey = key.trim();
  if (!normalizedKey.startsWith("0x") && !normalizedKey.startsWith("0X")) {
    normalizedKey = `0x${normalizedKey}`;
  }
  // Ensure lowercase 0x prefix
  if (normalizedKey.startsWith("0X")) {
    normalizedKey = `0x${normalizedKey.slice(2)}`;
  }

  // Check length (0x + 64 hex chars)
  if (normalizedKey.length !== 66) {
    return { valid: false, error: "Private key must be 64 hex characters (32 bytes)" };
  }

  // Check if all characters are valid hex
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalizedKey)) {
    return { valid: false, error: "Invalid hex characters in private key" };
  }

  // Try to derive address using viem
  try {
    const account = privateKeyToAccount(normalizedKey as `0x${string}`);
    return { valid: true, address: account.address, normalizedKey };
  } catch (e) {
    console.error("Failed to derive address from private key:", e);
    return { valid: false, error: "Invalid private key format" };
  }
}
