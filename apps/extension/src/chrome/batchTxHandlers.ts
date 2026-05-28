/**
 * ERC-5792 batch transaction handlers
 * Manages wallet_getCapabilities, wallet_sendCalls, wallet_getCallsStatus, wallet_showCallsStatus
 */

import { encodeFunctionData, encodeAbiParameters } from "viem";
import {
  submitTransactionDirect,
  type TransactionParams,
} from "./bankrApi";
import {
  BANKR_SUPPORTED_CHAIN_IDS,
  CHAIN_NAMES,
} from "../constants/networks";
import { ALLOWED_CHAIN_IDS } from "../constants/chainRegistry";
import {
  resolveActiveDelegate,
  getOnchainDelegate,
  hasDefaultDelegateForChain,
} from "../utils/delegationResolution";
import { getAllDelegatesForAccount } from "./delegationStorage";
import { bumpGasForEip7702Auth } from "./gasEstimation";
import { CHAIN_CONFIG } from "../constants/chainConfig";
import { getActiveAccount, getAccountById } from "./accountStorage";
import type { Account } from "./types";
import {
  savePendingBatchTxRequest,
  removePendingBatchTxRequest,
  getPendingBatchTxRequestById,
  removeCallFromPendingBatchTxRequest,
} from "./pendingBatchTxStorage";
import {
  saveBundleStatus,
  getBundleStatus,
  updateBundleStatus,
} from "./bundleStatusStorage";
import {
  getCachedApiKey,
  setCachedApiKey,
  getCachedPassword,
  getCachedVaultKey,
  setCachedVault,
  getAutoLockTimeout,
  tryRestoreSession,
  getPrivateKeyFromCache,
} from "./sessionCache";
import { loadDecryptedApiKey } from "./crypto";
import { handleUnlockWallet } from "./authHandlers";
import {
  addTxToHistory,
  updateTxInHistory,
  getTxById,
  type CompletedTransaction,
} from "./txHistoryStorage";
import { attachClearSignedMetaToHistory } from "./clearSignedMetaSnapshot";
import { startReceiptPolling, applyReceiptToHistory } from "./txReceiptPoller";
import {
  extractAssetChangesWhenReceiptAvailable,
  fetchBundleReceipt,
  fetchRawTransactionReceipt,
  toBundleReceipt,
} from "./receiptEnrichment";
import { openExtensionPopup, writeResultToStorage, showNotification, getRpcUrl } from "./txHandlers";
import {
  signAndBroadcastTransaction,
  signEip7702Authorization,
} from "./localSigner";
import { getNextNonce, resetNonce } from "./nonceManager";
import { decryptAllKeys } from "./vaultCrypto";
import { hasEncryptedApiKey } from "./crypto";
import {
  getStoredResolvedChainById,
  getStoredNetworksInfo,
  getResolvedChains,
} from "../lib/chains";
import type {
  WalletSendCallsParams,
  ERC5792Call,
  WalletGetCallsStatusResult,
  PendingBatchTxRequest,
  BundleReceipt,
} from "./erc5792Types";
import { BUNDLE_STATUS, ERC5792_ERRORS } from "./erc5792Types";
import { OP_STACK_CHAIN_IDS } from "../constants/networks";
import { pinnedBatchTxRequest } from "./pinnedRequest";

// ---------------------------------------------------------------------------
// ERC-7821 batch encoding
// ---------------------------------------------------------------------------

