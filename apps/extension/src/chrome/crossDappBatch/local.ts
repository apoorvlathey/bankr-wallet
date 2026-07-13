import { getStoredResolvedChainById } from "../../lib/chains";
import {
  getOnchainDelegate,
  resolveActiveDelegate,
} from "../../utils/delegationResolution";
import { getAccountById } from "../accountStorage";
import { handleUnlockWallet } from "../authHandlers";
import { hasEncryptedApiKey, loadDecryptedApiKey } from "../crypto";
import { assertAutomaticEip7702AuthorizationAllowed } from "../delegatedAuthorityPolicy";
import { bumpGasForEip7702Auth, type GasEstimate } from "../gasEstimation";
import { getNextNonce, resetNonce } from "../forceInclusion/nonceManager";
import {
  isBroadcastOutcomeUncertain,
  signAndBroadcastTransaction,
  signEip7702Authorization,
} from "../localSigner";
import {
  beginPendingRequestEffectLease,
  guardPendingRequestEffectLease,
} from "../requests/pendingRequestResolution";
import {
  getAutoLockTimeout,
  getCachedVaultKey,
  getPrivateKeyFromCache,
  setCachedApiKey,
  setCachedVault,
  tryRestoreSession,
} from "../sessionCache";
import { decryptAllKeys } from "../vaultCrypto";
import type { CrossDappBatchAuthorizationResult } from "./lifecycle";
import type { CrossDappBatchShipResult } from "./types";

interface LocalShipArgs {
  accountId: string;
  accountAddress: `0x${string}`;
  accountType: "privateKey" | "seedPhrase";
  chainId: number;
  encoded: { to: string; data: string; value: string };
  password: string;
  precomputedGasEstimates?: GasEstimate[];
  authorizeBeforeEffect: () => Promise<CrossDappBatchAuthorizationResult>;
}

