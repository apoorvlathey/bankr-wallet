/**
 * Sponsored USDC Transfer Handlers (ERC-3009)
 *
 * Handles gas-free USDC transfers on Base for premium users (20M+ sWCHAN).
 * Signs EIP-712 TransferWithAuthorization typed data locally, then sends
 * to the website API which broadcasts the tx onchain via a relayer.
 */

import { signTypedData } from "./localSigner";
import { signMessageViaApi } from "./bankrApi";
import { getAccountById, getActiveAccount } from "./accountStorage";
import {
  addTxToHistory,
  getTxById,
  updateTxInHistory,
} from "./txHistoryStorage";
import { startReceiptPolling } from "./forceInclusion/receiptPoller";
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
import { validateSponsoredTransferIntent } from "./sponsoredTransferValidation";
import { fetchTextBounded } from "./boundedHttpResponse";
import {
  parsePremiumStatusResponse,
  parseSponsoredTransferResponse,
} from "./sponsoredTransferResponse";
import { decryptWithVaultKey, encryptWithVaultKey } from "./crypto";
import {
  findSponsoredTransferIntent,
  parseSponsoredTransferRelayPayload,
  removeSponsoredTransferIntent,
  saveSponsoredTransferIntent,
  updateSponsoredTransferIntent,
  getSponsoredTransferIntentsForAddress,
  acknowledgeSponsoredTransferIntent,
  withSponsoredTransferOperation,
  type SponsoredTransferIntentRecord,
  type SponsoredTransferRelayPayload,
} from "./sponsoredTransferIntentStorage";
import { reconcileSponsoredTransferAuthorization } from "./sponsoredTransferReconciliation";
import {
  WALLET_SECRET_OPERATION_LOCK_KEY,
  withStorageLock,
} from "./storageLock";

/** USDC on Base (ERC-3009 transferWithAuthorization) */
const BASE_USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

const SPONSORED_TRANSFER_API = WALLETCHAN_SPONSORED_TRANSFER_API;
const PREMIUM_STATUS_API = WALLETCHAN_PREMIUM_STATUS_API;
const RELAYER_TIMEOUT_MS = 45_000;
const PREMIUM_TIMEOUT_MS = 15_000;
const RELAYER_RESPONSE_MAX_BYTES = 256 * 1024;
const PREMIUM_RESPONSE_MAX_BYTES = 64 * 1024;

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

async function ensureSponsoredTransferHistory(
  record: SponsoredTransferIntentRecord,
): Promise<void> {
  if (await getTxById(record.txId)) return;
  await addTxToHistory({
    id: record.txId,
    status: "processing",
    tx: {
      from: record.accountAddress,
      to: BASE_USDC_ADDRESS,
      data: "0x",
      value: "0x0",
      chainId: 8453,
    },
    origin: "Send USDC (Sponsored)",
    favicon: USDC_LOGO_URL,
    chainName: "Base",
    chainId: 8453,
    createdAt: record.createdAt,
    accountType: record.accountType,
    functionName: "transferWithAuthorization",
    transferMeta: {
      recipient: record.to,
      amount: record.amount,
      symbol: "USDC",
      tokenLogo: USDC_LOGO_URL,
    },
  });
}

async function ensureSponsoredVaultKey(): Promise<CryptoKey | null> {
  let vaultKey = getCachedVaultKey();
  if (!vaultKey && (await getAutoLockTimeout()) === 0) {
    await tryRestoreSession(handleUnlockWallet);
    vaultKey = getCachedVaultKey();
  }
  return vaultKey;
}

async function decryptSponsoredTransferPayload(
  record: SponsoredTransferIntentRecord,
  vaultKey: CryptoKey,
): Promise<SponsoredTransferRelayPayload> {
  const plaintext = await decryptWithVaultKey(vaultKey, record.encryptedPayload);
  if (!plaintext) {
    throw new Error("Sponsored transfer recovery state could not be decrypted");
  }
  const payload = parseSponsoredTransferRelayPayload(JSON.parse(plaintext));
  if (
    payload.from.toLowerCase() !== record.accountAddress.toLowerCase() ||
    payload.to.toLowerCase() !== record.to.toLowerCase() ||
    payload.value !== record.value ||
    payload.validBefore !== String(record.validBefore)
  ) {
    throw new Error(
      "Sponsored transfer recovery state does not match the reviewed intent",
    );
  }
  return payload;
}