const ERC7821_ABI = [
  {
    inputs: [
      { name: "mode", type: "bytes32" },
      { name: "executionData", type: "bytes" },
    ],
    name: "execute",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
] as const;

// ERC-7821 plain single-batch mode (no opData). Spec quote:
//   "If `opData` is empty, `executionData` is simply `abi.encode(calls)`."
//   "0x010000000000000000…: Single batch. Does not support optional `opData`."
//
// We always send executionData = abi.encode(Call[]) (no opData), so the
// matching mode is the plain variant. The previous magic-bit variant
// (`0x01…7821_0001…`) advertised opData support but we never appended any
// opData bytes — Solady's ERC7821 was permissive enough to accept that, but
// stricter implementers (Uniswap Calibur) reject it via strict-equality
// checks on the mode bytes. Plain mode is the universal subset accepted by
// every conforming implementation including MetaMask's EIP7702StatelessDeleGator
// and Calibur. Auth model: with opData empty, the spec mandates "the
// implementation SHOULD require that `msg.sender == address(this)`" — our
// EIP-7702 self-call (tx.to = EOA, msg.sender inside execute = EOA = self)
// satisfies that for every conforming delegator.
const ERC7821_BATCH_MODE =
  "0x0100000000000000000000000000000000000000000000000000000000000000" as `0x${string}`;

/**
 * Encode an array of ERC-5792 calls into a single ERC-7821 batch transaction.
 * Returns the tx params to send (to = walletAddress, data = encoded batch, value = total value).
 */
export function encodeBatchCalls(
  calls: ERC5792Call[],
  walletAddress: string,
): { to: string; data: string; value: string } {
  // Defense-in-depth against ERC-7821 self-recursion through self-calls.
  //
  // The exploit: an outer batch contains `{ to: EOA, data: <encoded
  // execute(mode, hostileBatch)> }`. Because the EOA is delegated, that
  // self-call dispatches to the delegate's execute() with msg.sender == EOA
  // == address(this), which passes the spec-mandated auth check, and the
  // hostile inner batch runs. The smuggle needs *payload*: a no-op
  // self-call (empty data, zero value) just hits the delegate's fallback,
  // which on conforming implementations does nothing — and wagmi-driven
  // 7702 onboarding flows (7702beat's "Upgrade Account") rely on that
  // pattern to nudge the wallet into the authorization path.
  //
  // We deliberately do NOT reject calls to address(0). The ERC-7821 spec
  // permits ("MAY") executors to substitute `Call.to == 0x0` with
  // `address(this)`, but the MM EIP7702StatelessDeleGator we ship as our
  // default — and most other audited 7821 impls — do NOT substitute.
  // A call to 0x0 onchain is a no-op (no code at the zero address).
  // Rejecting it preemptively broke legitimate flows (counterfactual
  // transfers, 7702-nudge patterns that use 0x0 instead of self) while
  // protecting against a class of attack that's only theoretical on the
  // delegates we actually use. Users see the full call list in the
  // confirmation UI; an inner call to 0x0 with hostile-looking data is as
  // visible as any other call.
  //
  // handleWalletSendCalls applies the same self-call guard upstream; this
  // is the last-line check so it can't be bypassed through any other call
  // site (cross-dapp batches, internal flows, etc.).
  const eoaLower = walletAddress.toLowerCase();
  for (let i = 0; i < calls.length; i++) {
    const to = (calls[i].to ?? "").toLowerCase();
    if (to !== eoaLower) continue;
    const data = calls[i].data ?? "0x";
    const valueHex = calls[i].value ?? "0x0";
    const hasData = data !== "0x" && data !== "0x0" && data.length > 2;
    const hasValue = valueHex !== "0x" && valueHex !== "0x0" && BigInt(valueHex) > 0n;
    if (hasData || hasValue) {
      throw new Error(
        `Call ${i + 1} targets your own account with payload — rejected to prevent ERC-7821 self-recursion (an inner execute() call would re-enter with auth bypassed)`,
      );
    }
  }

  const encodedCalls = calls.map((call) => ({
    to: call.to as `0x${string}`,
    value: call.value ? BigInt(call.value) : 0n,
    data: (call.data || "0x") as `0x${string}`,
  }));

  // Sum all call values for the outer tx value
  const totalValue = encodedCalls.reduce((sum, c) => sum + c.value, 0n);

  const executionData = encodeAbiParameters(
    [
      {
        type: "tuple[]",
        components: [
          { type: "address", name: "to" },
          { type: "uint256", name: "value" },
          { type: "bytes", name: "data" },
        ],
      },
    ],
    [encodedCalls],
  );

  const calldata = encodeFunctionData({
    abi: ERC7821_ABI,
    functionName: "execute",
    args: [ERC7821_BATCH_MODE, executionData],
  });

  return {
    to: walletAddress,
    data: calldata,
    value: totalValue > 0n ? `0x${totalValue.toString(16)}` : "0x0",
  };
}

// ---------------------------------------------------------------------------
// Prevent double-execution
// ---------------------------------------------------------------------------

const processingBundleIds = new Set<string>();
const TX_EXPIRY_MS = 30 * 60 * 1000;

// ---------------------------------------------------------------------------
// wallet_getCapabilities
// ---------------------------------------------------------------------------

export async function handleWalletGetCapabilities(
  address: string,
  chainIds?: `0x${string}`[],
  accountOverride?: Account,
): Promise<Record<string, any>> {
  const account = accountOverride ?? await getActiveAccount();

  // Per ERC-5792, capabilities are scoped to the *connected* address. We have
  // a single active account at a time, so a dapp asking about any other
  // address must get back an empty response — otherwise the dapp would think
  // we can sign atomic batches for arbitrary EOAs (e.g. someone else's
  // address pasted as a probe).
  if (address && account?.address) {
    if (address.toLowerCase() !== account.address.toLowerCase()) {
      return {};
    }
  }

  const isBankrAccount = account?.type === "bankr";
  const isPKOrSP =
    account?.type === "privateKey" || account?.type === "seedPhrase";
  // Impersonators advertise batching so wagmi dapps surface the batched flow,
  // but the popup will show a view-only banner and hide the Confirm button.
  // Confirm-time signing is still defended at handleConfirmBatchTransaction
  // and resolvePinnedAccount.
  const isImpersonator = account?.type === "impersonator";

  const capabilities: Record<string, any> = {};

  // The current ERC-5792 spec exposes batch support via
  // `atomic: { status: "supported" | "ready" | "unsupported" }`. The legacy
  // shape was `atomicBatch: { supported: boolean }` — some dapps and the
  // older wagmi / @wagmi/connectors versions still look for that, so we
  // advertise both. Keeping them in lockstep here (single helper) ensures
  // every emit site stays consistent if either spec moves.
  const ATOMIC_SUPPORTED_CAP = {
    atomic: { status: "supported" },
    atomicBatch: { supported: true },
  } as const;

  // Build a hidden-chain filter from the user's networks store. Honoring
  // `hidden` here keeps the dapp-visible support set in lockstep with what
  // shows up in the in-wallet UI — if the user hid a chain in Networks,
  // dapps shouldn't see capabilities for it either.
  const networksInfo = await getStoredNetworksInfo();
  const hiddenChainIds = new Set<number>();
  for (const c of getResolvedChains(networksInfo)) {
    if (c.hidden) hiddenChainIds.add(c.chainId);
  }
  const shouldEmit = (chainId: number, hexChainId: `0x${string}`) => {
    if (hiddenChainIds.has(chainId)) return false;
    if (chainIds && chainIds.length > 0 && !chainIds.includes(hexChainId)) {
      return false;
    }
    return true;
  };

  // Bankr accounts: atomic batching on Bankr-supported chains
  if (isBankrAccount) {
    for (const chainId of BANKR_SUPPORTED_CHAIN_IDS) {
      const hexChainId = `0x${chainId.toString(16)}` as `0x${string}`;
      if (!shouldEmit(chainId, hexChainId)) continue;
      capabilities[hexChainId] = { ...ATOMIC_SUPPORTED_CAP };
    }
  }

  // PK/SP accounts: only advertise `atomic` for chains where the same resolver
  // used at confirm time can find a usable delegate. This keeps capabilities
  // honest for edge cases such as an EOA already delegated to a non-ERC-7821
  // contract. Built-in Pectra chains, including non-standard-gas chains like
  // MegaETH, qualify through the default delegate when no conflicting onchain
  // delegation exists. Custom chains whose chainId is in KNOWN_CHAINS also
  // qualify through the default delegate once the user has added the chain.
  //
  // Candidate set = built-ins ∪ visible custom chains with a known default
  // delegate deployment ∪ chains where this account has a stored custom
  // delegate. We deliberately do NOT include every chain in `networksInfo` —
  // a user with 20 random custom chains would otherwise trigger 20 RPC probes
  // per `wallet_getCapabilities` call, and dead RPCs would stall the response.
  // KNOWN_CHAINS custom networks are the safe exception because the resolver
  // can authorize WalletChan's default delegate without manual setup.
  if (isPKOrSP && account) {
    const candidateSet = new Set<number>(ALLOWED_CHAIN_IDS);
    for (const c of getResolvedChains(networksInfo)) {
      if (!c.hidden && hasDefaultDelegateForChain(c.chainId)) {
        candidateSet.add(c.chainId);
      }
    }
    const optedInDelegates = await getAllDelegatesForAccount(account.id);
    for (const chainIdStr of Object.keys(optedInDelegates)) {
      const chainId = Number(chainIdStr);
      if (Number.isFinite(chainId)) candidateSet.add(chainId);
    }

    const candidateChainIds: number[] = [];
    for (const chainId of candidateSet) {
      const hexChainId = `0x${chainId.toString(16)}` as `0x${string}`;
      if (!shouldEmit(chainId, hexChainId)) continue;
      candidateChainIds.push(chainId);
    }

    // Parallel resolver probes. Each call hits chrome.storage and at most two RPCs
    // (eth_getCode + supportsExecutionMode), so a small fan-out is fine —
    // dapps frequently call wallet_getCapabilities without a chainIds filter.
    const probeResults = await Promise.all(
      candidateChainIds.map(async (chainId) => {
        const resolved = await getStoredResolvedChainById(chainId);
        if (!resolved?.rpcUrl) return { chainId, atomic: false };
        try {
          const result = await resolveActiveDelegate({
            accountId: account.id,
            accountAddress: account.address as `0x${string}`,
            chainId,
            rpcUrl: resolved.rpcUrl,
          });
          return { chainId, atomic: !!result.delegate };
        } catch {
          return { chainId, atomic: false };
        }
      }),
    );

    for (const { chainId, atomic } of probeResults) {
      if (!atomic) continue;
      const hexChainId = `0x${chainId.toString(16)}` as `0x${string}`;
      capabilities[hexChainId] = { ...ATOMIC_SUPPORTED_CAP };
    }
  }

  // Impersonator accounts advertise on every allowed chain so dapps surface
  // their batched flow — the popup will show the calls in view-only mode
  // (banner + disabled Confirm in BatchTransactionConfirmation.tsx). No
  // signing happens, so the "atomic" claim is moot; the goal is to let the
  // user inspect what a dapp tried to send. Non-standard-gas chains like
  // MegaETH stay included here — the gas-estimation caveat that gates real
  // signing paths doesn't apply when nothing is ever signed.
  if (isImpersonator) {
    for (const chainId of ALLOWED_CHAIN_IDS) {
      const hexChainId = `0x${chainId.toString(16)}` as `0x${string}`;
      if (!shouldEmit(chainId, hexChainId)) continue;
      capabilities[hexChainId] = { ...ATOMIC_SUPPORTED_CAP };
    }
  }

  return capabilities;
}

// ---------------------------------------------------------------------------
// wallet_sendCalls
// ---------------------------------------------------------------------------

export function handleWalletSendCalls(
  params: WalletSendCallsParams,
  bundleId: string,
  origin: string,
  favicon: string | null,
  senderWindowId?: number,
  senderOrigin?: string,
  tabId?: number,
  frameId?: number,
  accountOverride?: Account,
): void {
  (async () => {
    // Validate version
    if (params.version !== "2.0.0") {
      await writeResultToStorage(`batchTxAck:${bundleId}`, {
        success: false,
        error: "Unsupported version. Expected 2.0.0",
        code: ERC5792_ERRORS.UNSUPPORTED_CAPABILITY,
      });
      return;
    }

    const chainId = Number(params.chainId);

    // Validate account type. Impersonator accounts land in the popup so the
    // user can SEE what the dapp tried to send (banner + disabled Confirm in
    // BatchTransactionConfirmation.tsx); confirm-time signing is still
    // defended in handleConfirmBatchTransaction + resolvePinnedAccount.
    const account = accountOverride ?? await getActiveAccount();

    const isBankrAccount = account?.type === "bankr";
    const isPKOrSP =
      account?.type === "privateKey" || account?.type === "seedPhrase";
    const isImpersonator = account?.type === "impersonator";

    if (!account || (!isBankrAccount && !isPKOrSP && !isImpersonator)) {
      await writeResultToStorage(`batchTxAck:${bundleId}`, {
        success: false,
        error: "Active account does not support batch transactions",
        code: ERC5792_ERRORS.ATOMIC_NOT_SUPPORTED,
      });
      return;
    }

    // Validate chain support — Bankr accounts use Bankr chains, PK/SP use all chains
    const supportedChains = isBankrAccount
      ? BANKR_SUPPORTED_CHAIN_IDS
      : ALLOWED_CHAIN_IDS;

    if (!supportedChains.has(chainId)) {
      await writeResultToStorage(`batchTxAck:${bundleId}`, {
        success: false,
        error: `Chain ${chainId} is not supported for batch transactions`,
        code: ERC5792_ERRORS.UNSUPPORTED_CHAIN,
      });
      return;
    }

    // Validate calls array
    if (!params.calls || params.calls.length === 0) {
      await writeResultToStorage(`batchTxAck:${bundleId}`, {
        success: false,
        error: "No calls provided",
        code: -32602,
      });
      return;
    }

    // Validate every call has a "to" address (contract deployment via batch not supported)
    if (params.calls.some((call) => !call.to)) {
      await writeResultToStorage(`batchTxAck:${bundleId}`, {
        success: false,
        error: "Each call must have a 'to' address",
        code: -32602,
      });
      return;
    }

    // ERC-7821 self-recursion guard.
    //
    // The exploit: a batched inner call `{ to: EOA, data: execute(mode,
    // hostileBatch) }` dispatches to the EOA's delegated code with
    // msg.sender == EOA == address(this), which passes the spec-mandated
    // auth check, letting an attacker-controlled inner batch run past the
    // user's outer intent. We reject self-calls that carry *payload*
    // (calldata or value); a no-op self-call (the 7702beat "Upgrade
    // Account" pattern) is allowed through to nudge the EIP-7702 auth
    // path.
    //
    // Zero-address calls are NOT rejected. The ERC-7821 spec permits but
    // doesn't require executors to substitute `Call.to == 0x0` with
    // `address(this)`; the MM DeleGator we ship as default — and most
    // audited 7821 impls — don't substitute, so calls to 0x0 are plain
    // no-ops onchain (no code at the zero address). A blanket rejection
    // here broke legitimate flows (7702-nudge patterns, counterfactual
    // sends) for a threat that's only theoretical on the delegates we use.
    {
      const eoa = account.address.toLowerCase();
      const offending = params.calls.findIndex((call) => {
        const to = (call.to ?? "").toLowerCase();
        if (to !== eoa) return false;
        const data = call.data ?? "0x";
        const valueHex = call.value ?? "0x0";
        const hasData = data !== "0x" && data !== "0x0" && data.length > 2;
        const hasValue =
          valueHex !== "0x" && valueHex !== "0x0" && BigInt(valueHex) > 0n;
        return hasData || hasValue;
      });
      if (offending !== -1) {
        await writeResultToStorage(`batchTxAck:${bundleId}`, {
          success: false,
          error: `Call ${offending + 1} targets your own account with payload — rejected to prevent ERC-7821 self-recursion (an inner execute() call would re-enter with auth bypassed)`,
          code: -32602,
        });
        return;
      }
    }

    // Validate from matches if provided
    if (params.from && params.from.toLowerCase() !== account.address.toLowerCase()) {
      await writeResultToStorage(`batchTxAck:${bundleId}`, {
        success: false,
        error: "From address does not match active account",
        code: ERC5792_ERRORS.UNAUTHORIZED,
      });
      return;
    }

    // SECURITY: validate every per-call from (if provided) matches the active account.
    for (const call of params.calls) {
      const callFrom = (call as ERC5792Call & { from?: string }).from;
      if (
        typeof callFrom === "string" &&
        callFrom.length > 0 &&
        callFrom.toLowerCase() !== account.address.toLowerCase()
      ) {
        await writeResultToStorage(`batchTxAck:${bundleId}`, {
          success: false,
          error: "Call 'from' does not match active account",
          code: ERC5792_ERRORS.UNAUTHORIZED,
        });
        return;
      }
    }

    // ERC-5792 `atomicRequired: true` honesty check — for PK/SP, the dapp's
    // request only holds if we can actually deliver atomic on this chain.
    // Mirrors the capability-advertisement gate in handleWalletGetCapabilities:
    // the same delegate resolver used at confirm time must resolve a real 7702
    // path. If a dapp set atomicRequired despite our capabilities saying "no
    // atomic here", reject before the popup opens. Single-call batches bypass
    // the check — we send them as a normal tx (which is trivially atomic).
    if (
      isPKOrSP &&
      params.atomicRequired === true &&
      params.calls.length > 1
    ) {
      const resolved = await getStoredResolvedChainById(chainId);
      let canBeAtomic = false;
      if (resolved?.rpcUrl) {
        try {
          const result = await resolveActiveDelegate({
            accountId: account.id,
            accountAddress: account.address as `0x${string}`,
            chainId,
            rpcUrl: resolved.rpcUrl,
          });
          canBeAtomic = !!result.delegate;
        } catch {
          canBeAtomic = false;
        }
      }
      if (!canBeAtomic) {
        await writeResultToStorage(`batchTxAck:${bundleId}`, {
          success: false,
          error: `Atomic execution is not available for chain ${chainId} on this account. Configure a 7702 delegate in Account Settings → Smart Account, or retry without atomicRequired.`,
          code: ERC5792_ERRORS.ATOMIC_NOT_SUPPORTED,
        });
        return;
      }
    }

    const isAtomic = isBankrAccount;
    const chainName = CHAIN_NAMES[chainId] || `Chain ${chainId}`;

    // SECURITY: prefer Chrome-trusted sender.origin for binding; fall back to
    // the message-derived origin for backward compat.
    const trustedOrigin = senderOrigin ?? origin;

    // Save pending request (include accountType for confirm handler routing)
    const pendingRequest = pinnedBatchTxRequest(account, {
      id: bundleId,
      params,
      origin,
      favicon,
      chainName,
      chainId,
      timestamp: Date.now(),
      tabId,
      frameId,
      senderOrigin,
      requestChainId: chainId,
    });
    await savePendingBatchTxRequest(pendingRequest);

    // Create initial bundle status (pending)
    await saveBundleStatus({
      id: bundleId,
      chainId,
      status: BUNDLE_STATUS.PENDING,
      atomic: isAtomic,
      createdAt: Date.now(),
      origin: trustedOrigin,
    });

    // Send ack immediately so the dapp gets the bundle ID
    await writeResultToStorage(`batchTxAck:${bundleId}`, {
      success: true,
      id: bundleId,
    });

    // Notify popup of new batch request
    chrome.runtime
      .sendMessage({ type: "newPendingBatchTxRequest", batchRequest: pendingRequest })
      .catch(() => {});

    // Open popup for user confirmation
    openExtensionPopup(senderWindowId);
  })();
}

// ---------------------------------------------------------------------------
// Confirm batch transaction (Bankr API path)
// ---------------------------------------------------------------------------

export async function handleConfirmBatchTransaction(
  bundleId: string,
  password: string,
  functionNames?: string[],
  forceInclusion?: boolean,
): Promise<{ success: boolean; error?: string }> {
  if (processingBundleIds.has(bundleId)) {
    return { success: false, error: "Bundle already being processed" };
  }

  const pending = await getPendingBatchTxRequestById(bundleId);
  if (!pending || Date.now() - pending.timestamp > TX_EXPIRY_MS) {
    if (pending) await removePendingBatchTxRequest(bundleId);
    return { success: false, error: "Batch request expired" };
  }

  // SECURITY: resolve the pinned account; reject stale/missing bindings.
  if (!pending.accountId) {
    return { success: false, error: "Pending request is no longer valid" };
  }
  const pinnedAccount = await getAccountById(pending.accountId);
  if (!pinnedAccount) {
    return { success: false, error: "Account no longer exists" };
  }
  if (
    pending.accountAddress &&
    pinnedAccount.address.toLowerCase() !== pending.accountAddress.toLowerCase()
  ) {
    return { success: false, error: "Pending request is no longer valid" };
  }
  if (pinnedAccount.type !== "bankr") {
    return {
      success: false,
      error: "Pending request is no longer valid",
    };
  }

  // Validate chain support.
  // For force inclusion, the actual L1 deposit goes to the L1 chain — verify
  // THAT chain is in the Bankr-supported set (currently mainnet only).
  if (forceInclusion) {
    const { FORCE_INCLUSION_CHAINS } = await import("../constants/chainRegistry");
    const info = FORCE_INCLUSION_CHAINS.get(pending.chainId);
    if (!info) {
      return { success: false, error: "Chain does not support force inclusion" };
    }
    if (!BANKR_SUPPORTED_CHAIN_IDS.has(info.l1ChainId)) {
      return {
        success: false,
        error: `Force inclusion via Bankr requires an L1 chain supported by the Bankr API. Use a Private Key or Seed Phrase account to force-include on testnets.`,
      };
    }
  } else if (!BANKR_SUPPORTED_CHAIN_IDS.has(pending.chainId)) {
    return {
      success: false,
      error: `Chain ${CHAIN_NAMES[pending.chainId] || pending.chainId} is not supported for Bankr API accounts`,
    };
  }

  processingBundleIds.add(bundleId);

  // Get API key (same pattern as handleConfirmTransactionAsync)
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
      apiKey = await loadDecryptedApiKey(password);
      if (!apiKey) {
        processingBundleIds.delete(bundleId);
        return { success: false, error: "Invalid password" };
      }
      setCachedApiKey(apiKey, password);
    }
  }

  // Remove from pending storage
  await removePendingBatchTxRequest(bundleId);

  // Branch to force inclusion if requested
  if (forceInclusion) {
    const { processForceInclusionBatchBankr } = await import("./batchForceInclusion");
    processForceInclusionBatchBankr(bundleId, pending, apiKey, functionNames);
    return { success: true };
  }

  // Process in background
  processBatchTransactionInBackground(
    bundleId,
    pending,
    apiKey,
    pinnedAccount.address,
    functionNames,
  );

  return { success: true };
}

