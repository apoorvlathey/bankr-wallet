/**
 * Sponsored USDC Transfer Handlers (ERC-3009)
 *
 * Handles gas-free USDC transfers on Base for premium users (20M+ sWCHAN).
 * Signs EIP-712 TransferWithAuthorization typed data locally, then sends
 * to the website API which broadcasts the tx onchain via a relayer.
 */

import { parseUnits } from "viem";
import { signTypedData } from "./localSigner";
import { signMessageViaApi } from "./bankrApi";
import { getActiveAccount } from "./accountStorage";
import {
  addTxToHistory,
  updateTxInHistory,
} from "./txHistoryStorage";
import { startReceiptPolling } from "./txReceiptPoller";
import {
  getCachedApiKey,
  getPrivateKeyFromCache,
  getCachedPassword,
  getCachedVaultKey,
  setCachedVault,
  getAutoLockTimeout,
  tryRestoreSession,
} from "./sessionCache";
import { handleUnlockWallet } from "./authHandlers";
import {
  WALLETCHAN_SPONSORED_TRANSFER_API,
  WALLETCHAN_PREMIUM_STATUS_API,
  USDC_LOGO_URL,
} from "@/constants/externalUrls";

/** USDC on Base (ERC-3009 transferWithAuthorization) */
const BASE_USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

const SPONSORED_TRANSFER_API = WALLETCHAN_SPONSORED_TRANSFER_API;
const PREMIUM_STATUS_API = WALLETCHAN_PREMIUM_STATUS_API;

/** EIP-712 domain for USDC on Base */
const USDC_DOMAIN = {
  name: "USD Coin",
  version: "2",
  chainId: 8453,
  verifyingContract: BASE_USDC_ADDRESS as `0x${string}`,
};

const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
};

/**
 * Check premium status for an address via the website API.
 */
export async function handleCheckPremiumStatus(
  address: string
): Promise<{ isPremium: boolean; balance: string }> {
  try {
    const res = await fetch(
      `${PREMIUM_STATUS_API}?address=${encodeURIComponent(address)}`
    );
    if (!res.ok) return { isPremium: false, balance: "0" };
    return await res.json();
  } catch {
    return { isPremium: false, balance: "0" };
  }
}

/**
 * Main handler for sponsored USDC transfers.
 * Signs EIP-712 typed data, sends to API, records in tx history.
 */
export async function handleSponsoredTransfer(message: {
  to: string;
  amount: string;
  decimals: number;
  fromAddress: string;
}): Promise<{ success: boolean; txId?: string; error?: string }> {
  const { to, amount, decimals, fromAddress } = message;

  // 1. Resolve account
  const account = await getActiveAccount();
  if (!account) {
    return { success: false, error: "No account found" };
  }
  if (account.type === "impersonator") {
    return { success: false, error: "View-only accounts cannot send transactions" };
  }

  // 2. Build EIP-712 message
  const value = parseUnits(amount, decimals);
  const validAfter = 0n;
  const validBefore = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour

  // Generate random bytes32 nonce
  const nonceBytes = new Uint8Array(32);
  crypto.getRandomValues(nonceBytes);
  const nonce = ("0x" +
    Array.from(nonceBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")) as `0x${string}`;

  const typedData = {
    domain: USDC_DOMAIN,
    types: TRANSFER_WITH_AUTHORIZATION_TYPES,
    primaryType: "TransferWithAuthorization" as const,
    message: {
      from: fromAddress as `0x${string}`,
      to: to as `0x${string}`,
      value,
      validAfter,
      validBefore,
      nonce,
    },
  };

  // 3. Sign typed data based on account type
  let signature: string;

  if (account.type === "privateKey" || account.type === "seedPhrase") {
    // Get private key with session restoration
    let privateKey = getPrivateKeyFromCache(account.id);

    if (!privateKey) {
      const vaultKey = getCachedVaultKey();
      if (!vaultKey) {
        const autoLockTimeout = await getAutoLockTimeout();
        if (autoLockTimeout === 0) {
          const restored = await tryRestoreSession(handleUnlockWallet);
          if (restored) privateKey = getPrivateKeyFromCache(account.id);
        }
      }
      if (!privateKey) {
        const cachedVaultKey = getCachedVaultKey();
        if (cachedVaultKey) {
          const { decryptAllKeysWithVaultKey } = await import("./authHandlers");
          const vault = await decryptAllKeysWithVaultKey(cachedVaultKey);
          if (vault) setCachedVault(vault);
        }
        privateKey = getPrivateKeyFromCache(account.id);
      }
      if (!privateKey) {
        return { success: false, error: "Wallet must be unlocked" };
      }
    }

    signature = await signTypedData(privateKey, typedData, 8453);
  } else {
    // Bankr API account — sign via API
    let apiKey = getCachedApiKey();
    if (!apiKey) {
      if (!getCachedPassword()) {
        const autoLockTimeout = await getAutoLockTimeout();
        if (autoLockTimeout === 0) {
          await tryRestoreSession(handleUnlockWallet);
          apiKey = getCachedApiKey();
        }
      }
      if (!apiKey) {
        return { success: false, error: "Wallet must be unlocked" };
      }
    }

    const result = await signMessageViaApi(
      apiKey,
      "eth_signTypedData_v4",
      [fromAddress, JSON.stringify(typedData)]
    );
    signature = result.signature;
  }

  // 4. Create tx history entry
  const txId = crypto.randomUUID();
  await addTxToHistory({
    id: txId,
    status: "processing",
    tx: {
      from: fromAddress,
      to: BASE_USDC_ADDRESS,
      data: "0x",
      value: "0x0",
      chainId: 8453,
    },
    origin: "Send USDC (Sponsored)",
    favicon: USDC_LOGO_URL,
    chainName: "Base",
    chainId: 8453,
    createdAt: Date.now(),
    accountType:
      account.type === "impersonator" ? "bankr" : account.type,
    functionName: "transferWithAuthorization",
    transferMeta: {
      recipient: to,
      amount,
      symbol: "USDC",
      tokenLogo: USDC_LOGO_URL,
    },
  });

  // 5. Call API
  try {
    const res = await fetch(SPONSORED_TRANSFER_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from: fromAddress,
        to,
        value: value.toString(),
        validAfter: validAfter.toString(),
        validBefore: validBefore.toString(),
        nonce,
        signature,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      await updateTxInHistory(txId, {
        status: "failed",
        error: data.error || "Sponsored transfer failed",
        completedAt: Date.now(),
      });
      return { success: false, error: data.error || "Sponsored transfer failed" };
    }

    // 6. Update to pending and start polling
    const txHash = data.txHash;
    await updateTxInHistory(txId, {
      status: "pending",
      txHash,
    });
    startReceiptPolling(txId, txHash, 8453);

    return { success: true, txId };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Network error";
    await updateTxInHistory(txId, {
      status: "failed",
      error: errorMsg,
      completedAt: Date.now(),
    });
    return { success: false, error: errorMsg };
  }
}