async function reconcileSponsoredTransferRecord(
  record: SponsoredTransferIntentRecord,
  vaultKey: CryptoKey,
): Promise<{
  status: "consumed" | "expired-unused" | "unresolved";
  payload: SponsoredTransferRelayPayload;
}> {
  const payload = await decryptSponsoredTransferPayload(record, vaultKey);
  const status = await reconcileSponsoredTransferAuthorization(
    payload,
    record.validBefore,
  );
  if (status === "consumed") {
    await ensureSponsoredTransferHistory(record);
    await updateTxInHistory(record.txId, {
      status: "success",
      completedAt: Date.now(),
      error: undefined,
      broadcastUncertain: false,
    });
    await updateSponsoredTransferIntent(record.id, {
      state: "consumed",
      attempts: record.attempts,
    });
  } else if (status === "expired-unused") {
    await ensureSponsoredTransferHistory(record);
    await updateTxInHistory(record.txId, {
      status: "failed",
      completedAt: Date.now(),
      error: "Sponsored authorization expired without being used",
      broadcastUncertain: false,
    });
    await removeSponsoredTransferIntent(record.id);
  }
  return { status, payload };
}

export async function handleCheckSponsoredTransferStatus(
  fromAddress: string,
): Promise<{
  success: boolean;
  hasUnresolved: boolean;
  completed?: boolean;
  txId?: string;
  intentId?: string;
  error?: string;
}> {
  return withSponsoredTransferOperation(async () => {
    const account = await getActiveAccount();
    if (
      !account ||
      account.type === "impersonator" ||
      !/^0x[0-9a-fA-F]{40}$/.test(fromAddress) ||
      account.address.toLowerCase() !== fromAddress.toLowerCase()
    ) {
      return {
        success: false,
        hasUnresolved: true,
        error: "Transfer account no longer matches the active account",
      };
    }
    try {
      const records = await getSponsoredTransferIntentsForAddress(
        account.address,
      );
      if (records.length === 0) {
        return { success: true, hasUnresolved: false };
      }
      const vaultKey = await ensureSponsoredVaultKey();
      if (!vaultKey) {
        return {
          success: false,
          hasUnresolved: true,
          error: "Wallet must be unlocked",
        };
      }
      let completedTxId: string | undefined;
      let completedIntentId: string | undefined;
      let unresolved = false;
      for (const record of records) {
        if (record.state === "submitted" || record.state === "consumed") {
          completedTxId = record.txId;
          completedIntentId = record.id;
          continue;
        }
        const result = await reconcileSponsoredTransferRecord(record, vaultKey);
        if (result.status === "consumed") {
          completedTxId = record.txId;
          completedIntentId = record.id;
        }
        if (result.status === "unresolved") unresolved = true;
      }
      if (unresolved) {
        return {
          success: true,
          hasUnresolved: true,
          error:
            "Transfer outcome is still unknown. Check again before sending another transfer.",
        };
      }
      return {
        success: true,
        hasUnresolved: false,
        completed: completedTxId !== undefined,
        txId: completedTxId,
        intentId: completedIntentId,
      };
    } catch (error) {
      return {
        success: false,
        hasUnresolved: true,
        error:
          error instanceof Error
            ? error.message
            : "Sponsored transfer recovery state is invalid",
      };
    }
  });
}

export async function handleAcknowledgeSponsoredTransfer(
  intentId: string,
  fromAddress: string,
): Promise<{ success: boolean }> {
  return withSponsoredTransferOperation(async () => {
    const account = await getActiveAccount();
    if (
      !account ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(intentId) ||
      !/^0x[0-9a-fA-F]{40}$/.test(fromAddress) ||
      account.address.toLowerCase() !== fromAddress.toLowerCase()
    ) {
      return { success: false };
    }
    return {
      success: await acknowledgeSponsoredTransferIntent(
        intentId,
        account.address,
      ),
    };
  });
}

/**
 * Check premium status for an address via the website API.
 */
