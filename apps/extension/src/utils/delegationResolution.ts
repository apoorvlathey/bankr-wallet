/**
 * EIP-7702 delegate resolution + probing.
 *
 * Used by:
 *   - Batch confirm handler (chrome/batchTxHandlers.ts): decides whether to
 *     execute a PK/SP multi-call batch atomically via 7702, what delegate to
 *     authorize, and whether an authorization tuple needs to be bundled in.
 *   - Account Settings "Smart Account" section UI: shows current onchain
 *     delegation + custom override + what would be used on the next batch.
 *
 * Resolution order (per account × per chain):
 *   1. Probe onchain: eth_getCode(EOA) → parse 0xef0100 prefix → current delegate
 *   2. If active delegate exists AND supports ERC-7821 batch mode → use silently
 *   3. Else if the chain has WalletChan's default delegate deployed
 *      (built-in Pectra chain or KNOWN_CHAINS entry) → use WalletChan default
 *      with a bundled authorization in the first batch tx.
 *   4. Else → null (caller falls back to existing auto-sequential PK/SP path)
 *
 * "Silently" in (2) means we DON'T need to include an authorization tuple in
 * the tx — the EOA is already delegated onchain to that contract. This is the
 * common case after the first batch on a given chain.
 *
 * Custom delegates: written to `customDelegates` storage as a UI cache only.
 * They do NOT influence dapp-batch resolution. Runtime resolution either uses
 * a compatible onchain delegate, WalletChan's known default deployment, or
 * falls back to auto-sequential. To use any other delegate, users must
 * broadcast an explicit "Set" tx from Account Settings; after that the
 * resolver picks it up via step 1+2 (silent reuse).
 */

import { createPublicClient } from "viem";
import {
  EIP_7702_DEFAULT_DELEGATE,
  EIP_7702_CODE_PREFIX,
  EIP7702_SUPPORTED_CHAIN_IDS,
  VIEM_CHAINS,
} from "@/constants/chainRegistry";
import { KNOWN_CHAIN_IDS } from "@/constants/knownChains.generated";
import { secureHttpTransport } from "@/chrome/rpcHttpClient";
import { getCustomDelegate } from "@/chrome/delegationStorage";

/**
 * Whether WalletChan can authorize the MM default delegate on this chain.
 * True for:
 *   - Pectra-supported built-ins (CHAIN_REGISTRY.isEip7702Supported)
 *   - Custom chains whose chainId matches an entry in KNOWN_CHAINS (MM's
 *     delegation-deployments v1.3 list — same delegator address everywhere
 *     via CREATE2)
 * Other chains fall back to the auto-sequential PK/SP path.
 */
export function hasDefaultDelegateForChain(chainId: number): boolean {
  return (
    EIP7702_SUPPORTED_CHAIN_IDS.has(chainId) || KNOWN_CHAIN_IDS.has(chainId)
  );
}

type Address = `0x${string}`;

/**
 * ERC-7821 single-batch with opData support. Layout per EIP-7821:
 * `0x01 || 0x00 (revert on failure) || 0x007821 (selector for batch) ||
 * 0x000100 (with opData)`. We DO NOT emit this mode ourselves — our encoder
 * is locked to the plain variant per the policy decision in `_docs/7702.md` —
 * but some delegates only advertise capability for the opData mode, so we
 * keep the constant available as a secondary probe target if we ever need
 * fallback compatibility detection.
 */
export const ERC7821_BATCH_MODE_OPDATA =
  "0x0100000000007821000100000000000000000000000000000000000000000000" as const;

/**
 * Plain ERC-7821 single-batch mode (no opData). What `encodeBatchCalls()` in
 * `batchTxHandlers.ts` actually produces, and what we probe delegate
 * contracts for via `supportsExecutionMode(BATCH_MODE_PLAIN)`. Universal
 * subset — every conforming 7821 implementation we've shipped against
 * (MetaMask DeleGator, Uniswap Calibur, ZeroDev Kernel) accepts this.
 */
export const ERC7821_BATCH_MODE_PLAIN =
  "0x0100000000000000000000000000000000000000000000000000000000000000" as const;

