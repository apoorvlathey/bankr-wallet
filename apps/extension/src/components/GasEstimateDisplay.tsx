import { useState, useEffect, useCallback, memo, useMemo } from "react";
import {
  Box,
  VStack,
  HStack,
  Text,
  IconButton,
  Tooltip,
} from "@chakra-ui/react";
import {
  WarningIcon,
  CopyIcon,
  CheckIcon,
} from "@chakra-ui/icons";
import { PendingTxRequest } from "@/chrome/requests/pendingTxStorage";
import { GasEstimate, GasEstimateTier } from "@/chrome/gasEstimation";
import { GasOverrides } from "@/chrome/txHandlers";
import { formatEth, formatGwei, formatWeiToUsd } from "@/lib/gasFormatUtils";
import { useTheme } from "@/theme";
import {
  DEFAULT_TIER,
  getStoredGasTier,
  setStoredGasTier,
  type GasTierSelection,
} from "@/lib/gasTiers";
import { useScreenEntered } from "@/components/ScreenTransition";
import { ShapesLoader } from "@/components/Chat/ShapesLoader";
import { CustomGasEditor } from "@/components/GasEstimate/CustomGasEditor";
import { GasFeePopover } from "@/components/GasEstimate/GasFeePopover";
import { getInsufficientBalanceMessage } from "@/components/GasEstimate/model/balanceWarnings";

interface GasEstimateDisplayProps {
  txRequest: PendingTxRequest;
  accountType?: "bankr" | "privateKey" | "seedPhrase" | "impersonator";
  onGasOverrides?: (overrides: GasOverrides | null) => void;
  /**
   * Reports whether the current gas params are valid for broadcast. Bubbled
   * to the parent so it can disable Confirm. `true` means safe to confirm;
   * `false` means there's a validation error the user must fix.
   */
  onValidityChange?: (valid: boolean) => void;
  forceInclusion?: boolean;
}

function GasRow({ label, value }: { label: string; value: string }) {
  return (
    <HStack justify="space-between" w="full">
      <Text fontSize="xs" color="text.tertiary" fontWeight="600">
        {label}
      </Text>
      <Text fontSize="xs" fontWeight="700" color="text.primary" fontFamily="mono" textAlign="right">
        {value}
      </Text>
    </HStack>
  );
}

function weiToGweiStr(wei: string): string {
  const gwei = Number(BigInt(wei)) / 1e9;
  if (gwei === 0) return "0";
  return gwei.toFixed(9).replace(/0+$/, "").replace(/\.$/, "");
}

function formatCompactFee(wei: string, symbol: string): string {
  const value = Number(BigInt(wei)) / 1e18;
  const amount = value.toLocaleString("en-US", {
    maximumSignificantDigits: 4,
    useGrouping: false,
  });
  return `${amount} ${symbol}`;
}

function gweiStrToWei(gweiStr: string): string | null {
  const val = Number(gweiStr);
  if (isNaN(val) || val < 0) return null;
  try {
    const wei = BigInt(Math.round(val * 1e9));
    return wei.toString();
  } catch {
    return null;
  }
}

/**
 * Compute Max Fee from a Priority Fee in the Custom-tier "linked" mode.
 *   maxFee = predictedNextBaseFee × 1.5 + priority
 * Mirrors the Standard-tier multiplier in feeEstimation.ts so toggling between
 * Standard ↔ Custom doesn't surprise the user with a different headroom.
 */
function deriveMaxFeeFromPriority(
  priorityWei: bigint,
  predictedNextBaseFee: bigint,
): bigint {
  return (predictedNextBaseFee * 150n) / 100n + priorityWei;
}

