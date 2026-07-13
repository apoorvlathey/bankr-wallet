import { useEffect, useState } from "react";
import type { PendingTxRequest } from "@/chrome/requests/pendingTxStorage";
import { getStoredNativeCurrencySymbol } from "@/lib/chains";
import { getEthShLabels } from "@/lib/ethShLabelsCache";
import { resolveAddressToName } from "@/lib/ensUtils";

function getOriginHostname(origin: string): string | null {
  try {
    return new URL(origin).hostname;
  } catch {
    return null;
  }
}

function getOriginInitials(label: string): string {
  if (!label) return "WC";
  const words = label.split(/[\s\-_]+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return label.slice(0, 3).toUpperCase();
}

export function useTransactionMetadata(
  txRequest: PendingTxRequest,
  resolvedNativeSymbol?: string,
) {
  const { tx, origin } = txRequest;
  const isInternalWalletChan = origin === "WalletChan";
  const internalSendTokenLabel = origin.startsWith("Send ")
    ? origin.slice(5).trim()
    : null;
  const originHostname = getOriginHostname(origin);
  const originInitials = getOriginInitials(
    internalSendTokenLabel || originHostname || origin,
  );

  const [nativeSymbol, setNativeSymbol] = useState(
    resolvedNativeSymbol ?? "ETH",
  );
  const [toLabels, setToLabels] = useState<string[]>([]);
  const [delegateLabels, setDelegateLabels] = useState<string[]>([]);
  const [resolvedToName, setResolvedToName] = useState<string | null>(null);

  useEffect(() => {
    if (resolvedNativeSymbol) {
      setNativeSymbol(resolvedNativeSymbol);
      return;
    }
    getStoredNativeCurrencySymbol(tx.chainId)
      .then(setNativeSymbol)
      .catch(() => {});
  }, [resolvedNativeSymbol, tx.chainId]);

  useEffect(() => {
    if (!tx.to) return;
    let cancelled = false;
    getEthShLabels(tx.to, tx.chainId).then((labels) => {
      if (!cancelled && labels.length > 0) setToLabels(labels);
    });
    return () => {
      cancelled = true;
    };
  }, [tx.chainId, tx.to]);

  const delegation = txRequest.delegation7702Meta;
  const isSetDelegate = delegation?.kind === "setDelegate";
  useEffect(() => {
    if (!isSetDelegate || !delegation) {
      setDelegateLabels([]);
      return;
    }

    let cancelled = false;
    getEthShLabels(delegation.targetDelegate, tx.chainId).then((labels) => {
      if (!cancelled && labels.length > 0) setDelegateLabels(labels);
    });
    return () => {
      cancelled = true;
    };
  }, [delegation, isSetDelegate, tx.chainId]);

  useEffect(() => {
    if (!tx.to) return;
    resolveAddressToName(tx.to)
      .then((name) => {
        if (name) setResolvedToName(name);
      })
      .catch(() => {});
  }, [tx.to]);

  return {
    delegateLabels,
    isInternalWalletChan,
    nativeSymbol,
    originHostname,
    originInitials,
    resolvedToName,
    toLabels,
  };
}