async function processBatchTransactionInBackground(
  bundleId: string,
  pending: PendingBatchTxRequest,
  apiKey: string,
  pinnedAddress: string,
  functionNames?: string[],
): Promise<void> {
  // Encode calls into single ERC-7821 tx using the pinned account address.
  const batchTx = encodeBatchCalls(pending.params.calls, pinnedAddress);

  const tx: TransactionParams = {
    from: pinnedAddress,
    to: batchTx.to,
    data: batchTx.data,
    value: batchTx.value,
    chainId: pending.chainId,
  };

  // Compose display function name
  const displayName = functionNames?.length
    ? `Batch: ${functionNames.join(", ")}`
    : `Batch (${pending.params.calls.length} calls)`;

  // Save to tx history as "processing"
  await addTxToHistory({
    id: bundleId,
    status: "processing",
    tx,
    origin: pending.origin,
    favicon: pending.favicon,
    chainName: pending.chainName,
    chainId: pending.chainId,
    createdAt: pending.timestamp,
    accountType: "bankr",
    functionName: displayName,
  });

  try {
    const result = await submitTransactionDirect(apiKey, tx);
    const txHash = result.transactionHash;

    if (result.status === "reverted") {
      await handleBatchFailure(bundleId, pending, "Transaction reverted");
      await updateBundleStatus(bundleId, {
        status: BUNDLE_STATUS.REVERTED,
        txHash,
        completedAt: Date.now(),
      });
    } else if (result.status === "success" && txHash) {
      // Fetch receipt once: sanitized shape goes to wallet_getCallsStatus,
      // raw shape feeds internal history enrichers such as asset changes.
      const rawReceipt = await fetchRawTransactionReceipt(
        txHash,
        pending.chainId,
      );
      const receipt = rawReceipt ? toBundleReceipt(rawReceipt.receipt) : null;

      await updateBundleStatus(bundleId, {
        status: BUNDLE_STATUS.CONFIRMED,
        txHash,
        receipts: receipt ? [receipt] : undefined,
        completedAt: Date.now(),
      });

      await updateTxInHistory(bundleId, {
        status: "success",
        txHash,
        completedAt: Date.now(),
      });

      extractAssetChangesWhenReceiptAvailable({
        txId: bundleId,
        txHash,
        chainId: pending.chainId,
        userAddress: pinnedAddress,
        receipt: rawReceipt?.receipt,
        rpcUrl: rawReceipt?.rpcUrl,
        logPrefix: "[batch]",
      });

      // Fire-and-forget gas fee fetch
      fetchAndStoreBatchGasData(bundleId, txHash, pending.chainId);

      const chainConfig = CHAIN_CONFIG[pending.chainId];
      const explorerUrl = chainConfig?.explorer
        ? `${chainConfig.explorer}/tx/${txHash}`
        : null;

      const notificationId = `tx-success-${bundleId}`;
      if (explorerUrl) {
        chrome.storage.local.set({
          [`notification-${notificationId}`]: explorerUrl,
        });
      }

      await showNotification(
        notificationId,
        "Batch Transaction Confirmed",
        `Batch transaction (${pending.params.calls.length} calls) on ${pending.chainName} was successful.`,
      );

      await writeResultToStorage(`batchTxResult:${bundleId}`, {
        success: true,
        txHash,
      });
    } else {
      // Pending — submitted but not yet confirmed
      await updateBundleStatus(bundleId, {
        status: BUNDLE_STATUS.PENDING,
        txHash,
      });

      await updateTxInHistory(bundleId, {
        status: "pending",
        txHash,
      });

      if (txHash) {
        startReceiptPolling(bundleId, txHash, pending.chainId);
      }

      await writeResultToStorage(`batchTxResult:${bundleId}`, {
        success: true,
        txHash,
      });
    }
  } catch (error) {
    let errorMessage = "Unknown error";
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    await handleBatchFailure(bundleId, pending, errorMessage);
  } finally {
    processingBundleIds.delete(bundleId);
  }
}