function RevertWarning({ shortError, fullError }: { shortError: string; fullError: string }) {
  const [copied, setCopied] = useState(false);
  const { tokens } = useTheme();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullError);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard writes can fail when the extension view is not focused.
    }
  };

  return (
    <HStack
      bg="status.error.bg"
      border={tokens.borders.medium}
      borderColor="status.error.border"
      borderRadius="lg"
      boxShadow="card"
      px={3}
      py={2}
      spacing={2}
    >
      <WarningIcon color="status.error.fg" boxSize={3.5} flexShrink={0} />
      <Text fontSize="xs" color="status.error.fg" fontWeight="600" flex="1" noOfLines={2}>
        TX may revert: {shortError}
      </Text>
      <Tooltip label="Copy full error" fontSize="xs" hasArrow>
        <IconButton
          aria-label="Copy full error"
          icon={copied ? <CheckIcon /> : <CopyIcon />}
          size="xs"
          minW="24px"
          w="24px"
          h="24px"
          variant="ghost"
          color={copied ? "accent.highlight" : "status.error.fg"}
          onClick={handleCopy}
          _hover={{ color: "status.error.fg", bg: "blackAlpha.200" }}
          flexShrink={0}
        />
      </Tooltip>
    </HStack>
  );
}

function GasEstimateDisplay({
  txRequest,
  accountType,
  onGasOverrides,
  onValidityChange,
  forceInclusion,
}: GasEstimateDisplayProps) {
  const { tokens } = useTheme();
  const [estimate, setEstimate] = useState<GasEstimate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const [tier, setTier] = useState<GasTierSelection>(DEFAULT_TIER);
  useEffect(() => {
    let cancelled = false;
    getStoredGasTier().then((stored) => {
      if (!cancelled) setTier(stored);
    });
    return () => { cancelled = true; };
  }, []);

  const [editGasLimit, setEditGasLimit] = useState("");
  const [editMaxFee, setEditMaxFee] = useState("");
  const [editPriorityFee, setEditPriorityFee] = useState("");
  const [customEditorOpen, setCustomEditorOpen] = useState(false);
  const [draftGasLimit, setDraftGasLimit] = useState("");
  const [draftMaxFee, setDraftMaxFee] = useState("");
  const [draftPriorityFee, setDraftPriorityFee] = useState("");
  const [draftMaxFeeManual, setDraftMaxFeeManual] = useState(false);
  const [draftUsesPendingDappValues, setDraftUsesPendingDappValues] =
    useState(false);
  // Sticky-edit flag for Custom mode: once the user touches Max Fee directly,
  // we stop auto-deriving it from Priority. Cleared by the relink button.
  const [maxFeeManual, setMaxFeeManual] = useState(false);
  // True when we defaulted to a preset tier despite dappProvidedGas because
  // the dapp's fees were unusable. The first time the user opens Custom we
  // re-seed the editable fields with the dapp's original values so they can
  // still see and edit what the dapp asked for.
  const [dappValuesPendingForCustom, setDappValuesPendingForCustom] =
    useState(false);

  const isLocalAccount =
    accountType === "privateKey" || accountType === "seedPhrase";
  // Picker is hidden only when we have no tier data (force inclusion /
  // non-1559 chain) or when the account type doesn't allow overrides. We
  // intentionally still show it when the dapp suggested gas — the user
  // should be able to override the dapp's request with our own estimate
  // instead of being locked into whatever the dapp asked for.
  const showPicker =
    isLocalAccount && !forceInclusion && !!estimate?.tiers;
  const showCustomEditor =
    isLocalAccount && (customEditorOpen || !showPicker);

  // Defer the gas estimate RPC until the screen has finished animating in.
  // Fetching mid-animation triggers a re-render with new layout (tier picker,
  // fee rows) that stutters the slide. Skeleton stays put during the slide,
  // estimate arrives the frame after entry settles.
  const screenEntered = useScreenEntered();

  // Fetch gas estimate on mount and when forceInclusion toggles
  useEffect(() => {
    if (!screenEntered) return;
    let cancelled = false;
    setLoading(true);
    setEstimate(null);
    setError(null);
    setMaxFeeManual(false);
    setDappValuesPendingForCustom(false);
    setCustomEditorOpen(false);

    const messageType = forceInclusion ? "estimateForceInclusionGas" : "estimateGas";

    // EIP-7702 set/revoke txs broadcast with an authorization tuple attached.
    // Tell the background estimator how many we'll attach so it adds the
    // intrinsic-gas overhead `eth_estimateGas` can't see (mainline EVM ~12.5k
    // per auth, multiples higher on non-standard-gas chains like MegaETH).
    const eip7702AuthCount = txRequest.delegation7702Meta ? 1 : undefined;

    chrome.runtime.sendMessage(
      {
        type: messageType,
        tx: txRequest.tx,
        accountAddress: txRequest.tx.from,
        ...(eip7702AuthCount ? { eip7702AuthCount } : {}),
      },
      (result: GasEstimate) => {
        if (cancelled) return;
        if (chrome.runtime.lastError) {
          setError("Gas estimate unavailable");
          setLoading(false);
          return;
        }
        setEstimate(result);
        setEditGasLimit(result.gasLimit);

        // When the dapp suggested gas, default the picker to Custom so the
        // dapp's exact values stay pre-filled in the editable rows. The user
        // can flip to Slow / Standard / Fast to opt into our estimate
        // instead. Without this override the stored default (typically
        // "standard") would silently replace the dapp's request, breaking
        // dapps that rely on a specific gas budget (e.g. flashbots / MEV).
        //
        // Exception: if the dapp's fees are unusable (any of priority/max/
        // gasPrice is literal 0), defaulting to Custom would broadcast a
        // tx that gets dropped from the mempool. Fall back to the stored
        // tier (Standard by default) — the user can still flip to Custom
        // to inspect or use the dapp's values.
        const initialTier: GasTierSelection =
          result.dappProvidedGas && !result.dappGasInvalid
            ? "custom"
            : tier;
        if (initialTier !== tier) setTier(initialTier);

        // Preserve the dapp's original values for the Custom tab so the user
        // can still inspect them after we auto-switched away.
        if (result.dappProvidedGas && initialTier !== "custom") {
          setDappValuesPendingForCustom(true);
        }

        // If tiers are available and the active tier is a preset, use that
        // tier's fees. Otherwise (Custom, or tiers absent) fall back to the
        // estimate's own values (which are the standard tier or dapp values).
        const presetFees: GasEstimateTier | null =
          result.tiers && initialTier !== "custom"
            ? result.tiers[initialTier]
            : null;
        const activeMaxFee = presetFees?.maxFeePerGas ?? result.maxFeePerGas;
        const activePriority =
          presetFees?.maxPriorityFeePerGas ?? result.maxPriorityFeePerGas;

        setEditMaxFee(weiToGweiStr(activeMaxFee));
        setEditPriorityFee(weiToGweiStr(activePriority));
        setLoading(false);
      },
    );

    return () => { cancelled = true; };
    // tier intentionally omitted — re-firing the RPC just because the picker
    // changed would be wasteful. The tier-change effect below repopulates the
    // editable fields from cached `estimate.tiers`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txRequest.id, forceInclusion, screenEntered]);

  const openCustomEditor = useCallback(() => {
    if (!estimate) return;

    const usePendingDappValues = dappValuesPendingForCustom;
    setDraftGasLimit(editGasLimit);
    setDraftMaxFee(
      usePendingDappValues
        ? weiToGweiStr(estimate.maxFeePerGas)
        : editMaxFee,
    );
    setDraftPriorityFee(
      usePendingDappValues
        ? weiToGweiStr(estimate.maxPriorityFeePerGas)
        : editPriorityFee,
    );
    setDraftMaxFeeManual(usePendingDappValues ? false : maxFeeManual);
    setDraftUsesPendingDappValues(usePendingDappValues);
    setCustomEditorOpen(true);
  }, [
    dappValuesPendingForCustom,
    editGasLimit,
    editMaxFee,
    editPriorityFee,
    estimate,
    maxFeeManual,
  ]);

  // Presets apply immediately. Custom is a deliberate second step: opening
  // it only seeds a draft, and the transaction overrides remain untouched
  // until the user presses Set.
  const handleTierChange = useCallback(
    (next: GasTierSelection) => {
      if (next === "custom") {
        openCustomEditor();
        return;
      }

      setTier(next);
      setStoredGasTier(next);
      if (estimate?.tiers) {
        const t = estimate.tiers[next];
        setEditMaxFee(weiToGweiStr(t.maxFeePerGas));
        setEditPriorityFee(weiToGweiStr(t.maxPriorityFeePerGas));
        setMaxFeeManual(false);
      }
      setExpanded(false);
    },
    [estimate, openCustomEditor],
  );

  // Custom-mode coupling: editing Priority recomputes Max Fee unless the
  // user has explicitly edited Max Fee since the last relink.
  const handleDraftPriorityEdit = useCallback(
    (val: string) => {
      setDraftPriorityFee(val);
      if (!draftMaxFeeManual && estimate?.predictedNextBaseFee) {
        const priorityWei = gweiStrToWei(val);
        if (priorityWei !== null) {
          const derived = deriveMaxFeeFromPriority(
            BigInt(priorityWei),
            BigInt(estimate.predictedNextBaseFee),
          );
          setDraftMaxFee(weiToGweiStr(derived.toString()));
        }
      }
    },
    [draftMaxFeeManual, estimate],
  );

  const handleDraftMaxFeeEdit = useCallback((val: string) => {
    setDraftMaxFee(val);
    setDraftMaxFeeManual(true);
  }, []);

  const handleDraftEnableMaxFeeEdit = useCallback(() => {
    setDraftMaxFeeManual(true);
  }, []);

  const handleDraftRelinkMaxFee = useCallback(() => {
    if (!estimate?.predictedNextBaseFee) return;
    const priorityWei = gweiStrToWei(draftPriorityFee);
    if (priorityWei === null) return;
    const derived = deriveMaxFeeFromPriority(
      BigInt(priorityWei),
      BigInt(estimate.predictedNextBaseFee),
    );
    setDraftMaxFee(weiToGweiStr(derived.toString()));
    setDraftMaxFeeManual(false);
  }, [draftPriorityFee, estimate]);

  // Chains without a tier picker retain the existing direct-edit path.
  const handleAppliedPriorityEdit = useCallback(
    (val: string) => {
      setEditPriorityFee(val);
      if (!maxFeeManual && estimate?.predictedNextBaseFee) {
        const priorityWei = gweiStrToWei(val);
        if (priorityWei !== null) {
          const derived = deriveMaxFeeFromPriority(
            BigInt(priorityWei),
            BigInt(estimate.predictedNextBaseFee),
          );
          setEditMaxFee(weiToGweiStr(derived.toString()));
        }
      }
    },
    [maxFeeManual, estimate],
  );

  const handleAppliedMaxFeeEdit = useCallback((val: string) => {
    setEditMaxFee(val);
    setMaxFeeManual(true);
  }, []);

  const handleAppliedEnableMaxFeeEdit = useCallback(() => {
    setMaxFeeManual(true);
  }, []);

  const handleAppliedRelinkMaxFee = useCallback(() => {
    if (!estimate?.predictedNextBaseFee) return;
    const priorityWei = gweiStrToWei(editPriorityFee);
    if (priorityWei === null) return;
    const derived = deriveMaxFeeFromPriority(
      BigInt(priorityWei),
      BigInt(estimate.predictedNextBaseFee),
    );
    setEditMaxFee(weiToGweiStr(derived.toString()));
    setMaxFeeManual(false);
  }, [editPriorityFee, estimate]);

  // Validation
  const isGasLimitValid = (() => {
    const val = Number(editGasLimit);
    return !isNaN(val) && val > 0 && Number.isInteger(val);
  })();
  const isMaxFeeValid = (() => {
    const val = Number(editMaxFee);
    return !isNaN(val) && val > 0;
  })();
  const isPriorityFeeValid = (() => {
    const val = Number(editPriorityFee);
    return !isNaN(val) && val >= 0;
  })();
  const allFieldsValid = isGasLimitValid && isMaxFeeValid && isPriorityFeeValid;

  // Critical guard: Max Fee must cover baseFee + Priority, otherwise the tx
  // is mathematically invalid (RPC will reject or it will sit forever). The
  // picker's preset tiers always satisfy this by construction; the guard
  // only meaningfully fires in Custom mode.
  const maxFeeCoversBase = (() => {
    if (!allFieldsValid || !estimate) return false;
    try {
      const maxFeeWei = gweiStrToWei(editMaxFee);
      const priorityWei = gweiStrToWei(editPriorityFee);
      if (!maxFeeWei || !priorityWei) return false;
      const baseFeeWei = BigInt(estimate.baseFee || "0");
      return BigInt(maxFeeWei) >= baseFeeWei + BigInt(priorityWei);
    } catch {
      return false;
    }
  })();

  const isDraftGasLimitValid = (() => {
    const val = Number(draftGasLimit);
    return !isNaN(val) && val > 0 && Number.isInteger(val);
  })();
  const isDraftMaxFeeValid = (() => {
    const val = Number(draftMaxFee);
    return !isNaN(val) && val > 0;
  })();
  const isDraftPriorityFeeValid = (() => {
    const val = Number(draftPriorityFee);
    return !isNaN(val) && val >= 0;
  })();
  const allDraftFieldsValid =
    isDraftGasLimitValid &&
    isDraftMaxFeeValid &&
    isDraftPriorityFeeValid;
  const draftMaxFeeCoversBase = (() => {
    if (!allDraftFieldsValid || !estimate) return false;
    try {
      const maxFeeWei = gweiStrToWei(draftMaxFee);
      const priorityWei = gweiStrToWei(draftPriorityFee);
      if (!maxFeeWei || !priorityWei) return false;
      return (
        BigInt(maxFeeWei) >=
        BigInt(estimate.baseFee || "0") + BigInt(priorityWei)
      );
    } catch {
      return false;
    }
  })();
  const draftValidForSet = allDraftFieldsValid && draftMaxFeeCoversBase;

  const handleCancelCustomEditor = useCallback(() => {
    setCustomEditorOpen(false);
  }, []);

  const handleSetCustomGas = useCallback(() => {
    if (!draftValidForSet) return;
    setEditGasLimit(draftGasLimit);
    setEditMaxFee(draftMaxFee);
    setEditPriorityFee(draftPriorityFee);
    setMaxFeeManual(draftMaxFeeManual);
    setTier("custom");
    if (draftUsesPendingDappValues) {
      setDappValuesPendingForCustom(false);
    }
    setCustomEditorOpen(false);
    setExpanded(false);
  }, [
    draftGasLimit,
    draftMaxFee,
    draftMaxFeeManual,
    draftPriorityFee,
    draftUsesPendingDappValues,
    draftValidForSet,
  ]);

  const validForBroadcast =
    !isLocalAccount || // Bankr / impersonator paths don't broadcast through us
    (allFieldsValid && maxFeeCoversBase);

  // Bubble validity to parent so it can disable Confirm.
  useEffect(() => {
    if (onValidityChange) onValidityChange(validForBroadcast);
  }, [validForBroadcast, onValidityChange]);

  // Propagate gas overrides to parent. We always send overrides for local
  // accounts now — even on a fresh confirmation with no edits — because the
  // picker's selected tier IS the source of truth, and viem's auto-estimate
  // (the alternative when overrides=null) is exactly what we're trying to
  // replace.
  useEffect(() => {
    if (!onGasOverrides || !estimate) return;

    if (!isLocalAccount) {
      onGasOverrides(null);
      return;
    }
    if (!validForBroadcast) {
      onGasOverrides(null);
      return;
    }

    const maxFeeWei = gweiStrToWei(editMaxFee);
    const priorityFeeWei = gweiStrToWei(editPriorityFee);
    if (!maxFeeWei || !priorityFeeWei) {
      onGasOverrides(null);
      return;
    }

    onGasOverrides({
      gasLimit: editGasLimit,
      maxFeePerGas: maxFeeWei,
      maxPriorityFeePerGas: priorityFeeWei,
    });
  }, [
    editGasLimit,
    editMaxFee,
    editPriorityFee,
    validForBroadcast,
    estimate,
    isLocalAccount,
    onGasOverrides,
  ]);

  // Total gasLimit (single tx → its limit) for the per-tier cost preview.
  const pickerGasLimit = useMemo(() => {
    if (!editGasLimit) return null;
    try {
      return BigInt(editGasLimit);
    } catch {
      return null;
    }
  }, [editGasLimit]);

  // Compute display cost from current values
  const displayCostWei = (() => {
    if (!estimate) return "0";
    if (allFieldsValid) {
      const maxFeeWei = gweiStrToWei(editMaxFee);
      if (maxFeeWei) {
        return (BigInt(editGasLimit) * BigInt(maxFeeWei)).toString();
      }
    }
    return estimate.estimatedCostWei;
  })();

  const draftDisplayCostWei = (() => {
    if (!estimate || !allDraftFieldsValid) return displayCostWei;
    const maxFeeWei = gweiStrToWei(draftMaxFee);
    if (!maxFeeWei) return displayCostWei;
    return (BigInt(draftGasLimit) * BigInt(maxFeeWei)).toString();
  })();

  if (loading) {
    return (
      <Box
        border="1px solid"
        borderColor="border.default"
        borderRadius="lg"
        bg="surface.raised"
        boxShadow="none"
      >
        <HStack px={3} py={3} justify="center" spacing={3}>
          <ShapesLoader size="6px" />
          <Text fontSize="xs" color="text.secondary" fontWeight="600">
            Estimating gas…
          </Text>
        </HStack>
      </Box>
    );
  }

  if (error && !estimate) {
    return (
      <Box
        border={tokens.borders.medium}
        borderColor="border.default"
        borderRadius="lg"
        bg="surface.raised"
        boxShadow="none"
        px={3}
        py={2}
      >
        <Text fontSize="xs" color="text.tertiary" fontWeight="600">
          Gas estimate unavailable
        </Text>
      </Box>
    );
  }

  if (!estimate) return null;

  const usdDisplay = formatWeiToUsd(displayCostWei, estimate.nativePriceUsd);
  const sym = estimate.nativeCurrencySymbol || "ETH";
  const insufficientBalanceMessage = getInsufficientBalanceMessage([estimate]);
  const editorGasLimit = customEditorOpen ? draftGasLimit : editGasLimit;
  const editorMaxFee = customEditorOpen ? draftMaxFee : editMaxFee;
  const editorPriorityFee = customEditorOpen
    ? draftPriorityFee
    : editPriorityFee;
  const editorMaxFeeManual = customEditorOpen
    ? draftMaxFeeManual
    : maxFeeManual;
  const editorGasLimitValid = customEditorOpen
    ? isDraftGasLimitValid
    : isGasLimitValid;
  const editorMaxFeeValid = customEditorOpen
    ? isDraftMaxFeeValid
    : isMaxFeeValid;
  const editorPriorityFeeValid = customEditorOpen
    ? isDraftPriorityFeeValid
    : isPriorityFeeValid;
  const editorAllFieldsValid = customEditorOpen
    ? allDraftFieldsValid
    : allFieldsValid;
  const editorMaxFeeCoversBase = customEditorOpen
    ? draftMaxFeeCoversBase
    : maxFeeCoversBase;
  const editorCostWei = customEditorOpen
    ? draftDisplayCostWei
    : displayCostWei;
  const editorUsdDisplay = formatWeiToUsd(
    editorCostWei,
    estimate.nativePriceUsd,
  );
  const gasEditorContent = (
    <CustomGasEditor
      gasLimit={editorGasLimit}
      priorityFee={editorPriorityFee}
      maxFee={editorMaxFee}
      baseFee={weiToGweiStr(estimate.baseFee)}
      fiatCost={editorUsdDisplay}
      nativeCost={formatEth(editorCostWei, sym)}
      gasLimitValid={editorGasLimitValid}
      priorityFeeValid={editorPriorityFeeValid}
      maxFeeValid={editorMaxFeeValid}
      allFieldsValid={editorAllFieldsValid}
      maxFeeCoversBase={editorMaxFeeCoversBase}
      maxFeeManual={editorMaxFeeManual}
      showActions={customEditorOpen}
      canSet={draftValidForSet}
      onGasLimitChange={customEditorOpen ? setDraftGasLimit : setEditGasLimit}
      onPriorityFeeChange={
        customEditorOpen
          ? handleDraftPriorityEdit
          : handleAppliedPriorityEdit
      }
      onMaxFeeChange={
        customEditorOpen ? handleDraftMaxFeeEdit : handleAppliedMaxFeeEdit
      }
      onEnableMaxFeeEdit={
        customEditorOpen
          ? handleDraftEnableMaxFeeEdit
          : handleAppliedEnableMaxFeeEdit
      }
      onRelinkMaxFee={
        customEditorOpen
          ? handleDraftRelinkMaxFee
          : handleAppliedRelinkMaxFee
      }
      onCancel={handleCancelCustomEditor}
      onSet={handleSetCustomGas}
    />
  );

  return (
    <VStack spacing={2} align="stretch">
      {estimate.estimationFailed && (
        <RevertWarning
          shortError={estimate.estimationError || "estimation failed"}
          fullError={estimate.estimationErrorFull || estimate.estimationError || "estimation failed"}
        />
      )}

      {insufficientBalanceMessage && !estimate.estimationFailed && (
        <HStack
          bg="accent.highlight"
          border={tokens.borders.medium}
          borderColor="border.default"
          borderRadius="lg"
          boxShadow="card"
          px={3}
          py={2}
          spacing={2}
        >
          <WarningIcon color="accentFg.highlight" boxSize={3.5} />
          <Text fontSize="xs" color="accentFg.highlight" fontWeight="600">
            {insufficientBalanceMessage}
          </Text>
        </HStack>
      )}

      <GasFeePopover
        expanded={expanded}
        fiatFee={usdDisplay}
        nativeFee={formatCompactFee(displayCostWei, sym)}
        tier={showPicker ? tier : undefined}
        onToggle={() => {
          if (expanded) {
            setExpanded(false);
            setCustomEditorOpen(false);
          } else {
            setCustomEditorOpen(false);
            setExpanded(true);
          }
        }}
        onClose={() => {
          setExpanded(false);
          setCustomEditorOpen(false);
        }}
        showPicker={showPicker}
        customEditorOpen={customEditorOpen}
        customEditor={gasEditorContent}
        tiers={estimate.tiers}
        gasLimit={pickerGasLimit}
        nativePriceUsd={estimate.nativePriceUsd}
        nativeCurrencySymbol={sym}
        selectedTier={tier}
        onTierChange={handleTierChange}
        customBadge={estimate.dappProvidedGas ? "Dapp suggested" : undefined}
        fallbackContent={
          <VStack align="stretch" spacing={1.5}>
            {showCustomEditor ? (
              gasEditorContent
            ) : (
              <>
                <GasRow label="Gas Limit" value={estimate.gasLimit} />
                <GasRow
                  label="Max Priority Fee"
                  value={formatGwei(estimate.maxPriorityFeePerGas)}
                />
                <GasRow
                  label="Max Fee"
                  value={formatGwei(estimate.maxFeePerGas)}
                />
                <GasRow label="Base Fee" value={formatGwei(estimate.baseFee)} />
                <Box h="1px" bg="border.subtle" />
                <HStack justify="space-between" align="center" spacing={3}>
                  <Text fontSize="xs" color="text.secondary" fontWeight="600">
                    Estimated max
                  </Text>
                  <VStack align="flex-end" spacing={0} minW={0}>
                    <Text fontSize="xs" color="text.primary" fontWeight="700" noOfLines={1}>
                      {usdDisplay || formatEth(displayCostWei, sym)}
                    </Text>
                    {usdDisplay && (
                      <Text fontSize="2xs" color="text.tertiary" fontFamily="mono" noOfLines={1}>
                        {formatEth(displayCostWei, sym)}
                      </Text>
                    )}
                  </VStack>
                </HStack>
              </>
            )}
            {accountType === "bankr" && (
              <Text fontSize="2xs" color="text.tertiary" fontWeight="600" fontStyle="italic">
                Gas managed by Bankr API
              </Text>
            )}
          </VStack>
        }
      />
    </VStack>
  );
}

export default memo(GasEstimateDisplay);
