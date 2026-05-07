import { useState, useEffect, useMemo, useCallback, memo } from "react";
import {
  Box,
  VStack,
  HStack,
  Text,
  Spinner,
  Collapse,
  Input,
  IconButton,
  Tooltip,
  Icon,
} from "@chakra-ui/react";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  WarningIcon,
  ExternalLinkIcon,
} from "@chakra-ui/icons";
import { GasEstimate } from "@/chrome/gasEstimation";
import { formatEth, formatGwei } from "@/lib/gasFormatUtils";
import { getChainConfig } from "@/constants/chainConfig";
import { useNetworks } from "@/contexts/NetworksContext";
import { getResolvedChainById } from "@/lib/chains";
import { useTheme } from "@/theme";
import GasTierPicker from "./GasTierPicker";
import {
  DEFAULT_TIER,
  getStoredGasTier,
  setStoredGasTier,
  type GasTierSelection,
} from "@/lib/gasTiers";

// Inline icons for the Auto / Edited badge — kept in sync with
// GasEstimateDisplay.tsx so single-tx and batch UX read identically.
const ChainLinkIcon = (props: any) => (
  <Icon viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z" />
  </Icon>
);

const PencilIcon = (props: any) => (
  <Icon viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
  </Icon>
);

interface TxGasInput {
  tx: { from: string; to: string; data: string; value: string; chainId: number };
  label: string;
}

interface MultiTxGasEstimateDisplayProps {
  transactions: TxGasInput[];
  accountType: "bankr" | "privateKey" | "seedPhrase" | "impersonator";
  /** If provided, estimate gas for this single batch tx instead of individual txs */
  batchedTx?: TxGasInput;
  /** Use sequential gas estimation (eth_simulateV1 → Tevm fallback) for non-atomic batches */
  isNonAtomic?: boolean;
  onInsufficientBalance?: (insufficient: boolean) => void;
  /**
   * Callback fired with the gas estimates that should be passed to the confirm handler.
   *
   * For normal non-atomic batch: estimates contain L2 gas + L2 fees (used for signing each tx)
   * For force inclusion non-atomic batch: estimates contain L2 gas in `gasLimit` field only
   *   (background uses it as `l2GasOverride` for the portal `_gasLimit`; fees are recomputed
   *   on L1 at broadcast time)
   */
  onGasEstimates?: (estimates: GasEstimate[]) => void;
  /**
   * Reports whether the current gas params are valid for broadcast — bubbled
   * to the parent confirm UI so it can disable the Confirm button while the
   * Custom-tier editor is in an inconsistent state.
   */
  onValidityChange?: (valid: boolean) => void;
  /** When true, estimate gas for L1 deposit transactions (force inclusion) */
  forceInclusion?: boolean;
}

/**
 * Replace the space AFTER short prepositions with a non-breaking space so
 * orphan words like "for" / "to" / "on" stay glued to the noun that follows
 * when the label wraps. CSS can break anywhere whitespace allows — this
 * makes "Approve USDC for swap" wrap to "Approve USDC / for swap" instead
 * of the more awkward "Approve USDC for / swap".
 *
 * Conservative list: only short, semantically-light prepositions where
 * splitting them off the following word reads as bad typography. We don't
 * touch verbs/longer particles since their orphaning is rarely awkward.
 */
function preserveOrphans(label: string): string {
  return label.replace(
    /\s(for|to|on|at|in|with|of|by|from|into|via)\s/gi,
    " $1 ",
  );
}

/** Convert wei string to gwei display string */
function weiToGweiStr(wei: string): string {
  try {
    const gwei = Number(BigInt(wei)) / 1e9;
    if (gwei === 0) return "0";
    return gwei.toFixed(9).replace(/0+$/, "").replace(/\.$/, "");
  } catch {
    return "0";
  }
}

/** Convert gwei display string to wei string (returns null if invalid) */
function gweiStrToWei(gweiStr: string): string | null {
  const val = Number(gweiStr);
  if (isNaN(val) || val < 0) return null;
  try {
    return BigInt(Math.round(val * 1e9)).toString();
  } catch {
    return null;
  }
}

/**
 * Same Custom-mode coupling rule as the single-tx editor (see
 * GasEstimateDisplay.tsx). Kept inline rather than extracted because the
 * batch and single-tx UIs have meaningfully different surrounding state.
 */
function deriveBatchMaxFee(
  priorityWei: bigint,
  predictedNextBaseFee: bigint,
): bigint {
  return (predictedNextBaseFee * 150n) / 100n + priorityWei;
}

/** Format USD from wei + price */
function formatUsd(weiStr: string, priceUsd: number | null): string | null {
  if (priceUsd === null) return null;
  const eth = Number(BigInt(weiStr)) / 1e18;
  const usd = eth * priceUsd;
  if (usd < 0.01 && usd > 0) return "<$0.01";
  return `~$${usd.toFixed(2)}`;
}

