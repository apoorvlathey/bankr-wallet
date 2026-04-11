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
} from "@chakra-ui/react";
import { ChevronDownIcon, ChevronUpIcon, WarningIcon, ExternalLinkIcon } from "@chakra-ui/icons";
import { GasEstimate } from "@/chrome/gasEstimation";
import { formatEth } from "@/lib/gasFormatUtils";
import { getChainConfig } from "@/constants/chainConfig";
import { useNetworks } from "@/contexts/NetworksContext";
import { getResolvedChainById } from "@/lib/chains";
import { useTheme } from "@/theme";

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
  /** When true, estimate gas for L1 deposit transactions (force inclusion) */
  forceInclusion?: boolean;
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
          setEstimates(results);
          setPassthroughEstimates(results);
          setEditedGasLimits(results.map((e) => e.gasLimit));
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

  // Propagate (possibly edited) gas estimates to the parent.
  // onGasEstimates is intentionally NOT in deps — parent passes a useState
  // setter (stable identity), so re-firing on identity changes would only
  // create extra renders without changing behavior.
  useEffect(() => {
    if (!onGasEstimates) return;
    if (!passthroughEstimates || passthroughEstimates.length === 0) return;

    const allValid = editedGasLimits.every(isValidGasLimit);
    if (!allValid) return;

    const merged = passthroughEstimates.map((est, i) => ({
      ...est,
      gasLimit: editedGasLimits[i] || est.gasLimit,
    }));
    onGasEstimates(merged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passthroughEstimates, editedGasLimits]);

  const handleEditGasLimit = useCallback((index: number, val: string) => {
    setEditedGasLimits((prev) => {
      const next = [...prev];
      next[index] = val;
      return next;
    });
    setHasEdited(true);
  }, []);

  // Compute totals
  const validEstimates = estimates.filter((e): e is GasEstimate => e !== null);
  const totalCostWei = validEstimates.reduce(
    (sum, e) => sum + BigInt(e.estimatedCostWei || "0"),
    0n,
  ).toString();
  const nativePriceUsd = validEstimates[0]?.nativePriceUsd ?? null;
  const sym = validEstimates[0]?.nativeCurrencySymbol || "ETH";
  const anyFailed = validEstimates.some((e) => e.estimationFailed);
  const anyInsufficient = validEstimates.some((e) => e.insufficientBalance);
  const anyEditInvalid = hasEdited && editedGasLimits.some((g) => !isValidGasLimit(g));

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

            {/* Per-transaction cost breakdown */}
            {toEstimate.map((item, i) => {
              const est = estimates[i];
              if (!est) return null;

              const costUsd = formatUsd(est.estimatedCostWei, est.nativePriceUsd);

              return (
                <HStack key={i} justify="space-between" w="full">
                  <Text fontSize="xs" color="text.tertiary" fontWeight="600" noOfLines={1} maxW="55%">
                    {item.label}
                  </Text>
                  <HStack spacing={1}>
                    <Text fontSize="xs" fontWeight="700" color="text.primary" fontFamily="mono" textAlign="right">
                      {formatEth(est.estimatedCostWei, sym)}
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
                    <HStack key={`edit-${i}`} justify="space-between" w="full" spacing={1}>
                      <HStack spacing={1} maxW="55%" flex="1" minW={0}>
                        {isRowFallback && (
                          <WarningIcon color="accent.highlight" boxSize={2.5} flexShrink={0} />
                        )}
                        <Text
                          fontSize="xs"
                          color={isRowFallback ? "text.primary" : "text.tertiary"}
                          fontWeight={isRowFallback ? "800" : "600"}
                          noOfLines={1}
                        >
                          {item.label}
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