async function handleBatchFailure(
  bundleId: string,
  pending: PendingBatchTxRequest,
  error: string,
): Promise<void> {
  await updateBundleStatus(bundleId, {
    status: BUNDLE_STATUS.OFFCHAIN_FAILURE,
    error,
    completedAt: Date.now(),
  });

  await updateTxInHistory(bundleId, {
    status: "failed",
    error,
    completedAt: Date.now(),
  });

  const notificationId = `tx-failed-${bundleId}`;
  await showNotification(
    notificationId,
    "Batch Transaction Failed",
    `Batch transaction on ${pending.chainName} failed: ${error}`,
  );

  await writeResultToStorage(`batchTxResult:${bundleId}`, {
    success: false,
    error,
  });
}

// ---------------------------------------------------------------------------
// Confirm batch transaction (PK/SP non-atomic path)
// ---------------------------------------------------------------------------

export async function handleConfirmBatchTransactionPK(
  bundleId: string,
  password: string,
  _tabId?: number,
  functionNames?: string[],
  precomputedGasEstimates?: import("./gasEstimation").GasEstimate[],
  forceInclusion?: boolean,
): Promise<{ success: boolean; error?: string }> {
  if (processingBundleIds.has(bundleId)) {
    return { success: false, error: "Bundle already being processed" };
  }

  const pending = await getPendingBatchTxRequestById(bundleId);
  if (!pending || Date.now() - pending.timestamp > TX_EXPIRY_MS) {
    if (pending) await removePendingBatchTxRequest(bundleId);
    return { success: false, error: "Batch request expired" };
  }

  processingBundleIds.add(bundleId);

  // SECURITY: resolve the pinned account; do NOT fall back to getActiveAccount().
  if (!pending.accountId) {
    processingBundleIds.delete(bundleId);
    return { success: false, error: "Pending request is no longer valid" };
  }
  const account = await getAccountById(pending.accountId);
  if (!account) {
    processingBundleIds.delete(bundleId);
    return { success: false, error: "Account no longer exists" };
  }
  if (
    pending.accountAddress &&
    account.address.toLowerCase() !== pending.accountAddress.toLowerCase()
  ) {
    processingBundleIds.delete(bundleId);
    return { success: false, error: "Pending request is no longer valid" };
  }

  if (account.type !== "privateKey" && account.type !== "seedPhrase") {
    processingBundleIds.delete(bundleId);
    return { success: false, error: "Account does not support local signing" };
  }

  // Get private key — try cache, then session restoration, then vault decryption
  let privateKey = getPrivateKeyFromCache(account.id);

  if (!privateKey) {
    const vaultKey = getCachedVaultKey();
    if (!vaultKey) {
      const autoLockTimeout = await getAutoLockTimeout();
      if (autoLockTimeout === 0) {
        const restored = await tryRestoreSession(handleUnlockWallet);
        if (restored) {
          privateKey = getPrivateKeyFromCache(account.id);
        }
      }
    }

    if (!privateKey) {
      const cachedVaultKey = getCachedVaultKey();
      let vault;

      if (cachedVaultKey) {
        const { decryptAllKeysWithVaultKey } = await import("./authHandlers");
        vault = await decryptAllKeysWithVaultKey(cachedVaultKey);
      } else {
        vault = await decryptAllKeys(password);
      }

      if (!vault) {
        processingBundleIds.delete(bundleId);
        return { success: false, error: "Invalid password" };
      }
      setCachedVault(vault);

      // Also cache API key if available
      const hasApiKeyStored = await hasEncryptedApiKey();
      if (hasApiKeyStored) {
        const apiKey = await loadDecryptedApiKey(password);
        if (apiKey) {
          setCachedApiKey(apiKey, password);
        }
      }

      privateKey = getPrivateKeyFromCache(account.id);
      if (!privateKey) {
        processingBundleIds.delete(bundleId);
        return { success: false, error: "Private key not found for account" };
      }
    }
  }

  // Remove from pending storage
  await removePendingBatchTxRequest(bundleId);

  // Branch to force inclusion if requested
  if (forceInclusion) {
    const { processForceInclusionBatchLocal } = await import("./batchForceInclusion");
    processForceInclusionBatchLocal(
      bundleId,
      pending,
      account,
      privateKey,
      functionNames,
      precomputedGasEstimates,
    );
    return { success: true };
  }

  // EIP-7702 atomic / single-call shortcut / auto-sequential branching.
  //
  // Resolution order:
  //  - calls.length === 1 → send the inner call as a normal tx (no ERC-7821
  //    wrap, no 7702 overhead). The ERC-7821 self-call adds cost without
  //    benefit when there's nothing to batch.
  //  - calls.length > 1 AND a usable delegate resolves (onchain reuse OR
  //    custom override OR Pectra-supported chain default) → atomic via 7702.
  //  - else → existing auto-sequential path (preserves behavior on chains
  //    without 7702 support and on EOAs delegated to a non-ERC-7821 contract).
  //
  // Flip the bundle's `atomic` flag the moment we commit to a path. The
  // status was created with `atomic: isBankrAccount` (so PK/SP starts at
  // false), but the truth only becomes known at confirm-time: single-tx
  // and 7702 paths both ship as one onchain tx (trivially atomic by
  // EIP-5792), while the sequential fallback genuinely isn't. We update
  // here once and let the merge semantics of `updateBundleStatus` carry
  // it forward through every subsequent status transition (PENDING →
  // CONFIRMED / REVERTED). Without this the dapp's `wallet_getCallsStatus`
  // response keeps reporting `atomic: false` even after we delivered a
  // single atomic tx — caught by walletbeat's EIP-5792 conformance test.
  const calls = pending.params.calls;
  if (calls.length === 1) {
    await updateBundleStatus(bundleId, { atomic: true });
    processBatchAsSingleTxInBackground(
      bundleId,
      pending,
      account,
      privateKey,
      functionNames,
      precomputedGasEstimates,
    );
    return { success: true };
  }

  const resolution = await resolveActiveDelegate({
    accountId: account.id,
    accountAddress: account.address as `0x${string}`,
    chainId: pending.chainId,
    rpcUrl:
      (await getStoredResolvedChainById(pending.chainId))?.rpcUrl ?? "",
  });

  if (resolution.delegate) {
    await updateBundleStatus(bundleId, { atomic: true });
    processBatchTransactionAtomic7702InBackground(
      bundleId,
      pending,
      account,
      privateKey,
      resolution.delegate,
      resolution.needsAuthorization,
      functionNames,
      precomputedGasEstimates,
    );
    return { success: true };
  }

  // Process in background (non-atomic: sequential nonces, individual
  // broadcasts). `atomic` stays at its initial `false` — that's the
  // correct EIP-5792 value here.
  processBatchTransactionNonAtomicInBackground(
    bundleId,
    pending,
    account,
    privateKey,
    functionNames,
    precomputedGasEstimates,
  );

  return { success: true };
}