function EditableGasLimitInput({
  value,
  onChange,
  isInvalid,
  isWarning,
}: {
  value: string;
  onChange: (val: string) => void;
  isInvalid?: boolean;
  /** Row used a hardcoded fallback because estimation failed — highlight for user attention */
  isWarning?: boolean;
}) {
  const { tokens } = useTheme();
  // chart.negative resolves to RED in Bauhaus (matches the historic warning
  // border) and to a bright red in Midnight — unlike status.error.fg which is
  // white in Bauhaus and would vanish here.
  const borderColor = isInvalid
    ? "chart.negative"
    : isWarning
      ? "accent.highlight"
      : "border.default";
  // Soft warning tint for the fallback row — sourced from status.warning.tint
  // (Bauhaus = cream wash, Midnight = recessed surface).
  const bg = isWarning && !isInvalid ? "status.warning.tint" : "surface.raised";
  return (
    <Input
      size="xs"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      w="90px"
      textAlign="right"
      fontFamily="mono"
      fontWeight="700"
      fontSize="xs"
      border={tokens.borders.thin}
      borderColor={borderColor}
      borderRadius={tokens.radii.input}
      bg={bg}
      px={2}
      h="22px"
      _focus={{
        borderColor: isInvalid ? "chart.negative" : "accent.secondary",
        boxShadow: "none",
      }}
    />
  );
}

function isValidGasLimit(val: string): boolean {
  const n = Number(val);
  return !isNaN(n) && n > 0 && Number.isInteger(n);
}