export async function handleCheckPremiumStatus(
  address: string
): Promise<{ isPremium: boolean; balance: string; sponsoredTransfersEnabled: boolean }> {
  try {
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
      return { isPremium: false, balance: "0", sponsoredTransfersEnabled: false };
    }
    const { response, text } = await fetchTextBounded(
      `${PREMIUM_STATUS_API}?address=${encodeURIComponent(address)}`,
      { method: "GET" },
      { timeoutMs: PREMIUM_TIMEOUT_MS, maxBytes: PREMIUM_RESPONSE_MAX_BYTES },
    );
    if (!response.ok) {
      return { isPremium: false, balance: "0", sponsoredTransfersEnabled: false };
    }
    return parsePremiumStatusResponse(text);
  } catch {
    return { isPremium: false, balance: "0", sponsoredTransfersEnabled: false };
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
  intentId?: string;
}): Promise<{
  success: boolean;
  txId?: string;
  intentId?: string;
  error?: string;
  outcomeUncertain?: boolean;
  retryReady?: boolean;
}> {
  return withSponsoredTransferOperation(async () => {
  const { to, amount, decimals, fromAddress } = message;

  // 1. Resolve account
  const account = await getActiveAccount();
  if (!account) {
    return { success: false, error: "No account found" };
  }
  if (account.type === "impersonator") {
    return { success: false, error: "View-only accounts cannot send transactions" };
  }
  const intent = validateSponsoredTransferIntent(account.address, {
    fromAddress,
    to,
    amount,
    decimals,
  });
  if (!intent.valid) {
    return { success: false, error: intent.error };
  }

  const intentId =
    typeof message.intentId === "string" &&
    /^[A-Za-z0-9_-]{1,128}$/.test(message.intentId)
      ? message.intentId
      : crypto.randomUUID();

  let record: SponsoredTransferIntentRecord | null;
  try {
    record = await findSponsoredTransferIntent({
      id: intentId,
      accountId: account.id,
      accountAddress: account.address,
      to: intent.to,
      value: intent.value.toString(),
    });
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Sponsored transfer intent is invalid",
      outcomeUncertain: true,
    };
  }
  if (!record) {
    try {
      const unresolvedRecords = await getSponsoredTransferIntentsForAddress(
        account.address,
      );
      if (unresolvedRecords.length > 0) {
        const vaultKey = await ensureSponsoredVaultKey();
        if (!vaultKey) {
          return {
            success: false,
            error: "Wallet must be unlocked",
            outcomeUncertain: true,
          };
        }
        let completedTxId: string | undefined;
        let completedIntentId: string | undefined;
        let unresolved = false;
        for (const unresolvedRecord of unresolvedRecords) {
          if (
            unresolvedRecord.state === "submitted" ||
            unresolvedRecord.state === "consumed"
          ) {
            completedTxId = unresolvedRecord.txId;
            completedIntentId = unresolvedRecord.id;
            continue;
          }
          const result = await reconcileSponsoredTransferRecord(
            unresolvedRecord,
            vaultKey,
          );
          if (result.status === "consumed") {
            completedTxId = unresolvedRecord.txId;
            completedIntentId = unresolvedRecord.id;
          }
          if (result.status === "unresolved") unresolved = true;
        }
        if (completedTxId && !unresolved) {
          return {
            success: true,
            txId: completedTxId,
            intentId: completedIntentId,
          };
        }
        if (!unresolved) {
          return {
            success: false,
            error:
              "The previous sponsored transfer safely expired. Review and press Send again.",
            retryReady: true,
          };
        } else {
        return {
          success: false,
          error:
            "Check the existing sponsored transfer before sending another one.",
          outcomeUncertain: true,
        };
        }
      }
    } catch {
      return {
        success: false,
        error: "Sponsored transfer recovery state is invalid",
        outcomeUncertain: true,
      };
    }
  }
  if (
    record &&
    (record.state === "submitted" || record.state === "consumed")
  ) {
    return { success: true, txId: record.txId, intentId: record.id };
  }

  let payload: SponsoredTransferRelayPayload;
  if (record) {
    const vaultKey = await ensureSponsoredVaultKey();
    if (!vaultKey) return { success: false, error: "Wallet must be unlocked" };
    const reconciled = await reconcileSponsoredTransferRecord(record, vaultKey);
    payload = reconciled.payload;
    const resolution = reconciled.status;
    if (resolution === "consumed") {
      return { success: true, txId: record.txId, intentId: record.id };
    }
    if (resolution === "expired-unused") {
      record = null;
    } else if (record.state !== "prepared") {
      const retryMessage =
        "Transfer outcome is still unknown. Check again before sending another transfer.";
      await ensureSponsoredTransferHistory(record);
      await updateSponsoredTransferIntent(record.id, {
        state: "ambiguous",
        attempts: record.attempts,
        lastError: retryMessage,
      });
      await updateTxInHistory(record.txId, {
        status: "pending",
        error: retryMessage,
        broadcastUncertain: true,
      });
      return {
        success: false,
        txId: record.txId,
        intentId: record.id,
        error: retryMessage,
        outcomeUncertain: true,
      };
    }
  }

  if (!record) {
  // 2. Build EIP-712 message
  const { value } = intent;
  const validAfter = 0n;
  const validBefore = BigInt(Math.floor(Date.now() / 1000) + 600); // 10 minutes

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
      from: intent.from,
      to: intent.to,
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

    try {
      signature = await signTypedData(privateKey, typedData, 8453);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Signing failed",
      };
    }
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
      [
        account.address,
        {
          ...typedData,
          message: {
            ...typedData.message,
            value: typedData.message.value.toString(),
            validAfter: typedData.message.validAfter.toString(),
            validBefore: typedData.message.validBefore.toString(),
          },
        },
      ],
    );
    signature = result.signature;
  }

  payload = {
    from: account.address,
    to: intent.to,
    value: value.toString(),
    validAfter: validAfter.toString(),
    validBefore: validBefore.toString(),
    nonce,
    signature,
  };
  const vaultKey = await ensureSponsoredVaultKey();
  if (!vaultKey) return { success: false, error: "Wallet must be unlocked" };
  const encryptedPayload = await encryptWithVaultKey(
    vaultKey,
    JSON.stringify(payload),
  );
  record = {
    version: 1,
    id: intentId,
    txId: crypto.randomUUID(),
    accountId: account.id,
    accountAddress: account.address,
    accountType: account.type,
    to: intent.to,
    value: value.toString(),
    amount,
    createdAt: Date.now(),
    validBefore: Number(validBefore),
    state: "prepared",
    encryptedPayload,
    attempts: 0,
  };
  await saveSponsoredTransferIntent(record);
  }

  const latestAccount = await getAccountById(account.id);
  if (
    !latestAccount ||
    latestAccount.type !== account.type ||
    latestAccount.address.toLowerCase() !== account.address.toLowerCase()
  ) {
    return { success: false, error: "Transfer account is no longer available" };
  }

  await ensureSponsoredTransferHistory(record);

  // 4. Persist the exact one-time authorization before the sole POST. A lost
  // response is reconciled against finalized Base state; it is never re-POSTed
  // and never replaced with another authorization while its outcome is open.
  let request:
    | Promise<{ response: Response; text: string }>
    | undefined;
  await withStorageLock(WALLET_SECRET_OPERATION_LOCK_KEY, async () => {
    const current = await getAccountById(account.id);
    if (
      !current ||
      current.type !== account.type ||
      current.address.toLowerCase() !== account.address.toLowerCase()
    ) {
      throw new Error("Transfer account is no longer available");
    }
    await updateSponsoredTransferIntent(record!.id, {
      state: "submitting",
      attempts: record!.attempts + 1,
    });
    request = fetchTextBounded(
      SPONSORED_TRANSFER_API,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
      { timeoutMs: RELAYER_TIMEOUT_MS, maxBytes: RELAYER_RESPONSE_MAX_BYTES },
    );
  });

  try {
    if (!request) throw new Error("Sponsored transfer submission did not start");
    const { response, text } = await request;
    const txHash = parseSponsoredTransferResponse(text, response.ok);
    await updateSponsoredTransferIntent(record.id, {
      state: "submitted",
      attempts: record.attempts + 1,
      txHash,
    });
    await updateTxInHistory(record.txId, {
      status: "pending",
      txHash,
      error: undefined,
      broadcastUncertain: false,
    });
    startReceiptPolling(record.txId, txHash, 8453);
    return {
      success: true,
      txId: record.txId,
      intentId: record.id,
    };
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "Relayer response was lost";
    const retryMessage =
      "Transfer outcome is unknown. Check again before sending another transfer.";
    await updateSponsoredTransferIntent(record.id, {
      state: "ambiguous",
      attempts: record.attempts + 1,
      lastError: detail,
    }).catch(() => undefined);
    await updateTxInHistory(record.txId, {
      status: "pending",
      error: retryMessage,
      broadcastUncertain: true,
    });
    return {
      success: false,
      txId: record.txId,
      intentId: record.id,
      error: retryMessage,
      outcomeUncertain: true,
    };
  }

  });
}
