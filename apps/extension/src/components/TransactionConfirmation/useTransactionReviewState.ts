import { useEffect, useMemo, useRef, useState } from "react";
import type { PendingTxRequest } from "@/chrome/requests/pendingTxStorage";
import type { GasOverrides } from "@/chrome/txHandlers";
import {
  FORCE_INCLUSION_CHAINS,
  isForceInclusionSupportedForAccount,
} from "@/constants/chainRegistry";
import { detectAbiEncodingError } from "@/lib/calldataValidation";
import { getAddressBoundCalldataDescriptor } from "@/lib/clearSigning/builtinDescriptors";
import { parseApproveCalldata } from "@/lib/erc20Approve";
import { parseTransactionValueWei } from "./transactionValue";
import type { ForceInclusionInfo, TransactionAccountType } from "./types";
import { useSplitPriorTxState } from "./useSplitPriorTxState";

export function useTransactionReviewState(
  txRequest: PendingTxRequest,
  accountType: TransactionAccountType | undefined,
) {
  const { tx } = txRequest;
  const delegation7702 = txRequest.delegation7702Meta;
  const isErc7715PermissionRevoke =
    !!txRequest.erc7715PermissionRevokeMeta;
  const parsedTxValue = useMemo(
    () => parseTransactionValueWei(tx.value),
    [tx.value],
  );
  const isValueMalformed = !parsedTxValue.ok;
  const parsedApproval = useMemo(
    () =>
      tx.to &&
      tx.data &&
      !getAddressBoundCalldataDescriptor(tx.chainId, tx.to, tx.data)
        ? parseApproveCalldata(tx.data)
        : null,
    [tx.chainId, tx.data, tx.to],
  );
  const clearSigningEligible = !!(
    tx.data &&
    tx.data !== "0x" &&
    tx.to &&
    !parsedApproval &&
    !isErc7715PermissionRevoke &&
    !isValueMalformed
  );
  const [clearSigningStatus, setClearSigningStatus] = useState<
    "loading" | "matched" | "absent"
  >(clearSigningEligible ? "loading" : "absent");
  const [simulationReverted, setSimulationReverted] = useState(false);
  const [simulationUnavailable, setSimulationUnavailable] = useState(false);
  const [gasOverrides, setGasOverrides] = useState<GasOverrides | null>(null);
  const [gasValid, setGasValid] = useState(true);
  const [forceInclusion, setForceInclusion] = useState(false);
  const [nativePriceUsd, setNativePriceUsd] = useState<number | null>(null);

  useEffect(() => {
    setClearSigningStatus(clearSigningEligible ? "loading" : "absent");
  }, [clearSigningEligible, txRequest.id]);

  useEffect(() => {
    if (!isValueMalformed) return;
    setGasValid(false);
    setSimulationReverted(false);
    setSimulationUnavailable(false);
  }, [isValueMalformed, txRequest.id]);

  useEffect(() => {
    let cancelled = false;
    setNativePriceUsd(null);

    if (!parsedTxValue.ok || parsedTxValue.wei <= 0n) return undefined;

    chrome.runtime.sendMessage(
      { type: "fetchNativePrice", chainId: tx.chainId },
      (response) => {
        if (cancelled || chrome.runtime.lastError) return;
        const price = Number(response?.priceUsd ?? 0);
        if (response?.success && Number.isFinite(price) && price > 0) {
          setNativePriceUsd(price);
        }
      },
    );

    return () => {
      cancelled = true;
    };
  }, [parsedTxValue, tx.chainId, txRequest.id]);

  const splitState = useSplitPriorTxState(txRequest);
  const [gasEstimateKey, setGasEstimateKey] = useState(0);
  const lastSeenSplitResolveRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (
      splitState.ready &&
      splitState.justResolvedAt &&
      splitState.justResolvedAt !== lastSeenSplitResolveRef.current
    ) {
      lastSeenSplitResolveRef.current = splitState.justResolvedAt;
      setGasEstimateKey((key) => key + 1);
      setGasValid(false);
    }
  }, [splitState]);

  const forceInclusionInfo = useMemo<ForceInclusionInfo | null>(() => {
    if (delegation7702) return null;
    if (!isForceInclusionSupportedForAccount(tx.chainId, accountType)) {
      return null;
    }
    const entry = FORCE_INCLUSION_CHAINS.get(tx.chainId)!;
    return {
      l1ChainId: entry.l1ChainId,
      l1ChainName: entry.l1ChainName,
    };
  }, [accountType, delegation7702, tx.chainId]);

  const calldataValidation = useMemo(
    () => detectAbiEncodingError(tx.data),
    [tx.data],
  );
  return {
    calldataValidation,
    clearSigningEligible,
    clearSigningMatched: clearSigningStatus === "matched",
    clearSigningStatus,
    forceInclusion,
    forceInclusionInfo,
    gasEstimateKey,
    gasOverrides,
    gasValid,
    isCalldataMalformed: calldataValidation.malformed,
    isValueMalformed,
    isValueZero: parsedTxValue.ok && parsedTxValue.wei === 0n,
    nativePriceUsd,
    parsedApproval,
    parsedTxValue,
    setClearSigningStatus,
    setForceInclusion,
    setGasOverrides,
    setGasValid,
    setSimulationReverted,
    setSimulationUnavailable,
    simulationReverted,
    simulationUnavailable,
    splitState,
  };
}
