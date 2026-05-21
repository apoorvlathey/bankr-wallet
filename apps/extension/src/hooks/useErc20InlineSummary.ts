/**
 * Inline one-liner summary for a transaction call — used in batch confirmation
 * `CallCard` headers so each row reads
 *   "Send 100 USDC to vitalik.eth"            (ERC-20 transfer)
 *   "Send 0.1 ETH to vitalik.eth"             (native transfer)
 *   "Approve unlimited USDC to uniswap-router"
 *   "Revoke USDC approval from uniswap-router"   (approve(spender, 0))
 * instead of just "transfer" / "approve" / "Native Transfer".
 *
 * Handles two ERC-20 selectors today plus the empty-calldata + value > 0
 * native-send shape. Extend `decodeCall` to add more selectors. The renderer
 * in `BatchTransactionConfirmation` consumes a single shape regardless of
 * mode — only `prefix` and `logoUrl` differ.
 *
 * Returns `null` when the call isn't a recognized send/approve/revoke.
 * Otherwise the result progressively enhances as token metadata and the
 * counterparty name resolve:
 *
 *   1. "Send tokens to 0xabcd…0123"     (decoded, awaiting token info / name)
 *   2. "Send 100 USDC to 0xabcd…0123"   (have token info, no name yet)
 *   3. "Send 100 USDC to vitalik.eth"   (have token info + name)
 *
 * The summary purposefully mirrors the field set rendered by the built-in
 * ERC-20 descriptors (`Amount` + `Recipient`/`Spender`) so the inline label
 * and the full descriptor card stay in lockstep.
 */

import { useEffect, useMemo, useState } from "react";
import { decodeFunctionData, parseAbiItem } from "viem";
import { blo } from "blo";

import type { Account } from "@/chrome/types";
import { useEnsIdentities } from "@/hooks/useEnsIdentities";
import { useCachedAvatarSrc } from "@/hooks/useCachedAvatarSrc";
import { KNOWN_TOKEN_LOGOS, getNativeCurrency } from "@/chrome/txSimulation";
import { getEthShLabels } from "@/lib/ethShLabelsCache";
import { useNetworks } from "@/contexts/NetworksContext";
import { getResolvedChainById } from "@/lib/chains";
import { getChainConfig } from "@/constants/chainConfig";

const TRANSFER_SELECTOR = "0xa9059cbb";
const APPROVE_SELECTOR = "0x095ea7b3";
const TRANSFER_ABI = parseAbiItem("function transfer(address to, uint256 amount)");
const APPROVE_ABI = parseAbiItem("function approve(address spender, uint256 amount)");

// uint256 max — canonical "infinite approval" sentinel. uint160 max is the
// Permit2 AllowanceTransfer cap (smaller integer); we collapse both to
// "unlimited" since either reads as effectively-infinite to the user.
const MAX_UINT256 = (1n << 256n) - 1n;
const MAX_UINT160 = (1n << 160n) - 1n;

export type Erc20SummaryMode = "send" | "approve" | "revoke";

interface DecodedCall {
  mode: Erc20SummaryMode;
  /** Either the transfer recipient or the approval spender. */
  counterparty: string;
  amount: bigint;
  /** True when the call is a native-coin transfer (empty data + value > 0). */
  isNative: boolean;
}

function isEmptyCalldata(data: string | undefined | null): boolean {
  return !data || data === "0x" || data === "0x0";
}

/**
 * Decode the call into a unified shape: ERC-20 transfer/approve, or — when
 * calldata is empty and value > 0 — a native-coin send. Returns null when the
 * call isn't a recognized shape (anything else falls back to the existing
 * `decodedName` / generic "Contract Call" path in the renderer).
 */