function MultiTxGasEstimateDisplay({
  transactions,
  accountType,
  batchedTx,
  isNonAtomic,
  onInsufficientBalance,
  onGasEstimates,
  onValidityChange,
  forceInclusion,
}: MultiTxGasEstimateDisplayProps) {
  const { tokens } = useTheme();
  // Display estimates — what the user sees
  //   Normal batch: from estimateBatchGasSequential (L2 gas + L2 fees)
  //   Force inclusion: from estimateForceInclusionGas per call (L1 gas + L1 fees)
  //   Atomic/individual: from estimateGas per tx (L2 gas + L2 fees)
  const [estimates, setEstimates] = useState<(GasEstimate | null)[]>([]);

  // Pass-through estimates — what's fired via onGasEstimates
  //   Normal batch: same as `estimates` (L2 gas + L2 fees, background uses both)
  //   Force inclusion: from estimateBatchGasSequential separately (L2 gas; background only uses gasLimit)
  //   Atomic: null (Bankr manages gas)
  const [passthroughEstimates, setPassthroughEstimates] = useState<GasEstimate[] | null>(null);

  // User-editable gas limits per call (always the L2 gas limit)
  //   Normal batch: the gas limit on each L2 tx
  //   Force inclusion: the `_gasLimit` field baked into the portal call
  const [editedGasLimits, setEditedGasLimits] = useState<string[]>([]);
  const [hasEdited, setHasEdited] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  // Whether we've already auto-expanded for a fallback warning (so we don't
  // keep re-expanding if the user manually collapses)
  const [autoExpanded, setAutoExpanded] = useState(false);

  // Tier picker state for non-atomic PK/SP batches. One shared selection
  // applies to ALL calls in the batch — sequential nonces mean a per-call
  // tier choice can't actually reorder execution, so a single picker matches
  // the user's mental model ("the batch is too slow → bump the whole thing").
  const [tier, setTier] = useState<GasTierSelection>(DEFAULT_TIER);
  // Shared Custom-tier fee inputs (gwei strings).
  const [editPriority, setEditPriority] = useState("");
  const [editMaxFee, setEditMaxFee] = useState("");
  // Sticky-edit flag: stops auto-deriving Max Fee once the user touches it.
  const [maxFeeManual, setMaxFeeManual] = useState(false);

  // Rehydrate the user's last preset choice. Re-runs on mount only.
  useEffect(() => {
    let cancelled = false;
    getStoredGasTier().then((stored) => {
      if (!cancelled) setTier(stored);
    });
    return () => { cancelled = true; };
  }, []);

  const isEditable =
    (accountType === "privateKey" || accountType === "seedPhrase") &&
    // Only per-call batches can be edited — atomic Bankr batches are managed server-side
    !batchedTx;

  // Resolve explorer for the chain the batch is on (all calls share the same chainId).
  // Prefers user-configured custom chain explorer, falls back to the built-in static config.
  const { networksInfo } = useNetworks();
  const chainIdForExplorer = transactions[0]?.tx.chainId;
  const explorerBase = useMemo(() => {
    if (chainIdForExplorer == null) return "";
    return (
      getResolvedChainById(chainIdForExplorer, networksInfo)?.explorer ||
      getChainConfig(chainIdForExplorer).explorer ||
      ""
    );
  }, [chainIdForExplorer, networksInfo]);

  // Determine what to estimate for display
  const toEstimate: TxGasInput[] = batchedTx ? [batchedTx] : transactions;

  // Stable key for dependency — only re-run when actual tx data changes
  const estimateKey = useMemo(
    () => toEstimate.map((t) => t.tx.to + t.tx.data).join(",") + (isNonAtomic ? ":na" : "") + (forceInclusion ? ":fi" : ""),
    [toEstimate.map((t) => t.tx.to + t.tx.data).join(","), isNonAtomic, forceInclusion],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setEstimates([]);
    setPassthroughEstimates(null);
    setEditedGasLimits([]);
    setHasEdited(false);
    setAutoExpanded(false);

    if (forceInclusion) {
      // Force inclusion: fetch BOTH in parallel
      //   1. estimateForceInclusionGas per call — for L1 cost display
      //   2. estimateBatchGasSequential — for the editable L2 `_gasLimit` baked into the portal
      const l1CostPromises = toEstimate.map(
        (item) =>
          new Promise<GasEstimate | null>((resolve) => {
            chrome.runtime.sendMessage(
              {
                type: "estimateForceInclusionGas",
                tx: item.tx,
                accountAddress: item.tx.from,
              },
              (result: GasEstimate) => {
                if (chrome.runtime.lastError) {
                  resolve(null);
                  return;
                }
                resolve(result);
              },
            );
          }),
      );

      const l2GasPromise = new Promise<GasEstimate[] | null>((resolve) => {
        if (batchedTx) {
          // Atomic-encoded batch: no per-call L2 estimation, skip (not editable anyway)
          resolve(null);
          return;
        }
        const calls = transactions.map((t) => ({
          to: t.tx.to,
          data: t.tx.data,
          value: t.tx.value,
        }));
        chrome.runtime.sendMessage(
          {
            type: "estimateBatchGasSequential",
            calls,
            fromAddress: transactions[0]?.tx.from,
            chainId: transactions[0]?.tx.chainId,
          },
          (results: GasEstimate[]) => {
            if (chrome.runtime.lastError || !results) {
              resolve(null);
              return;
            }
            resolve(results);
          },
        );
      });

      Promise.all([Promise.all(l1CostPromises), l2GasPromise]).then(([l1Results, l2Results]) => {
        if (cancelled) return;
        setEstimates(l1Results);
        setLoading(false);

        const hasEstimates = l1Results.some((r) => r !== null);
        if (!hasEstimates) {
          setError("Gas estimate unavailable");
        }

        if (onInsufficientBalance) {
          const anyInsufficient = l1Results.some((r) => r?.insufficientBalance);
          onInsufficientBalance(!!anyInsufficient);
        }

        // Editable L2 gas limits come from estimateBatchGasSequential.
        // These get passed to the background as the portal `_gasLimit` override.
        if (l2Results && isEditable) {
          setPassthroughEstimates(l2Results);
          setEditedGasLimits(l2Results.map((e) => e.gasLimit));
        }
      });
    } else if (isNonAtomic) {
      // Non-atomic: use sequential estimation (eth_simulateV1 → per-call estimateGas)
      // so each call sees state changes from prior calls
      const calls = transactions.map((t) => ({
        to: t.tx.to,
        data: t.tx.data,
        value: t.tx.value,
      }));

      chrome.runtime.sendMessage(
        {
          type: "estimateBatchGasSequential",
          calls,
          fromAddress: transactions[0]?.tx.from,
          chainId: transactions[0]?.tx.chainId,
        },
        (results: GasEstimate[]) => {
          if (cancelled) return;
          if (chrome.runtime.lastError || !results) {
            setError("Gas estimate unavailable");
            setLoading(false);
            return;
          }
          // Apply dapp-provided gas as a floor on each estimate. Without this,
          // a low local simulation (eth_simulateV1 has been observed ~25%
          // under real need on Base for V4-with-hooks calls — likely a
          // gas-accounting quirk in the simulator's handling of dynamic
          // hook gas) would silently downgrade a correct dapp/API gas value
          // at signing time. Taking the max is safe: unused gas refunds on
          // Base, and the user can still edit downward in the picker.
          const floored = results.map((r, i) => {
            const dappGasStr = transactions[i]?.tx.gas;
            if (!dappGasStr) return r;
            try {
              const dappGas = BigInt(dappGasStr);
              const simGas = BigInt(r.gasLimit);
              return dappGas > simGas
                ? { ...r, gasLimit: dappGas.toString() }
                : r;
            } catch {
              return r;
            }
          });
          setEstimates(floored);
          setPassthroughEstimates(floored);
          setEditedGasLimits(floored.map((e) => e.gasLimit));
          // Seed Custom-tier shared inputs from the first call's standard
          // tier (or its raw fees when tiers are absent). All calls share
          // the same fee market, so it's correct to seed from index 0.
          const seed = results[0];
          if (seed) {
            const seedFees = seed.tiers?.standard ?? {
              maxFeePerGas: seed.maxFeePerGas,
              maxPriorityFeePerGas: seed.maxPriorityFeePerGas,
            };
            setEditPriority(weiToGweiStr(seedFees.maxPriorityFeePerGas));
            setEditMaxFee(weiToGweiStr(seedFees.maxFeePerGas));
            setMaxFeeManual(false);
          }
          setLoading(false);

          if (onInsufficientBalance) {
            const anyInsufficient = results.some((r) => r?.insufficientBalance);
            onInsufficientBalance(!!anyInsufficient);
          }
        },
      );
    } else {
      // Atomic or individual: estimate each tx independently
      const promises = toEstimate.map(
        (item) =>
          new Promise<GasEstimate | null>((resolve) => {
            chrome.runtime.sendMessage(
              {
                type: "estimateGas",
                tx: item.tx,
                accountAddress: item.tx.from,
              },
              (result: GasEstimate) => {
                if (chrome.runtime.lastError) {
                  resolve(null);
                  return;
                }
                resolve(result);
              },
            );
          }),
      );

      Promise.all(promises).then((results) => {
        if (cancelled) return;
        setEstimates(results);
        setLoading(false);

        const hasEstimates = results.some((r) => r !== null);
        if (!hasEstimates) {
          setError("Gas estimate unavailable");
        }

        if (onInsufficientBalance) {
          const anyInsufficient = results.some((r) => r?.insufficientBalance);
          onInsufficientBalance(!!anyInsufficient);
        }
      });
    }

    return () => {
      cancelled = true;
    };
    // estimateKey is a memoized digest of all the inputs that should trigger
    // a re-fetch (tx data, isNonAtomic, forceInclusion). Listing the raw
    // variables individually would re-fire on every parent render because
    // arrays/callbacks change identity each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estimateKey]);

  // Picker is shown only for non-atomic PK/SP batches with tier data and
  // not in force-inclusion mode (force inclusion uses L1 fees recomputed at
  // broadcast). Atomic Bankr batches keep their server-managed gas UX.
  const showPicker =
    isEditable &&
    !forceInclusion &&
    !!passthroughEstimates &&
    !!passthroughEstimates[0]?.tiers;
  const showCustomEditor = showPicker && tier === "custom";

  // The fees that should be applied to every call in the batch. Derived from
  // the tier selection plus the (possibly edited) Custom inputs.
  const appliedFees = useMemo<{
    maxFeePerGas: string;
    maxPriorityFeePerGas: string;
  } | null>(() => {
    if (!passthroughEstimates || passthroughEstimates.length === 0) return null;
    const seed = passthroughEstimates[0];
    if (tier !== "custom" && seed.tiers) {
      const t = seed.tiers[tier];
      return {
        maxFeePerGas: t.maxFeePerGas,
        maxPriorityFeePerGas: t.maxPriorityFeePerGas,
      };
    }
    if (tier === "custom") {
      const maxFeeWei = gweiStrToWei(editMaxFee);
      const priorityWei = gweiStrToWei(editPriority);
      if (!maxFeeWei || !priorityWei) return null;
      return { maxFeePerGas: maxFeeWei, maxPriorityFeePerGas: priorityWei };
    }
    // tier !== custom but no tiers data — fall back to whatever the estimate
    // already had (likely standard tier from estimateFees default).
    return {
      maxFeePerGas: seed.maxFeePerGas,
      maxPriorityFeePerGas: seed.maxPriorityFeePerGas,
    };
  }, [tier, passthroughEstimates, editMaxFee, editPriority]);

  // Custom-tier validation — same rule as single-tx editor.
  const isCustomFeeValid = useMemo(() => {
    if (tier !== "custom") return true;
    if (!passthroughEstimates || passthroughEstimates.length === 0) return false;
    const seed = passthroughEstimates[0];
    const maxFeeWei = gweiStrToWei(editMaxFee);
    const priorityWei = gweiStrToWei(editPriority);
    if (!maxFeeWei || !priorityWei) return false;
    if (BigInt(maxFeeWei) <= 0n) return false;
    const baseFeeWei = BigInt(seed.baseFee || "0");
    return BigInt(maxFeeWei) >= baseFeeWei + BigInt(priorityWei);
  }, [tier, passthroughEstimates, editMaxFee, editPriority]);

  // Propagate (possibly edited) gas estimates to the parent. Includes the
  // tier-selected fees so all calls get the same Priority / Max Fee.
  // onGasEstimates is intentionally NOT in deps — parent passes a useState
  // setter (stable identity), so re-firing on identity changes would only
  // create extra renders without changing behavior.
  useEffect(() => {
    if (!onGasEstimates) return;
    if (!passthroughEstimates || passthroughEstimates.length === 0) return;

    const allValid = editedGasLimits.every(isValidGasLimit);
    if (!allValid) return;
    if (!isCustomFeeValid) return;

    const merged = passthroughEstimates.map((est, i) => ({
      ...est,
      gasLimit: editedGasLimits[i] || est.gasLimit,
      // Apply tier-selected fees uniformly. For force-inclusion the
      // background recomputes fees on L1 anyway, so this is harmless.
      ...(appliedFees && {
        maxFeePerGas: appliedFees.maxFeePerGas,
        maxPriorityFeePerGas: appliedFees.maxPriorityFeePerGas,
      }),
    }));
    onGasEstimates(merged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passthroughEstimates, editedGasLimits, appliedFees, isCustomFeeValid]);

  // Bubble validity to the parent confirm button.
  // We gate on three things: estimation is done (loading=false), at least one
  // gas limit is populated (`editedGasLimits.length > 0`), and every populated
  // limit parses as a valid number. The length check matters: `[].every()`
  // returns `true` (vacuous), which would otherwise enable the Confirm button
  // before the first estimate has landed — letting a fast click submit with
  // dapp-provided gas (sometimes too low) and skip our local revert detection.
  // Non-editable surfaces (Bankr-managed gas) bypass these checks entirely.
  useEffect(() => {
    if (!onValidityChange) return;
    if (!isEditable) {
      onValidityChange(true);
      return;
    }
    if (loading) {
      onValidityChange(false);
      return;
    }
    const hasEstimates = editedGasLimits.length > 0;
    const allLimitsValid =
      hasEstimates && editedGasLimits.every(isValidGasLimit);
    onValidityChange(allLimitsValid && isCustomFeeValid);
  }, [editedGasLimits, isCustomFeeValid, isEditable, loading, onValidityChange]);

  const handleEditGasLimit = useCallback((index: number, val: string) => {
    setEditedGasLimits((prev) => {
      const next = [...prev];
      next[index] = val;
      return next;
    });
    setHasEdited(true);
  }, []);

  const handleTierChange = useCallback(
    (next: GasTierSelection) => {
      setTier(next);
      setStoredGasTier(next);
      if (
        next !== "custom" &&
        passthroughEstimates &&
        passthroughEstimates[0]?.tiers
      ) {
        const t = passthroughEstimates[0].tiers[next];
        setEditPriority(weiToGweiStr(t.maxPriorityFeePerGas));
        setEditMaxFee(weiToGweiStr(t.maxFeePerGas));
        setMaxFeeManual(false);
      }
    },
    [passthroughEstimates],
  );

  const handlePriorityEdit = useCallback(
    (val: string) => {
      setEditPriority(val);
      const seed = passthroughEstimates?.[0];
      if (!maxFeeManual && seed?.predictedNextBaseFee) {
        const priorityWei = gweiStrToWei(val);
        if (priorityWei !== null) {
          const derived = deriveBatchMaxFee(
            BigInt(priorityWei),
            BigInt(seed.predictedNextBaseFee),
          );
          setEditMaxFee(weiToGweiStr(derived.toString()));
        }
      }
    },
    [maxFeeManual, passthroughEstimates],
  );

  const handleMaxFeeEdit = useCallback((val: string) => {
    setEditMaxFee(val);
    setMaxFeeManual(true);
  }, []);

  const handleRelinkMaxFee = useCallback(() => {
    const seed = passthroughEstimates?.[0];
    if (!seed?.predictedNextBaseFee) return;
    const priorityWei = gweiStrToWei(editPriority);
    if (priorityWei === null) return;
    const derived = deriveBatchMaxFee(
      BigInt(priorityWei),
      BigInt(seed.predictedNextBaseFee),
    );
    setEditMaxFee(weiToGweiStr(derived.toString()));
    setMaxFeeManual(false);
  }, [editPriority, passthroughEstimates]);

  // Compute totals
  const validEstimates = estimates.filter((e): e is GasEstimate => e !== null);
  const nativePriceUsd = validEstimates[0]?.nativePriceUsd ?? null;
  const sym = validEstimates[0]?.nativeCurrencySymbol || "ETH";
  const anyFailed = validEstimates.some((e) => e.estimationFailed);
  const anyInsufficient = validEstimates.some((e) => e.insufficientBalance);
  const anyEditInvalid = hasEdited && editedGasLimits.some((g) => !isValidGasLimit(g));

  // Per-call display cost. Uses the applied tier's maxFeePerGas × the
  // (possibly edited) gas limit so the breakdown matches the picker choice.
  // Falls back to the original estimate's cost when applied fees aren't ready
  // (e.g., still loading or atomic batch with no tier picker).
  const perCallDisplayCostWei = useMemo<string[]>(() => {
    return toEstimate.map((_, i) => {
      const est = estimates[i];
      if (!est) return "0";
      const editedLimit = editedGasLimits[i];
      if (appliedFees && editedLimit && isValidGasLimit(editedLimit)) {
        try {
          return (
            BigInt(editedLimit) * BigInt(appliedFees.maxFeePerGas)
          ).toString();
        } catch {
          // Fall through to estimate's cost.
        }
      }
      return est.estimatedCostWei || "0";
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estimates, editedGasLimits, appliedFees]);

  const totalCostWei = perCallDisplayCostWei
    .reduce((sum, w) => sum + BigInt(w || "0"), 0n)
    .toString();

  // Detect which calls used the hardcoded fallback instead of a real estimate.
  // Read from passthroughEstimates (the L2 gas source — for force inclusion
  // these come from a separate estimateBatchGasSequential call, for normal
  // batch they're the same as `estimates`).
  const fallbackIndices = useMemo(() => {
    const source = passthroughEstimates;
    if (!source) return [] as number[];
    return source
      .map((e, i) => (e?.fallbackUsed ? i : -1))
      .filter((i) => i >= 0);
  }, [passthroughEstimates]);
  const hasFallback = fallbackIndices.length > 0;

  // Auto-expand the gas section once when a fallback is detected, so the user
  // immediately sees the warning and the highlighted rows.
  useEffect(() => {
    if (hasFallback && !autoExpanded) {
      setExpanded(true);
      setAutoExpanded(true);
    }
  }, [hasFallback, autoExpanded]);

  // Loading state
  if (loading) {
    return (
      <Box
        border={tokens.borders.medium}
        borderColor="border.default"
        borderRadius="lg"
        bg="surface.raised"
        boxShadow="card"
      >
        <HStack px={3} py={3} justify="center">
          <Spinner size="xs" color="accent.secondary" />
          <Text fontSize="xs" color="text.secondary" fontWeight="700" textTransform="uppercase">
            Estimating gas...
          </Text>
        </HStack>
      </Box>
    );
  }

  // Error state
  if (error && validEstimates.length === 0) {
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

  if (validEstimates.length === 0) return null;

  const usdDisplay = formatUsd(totalCostWei, nativePriceUsd);

  return (
    <VStack spacing={2} align="stretch">
      {/* Revert warning */}
      {anyFailed && (
        <HStack
          bg="status.error.bg"
          border={tokens.borders.medium}
          borderColor="border.default"
          borderRadius="lg"
          boxShadow="card"
          px={3}
          py={2}
          spacing={2}
        >
          <WarningIcon color="status.error.fg" boxSize={3.5} flexShrink={0} />
          <Text fontSize="xs" color="status.error.fg" fontWeight="700" textTransform="uppercase">
            One or more transactions may revert
          </Text>
        </HStack>
      )}

      {/* Insufficient balance warning */}
      {anyInsufficient && !anyFailed && (
        <HStack
          bg="status.warning.bg"
          border={tokens.borders.medium}
          borderColor="border.default"
          borderRadius="lg"
          boxShadow="card"
          px={3}
          py={2}
          spacing={2}
        >
          <WarningIcon color="status.warning.fg" boxSize={3.5} />
          <Text fontSize="xs" color="status.warning.fg" fontWeight="700" textTransform="uppercase">
            Insufficient balance for gas
          </Text>
        </HStack>
      )}

      {/* Fallback gas-limit warning — shown when one or more calls couldn't be
          estimated sequentially and we had to use the 500k dependent-call default.
          Rendered above the force-inclusion blue banner so the warning is the
          most prominent thing above the gas fee row. */}
      {hasFallback && (
        <VStack
          align="stretch"
          spacing={0.5}
          bg="status.warning.bg"
          border={tokens.borders.medium}
          borderColor="border.default"
          borderRadius="lg"
          boxShadow="card"
          px={3}
          py={2}
        >
          <HStack spacing={2}>
            <WarningIcon color="status.warning.fg" boxSize={3.5} flexShrink={0} />
            <Text fontSize="xs" color="status.warning.fg" fontWeight="900" textTransform="uppercase">
              Couldn&apos;t estimate {fallbackIndices.length} call{fallbackIndices.length > 1 ? "s" : ""} — using 500k default
            </Text>
          </HStack>
          <Text fontSize="2xs" color="status.warning.fg" fontWeight="700" lineHeight="1.35" pl={5}>
            {forceInclusion
              ? "Edit highlighted row below — too high wastes L1 burn, too low reverts on L2 (burn lost)."
              : "Edit highlighted row below if your call needs more. Extra gas gets refunded back."}
          </Text>
        </VStack>
      )}

      {/* Force inclusion info banner */}
      {forceInclusion && (
        <HStack
          bg="status.info.bg"
          border={tokens.borders.medium}
          borderColor="border.default"
          borderRadius="lg"
          boxShadow="card"
          px={3}
          py={1.5}
          spacing={2}
        >
          <Text fontSize="xs" color="status.info.fg" fontWeight="700" textTransform="uppercase">
            Gas estimated for L1 deposit
          </Text>
        </HStack>
      )}

      {/* Gas estimate box */}
      <Box
        border={tokens.borders.medium}
        borderColor="border.default"
        borderRadius="lg"
        bg="surface.raised"
        boxShadow="card"
        position="relative"
      >
        {/* Collapsed header */}
        <HStack
          px={3}
          py={2.5}
          cursor="pointer"
          onClick={() => setExpanded(!expanded)}
          _hover={{ bg: "bg.muted" }}
          justify="space-between"
        >
          <Text fontSize="xs" color="text.secondary" fontWeight="700" textTransform="uppercase" flexShrink={0}>
            Gas Fee
          </Text>
          <HStack spacing={1} minW={0}>
            <Text fontSize="xs" fontWeight="700" color="text.primary" fontFamily="mono" noOfLines={1}>
              {formatEth(totalCostWei, sym)}
            </Text>
            {usdDisplay && (
              <Text fontSize="xs" color="text.tertiary" fontWeight="600">
                ({usdDisplay})
              </Text>
            )}
            {expanded
              ? <ChevronUpIcon boxSize={4} color="text.tertiary" />
              : <ChevronDownIcon boxSize={4} color="text.tertiary" />}
          </HStack>
        </HStack>

        {/* Expanded details */}
        <Collapse in={expanded} animateOpacity>
          <VStack align="stretch" spacing={1.5} px={3} pb={3} pt={1}>
            <Box h="1px" bg="border.subtle" />

            {/* Tier picker (non-atomic PK/SP only). Lives at the top of the
                expanded section so the user picks once and the per-call rows
                below all reflect the chosen fees. */}
            {showPicker && (
              <GasTierPicker
                tiers={passthroughEstimates![0].tiers}
                gasLimit={(() => {
                  // Sum of (possibly edited) per-call gas limits — drives the
                  // per-tier total cost preview in the picker buttons.
                  try {
                    return editedGasLimits.reduce(
                      (sum, g) =>
                        sum + (isValidGasLimit(g) ? BigInt(g) : 0n),
                      0n,
                    );
                  } catch {
                    return null;
                  }
                })()}
                nativePriceUsd={nativePriceUsd}
                nativeCurrencySymbol={sym}
                selected={tier}
                onChange={handleTierChange}
              />
            )}

            {/* Custom-tier shared fee editor — one Priority + one Max Fee
                applied to every call in the batch (sequential nonces mean
                per-call differentiation can't actually reorder execution). */}
            {showCustomEditor && passthroughEstimates && passthroughEstimates[0] && (
              <VStack align="stretch" spacing={1.5}>
                <HStack justify="space-between" w="full">
                  <Text fontSize="xs" color="text.tertiary" fontWeight="600">
                    Max Priority Fee
                  </Text>
                  <HStack spacing={1}>
                    <Input
                      size="xs"
                      value={editPriority}
                      onChange={(e) => handlePriorityEdit(e.target.value)}
                      w="100px"
                      textAlign="right"
                      fontFamily="mono"
                      fontWeight="700"
                      fontSize="xs"
                      isInvalid={gweiStrToWei(editPriority) === null}
                      px={2}
                      h="24px"
                    />
                    <Text fontSize="xs" color="text.tertiary" fontWeight="600" minW="35px">
                      Gwei
                    </Text>
                  </HStack>
                </HStack>
                <HStack justify="space-between" w="full">
                  <HStack spacing={1.5}>
                    <Text fontSize="xs" color="text.tertiary" fontWeight="600">
                      Max Fee
                    </Text>
                    {maxFeeManual ? (
                      <Tooltip
                        label="You edited Max Fee. Click to auto-link it back to Priority Fee."
                        fontSize="2xs"
                        hasArrow
                        openDelay={300}
                      >
                        <HStack
                          as="button"
                          type="button"
                          onClick={handleRelinkMaxFee}
                          spacing={1}
                          px={1.5}
                          py={0.5}
                          borderRadius="md"
                          bg="accent.highlight"
                          cursor="pointer"
                          _hover={{ filter: "brightness(0.95)" }}
                          _focus={{ outline: "none", boxShadow: "none" }}
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
                    )}
                  </HStack>
                  <HStack spacing={1}>
                    <Input
                      size="xs"
                      value={editMaxFee}
                      onChange={(e) => handleMaxFeeEdit(e.target.value)}
                      w="100px"
                      textAlign="right"
                      fontFamily="mono"
                      fontWeight="700"
                      fontSize="xs"
                      isInvalid={!isCustomFeeValid}
                      px={2}
                      h="24px"
                    />
                    <Text fontSize="xs" color="text.tertiary" fontWeight="600" minW="35px">
                      Gwei
                    </Text>
                  </HStack>
                </HStack>
                <HStack justify="space-between" w="full">
                  <Text fontSize="xs" color="text.tertiary" fontWeight="600">
                    Base Fee
                  </Text>
                  <Text
                    fontSize="xs"
                    fontWeight="700"
                    color="text.primary"
                    fontFamily="mono"
                    textAlign="right"
                  >
                    {formatGwei(passthroughEstimates[0].baseFee || "0")}
                  </Text>
                </HStack>
                {!isCustomFeeValid && (
                  <Text fontSize="2xs" color="status.error.fg" fontWeight="700">
                    Max Fee must be at least Base Fee + Priority Fee
                  </Text>
                )}
              </VStack>
            )}

            {showPicker && <Box h="1px" bg="border.subtle" mt={0.5} />}

            {/* Per-transaction cost breakdown */}
            {toEstimate.map((item, i) => {
              const est = estimates[i];
              if (!est) return null;

              const callCost = perCallDisplayCostWei[i] || est.estimatedCostWei;
              const costUsd = formatUsd(callCost, est.nativePriceUsd);

              return (
                // align="flex-start" so a wrapped label keeps the cost
                // anchored at the top right rather than visually drifting
                // down to the second line of the label.
                <HStack
                  key={i}
                  justify="space-between"
                  w="full"
                  align="flex-start"
                  spacing={2}
                >
                  <Text
                    fontSize="xs"
                    color="text.tertiary"
                    fontWeight="600"
                    maxW="55%"
                    wordBreak="break-word"
                    lineHeight="1.35"
                  >
                    {preserveOrphans(item.label)}
                  </Text>
                  <HStack spacing={1} flexShrink={0}>
                    <Text fontSize="xs" fontWeight="700" color="text.primary" fontFamily="mono" textAlign="right">
                      {formatEth(callCost, sym)}
                    </Text>
                    {costUsd && (
                      <Text fontSize="xs" color="text.tertiary" fontWeight="600">
                        ({costUsd})
                      </Text>
                    )}
                  </HStack>
                </HStack>
              );
            })}

            {/* Total row (only when multiple estimates) */}
            {validEstimates.length > 1 && (
              <>
                <Box h="1px" bg="border.subtle" mt={0.5} />
                <HStack justify="space-between" w="full">
                  <Text fontSize="xs" color="text.secondary" fontWeight="700" textTransform="uppercase">
                    Total
                  </Text>
                  <HStack spacing={1}>
                    <Text fontSize="xs" fontWeight="700" color="text.primary" fontFamily="mono" textAlign="right">
                      {formatEth(totalCostWei, sym)}
                    </Text>
                    {usdDisplay && (
                      <Text fontSize="xs" color="text.tertiary" fontWeight="600">
                        ({usdDisplay})
                      </Text>
                    )}
                  </HStack>
                </HStack>
              </>
            )}

            {/* Editable L2 gas limits (PK/Seed only, non-atomic batches only) */}
            {isEditable && editedGasLimits.length > 0 && (
              <>
                <Box h="1px" bg="border.subtle" mt={0.5} />
                <HStack justify="space-between" align="center" mb={0.5}>
                  <Text fontSize="2xs" color="text.secondary" fontWeight="700" textTransform="uppercase">
                    {forceInclusion ? "L2 Gas Limit (per call)" : "Gas Limit (per call)"}
                  </Text>
                </HStack>
                {transactions.map((item, i) => {
                  const isRowFallback = fallbackIndices.includes(i);
                  const targetAddr = item.tx.to;
                  const canLinkToExplorer =
                    !!explorerBase &&
                    !!targetAddr &&
                    targetAddr !== "0x0000000000000000000000000000000000000000";
                  return (
                    // align="flex-start" + wrapping label so multi-line
                    // function names ("Approve USDC for Permit2..." etc.)
                    // stay readable instead of getting cut to "Approve...".
                    <HStack
                      key={`edit-${i}`}
                      justify="space-between"
                      w="full"
                      spacing={1}
                      align="flex-start"
                    >
                      <HStack spacing={1} maxW="55%" flex="1" minW={0} align="flex-start">
                        {isRowFallback && (
                          <WarningIcon color="accent.highlight" boxSize={2.5} flexShrink={0} mt={1} />
                        )}
                        <Text
                          fontSize="xs"
                          color={isRowFallback ? "text.primary" : "text.tertiary"}
                          fontWeight={isRowFallback ? "800" : "600"}
                          wordBreak="break-word"
                          lineHeight="1.35"
                        >
                          {preserveOrphans(item.label)}
                        </Text>
                        {canLinkToExplorer && (
                          <Tooltip
                            label="View contract on explorer — check past txs to learn typical gas"
                            fontSize="2xs"
                            hasArrow
                            openDelay={300}
                          >
                            <IconButton
                              aria-label="View on explorer"
                              icon={<ExternalLinkIcon boxSize="10px" />}
                              size="xs"
                              variant="ghost"
                              minW="16px"
                              h="16px"
                              color="text.tertiary"
                              _hover={{ color: "accent.secondary", bg: "bg.muted" }}
                              onClick={() =>
                                chrome.tabs.create({
                                  url: `${explorerBase}/address/${targetAddr}`,
                                })
                              }
                            />
                          </Tooltip>
                        )}
                      </HStack>
                      <EditableGasLimitInput
                        value={editedGasLimits[i] || ""}
                        onChange={(val) => handleEditGasLimit(i, val)}
                        isInvalid={hasEdited && !isValidGasLimit(editedGasLimits[i] || "")}
                        isWarning={isRowFallback}
                      />
                    </HStack>
                  );
                })}
                {anyEditInvalid && (
                  <Text fontSize="2xs" color="chart.negative" fontWeight="700">
                    Invalid gas limit — must be a positive integer
                  </Text>
                )}
                {forceInclusion && (
                  <Text fontSize="2xs" color="text.tertiary" fontWeight="500" fontStyle="italic">
                    L1 cost is re-estimated at broadcast based on these values
                  </Text>
                )}
              </>
            )}

            {accountType === "bankr" && (
              <Text fontSize="2xs" color="text.tertiary" fontWeight="600" fontStyle="italic">
                Gas managed by Bankr API
              </Text>
            )}
          </VStack>
        </Collapse>
      </Box>
    </VStack>
  );
}

export default memo(MultiTxGasEstimateDisplay);