async function processBatchTransactionNonAtomicInBackground(
  bundleId: string,
  pending: PendingBatchTxRequest,
  account: { id: string; address: string; type: string },
  privateKey: `0x${string}`,
  functionNames?: string[],
  precomputedGasEstimates?: import("./gasEstimation").GasEstimate[],
): Promise<void> {
  const { calls } = pending.params;
  const chainId = pending.chainId;
  const fromAddr = account.address;

  const resolvedChain = await getStoredResolvedChainById(chainId);
  const rpcUrl = resolvedChain?.rpcUrl;
  const customChainMeta = resolvedChain?.isCustom
    ? {
        name: resolvedChain.name,
        nativeCurrency: resolvedChain.nativeCurrency,
        explorer: resolvedChain.explorer || undefined,
      }
    : undefined;

  // Phase 1 (sequential): assign nonces + write history entries
  const prepared: Array<{
    txId: string;
    call: ERC5792Call;
    nonce: number;
    functionName?: string;
  }> = [];

  try {
    for (let i = 0; i < calls.length; i++) {
      const call = calls[i];
      const txId = `${bundleId}:${i}`;
      const nonce = await getNextNonce(fromAddr, chainId);
      const fnName = functionNames?.[i] || `Batch call ${i + 1}/${calls.length}`;

      await addTxToHistory({
        id: txId,
        status: "processing",
        tx: {
          from: fromAddr,
          to: call.to || "0x0000000000000000000000000000000000000000",
          data: call.data || "0x",
          value: call.value || "0x0",
          chainId,
        },
        origin: pending.origin,
        favicon: pending.favicon,
        chainName: pending.chainName,
        chainId,
        createdAt: pending.timestamp,
        accountType: account.type as "privateKey" | "seedPhrase",
        functionName: fnName,
      });

      // Snapshot clear-signed summary for the per-call activity row.
      attachClearSignedMetaToHistory(
        txId,
        { to: call.to, data: call.data, value: call.value },
        chainId,
      );

      prepared.push({ txId, call, nonce, functionName: fnName });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Failed to prepare batch";
    await handleBatchFailure(bundleId, pending, errorMessage);
    processingBundleIds.delete(bundleId);
    return;
  }

  // Use pre-computed gas estimates from the UI if available (avoids duplicate RPC calls).
  // Otherwise, compute them now so dependent calls (e.g., swap after approve) get valid
  // gas limits without needing onchain state from prior calls.
  let gasEstimates = precomputedGasEstimates;
  if (!gasEstimates || gasEstimates.length !== calls.length) {
    const { estimateBatchGasSequential } = await import("./batchGasEstimation");
    gasEstimates = await estimateBatchGasSequential(
      calls.map((c) => ({
        to: c.to || "0x0000000000000000000000000000000000000000",
        data: c.data || "0x",
        value: c.value || "0x0",
      })),
      fromAddr,
      chainId,
    );
  }

  // Phase 2 (concurrent broadcast): sign + broadcast each with pre-assigned nonce.
  // Provide gas + fee params from estimates so viem makes ZERO RPC calls during broadcast
  // (only eth_sendRawTransaction). This avoids 429 rate limiting breaking the broadcast.
  const txHashes: string[] = [];
  const results: Array<{ txId: string; success: boolean; txHash?: string; error?: string }> = [];

  const broadcastPromises = prepared.map(async (item, i) => {
    try {
      const est = gasEstimates[i];
      const txForSigning = {
        from: fromAddr,
        to: item.call.to || "0x0000000000000000000000000000000000000000",
        data: item.call.data || "0x",
        value: item.call.value || "0x0",
        chainId,
        nonce: item.nonce,
        gas: est?.gasLimit || "500000",
        maxFeePerGas: est?.maxFeePerGas || undefined,
        maxPriorityFeePerGas: est?.maxPriorityFeePerGas || undefined,
      };

      const result = await signAndBroadcastTransaction(
        privateKey,
        txForSigning,
        rpcUrl,
        customChainMeta,
      );

      // Sync-send chains return the receipt with the broadcast — jump straight
      // to the final state with no intermediate "pending" flash. Otherwise mark
      // pending and start individual receipt polling (exponential backoff
      // 2s→30s to avoid rate-limiting). Bundle status is tracked separately
      // via local storage polling.
      if (result.receipt) {
        await applyReceiptToHistory(item.txId, result.txHash, chainId, result.receipt, {
          rpcUrl,
          signedGasLimit: result.signedGasLimit,
        });
      } else {
        await updateTxInHistory(item.txId, {
          status: "pending",
          txHash: result.txHash,
        });
        startReceiptPolling(item.txId, result.txHash, chainId);
      }

      return { txId: item.txId, success: true, txHash: result.txHash };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      resetNonce(fromAddr, chainId);

      await updateTxInHistory(item.txId, {
        status: "failed",
        error: errorMessage,
        completedAt: Date.now(),
      });

      return { txId: item.txId, success: false, error: errorMessage };
    }
  });

  const broadcastResults = await Promise.all(broadcastPromises);
  results.push(...broadcastResults);

  // Collect tx hashes for bundle status
  for (const r of results) {
    if (r.txHash) txHashes.push(r.txHash);
  }

  const allSuccess = results.every((r) => r.success);
  const allFailed = results.every((r) => !r.success);

  // Update bundle status
  if (allFailed) {
    const firstError = results.find((r) => r.error)?.error || "All transactions failed";
    await updateBundleStatus(bundleId, {
      status: BUNDLE_STATUS.OFFCHAIN_FAILURE,
      txHashes,
      error: firstError,
      completedAt: Date.now(),
    });

    await showNotification(
      `tx-failed-${bundleId}`,
      "Batch Transaction Failed",
      `Batch transaction on ${pending.chainName} failed: ${firstError}`,
    );

    await writeResultToStorage(`batchTxResult:${bundleId}`, {
      success: false,
      error: firstError,
    });
  } else {
    // At least some txs were broadcast — mark as pending, let receipt polling finalize.
    // Use the LAST tx hash as the primary one (dapps show this to the user,
    // and the last call is typically the meaningful action, e.g., swap after approve).
    const primaryTxHash = txHashes[txHashes.length - 1] || txHashes[0];
    await updateBundleStatus(bundleId, {
      status: BUNDLE_STATUS.PENDING,
      txHashes,
      txHash: primaryTxHash,
    });

    await writeResultToStorage(`batchTxResult:${bundleId}`, {
      success: true,
      txHash: primaryTxHash,
    });

    // If some failed but others succeeded, show partial notification
    if (!allSuccess) {
      const failedCount = results.filter((r) => !r.success).length;
      await showNotification(
        `tx-partial-${bundleId}`,
        "Batch Partially Failed",
        `${failedCount}/${calls.length} calls failed to broadcast on ${pending.chainName}`,
      );
    }

    // Start aggregate status tracking — when all receipts resolve, compute final status
    trackNonAtomicBundleCompletion(bundleId, pending, results);
  }

  processingBundleIds.delete(bundleId);
}

/**
 * Track receipt completion for non-atomic bundles and update aggregate status.
 * Instead of making RPC calls (which can get rate-limited), this polls local
 * tx history storage. Individual receipt tracking is done by startReceiptPolling()
 * which has proper exponential backoff (2s→30s).
 */
async function trackNonAtomicBundleCompletion(
  bundleId: string,
  pending: PendingBatchTxRequest,
  results: Array<{ txId: string; success: boolean; txHash?: string; error?: string }>,
): Promise<void> {
  const successfulTxIds = results.filter((r) => r.success).map((r) => r.txId);
  if (successfulTxIds.length === 0) return;

  // Poll local storage (no RPC) until all txs have a terminal status.
  // startReceiptPolling() handles the actual RPC calls with exponential backoff.
  const MAX_WAIT_MS = 10 * 60 * 1000; // 10 min (match receipt poller timeout)
  const POLL_INTERVAL_MS = 5_000;
  const startTime = Date.now();

  while (Date.now() - startTime < MAX_WAIT_MS) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    let allResolved = true;
    for (const txId of successfulTxIds) {
      const tx = await getTxById(txId);
      if (!tx || tx.status === "processing" || tx.status === "pending") {
        allResolved = false;
        break;
      }
    }

    if (allResolved) break;
  }

  // Read final statuses and fetch receipts for bundle status (one-time, not polling)
  const receipts: BundleReceipt[] = [];
  let successCount = 0;
  let failCount = 0;

  for (const r of results) {
    if (!r.success) {
      failCount++;
      continue;
    }
    const tx = await getTxById(r.txId);
    if (tx?.status === "success") {
      successCount++;
      if (r.txHash) {
        const receipt = await fetchBundleReceipt(r.txHash, pending.chainId);
        if (receipt) receipts.push(receipt);
      }
    } else {
      failCount++;
    }
  }

  let aggregateStatus: number;
  if (successCount === results.length) {
    aggregateStatus = BUNDLE_STATUS.CONFIRMED;
  } else if (failCount === results.length) {
    aggregateStatus = BUNDLE_STATUS.REVERTED;
  } else {
    aggregateStatus = BUNDLE_STATUS.PARTIAL_REVERT;
  }

  // Set txHash to the last successful tx (the meaningful action, e.g., swap after approve)
  const lastSuccessfulTx = [...results].reverse().find((r) => r.success && r.txHash);
  await updateBundleStatus(bundleId, {
    status: aggregateStatus,
    txHash: lastSuccessfulTx?.txHash,
    // Reverse receipts so the last/most-meaningful tx (e.g., swap) comes first.
    // Dapps like LlamaSwap use `receipts.find(r => ...)` which picks the first match.
    receipts: receipts.length > 0 ? receipts.reverse() : undefined,
    completedAt: Date.now(),
  });

  // Notification for final status
  const chainConfig = CHAIN_CONFIG[pending.chainId];
  if (aggregateStatus === BUNDLE_STATUS.CONFIRMED) {
    const notificationId = `tx-success-${bundleId}`;
    const lastTxHash = lastSuccessfulTx?.txHash || results[0]?.txHash;
    const explorerUrl = chainConfig?.explorer && lastTxHash
      ? `${chainConfig.explorer}/tx/${lastTxHash}`
      : null;
    if (explorerUrl) {
      chrome.storage.local.set({ [`notification-${notificationId}`]: explorerUrl });
    }
    await showNotification(
      notificationId,
      "Batch Transaction Confirmed",
      `All ${results.length} calls on ${pending.chainName} confirmed successfully.`,
    );
  } else if (aggregateStatus === BUNDLE_STATUS.PARTIAL_REVERT) {
    await showNotification(
      `tx-partial-${bundleId}`,
      "Batch Partially Reverted",
      `${successCount}/${results.length} calls succeeded on ${pending.chainName}. ${failCount} reverted.`,
    );
  } else {
    await showNotification(
      `tx-failed-${bundleId}`,
      "Batch Transaction Reverted",
      `All calls on ${pending.chainName} reverted.`,
    );
  }
}