function decodeCall(
  to: string | undefined,
  data: string | undefined | null,
  value: string | undefined | null,
): DecodedCall | null {
  // ERC-20 selectors take precedence — `to` is the token contract; the
  // recipient/spender lives inside the calldata. value is irrelevant.
  if (data && data.startsWith("0x") && data.length >= 10) {
    const selector = data.slice(0, 10).toLowerCase();
    try {
      if (selector === TRANSFER_SELECTOR) {
        const { args } = decodeFunctionData({
          abi: [TRANSFER_ABI],
          data: data as `0x${string}`,
        });
        if (!args || args.length < 2) return null;
        return {
          mode: "send",
          counterparty: String(args[0]),
          amount: BigInt(args[1] as bigint | string | number),
          isNative: false,
        };
      }
      if (selector === APPROVE_SELECTOR) {
        const { args } = decodeFunctionData({
          abi: [APPROVE_ABI],
          data: data as `0x${string}`,
        });
        if (!args || args.length < 2) return null;
        const amount = BigInt(args[1] as bigint | string | number);
        return {
          // approve(spender, 0) strips an existing allowance — read as
          // "Revoke" so the summary reads "Revoke USDC approval from X"
          // instead of "Approve 0 USDC to X".
          mode: amount === 0n ? "revoke" : "approve",
          counterparty: String(args[0]),
          amount,
          isNative: false,
        };
      }
    } catch {
      return null;
    }
  }

  // Native send: no calldata, value > 0, and a valid `to`. The recipient is
  // tx.to itself, the amount is tx.value, and the token metadata comes from
  // the chain registry (resolved in the hook, not here, so this stays pure).
  if (
    to &&
    /^0x[a-fA-F0-9]{40}$/.test(to) &&
    isEmptyCalldata(data) &&
    value != null
  ) {
    try {
      const amount = BigInt(value);
      if (amount > 0n) {
        return {
          mode: "send",
          counterparty: to,
          amount,
          isNative: true,
        };
      }
    } catch {
      return null;
    }
  }

  return null;
}

interface TokenInfo {
  symbol: string;
  decimals: number;
  logoUrl?: string;
}

/**
 * What kind of avatar art we have for the counterparty. Controls border-radius
 * (ENS = circle, account/blockie = rounded square) so the same renderer
 * doesn't need to inspect the URL.
 */
export type Erc20CounterpartyAvatarKind = "ens" | "bankr" | "blockie";

export interface Erc20InlineSummary {
  /** "send" → transfer call; "approve" → allowance grant; "revoke" → approve(spender, 0). */
  mode: Erc20SummaryMode;
  /** Plain-text fallback ("Send 100 USDC to vitalik.eth") for tooltips. */
  text: string;
  /** "Send ", "Approve ", or "Revoke ". */
  prefix: string;
  /** "100" / "unlimited". Omitted in revoke mode (no amount to display). */
  amount?: string;
  symbol?: string; // "USDC"
  logoUrl?: string; // CDN url or cached data URL
  /** " to " for send/approve, " approval from " for revoke. */
  middle: string;
  /** Recipient (transfer) or spender (approve / revoke) display label. */
  recipient: string;
  recipientAvatarSrc?: string;
  recipientAvatarKind?: Erc20CounterpartyAvatarKind;
}

