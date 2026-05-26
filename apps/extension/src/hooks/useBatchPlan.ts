/**
 * Resolve the EIP-7702 plan for a PK/SP batch confirmation surface.
 *
 * Asks the background script (`getDelegationStatus`) what delegate would be
 * used if the batch were confirmed right now. Returns the resolved strategy
 * (atomic-7702, auto-sequential, atomic-bankr) along with the data the
 * confirmation UI needs to render the authorization banner.
 *
 * Bankr/impersonator inputs short-circuit to a known strategy without
 * hitting background — the resolver only matters for PK/SP accounts.
 */

import { useEffect, useState } from "react";

type Address = `0x${string}`;

export type BatchStrategy =
  | "atomic-bankr" // Bankr API atomic batch
  | "atomic-7702" // PK/SP local-signing atomic via EIP-7702
  | "auto-sequential" // PK/SP sequential broadcasts (fallback)
  | "view-only" // Impersonator — no execution
  | "loading";

export interface BatchPlan {
  strategy: BatchStrategy;
  /** Delegate WalletChan would authorize / has authorized. */
  delegate: Address | null;
  /** True when a fresh authorization signature is bundled into the tx. */
  needsAuthorization: boolean;
  /** Source of the resolved delegate, for diagnostics + UI label. */
  source: "onchain" | "default" | "none" | null;
  /**
   * The EOA's current onchain delegation, if any. Surfaced so the
   * confirmation banner can distinguish a fresh "Smart account setup" from
   * a "Replacing existing delegation" case (where the EOA is already
   * delegated to some non-7821-compatible contract that we're about to swap
   * out for the WalletChan default).
   */
  onchainDelegate: Address | null;
}

const LOADING: BatchPlan = {
  strategy: "loading",
  delegate: null,
  needsAuthorization: false,
  source: null,
  onchainDelegate: null,
};

/**
 * The hook fires one background message on mount or when (accountId, chainId,
 * accountType) changes. The result is cached locally; the background
 * resolution itself probes onchain so multiple consecutive calls cost RPC,
 * which is why we only refresh on input change.
 */
export function useBatchPlan(args: {
  accountId: string | null;
  accountType: string | null;
  chainId: number | null;
}): BatchPlan {
  const { accountId, accountType, chainId } = args;
  const [plan, setPlan] = useState<BatchPlan>(LOADING);

  useEffect(() => {
    if (!accountType || !chainId) {
      setPlan(LOADING);
      return;
    }
    if (accountType === "bankr") {
      setPlan({
        strategy: "atomic-bankr",
        delegate: null,
        needsAuthorization: false,
        source: null,
        onchainDelegate: null,
      });
      return;
    }
    if (accountType === "impersonator") {
      setPlan({
        strategy: "view-only",
        delegate: null,
        needsAuthorization: false,
        source: null,
        onchainDelegate: null,
      });
      return;
    }
    if (
      (accountType !== "privateKey" && accountType !== "seedPhrase") ||
      !accountId
    ) {
      setPlan({
        strategy: "auto-sequential",
        delegate: null,
        needsAuthorization: false,
        source: null,
        onchainDelegate: null,
      });
      return;
    }

    let cancelled = false;
    setPlan(LOADING);
    chrome.runtime.sendMessage(
      { type: "getDelegationStatus", accountId, chainId },
      (
        result:
          | {
              success: true;
              delegate: Address | null;
              source: "onchain" | "default" | "none";
              needsAuthorization: boolean;
              onchainDelegate: Address | null;
            }
          | { success: false; error: string }
          | undefined,
      ) => {
        if (cancelled) return;
        if (!result || !result.success) {
          // Treat unknown / errored as auto-sequential — the confirm handler
          // would fall back anyway, and we don't want to block the UI.
          setPlan({
            strategy: "auto-sequential",
            delegate: null,
            needsAuthorization: false,
            source: null,
            onchainDelegate: null,
          });
          return;
        }
        if (result.delegate) {
          setPlan({
            strategy: "atomic-7702",
            delegate: result.delegate,
            needsAuthorization: result.needsAuthorization,
            source: result.source,
            onchainDelegate: result.onchainDelegate,
          });
        } else {
          setPlan({
            strategy: "auto-sequential",
            delegate: null,
            needsAuthorization: false,
            source: result.source,
            onchainDelegate: result.onchainDelegate,
          });
        }
      },
    );

    return () => {
      cancelled = true;
    };
  }, [accountId, accountType, chainId]);

  return plan;
}
