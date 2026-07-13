import { signMessageViaApi } from "../bankr/signing";
import { encryptWithVaultKey } from "../crypto";
import { signTypedData } from "../localSigner";
import {
  getAutoLockTimeout,
  getCachedApiKey,
  getCachedPassword,
  getCachedVaultKey,
  getPrivateKeyFromCache,
  setCachedVault,
  tryRestoreSession,
} from "../sessionCache";
import { handleUnlockWallet } from "../authHandlers";
import {
  TRANSFER_WITH_AUTHORIZATION_TYPES,
  USDC_DOMAIN,
} from "./constants";
import type {
  SponsoredTransferIntentRecord,
  SponsoredTransferRelayPayload,
} from "./intentStorage";
import type {
  SponsoredTransferSignerAccount,
  ValidSponsoredTransferIntent,
} from "./types";
import { ensureSponsoredVaultKey } from "./vaultAccess";

type AuthorizationResult =
  | {
      success: true;
      record: SponsoredTransferIntentRecord;
      payload: SponsoredTransferRelayPayload;
    }
  | { success: false; error: string };

export async function createSponsoredTransferAuthorization(input: {
  account: SponsoredTransferSignerAccount;
  intent: ValidSponsoredTransferIntent;
  intentId: string;
  amount: string;
}): Promise<AuthorizationResult> {
  const { account, intent, intentId, amount } = input;
  const validAfter = 0n;
  const validBefore = BigInt(Math.floor(Date.now() / 1000) + 600);
  const nonceBytes = new Uint8Array(32);
  crypto.getRandomValues(nonceBytes);
  const nonce = (`0x${Array.from(nonceBytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`) as `0x${string}`;

  const typedData = {
    domain: USDC_DOMAIN,
    types: TRANSFER_WITH_AUTHORIZATION_TYPES,
    primaryType: "TransferWithAuthorization" as const,
    message: {
      from: intent.from,
      to: intent.to,
      value: intent.value,
      validAfter,
      validBefore,
      nonce,
    },
  };

  let signature: string;
  if (account.type === "privateKey" || account.type === "seedPhrase") {
    let privateKey = getPrivateKeyFromCache(account.id);
    if (!privateKey) {
      const vaultKey = getCachedVaultKey();
      if (!vaultKey && (await getAutoLockTimeout()) === 0) {
        const restored = await tryRestoreSession(handleUnlockWallet);
        if (restored) privateKey = getPrivateKeyFromCache(account.id);
      }
      if (!privateKey) {
        const cachedVaultKey = getCachedVaultKey();
        if (cachedVaultKey) {
          const { decryptAllKeysWithVaultKey } = await import("../authHandlers");
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
    let apiKey = getCachedApiKey();
    if (!apiKey && !getCachedPassword()) {
      if ((await getAutoLockTimeout()) === 0) {
        await tryRestoreSession(handleUnlockWallet);
        apiKey = getCachedApiKey();
      }
    }
    if (!apiKey) {
      return { success: false, error: "Wallet must be unlocked" };
    }
    const result = await signMessageViaApi(apiKey, "eth_signTypedData_v4", [
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
    ]);
    signature = result.signature;
  }

  const payload: SponsoredTransferRelayPayload = {
    from: account.address,
    to: intent.to,
    value: intent.value.toString(),
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
  return {
    success: true,
    payload,
    record: {
      version: 1,
      id: intentId,
      txId: crypto.randomUUID(),
      accountId: account.id,
      accountAddress: account.address,
      accountType: account.type,
      to: intent.to,
      value: intent.value.toString(),
      amount,
      createdAt: Date.now(),
      validBefore: Number(validBefore),
      state: "prepared",
      encryptedPayload,
      attempts: 0,
    },
  };
}