const ERC7821_PROBE_ABI = [
  {
    inputs: [{ name: "mode", type: "bytes32" }],
    name: "supportsExecutionMode",
    outputs: [{ type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

function makePublicClient(rpcUrl: string, chainId: number) {
  const chain = VIEM_CHAINS[chainId];
  return createPublicClient({
    chain,
    transport: secureHttpTransport(rpcUrl, { timeout: 8000, retryCount: 1 }),
  });
}

/**
 * Strict read of the current EIP-7702 delegation for an EOA. Distinguishes
 * "no delegation" from "couldn't read the chain"; security-sensitive callers
 * must use this shape so RPC failures don't silently clear mirrors or cause
 * WalletChan to authorize a default delegate over unknown onchain state.
 *
 * A delegate address of 0x0000…0000 means the EOA was explicitly de-delegated
 * (a "revoke" tx that authorized the zero address) — treated as no delegation.
 */
export type OnchainDelegateRead =
  | { ok: true; delegate: Address | null }
  | { ok: false; error: string };

export async function readOnchainDelegate(
  rpcUrl: string,
  chainId: number,
  eoa: Address,
): Promise<OnchainDelegateRead> {
  try {
    const client = makePublicClient(rpcUrl, chainId);
    const code = await client.getCode({ address: eoa });
    if (!code) return { ok: true, delegate: null };
    const lower = code.toLowerCase();
    if (!lower.startsWith(EIP_7702_CODE_PREFIX)) {
      return { ok: true, delegate: null };
    }
    // 0xef0100 (3 bytes = 6 hex chars + "0x") + 40 hex chars = 48 chars total
    if (lower.length < 48) return { ok: true, delegate: null };
    const addr = ("0x" + lower.slice(8, 48)) as Address;
    if (addr === ZERO_ADDRESS) return { ok: true, delegate: null };
    return { ok: true, delegate: addr };
  } catch (err) {
    const error =
      err instanceof Error ? err.message : "Failed to read onchain delegate";
    console.warn(
      `[WalletChan] getOnchainDelegate failed for ${eoa} on chain ${chainId}:`,
      err,
    );
    return { ok: false, error };
  }
}

/**
 * Backward-compatible helper for non-security-critical probes. Prefer
 * `readOnchainDelegate` when callers need to know whether the read failed.
 */
export async function getOnchainDelegate(
  rpcUrl: string,
  chainId: number,
  eoa: Address,
): Promise<Address | null> {
  const read = await readOnchainDelegate(rpcUrl, chainId, eoa);
  return read.ok ? read.delegate : null;
}

/**
 * Outcome of an ERC-7821 capability probe.
 *
 *   { ok: true,  supports: true }  → contract implements the batch mode
 *   { ok: true,  supports: false } → contract exists but reverts or has no code
 *   { ok: false, error: string }   → couldn't reach the chain (bad RPC, timeout,
 *                                    CORS, etc.). Callers that surface this to
 *                                    the user should propagate `error` verbatim
 *                                    so the message is actionable instead of
 *                                    pretending the contract is incompatible.
 */
export type Erc7821ProbeResult =
  | { ok: true; supports: boolean }
  | { ok: false; error: string };

/**
 * Check whether a contract implements ERC-7821 batch execution. The probe
 * calls supportsExecutionMode(BATCH_MODE_PLAIN); a contract that returns true
 * for plain batch mode will accept the calldata that encodeBatchCalls()
 * produces (which uses the opData variant — most 7821 impls support both).
 *
 * Discriminates "doesn't support" (no code / contract revert) from "can't
 * tell" (RPC failure). The capability-resolution path treats both as
 * "unusable" silently; explicit user actions (Set / Custom delegate save)
 * surface the RPC error so they don't masquerade as "Contract does not
 * implement ERC-7821 batch execution".
 */
export async function probeErc7821Support(
  rpcUrl: string,
  chainId: number,
  delegate: Address,
): Promise<Erc7821ProbeResult> {
  const client = makePublicClient(rpcUrl, chainId);

  // Step 1: bytecode-present check. Any throw here is a chain/RPC issue —
  // there's no contract-level error path through eth_getCode.
  let code: `0x${string}` | undefined;
  try {
    code = await client.getCode({ address: delegate });
  } catch (err: any) {
    const msg = err?.shortMessage || err?.message || String(err);
    console.warn(
      `[probeErc7821] getCode failed for ${delegate} on chain ${chainId}: ${msg}`,
    );
    return { ok: false, error: msg };
  }
  if (!code || code === "0x") return { ok: true, supports: false };

  // Step 2: the actual capability call. Discriminate contract reverts (the
  // contract exists but doesn't implement supportsExecutionMode) from RPC /
  // network errors via viem's error-name chain. Reverts surface as
  // ContractFunctionExecutionError / ContractFunctionRevertedError; transport
  // failures as HttpRequestError / RpcRequestError / TimeoutError.
  try {
    const supported = await client.readContract({
      address: delegate,
      abi: ERC7821_PROBE_ABI,
      functionName: "supportsExecutionMode",
      args: [ERC7821_BATCH_MODE_PLAIN],
    });
    return { ok: true, supports: Boolean(supported) };
  } catch (err: any) {
    const name: string = err?.name || "";
    const msg: string = err?.shortMessage || err?.message || String(err);
    const isTransport =
      /Http|Rpc|Timeout|Network|Abort|Connection/i.test(name) ||
      /fetch|HTTP|network|timeout|abort|connection refused|ENOTFOUND|ECONN/i.test(
        msg,
      );
    if (isTransport) {
      console.warn(
        `[probeErc7821] readContract RPC error for ${delegate} on chain ${chainId}: ${msg}`,
      );
      return { ok: false, error: msg };
    }
    // Contract-level revert (function selector unknown, etc.) → not 7821.
    return { ok: true, supports: false };
  }
}

export type DelegateSource =
  | "onchain" // EOA is already delegated to a 7821-compatible contract; reuse it
  | "default" // WalletChan default (MM DeleGator)
  | "none"; // No usable delegate → fall back to auto-sequential

export interface DelegateResolution {
  /** The delegate address to use, or null if no 7702 path is available. */
  delegate: Address | null;
  /** Where the delegate came from. */
  source: DelegateSource;
  /**
   * True when the tx must bundle an authorization tuple to set the EOA's
   * delegation. False when the EOA is already delegated to this contract.
   */
  needsAuthorization: boolean;
  /**
   * The raw onchain delegation (regardless of 7821 support). Surfaced for the
   * Settings UI so it can tell the user "you're currently delegated to X".
   */
  onchainDelegate: Address | null;
  /**
   * The user's custom override from settings (regardless of whether it would
   * actually be used). For UI display.
   */
  customDelegate: Address | null;
}

/**
 * The single resolution function consumed by both the confirm handler and
 * the settings UI. The handler reads `delegate` + `needsAuthorization`; the
 * UI also reads `onchainDelegate` and `customDelegate` for display.
 */
export async function resolveActiveDelegate(params: {
  accountId: string;
  accountAddress: Address;
  chainId: number;
  rpcUrl: string;
}): Promise<DelegateResolution> {
  const { accountId, accountAddress, chainId, rpcUrl } = params;

  const [onchainRead, customDelegate] = await Promise.all([
    readOnchainDelegate(rpcUrl, chainId, accountAddress),
    getCustomDelegate(accountId, chainId),
  ]);

  if (!onchainRead.ok) {
    return {
      delegate: null,
      source: "none",
      needsAuthorization: false,
      onchainDelegate: null,
      customDelegate,
    };
  }

  const onchainDelegate = onchainRead.delegate;
  const chainHasDefault = hasDefaultDelegateForChain(chainId);

  // Step 1+2: silent reuse of existing onchain delegation when it's 7821-capable.
  if (onchainDelegate) {
    const probe = await probeErc7821Support(rpcUrl, chainId, onchainDelegate);
    if (probe.ok && probe.supports) {
      return {
        delegate: onchainDelegate,
        source: "onchain",
        needsAuthorization: false,
        onchainDelegate,
        customDelegate,
      };
    }
    // The EOA is delegated to a contract we can't batch through (e.g. another
    // wallet's delegate that doesn't implement ERC-7821). On chains where we
    // *can* authorize the WalletChan default, treat this as a re-delegation
    // case: return the default + needsAuthorization, but keep `onchainDelegate`
    // populated so the confirmation UI can render an explicit "Replacing
    // existing delegation" banner. The user sees the swap before signing and
    // can always reject.
    if (chainHasDefault) {
      return {
        delegate: EIP_7702_DEFAULT_DELEGATE,
        source: "default",
        needsAuthorization: true,
        onchainDelegate,
        customDelegate,
      };
    }
    // Custom chain with no known default delegate — can't safely re-delegate
    // (we don't know where MM DeleGator is deployed). Fall back to
    // auto-sequential and let the user resolve via Account Settings.
    return {
      delegate: null,
      source: "none",
      needsAuthorization: false,
      onchainDelegate,
      customDelegate,
    };
  }

  // Step 3: WalletChan default for chains that have a known deployment of
  // EIP_7702_DEFAULT_DELEGATE (built-ins + KNOWN_CHAINS). The customDelegate
  // from storage is returned in the response for UI display (so the settings
  // panel can pre-fill the "Custom" field) but does NOT influence the runtime
  // delegate — to use a custom delegate the user must broadcast a Set tx
  // from Account Settings first.
  if (chainHasDefault) {
    return {
      delegate: EIP_7702_DEFAULT_DELEGATE,
      source: "default",
      needsAuthorization: true,
      onchainDelegate: null,
      customDelegate,
    };
  }

  // Step 4: no 7702 path for this chain → auto-sequential fallback.
  return {
    delegate: null,
    source: "none",
    needsAuthorization: false,
    onchainDelegate: null,
    customDelegate,
  };
}