/**
 * Track the receipt for a PK/SP atomic (or single-call) bundle and update the
 * bundle status when terminal so the dapp's `wallet_getCallsStatus` polling
 * sees CONFIRMED / REVERTED. `applyReceiptToHistory` only updates the tx
 * history row; the bundle status is a separate storage key the dapp reads.
 *
 * For Bankr atomic batches the Bankr API returns the receipt synchronously,
 * so the bundle status is set inline. PK/SP atomic broadcasts return only a
 * tx hash, so we poll local tx history (no RPC) waiting for the receipt
 * poller (`startReceiptPolling`) to land a terminal status, then mirror that
 * to the bundle status.
 */
async function trackAtomicBundleCompletion(
  bundleId: string,
  txHash: string,
  pending: PendingBatchTxRequest,
): Promise<void> {
  const MAX_WAIT_MS = 10 * 60 * 1000;
  const POLL_INTERVAL_MS = 5_000;
  const startTime = Date.now();

  while (Date.now() - startTime < MAX_WAIT_MS) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    const tx = await getTxById(bundleId);
    if (!tx || tx.status === "processing" || tx.status === "pending") continue;

    if (tx.status === "success") {
      const receipt = await fetchBundleReceipt(txHash, pending.chainId);
      await updateBundleStatus(bundleId, {
        status: BUNDLE_STATUS.CONFIRMED,
        txHash,
        receipts: receipt ? [receipt] : undefined,
        completedAt: Date.now(),
      });

      const chainConfig = CHAIN_CONFIG[pending.chainId];
      const notificationId = `tx-success-${bundleId}`;
      const explorerUrl = chainConfig?.explorer
        ? `${chainConfig.explorer}/tx/${txHash}`
        : null;
      if (explorerUrl) {
        chrome.storage.local.set({
          [`notification-${notificationId}`]: explorerUrl,
        });
      }
      await showNotification(
        notificationId,
        "Batch Transaction Confirmed",
        `Batch (${pending.params.calls.length} call${pending.params.calls.length === 1 ? "" : "s"}) on ${pending.chainName} was successful.`,
      );
    } else {
      await updateBundleStatus(bundleId, {
        status: BUNDLE_STATUS.REVERTED,
        txHash,
        error: tx.error || "Transaction reverted",
        completedAt: Date.now(),
      });

      await showNotification(
        `tx-failed-${bundleId}`,
        "Batch Transaction Reverted",
        `Batch on ${pending.chainName} reverted onchain.`,
      );
    }
    return;
  }
}

// ---------------------------------------------------------------------------
// PK/SP single-call shortcut: a batch with calls.length === 1 ships as a
// plain EIP-1559 tx, no ERC-7821 self-call wrapping, no 7702 overhead. The
// dapp gets the same wallet_sendCalls success ack with a single tx hash.
// ---------------------------------------------------------------------------