export function useErc20InlineSummary(
  to: string | undefined,
  data: string | undefined,
  chainId: number,
  /**
   * tx.value — required to detect native-coin sends (empty calldata + value).
   * Accepts the hex string the message bus already passes around; pass
   * undefined for surfaces that don't have a value (ERC-20-only legacy
   * callers) and the hook falls back to ERC-20 decoding alone.
   */
  value?: string,
): Erc20InlineSummary | null {
  const decoded = useMemo(
    () => decodeCall(to, data, value),
    [to, data, value],
  );

  // Native symbol/decimals come from the resolved chain registry (handles
  // user-added custom networks too). Skipping the chrome.runtime hop avoids
  // a pointless background round-trip — there's no ERC-20 contract to fetch
  // info from on a plain ETH send.
  const { networksInfo } = useNetworks();
  const resolvedChain = useMemo(
    () => getResolvedChainById(chainId, networksInfo),
    [chainId, networksInfo],
  );
  const fallbackConfig = useMemo(() => getChainConfig(chainId), [chainId]);

  // Token metadata + logo — mirrors TokenAmountInline's resolution order:
  //   symbol/decimals: onchain ERC-20 (canonical) → custom-token fallback
  //   logo: per-token cache (swap-list backed) → custom-token image →
  //         KNOWN_TOKEN_LOGOS hardcoded fallback
  // Native sends short-circuit the whole fetch and read symbol/decimals out
  // of the chain registry instead; no token logo (parity with the activity
  // tab's native-send rendering — chain icon already lives on the row's
  // outer container).
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  useEffect(() => {
    if (!decoded) {
      setTokenInfo(null);
      return;
    }

    if (decoded.isNative) {
      // Symbol/decimals: prefer the React-resolved network (handles user-added
      //   custom networks), fall back to the built-in registry, and finally
      //   to the canonical ETH defaults from txSimulation.
      // Logo: reuse the same lookup `AssetChangesDisplay` consumes (built off
      //   CHAIN_REGISTRY) so the inline batch row's icon matches the
      //   simulation panel on the same screen — ETH → ethereum.svg on all
      //   ETH-native chains, otherwise the chain's own icon (Polygon → POL,
      //   BNB Chain → BNB, etc.).
      const native =
        resolvedChain?.nativeCurrency ?? fallbackConfig?.nativeCurrency;
      const builtin = getNativeCurrency(chainId);
      const symbol = native?.symbol || builtin.symbol;
      const decimals =
        typeof native?.decimals === "number"
          ? native.decimals
          : builtin.decimals;
      setTokenInfo({ symbol, decimals, logoUrl: builtin.icon || undefined });
      return;
    }

    if (!to || !/^0x[a-fA-F0-9]{40}$/.test(to)) {
      setTokenInfo(null);
      return;
    }
    let cancelled = false;
    const infoP = new Promise<{ success: boolean; data?: { symbol: string; decimals: number } }>(
      (res) => {
        chrome.runtime.sendMessage(
          { type: "fetchTokenInfo", tokenAddress: to, chainId },
          res,
        );
      },
    );
    const logoP = new Promise<{ success: boolean; logoUrl?: string | null }>(
      (res) => {
        chrome.runtime.sendMessage(
          { type: "fetchTokenLogo", tokenAddress: to, chainId },
          res,
        );
      },
    );
    const customP = new Promise<{
      success: boolean;
      data?: { symbol: string; decimals: number; image?: string } | null;
    }>((res) => {
      chrome.runtime.sendMessage(
        { type: "lookupCustomToken", tokenAddress: to, chainId },
        res,
      );
    });
    Promise.all([infoP, logoP, customP]).then(([info, logo, custom]) => {
      if (cancelled) return;
      const symbol = info?.data?.symbol ?? custom?.data?.symbol;
      const decimals = info?.data?.decimals ?? custom?.data?.decimals;
      if (typeof symbol !== "string" || typeof decimals !== "number") return;
      const addrLower = to.toLowerCase();
      const logoUrl =
        logo?.logoUrl ||
        custom?.data?.image ||
        KNOWN_TOKEN_LOGOS[addrLower] ||
        undefined;
      setTokenInfo({ symbol, decimals, logoUrl });
    });
    return () => {
      cancelled = true;
    };
  }, [decoded, to, chainId, resolvedChain, fallbackConfig]);

  // Image-bytes cache for the token logo — same chrome.storage data-URL cache
  // used by ENS avatars and every other token icon in the UI.
  const cachedLogoUrl = useCachedAvatarSrc(tokenInfo?.logoUrl);

  // Counterparty name — saved-account match wins over ENS, mirroring
  // ClearSigningView's `AddressInline` priority.
  const counterpartyAddresses = useMemo(
    () => (decoded ? [decoded.counterparty] : []),
    [decoded],
  );
  const { identities } = useEnsIdentities(counterpartyAddresses);

  const [account, setAccount] = useState<Account | null>(null);
  useEffect(() => {
    if (!decoded) {
      setAccount(null);
      return;
    }
    let cancelled = false;
    chrome.runtime.sendMessage(
      { type: "getAccounts" },
      (accounts: Account[] | null) => {
        if (cancelled || !accounts) return;
        const lower = decoded.counterparty.toLowerCase();
        setAccount(accounts.find((a) => a.address.toLowerCase() === lower) || null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [decoded]);

  // eth.sh contract label (e.g. "AugustusV6", "Permit2", "Uniswap V3 Router").
  // Mostly meaningful for approve spenders — contracts rarely have ENS — but
  // safe to fetch for any counterparty. Skipped when the address belongs to
  // one of the user's saved accounts (their own label always wins). Mirrors
  // ClearSigningView's `AddressInline` external-label flow.
  const [externalLabel, setExternalLabel] = useState<string | null>(null);
  useEffect(() => {
    if (!decoded || account) {
      setExternalLabel(null);
      return;
    }
    let cancelled = false;
    getEthShLabels(decoded.counterparty, chainId).then((labels) => {
      if (cancelled) return;
      if (labels.length > 0) setExternalLabel(labels[0]);
    });
    return () => {
      cancelled = true;
    };
  }, [decoded, chainId, account]);

  const ens = decoded
    ? identities.get(decoded.counterparty.toLowerCase())
    : undefined;
  const cachedEnsAvatar = useCachedAvatarSrc(ens?.avatar);

  if (!decoded) return null;

  // Display priority: own account > ENS > eth.sh contract label > short hex.
  // eth.sh sits below ENS so a contract that's somehow set ENS still wins,
  // and above the hex fallback so approve rows read "AugustusV6" instead of
  // "0x6A00…1068".
  const name = account?.displayName || ens?.name || externalLabel || null;
  const recipientDisplay =
    name || `${decoded.counterparty.slice(0, 6)}…${decoded.counterparty.slice(-4)}`;

  let recipientAvatarSrc: string | undefined;
  let recipientAvatarKind: Erc20CounterpartyAvatarKind | undefined;
  if (ens?.avatar) {
    recipientAvatarSrc = cachedEnsAvatar || ens.avatar;
    recipientAvatarKind = "ens";
  } else if (account?.type === "bankr") {
    recipientAvatarSrc = "/bankr-icon.png";
    recipientAvatarKind = "bankr";
  } else if (account) {
    recipientAvatarSrc = blo(decoded.counterparty as `0x${string}`);
    recipientAvatarKind = "blockie";
  }

  // Revoke is intentionally amountless — "Revoke 0 USDC" reads as noise; the
  // important bits are the token + the spender losing access.
  const amount =
    decoded.mode === "revoke"
      ? undefined
      : tokenInfo
        ? formatAmount(decoded.amount, tokenInfo.decimals)
        : undefined;
  const symbol = tokenInfo?.symbol;
  const logoUrl = cachedLogoUrl || tokenInfo?.logoUrl;

  const prefix =
    decoded.mode === "approve"
      ? "Approve "
      : decoded.mode === "revoke"
        ? "Revoke "
        : "Send ";
  // Revoke shifts the connecting phrase from "to" to "approval from" so the
  // sentence reads "Revoke USDC approval from uniswap-router".
  const middle = decoded.mode === "revoke" ? " approval from " : " to ";
  const text = (() => {
    if (decoded.mode === "revoke") {
      return symbol
        ? `Revoke ${symbol} approval from ${recipientDisplay}`
        : `Revoke approval from ${recipientDisplay}`;
    }
    const fallbackNoun = decoded.mode === "approve" ? "approval" : "tokens";
    return amount && symbol
      ? `${prefix}${amount} ${symbol} to ${recipientDisplay}`
      : `${prefix}${fallbackNoun} to ${recipientDisplay}`;
  })();

  return {
    mode: decoded.mode,
    text,
    prefix,
    amount,
    symbol,
    logoUrl,
    middle,
    recipient: recipientDisplay,
    recipientAvatarSrc,
    recipientAvatarKind,
  };
}

/**
 * Compact amount: trims trailing zeros and caps fractional digits to 6 so
 * the one-liner stays short. Collapses the uint256/uint160 max sentinels to
 * "unlimited" — the precise number is still available in the expanded
 * descriptor card. Full-precision is available in the descriptor card below
 * the call list.
 */
function formatAmount(raw: bigint, decimals: number): string {
  if (raw === MAX_UINT256 || raw === MAX_UINT160) return "unlimited";
  if (decimals <= 0) return raw.toString();
  const neg = raw < 0n;
  const abs = neg ? -raw : raw;
  const divisor = 10n ** BigInt(decimals);
  const whole = abs / divisor;
  const frac = abs % divisor;
  if (frac === 0n) return `${neg ? "-" : ""}${whole.toString()}`;
  let fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  if (fracStr.length > 6) fracStr = fracStr.slice(0, 6);
  return `${neg ? "-" : ""}${whole.toString()}.${fracStr}`;
}