/** Sign one cross-dapp batch locally through EIP-7702 + ERC-7821. */
export async function shipCrossDappBatchLocal(
  args: LocalShipArgs,
): Promise<CrossDappBatchShipResult> {
  const privateKey = await resolveLocalKey(args);
  if (!privateKey.ok) return { kind: "error", error: privateKey.error };

  const resolved = await getStoredResolvedChainById(args.chainId);
  if (!resolved?.rpcUrl) {
    return { kind: "error", error: "Chain has no RPC URL configured" };
  }
  const rpcUrl = resolved.rpcUrl;
  const customChainMeta = resolved.isCustom
    ? {
        name: resolved.name,
        nativeCurrency: resolved.nativeCurrency,
        explorer: resolved.explorer || undefined,
      }
    : undefined;
  const resolution = await resolveActiveDelegate({
    accountId: args.accountId,
    accountAddress: args.accountAddress,
    chainId: args.chainId,
    rpcUrl,
  });
  if (!resolution.delegate) {
    return {
      kind: "error",
      error:
        "This account isn't delegated to a compatible smart account on this chain. Set a custom delegate in Account Settings or switch chains.",
    };
  }

  try {
    const txNonce = await getNextNonce(args.accountAddress, args.chainId);
    let needsAuthorization = resolution.needsAuthorization;
    if (!needsAuthorization) {
      try {
        const onchain = await getOnchainDelegate(
          rpcUrl,
          args.chainId,
          args.accountAddress,
        );
        if (
          !onchain ||
          onchain.toLowerCase() !== resolution.delegate.toLowerCase()
        ) {
          console.warn(
            "[cross-dapp-7702] onchain delegate changed between resolve and broadcast — re-authorizing",
            { expected: resolution.delegate, actual: onchain },
          );
          needsAuthorization = true;
        }
      } catch (error) {
        console.warn(
          "[cross-dapp-7702] onchain delegate re-check failed — re-authorizing defensively",
          error,
        );
        needsAuthorization = true;
      }
    }

    let authorizationList:
      | readonly import("viem").SignedAuthorization[]
      | undefined;
    if (needsAuthorization) {
      assertAutomaticEip7702AuthorizationAllowed(resolution.delegate);
      const auth = await signEip7702Authorization(privateKey.privateKey, {
        contractAddress: resolution.delegate,
        chainId: args.chainId,
        nonce: txNonce + 1,
        rpcUrl,
        customChainMeta,
      });
      authorizationList = [auth];
    }

    const fees = combinedGasPolicy(
      args.chainId,
      needsAuthorization,
      args.precomputedGasEstimates,
    );
    const authorization = await args.authorizeBeforeEffect();
    if (!authorization.authorized) {
      return { kind: "authorization", error: authorization.error };
    }
    const commit = authorization.commit();
    if (!commit.authorized) {
      await commit.terminalize();
      return { kind: "authorization", error: commit.error };
    }
    const effectLease = beginPendingRequestEffectLease(
      "crossDappBatch",
      "active",
    );
    if (!effectLease) {
      return { kind: "error", error: "Wallet reset is in progress" };
    }
    const effectGuard = guardPendingRequestEffectLease(effectLease);

    let result: Awaited<ReturnType<typeof signAndBroadcastTransaction>>;
    try {
      result = await signAndBroadcastTransaction(
        privateKey.privateKey,
        {
          from: args.accountAddress,
          to: args.encoded.to,
          data: args.encoded.data,
          value: args.encoded.value,
          chainId: args.chainId,
          nonce: txNonce,
          gas: fees.gas,
          maxFeePerGas: fees.maxFeePerGas,
          maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
          ...(authorizationList
            ? { type: "eip7702", authorizationList }
            : {}),
        },
        rpcUrl,
        customChainMeta,
        async () => {
          const finalAuthorization = await args.authorizeBeforeEffect();
          if (!finalAuthorization.authorized) {
            throw new Error(finalAuthorization.error);
          }
          const latestAccount = await getAccountById(args.accountId);
          const finalCommit = finalAuthorization.commit();
          if (!finalCommit.authorized) {
            await finalCommit.terminalize();
            throw new Error(finalCommit.error);
          }
          if (
            !latestAccount ||
            latestAccount.type !== args.accountType ||
            latestAccount.address.toLowerCase() !==
              args.accountAddress.toLowerCase()
          ) {
            throw new Error("Pending request account is no longer available");
          }
          effectGuard.beginEffect();
        },
      );
      effectGuard.settleEffect();
    } finally {
      effectGuard.releaseIfSafe();
    }

    if (result.receipt) {
      const success =
        result.receipt.status === "success" ||
        (result.receipt.status as unknown) === "0x1";
      return success
        ? { kind: "ok", txHash: result.txHash, status: "success" }
        : {
            kind: "reverted",
            txHash: result.txHash,
            error: "Transaction reverted",
          };
    }
    return {
      kind: "ok",
      txHash: result.txHash,
      status: "pending",
      broadcastUncertain: isBroadcastOutcomeUncertain(result),
    };
  } catch (error) {
    resetNonce(args.accountAddress, args.chainId);
    return {
      kind: "error",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function resolveLocalKey(
  args: Pick<LocalShipArgs, "accountId" | "password">,
): Promise<
  | { ok: true; privateKey: `0x${string}` }
  | { ok: false; error: string }
> {
  let privateKey = getPrivateKeyFromCache(args.accountId);
  if (!privateKey && !getCachedVaultKey()) {
    if ((await getAutoLockTimeout()) === 0) {
      const restored = await tryRestoreSession(handleUnlockWallet);
      if (restored) privateKey = getPrivateKeyFromCache(args.accountId);
    }
  }
  if (!privateKey) {
    const cachedVaultKey = getCachedVaultKey();
    const vault = cachedVaultKey
      ? await (
          await import("../authHandlers")
        ).decryptAllKeysWithVaultKey(cachedVaultKey)
      : await decryptAllKeys(args.password);
    if (!vault) return { ok: false, error: "Invalid password" };
    setCachedVault(vault);
    if (await hasEncryptedApiKey()) {
      const apiKey = await loadDecryptedApiKey(args.password);
      if (apiKey) setCachedApiKey(apiKey, args.password);
    }
    privateKey = getPrivateKeyFromCache(args.accountId);
  }
  return privateKey
    ? { ok: true, privateKey }
    : { ok: false, error: "Private key not found for account" };
}

function combinedGasPolicy(
  chainId: number,
  needsAuthorization: boolean,
  estimates?: GasEstimate[],
): {
  gas: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
} {
  const summed = estimates?.reduce(
    (total, estimate) => total + (Number(estimate?.gasLimit) || 0),
    0,
  );
  const fallback = 120_000 * Math.max(1, estimates?.length ?? 8) + 80_000;
  let gas = BigInt(Math.ceil(summed && summed > 0 ? summed : fallback));
  if (needsAuthorization) gas = bumpGasForEip7702Auth(chainId, gas, 1);
  let maxFeePerGas: string | undefined;
  let maxPriorityFeePerGas: string | undefined;
  for (const estimate of estimates ?? []) {
    if (
      estimate?.maxFeePerGas &&
      (!maxFeePerGas || BigInt(estimate.maxFeePerGas) > BigInt(maxFeePerGas))
    ) {
      maxFeePerGas = estimate.maxFeePerGas;
    }
    if (
      estimate?.maxPriorityFeePerGas &&
      (!maxPriorityFeePerGas ||
        BigInt(estimate.maxPriorityFeePerGas) >
          BigInt(maxPriorityFeePerGas))
    ) {
      maxPriorityFeePerGas = estimate.maxPriorityFeePerGas;
    }
  }
  return { gas: `0x${gas.toString(16)}`, maxFeePerGas, maxPriorityFeePerGas };
}