async function processBatchAsSingleTxInBackground(
  bundleId: string,
  pending: PendingBatchTxRequest,
  account: { id: string; address: string; type: string },
  privateKey: `0x${string}`,
  functionNames?: string[],
  precomputedGasEstimates?: import("./gasEstimation").GasEstimate[],
): Promise<void> {
  const { calls } = pending.params;
  const call = calls[0];
  const chainId = pending.chainId;
  const fromAddr = account.address;
  const displayName =
    functionNames?.[0] || `Batch (${pending.params.calls.length} call)`;

  const resolvedChain = await getStoredResolvedChainById(chainId);
  const rpcUrl = resolvedChain?.rpcUrl;
  const customChainMeta = resolvedChain?.isCustom
    ? {
        name: resolvedChain.name,
        nativeCurrency: resolvedChain.nativeCurrency,
        explorer: resolvedChain.explorer || undefined,
      }
    : undefined;

  await addTxToHistory({
    id: bundleId,
    status: "processing",
    tx: {
      from: fromAddr,
      to: call.to || "0x0000000000000000000000000000000000000000",
      data: call.data || "0x",
      value: call.value || "0x0",
      chainId,
    },
    origin: pending.origin,
    favicon: pending.favicon,
    chainName: pending.chainName,
    chainId,
    createdAt: pending.timestamp,
    accountType: account.type as "privateKey" | "seedPhrase",
    functionName: displayName,
  });
  attachClearSignedMetaToHistory(
    bundleId,
    { to: call.to, data: call.data, value: call.value },
    chainId,
  );

  try {
    const nonce = await getNextNonce(fromAddr, chainId);
    const est = precomputedGasEstimates?.[0];
    const result = await signAndBroadcastTransaction(
      privateKey,
      {
        from: fromAddr,
        to: call.to || "0x0000000000000000000000000000000000000000",
        data: call.data || "0x",
        value: call.value || "0x0",
        chainId,
        nonce,
        gas: est?.gasLimit || "500000",
        maxFeePerGas: est?.maxFeePerGas || undefined,
        maxPriorityFeePerGas: est?.maxPriorityFeePerGas || undefined,
      },
      rpcUrl,
      customChainMeta,
    );

    if (result.receipt) {
      await applyReceiptToHistory(
        bundleId,
        result.txHash,
        chainId,
        result.receipt,
        { rpcUrl, signedGasLimit: result.signedGasLimit },
      );
      await updateBundleStatus(bundleId, {
        status:
          result.receipt.status === "success" ||
          (result.receipt.status as unknown) === "0x1"
            ? BUNDLE_STATUS.CONFIRMED
            : BUNDLE_STATUS.REVERTED,
        txHash: result.txHash,
        completedAt: Date.now(),
      });
    } else {
      await updateTxInHistory(bundleId, {
        status: "pending",
        txHash: result.txHash,
      });
      await updateBundleStatus(bundleId, {
        status: BUNDLE_STATUS.PENDING,
        txHash: result.txHash,
      });
      startReceiptPolling(bundleId, result.txHash, chainId);
      // The receipt poller updates tx history but not bundle status. Watch
      // history until terminal and mirror to the bundle status so the dapp's
      // wallet_getCallsStatus polling resolves.
      void trackAtomicBundleCompletion(bundleId, result.txHash, pending);
    }

    fetchAndStoreBatchGasData(bundleId, result.txHash, chainId);

    await writeResultToStorage(`batchTxResult:${bundleId}`, {
      success: true,
      txHash: result.txHash,
    });
  } catch (error) {
    resetNonce(fromAddr, chainId);
    const message = error instanceof Error ? error.message : "Unknown error";
    await handleBatchFailure(bundleId, pending, message);
  } finally {
    processingBundleIds.delete(bundleId);
  }
}

// ---------------------------------------------------------------------------
// EIP-7702 atomic batch (PK/SP, calls.length > 1).
//
// Uses ERC-7821 batch encoding against the EOA itself. If the EOA isn't
// already delegated to a 7821-compatible contract, an authorization tuple
// is bundled into the tx (type-4 / EIP-7702) so the EOA's `code` is set
// to point at `delegate` for this execution. After inclusion, subsequent
// batches reuse the same delegation onchain (no further auth needed).
// ---------------------------------------------------------------------------

/**
 * Optional metadata for callers that re-use the atomic-7702 broadcast path
 * for non-dapp flows (e.g., the swap surface — see `handleExecuteSwapAtomicPK`
 * in `txHandlers.ts`). When set, these get attached to the bundle's tx-history
 * row so the activity modal, asset-changes extractor, and bridge-status poller
 * all recognise the entry the same way they do for Bankr-atomic swap/bridge
 * txs. Pure pass-through — no behaviour change for dapp-initiated batches
 * (their callers leave this undefined).
 */
export interface AtomicBatchHistoryMeta {
  swapMeta?: import("./txHistoryStorage").SwapMeta;
  bridge?: import("./txHistoryStorage").BridgeMeta;
}

export async function processBatchTransactionAtomic7702InBackground(
  bundleId: string,
  pending: PendingBatchTxRequest,
  account: { id: string; address: string; type: string },
  privateKey: `0x${string}`,
  delegate: `0x${string}`,
  needsAuthorization: boolean,
  functionNames?: string[],
  precomputedGasEstimates?: import("./gasEstimation").GasEstimate[],
  historyMeta?: AtomicBatchHistoryMeta,
): Promise<void> {
  const { calls } = pending.params;
  const chainId = pending.chainId;
  const fromAddr = account.address;

  const resolvedChain = await getStoredResolvedChainById(chainId);
  const rpcUrl = resolvedChain?.rpcUrl;
  const customChainMeta = resolvedChain?.isCustom
    ? {
        name: resolvedChain.name,
        nativeCurrency: resolvedChain.nativeCurrency,
        explorer: resolvedChain.explorer || undefined,
      }
    : undefined;

  // ERC-7821 calldata, target = the EOA itself (which becomes a smart account
  // for the duration of this tx via the 7702 delegation designator).
  const batchTx = encodeBatchCalls(calls, fromAddr);

  const displayName = functionNames?.length
    ? `Batch: ${functionNames.join(", ")}`
    : `Batch (${calls.length} calls)`;

  // Single bundle-level tx history entry — atomic means one onchain tx, one
  // hash, one explorer link, just like Bankr atomic batches.
  //
  // Keep metadata in the initial object literal. The service-worker production
  // build minifies with Terser; it folded the previous conditional spreads to
  // `...{}` and also removed late property assignment before this object
  // escaped to chrome.storage, dropping bridge/swap metadata before storage.
  const historyEntry: CompletedTransaction = {
    id: bundleId,
    status: "processing",
    tx: {
      from: fromAddr,
      to: batchTx.to,
      data: batchTx.data,
      value: batchTx.value,
      chainId,
    },
    origin: pending.origin,
    favicon: pending.favicon,
    chainName: pending.chainName,
    chainId,
    createdAt: pending.timestamp,
    accountType: account.type as "privateKey" | "seedPhrase",
    functionName: displayName,
    accountId: pending.accountId,
    swapMeta: historyMeta?.swapMeta,
    bridge: historyMeta?.bridge,
  };
  await addTxToHistory(historyEntry);

  try {
    // Reserve the nonce for our tx. If we also need to bundle an authorization,
    // that auth must reference EOA.nonce AFTER this tx is included — which is
    // txNonce + 1 (the EOA's nonce is bumped by inclusion before the auth list
    // is processed; see EIP-7702 "authorization processing" section).
    const txNonce = await getNextNonce(fromAddr, chainId);

    // Race-window defense: `needsAuthorization` was decided at confirm-click
    // time. Between then and now (~100-500ms typically, longer if multiple
    // RPCs ran in parallel) the user could have revoked the delegation via
    // Settings, or a concurrent flow could have changed onchain state. If
    // the EOA is no longer onchain-delegated to a usable contract, force
    // re-authorization so the batch tx self-call still dispatches through
    // the delegate's code. Without this guard a `needsAuthorization=false`
    // decision could ride into a broadcast against a code-less EOA where
    // the ERC-7821 calldata is silently no-op'd by the chain.
    //
    // Only re-checks the onchain delegate; the custom/default fallback was
    // already resolved at confirm-click and shouldn't flip mid-broadcast
    // (those are storage/registry reads, not chain state).
    if (!needsAuthorization && rpcUrl) {
      try {
        const onchain = await getOnchainDelegate(rpcUrl, chainId, fromAddr as `0x${string}`);
        if (!onchain || onchain.toLowerCase() !== delegate.toLowerCase()) {
          console.warn(
            "[atomic-7702] onchain delegate changed between resolve and broadcast — re-authorizing",
            { expected: delegate, actual: onchain },
          );
          needsAuthorization = true;
        }
      } catch (err) {
        // RPC blip during re-check — bundle an auth tuple defensively. The
        // overhead is ~25k gas; the alternative is a silent no-op tx.
        console.warn(
          "[atomic-7702] onchain delegate re-check failed — re-authorizing defensively",
          err,
        );
        needsAuthorization = true;
      }
    }

    let authorizationList:
      | readonly import("viem").SignedAuthorization[]
      | undefined;
    if (needsAuthorization) {
      const auth = await signEip7702Authorization(privateKey, {
        contractAddress: delegate,
        chainId,
        nonce: txNonce + 1,
        rpcUrl,
        customChainMeta,
      });
      authorizationList = [auth];
    }

    // Use the UI's wrapped atomic estimate exactly when present. That is the
    // value the user reviewed, and it already includes ERC-7821 wrapper cost
    // plus any 7702 state-override behavior. If an older caller passes per-call
    // estimates, sum them without an extra hidden multiplier so signed gas still
    // matches the values shown to the user as closely as that legacy shape allows.
    const summedFromEstimates = precomputedGasEstimates?.reduce(
      (acc, e) => acc + (Number(e?.gasLimit) || 0),
      0,
    );
    // Conservative fallback when the UI didn't precompute. eth_estimateGas can
    // fail on a not-yet-delegated EOA (no code to execute) and the authorization
    // adds ~25k gas of its own, so be generous.
    const fallbackGas = 120_000 * calls.length + 80_000;
    let gasHex =
      summedFromEstimates && summedFromEstimates > 0
        ? `0x${Math.ceil(summedFromEstimates).toString(16)}`
        : `0x${fallbackGas.toString(16)}`;
    // When we're bundling an authorization tuple, neither the UI's
    // state-override simulation nor the fallback above sees the auth's
    // intrinsic cost — it gets added at chain-side intake. Bump with the
    // shared helper so non-standard-gas chains (MegaETH) don't trip
    // "intrinsic gas too low" the way the single Set/Revoke path did.
    if (needsAuthorization) {
      gasHex = `0x${bumpGasForEip7702Auth(
        chainId,
        BigInt(gasHex),
        1,
      ).toString(16)}`;
    }

    // Pick max(maxFeePerGas) and max(maxPriorityFeePerGas) across the
    // per-call estimates as a single combined fee — the atomic path runs
    // every call in one tx, so we use the most aggressive fee.
    let maxFeePerGas: string | undefined;
    let maxPriorityFeePerGas: string | undefined;
    for (const est of precomputedGasEstimates ?? []) {
      if (est?.maxFeePerGas) {
        if (!maxFeePerGas || BigInt(est.maxFeePerGas) > BigInt(maxFeePerGas)) {
          maxFeePerGas = est.maxFeePerGas;
        }
      }
      if (est?.maxPriorityFeePerGas) {
        if (
          !maxPriorityFeePerGas ||
          BigInt(est.maxPriorityFeePerGas) > BigInt(maxPriorityFeePerGas)
        ) {
          maxPriorityFeePerGas = est.maxPriorityFeePerGas;
        }
      }
    }

    const result = await signAndBroadcastTransaction(
      privateKey,
      {
        from: fromAddr,
        to: batchTx.to,
        data: batchTx.data,
        value: batchTx.value,
        chainId,
        nonce: txNonce,
        gas: gasHex,
        maxFeePerGas,
        maxPriorityFeePerGas,
        ...(authorizationList ? { type: "eip7702", authorizationList } : {}),
      },
      rpcUrl,
      customChainMeta,
    );

    const txHash = result.txHash;

    if (result.receipt) {
      const success =
        result.receipt.status === "success" ||
        (result.receipt.status as unknown) === "0x1";
      await applyReceiptToHistory(bundleId, txHash, chainId, result.receipt, {
        rpcUrl,
        signedGasLimit: result.signedGasLimit,
      });
      await updateBundleStatus(bundleId, {
        status: success ? BUNDLE_STATUS.CONFIRMED : BUNDLE_STATUS.REVERTED,
        txHash,
        completedAt: Date.now(),
      });
    } else {
      await updateTxInHistory(bundleId, { status: "pending", txHash });
      await updateBundleStatus(bundleId, {
        status: BUNDLE_STATUS.PENDING,
        txHash,
      });
      startReceiptPolling(bundleId, txHash, chainId);
      // applyReceiptToHistory (called by the poller) only updates tx history.
      // Mirror its terminal status onto the bundle status so the dapp's
      // wallet_getCallsStatus polling sees CONFIRMED / REVERTED.
      void trackAtomicBundleCompletion(bundleId, txHash, pending);
    }

    fetchAndStoreBatchGasData(bundleId, txHash, chainId);

    await writeResultToStorage(`batchTxResult:${bundleId}`, {
      success: true,
      txHash,
    });
  } catch (error) {
    resetNonce(fromAddr, chainId);
    const message = error instanceof Error ? error.message : "Unknown error";
    await handleBatchFailure(bundleId, pending, message);
  } finally {
    processingBundleIds.delete(bundleId);
  }
}

