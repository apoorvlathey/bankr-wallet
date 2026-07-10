import { useState, useEffect, useCallback, memo, useMemo } from "react";
import {
  Box,
  VStack,
  HStack,
  Text,
  Spinner,
  Collapse,
  Button,
  Input,
  IconButton,
  Tooltip,
  Icon,
  usePrefersReducedMotion,
} from "@chakra-ui/react";
import {
  ChevronDownIcon,
  WarningIcon,
  CopyIcon,
  CheckIcon,
} from "@chakra-ui/icons";
import { PendingTxRequest } from "@/chrome/pendingTxStorage";
import { GasEstimate, GasEstimateTier } from "@/chrome/gasEstimation";
import { GasOverrides } from "@/chrome/txHandlers";
import { formatEth, formatGwei, formatWeiToUsd } from "@/lib/gasFormatUtils";
import { useTheme } from "@/theme";
import GasTierPicker from "./GasTierPicker";
import {
  DEFAULT_TIER,
  getStoredGasTier,
  setStoredGasTier,
  type GasTierSelection,
} from "@/lib/gasTiers";
import { useScreenEntered } from "@/components/ScreenTransition";

// Small chain-link icon — used as the visual cue for "Max Fee follows
// Priority Fee" auto-derivation. Inline SVG so we can size it tightly next
// to the "Auto" badge text.
const ChainLinkIcon = (props: any) => (
  <Icon viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z" />
  </Icon>
);

// Pencil icon for the "Edited" / manually-overridden state.
const PencilIcon = (props: any) => (
  <Icon viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
  </Icon>
);

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

function EditableGasRow({
  label,
  value,
  onChange,
  suffix,
  isInvalid,
  rightAdornment,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  suffix: string;
  isInvalid?: boolean;
  rightAdornment?: React.ReactNode;
}) {
  return (
    <HStack justify="space-between" w="full">
      <HStack spacing={1.5} minW={0}>
        <Text fontSize="xs" color="text.tertiary" fontWeight="600">
          {label}
        </Text>
        {rightAdornment}
      </HStack>
      <HStack spacing={1}>
        <Input
          size="xs"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          w="100px"
          textAlign="right"
          fontFamily="mono"
          fontWeight="700"
          fontSize="xs"
          isInvalid={isInvalid}
          px={2}
          h="24px"
        />
        <Text fontSize="xs" color="text.tertiary" fontWeight="600" minW="35px">
          {suffix}
        </Text>
      </HStack>
    </HStack>
  );
}

/** Format USD price for display */
/** Convert wei string to gwei display string */
function weiToGweiStr(wei: string): string {
  const gwei = Number(BigInt(wei)) / 1e9;
  if (gwei === 0) return "0";
  return gwei.toFixed(9).replace(/0+$/, "").replace(/\.$/, "");
}