// ---------------------------------------------------------------------------
// Reject batch transaction
// ---------------------------------------------------------------------------

export async function handleRejectBatchTransaction(
  bundleId: string,
): Promise<{ success: boolean }> {
  await removePendingBatchTxRequest(bundleId);

  await updateBundleStatus(bundleId, {
    status: BUNDLE_STATUS.OFFCHAIN_FAILURE,
    error: "User rejected batch transaction",
    completedAt: Date.now(),
  });

  await writeResultToStorage(`batchTxResult:${bundleId}`, {
    success: false,
    error: "Batch transaction rejected by user",
  });

  return { success: true };
}

/**
 * Drop a single call from a pending batch request before the user confirms.
 *
 * The dapp asked for an atomic bundle, but the user is allowed to prune
 * individual calls before signing (e.g. they already have the approval the
 * bundle re-issues). The remaining calls still ship as one atomic batch.
 *
 * If the user removes the last call, fall through to a full rejection so the
 * dapp's `wallet_sendCalls` promise resolves with an error instead of being
 * left hanging by an empty batch.
 */
export async function handleRemoveCallFromPendingBatch(
  bundleId: string,
  callIndex: number,
): Promise<{ success: boolean; error?: string; rejected?: boolean }> {
  const result = await removeCallFromPendingBatchTxRequest(bundleId, callIndex);
  if (!result.found) {
    return { success: false, error: "Pending batch not found" };
  }
  if (result.remainingCalls === 0) {
    await handleRejectBatchTransaction(bundleId);
    return { success: true, rejected: true };
  }
  return { success: true };
}

/**
 * Replace a single call's calldata in a pending batch. Used by the
 * confirmation UI when the user edits an ERC-20 approve amount (and any
 * future built-in editable field). The signing handlers
 * (`handleConfirmBatchTransaction` for Bankr ERC-7821 + future EIP-7702,
 * `handleConfirmBatchTransactionPK` for PK/Seed auto-sequential) re-fetch the
 * pending batch from storage at sign time, so the edited calldata is picked
 * up without any per-handler plumbing.
 */
export async function handleUpdateCallInPendingBatch(
  bundleId: string,
  callIndex: number,
  newData: string,
): Promise<{ success: boolean; error?: string }> {
  const { updateCallInPendingBatchTxRequest } = await import(
    "./pendingBatchTxStorage"
  );
  return updateCallInPendingBatchTxRequest(bundleId, callIndex, newData);
}

// ---------------------------------------------------------------------------
// wallet_getCallsStatus
// ---------------------------------------------------------------------------

export async function handleWalletGetCallsStatus(
  bundleId: string,
  requestOrigin?: string,
): Promise<WalletGetCallsStatusResult | { error: string; code: number }> {
  const status = await getBundleStatus(bundleId);
  // Scope lookup to the origin that created the bundle. Legacy entries
  // without `origin` are treated as unknown (safer than leaking status).
  if (!status || !status.origin || status.origin !== requestOrigin) {
    return {
      error: "Unknown bundle ID",
      code: ERC5792_ERRORS.UNKNOWN_BUNDLE_ID,
    };
  }

  return {
    version: "2.0.0",
    id: bundleId,
    chainId: `0x${status.chainId.toString(16)}` as `0x${string}`,
    status: status.status,
    atomic: status.atomic,
    receipts: status.receipts,
  };
}

// ---------------------------------------------------------------------------
// wallet_showCallsStatus
// ---------------------------------------------------------------------------

export async function handleWalletShowCallsStatus(
  bundleId: string,
  requestOrigin?: string,
): Promise<void> {
  const status = await getBundleStatus(bundleId);
  // Refuse to act if origin doesn't match the bundle's creator.
  if (!status || !status.origin || status.origin !== requestOrigin) return;
  if (status.txHash) {
    const chainConfig = CHAIN_CONFIG[status.chainId];
    if (chainConfig?.explorer) {
      chrome.tabs.create({
        url: `${chainConfig.explorer}/tx/${status.txHash}`,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchAndStoreBatchGasData(
  bundleId: string,
  txHash: string,
  chainId: number,
): Promise<void> {
  const rpcUrl = await getRpcUrl(chainId);
  if (!rpcUrl) return;

  try {
    const rpcCall = (method: string, params: any[]) =>
      fetch(rpcUrl!, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      })
        .then((r) => r.json())
        .then((r) => r.result);

    const [txData, receipt] = await Promise.all([
      rpcCall("eth_getTransactionByHash", [txHash]),
      rpcCall("eth_getTransactionReceipt", [txHash]),
    ]);
    if (!receipt) return;

    const gasData: import("./txHistoryStorage").GasData = {
      gasUsed: BigInt(receipt.gasUsed).toString(),
      gasLimit: txData?.gas
        ? BigInt(txData.gas).toString()
        : BigInt(receipt.gasUsed).toString(),
      effectiveGasPrice: BigInt(receipt.effectiveGasPrice).toString(),
    };

    if (OP_STACK_CHAIN_IDS.has(chainId)) {
      if (receipt.l1Fee) gasData.l1Fee = BigInt(receipt.l1Fee).toString();
      if (receipt.l1GasUsed)
        gasData.l1GasUsed = BigInt(receipt.l1GasUsed).toString();
      if (receipt.l1GasPrice)
        gasData.l1GasPrice = BigInt(receipt.l1GasPrice).toString();
    }

    await updateTxInHistory(bundleId, { gasData });
  } catch {
    // Non-critical
  }
}