/** Convert gwei display string to wei string (returns null if invalid) */
function gweiStrToWei(gweiStr: string): string | null {
  const val = Number(gweiStr);
  if (isNaN(val) || val < 0) return null;
  try {
    // Convert gwei to wei: multiply by 1e9
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
  const prefersReducedMotion = usePrefersReducedMotion();

  // Tier picker state. Lives across estimate refreshes (e.g., when forceInclusion
  // toggles) so the user's choice doesn't reset under their feet.
  const [tier, setTier] = useState<GasTierSelection>(DEFAULT_TIER);
  // Rehydrate the user's last preset choice from chrome.storage.sync.
  useEffect(() => {
    let cancelled = false;
    getStoredGasTier().then((stored) => {
      if (!cancelled) setTier(stored);
    });
    return () => { cancelled = true; };
  }, []);

  // Editable fields (gwei strings for fees, decimal string for gas limit).
  // Always populated, even on preset tiers — so flipping Custom shows the
  // current preset values and the user can fine-tune from there.
  const [editGasLimit, setEditGasLimit] = useState("");
  const [editMaxFee, setEditMaxFee] = useState("");
  const [editPriorityFee, setEditPriorityFee] = useState("");
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
  const showCustomEditor = isLocalAccount && (tier === "custom" || !showPicker);

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

  // When the user picks a preset tier, repopulate the editable fields from
  // the cached tiers and clear the sticky-manual flag so Custom starts linked
  // again next time the user opens it.
  const handleTierChange = useCallback(
    (next: GasTierSelection) => {
      setTier(next);
      setStoredGasTier(next);
      if (next !== "custom" && estimate?.tiers) {
        const t = estimate.tiers[next];
        setEditMaxFee(weiToGweiStr(t.maxFeePerGas));
        setEditPriorityFee(weiToGweiStr(t.maxPriorityFeePerGas));
        setMaxFeeManual(false);
      } else if (next === "custom" && dappValuesPendingForCustom && estimate) {
        // First visit to Custom after we auto-switched away from a
        // dapp-suggested-but-unusable default. Re-seed with the dapp's
        // values so the user can review/edit them.
        setEditMaxFee(weiToGweiStr(estimate.maxFeePerGas));
        setEditPriorityFee(weiToGweiStr(estimate.maxPriorityFeePerGas));
        setMaxFeeManual(false);
        setDappValuesPendingForCustom(false);
      }
    },
    [estimate, dappValuesPendingForCustom],
  );

  // Custom-mode coupling: editing Priority recomputes Max Fee unless the
  // user has explicitly edited Max Fee since the last relink.
  const handlePriorityEdit = useCallback(
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

  const handleMaxFeeEdit = useCallback((val: string) => {
    setEditMaxFee(val);
    setMaxFeeManual(true);
  }, []);

  const handleRelinkMaxFee = useCallback(() => {
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

  // Loading state
  if (loading) {
    return (
      <Box
        border="1px solid"
        borderColor="border.default"
        borderRadius="lg"
        bg="surface.raised"
        boxShadow="none"
      >
        <HStack px={3} py={3} justify="center">
          <Spinner size="xs" color="accent.secondary" />
          <Text fontSize="xs" color="text.secondary" fontWeight="600">
            Estimating gas…
          </Text>
        </HStack>
      </Box>
    );
  }

  // Error state (non-blocking)
  if (error && !estimate) {
    return (
      <Box
        border={tokens.borders.medium}
        borderColor="border.default"
        borderRadius="lg"
        bg="surface.raised"
        boxShadow="card"
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

  return (
    <VStack spacing={2} align="stretch">
      {/* Revert warning */}
      {estimate.estimationFailed && (
        <RevertWarning
          shortError={estimate.estimationError || "estimation failed"}
          fullError={estimate.estimationErrorFull || estimate.estimationError || "estimation failed"}
        />
      )}

      {/* Insufficient balance warning */}
      {estimate.insufficientBalance && !estimate.estimationFailed && (
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
            Insufficient balance for gas
          </Text>
        </HStack>
      )}

      {/* Force inclusion L1 gas banner */}
      {forceInclusion && (
        <Box
          bg="accent.secondary"
          border={tokens.borders.thin}
          borderColor="border.default"
          borderRadius="md"
          px={3}
          py={1.5}
        >
          <Text fontSize="2xs" color="accentFg.secondary" fontWeight="600">
            Gas estimated for L1 deposit transaction
          </Text>
        </Box>
      )}

      {/* Gas estimate box */}
      <Box
        border={tokens.borders.medium}
        borderColor="border.default"
        borderRadius="lg"
        // overflow:hidden clips the header's hover bg to the card's rounded
        // corners. Without it, the inner HStack hover fill renders as a sharp
        // rectangle inside the rounded outer Box and leaks square corners
        // (most visible on Midnight, where the hover tint is most saturated).
        overflow="hidden"
        bg="surface.raised"
        boxShadow="card"
        position="relative"
      >
        {/* Collapsed header */}
        <Button
          type="button"
          variant="unstyled"
          display="flex"
          w="full"
          minH="44px"
          h="auto"
          px={3}
          py={2.5}
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          aria-controls="gas-fee-details"
          borderRadius={0}
          fontWeight="inherit"
          textTransform="none"
          _hover={{ bg: "surface.raisedHover" }}
          justifyContent="space-between"
        >
          <Text fontSize="xs" color="text.secondary" fontWeight="600" flexShrink={0}>
            Gas fee
          </Text>
          <HStack spacing={1} minW={0}>
            <Text fontSize="xs" fontWeight="700" color="text.primary" fontFamily="mono" noOfLines={1}>
              {formatEth(displayCostWei, sym)}
            </Text>
            {usdDisplay && (
              <Text fontSize="xs" color="text.tertiary" fontWeight="600">
                ({usdDisplay})
              </Text>
            )}
            <ChevronDownIcon
              boxSize={4}
              color="text.tertiary"
              transform={expanded ? "rotate(180deg)" : "rotate(0deg)"}
              transition={prefersReducedMotion ? "none" : "transform 150ms cubic-bezier(0.23, 1, 0.32, 1)"}
              aria-hidden
            />
          </HStack>
        </Button>

        {/* Expanded details */}
        <Collapse id="gas-fee-details" in={expanded} animateOpacity={!prefersReducedMotion}>
          <VStack align="stretch" spacing={1.5} px={3} pb={3} pt={1}>
            <Box h="1px" bg="border.subtle" />

            {showPicker && (
              <GasTierPicker
                tiers={estimate.tiers}
                gasLimit={pickerGasLimit}
                nativePriceUsd={estimate.nativePriceUsd}
                nativeCurrencySymbol={sym}
                selected={tier}
                onChange={handleTierChange}
              />
            )}

            {showCustomEditor ? (
              <>
                <EditableGasRow
                  label="Gas Limit"
                  value={editGasLimit}
                  onChange={(v) => setEditGasLimit(v)}
                  suffix=""
                  isInvalid={!isGasLimitValid}
                />
                <EditableGasRow
                  label="Max Priority Fee"
                  value={editPriorityFee}
                  onChange={handlePriorityEdit}
                  suffix="Gwei"
                  isInvalid={!isPriorityFeeValid}
                />
                <EditableGasRow
                  label="Max Fee"
                  value={editMaxFee}
                  onChange={handleMaxFeeEdit}
                  suffix="Gwei"
                  isInvalid={!isMaxFeeValid}
                  rightAdornment={
                    estimate.predictedNextBaseFee ? (
                      maxFeeManual ? (
                        // Manual state: explicit "Edited" pill + reset button.
                        // Click the whole pill to relink — single, obvious
                        // affordance instead of a tiny standalone repeat icon.
                        <Tooltip
                          label="You edited Max Fee. Click to auto-link it back to Priority Fee."
                          fontSize="2xs"
                          hasArrow
                          openDelay={300}
                        >
                          <HStack
                            as="button"
                            type="button"
                            aria-label="Auto-link Max Fee to Priority Fee"
                            onClick={handleRelinkMaxFee}
                            spacing={1}
                            px={1.5}
                            py={0.5}
                            minH="24px"
                            borderRadius="md"
                            bg="accent.highlight"
                            cursor="pointer"
                            _hover={{ filter: "brightness(0.95)" }}
                            _focus={{ outline: "none" }}
                            _focusVisible={{ boxShadow: "focus" }}
                            transition="filter 100ms ease-out"
                          >
                            <PencilIcon boxSize="9px" color="accentFg.highlight" />
                            <Text
                              fontSize="2xs"
                              fontWeight="700"
                              textTransform="uppercase"
                              color="accentFg.highlight"
                              letterSpacing="wide"
                            >
                              Edited
                            </Text>
                          </HStack>
                        </Tooltip>
                      ) : (
                        // Linked / auto state: subtle informational badge.
                        // No click target — there's nothing to do here,
                        // editing Max Fee directly will switch to Edited.
                        <Tooltip
                          label="Max Fee follows your Priority Fee changes."
                          fontSize="2xs"
                          hasArrow
                          openDelay={300}
                        >
                          <HStack spacing={1} color="text.tertiary">
                            <ChainLinkIcon boxSize="9px" />
                            <Text
                              fontSize="2xs"
                              fontWeight="700"
                              textTransform="uppercase"
                              letterSpacing="wide"
                            >
                              Auto
                            </Text>
                          </HStack>
                        </Tooltip>
                      )
                    ) : undefined
                  }
                />
              </>
            ) : (
              <>
                <GasRow label="Gas Limit" value={estimate.gasLimit} />
                {(() => {
                  // Resolve the fees to display for the currently selected
                  // preset tier. Falling back to `estimate.maxFeePerGas` is
                  // wrong here when the dapp suggested unusable fees — the
                  // raw estimate carries those values, not the active
                  // tier's, so the user would see "0" priority while the
                  // picker says "Standard".
                  const fees =
                    tier !== "custom" && estimate.tiers
                      ? estimate.tiers[tier]
                      : { maxFeePerGas: estimate.maxFeePerGas, maxPriorityFeePerGas: estimate.maxPriorityFeePerGas };
                  return (
                    <>
                      <GasRow
                        label="Max Priority Fee"
                        value={formatGwei(fees.maxPriorityFeePerGas)}
                      />
                      <GasRow
                        label="Max Fee"
                        value={formatGwei(fees.maxFeePerGas)}
                      />
                    </>
                  );
                })()}
              </>
            )}

            <GasRow label="Base Fee" value={formatGwei(estimate.baseFee)} />

            <Box h="1px" bg="border.subtle" mt={0.5} />

            <GasRow
              label="Estimated Cost"
              value={`${formatEth(displayCostWei, sym)}${usdDisplay ? ` (${usdDisplay})` : ""}`}
            />

            {estimate.dappProvidedGas && tier === "custom" && (
              // Only display the badge while we're actually using the dapp's
              // values (Custom tier with the prefilled inputs). Picking
              // Slow/Standard/Fast overrides the dapp's suggestion, so the
              // label would otherwise mislead the user about what's about to
              // be broadcast.
              <Text fontSize="2xs" color="accent.secondary" fontWeight="700">
                Custom uses gas params suggested by dapp
              </Text>
            )}

            {accountType === "bankr" && (
              <Text fontSize="2xs" color="text.tertiary" fontWeight="600" fontStyle="italic">
                Gas managed by Bankr API
              </Text>
            )}

            {isLocalAccount && allFieldsValid && !maxFeeCoversBase && (
              <Text fontSize="2xs" color="status.error.fg" fontWeight="700">
                Max Fee must be at least Base Fee + Priority Fee
              </Text>
            )}
            {isLocalAccount && !allFieldsValid && (
              <Text fontSize="2xs" color="status.error.fg" fontWeight="700">
                Invalid gas parameters
              </Text>
            )}
          </VStack>
        </Collapse>
      </Box>
    </VStack>
  );
}

export default memo(GasEstimateDisplay);
