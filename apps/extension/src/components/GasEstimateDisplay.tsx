import { useState, useEffect, useCallback, memo } from "react";
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
import { ChevronDownIcon, ChevronUpIcon, WarningIcon, CopyIcon, CheckIcon } from "@chakra-ui/icons";
import { PendingTxRequest } from "@/chrome/pendingTxStorage";
import { GasEstimate } from "@/chrome/gasEstimation";
import { GasOverrides } from "@/chrome/txHandlers";
import { formatEth, formatGwei } from "@/lib/gasFormatUtils";

interface GasEstimateDisplayProps {
  txRequest: PendingTxRequest;
  accountType?: "bankr" | "privateKey" | "seedPhrase" | "impersonator";
  onGasOverrides?: (overrides: GasOverrides | null) => void;
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
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  suffix: string;
  isInvalid?: boolean;
}) {
  return (
    <HStack justify="space-between" w="full">
      <Text fontSize="xs" color="text.tertiary" fontWeight="600">
        {label}
      </Text>
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
          border="2px solid"
          borderColor={isInvalid ? "bauhaus.red" : "bauhaus.black"}
          borderRadius="0"
          bg="bauhaus.white"
          px={2}
          h="24px"
          _focus={{
            borderColor: isInvalid ? "bauhaus.red" : "bauhaus.blue",
            boxShadow: "none",
          }}
        />
        <Text fontSize="xs" color="text.tertiary" fontWeight="600" minW="35px">
          {suffix}
        </Text>
      </HStack>
    </HStack>
  );
}

/** Format USD price for display */
function formatUsd(weiStr: string, priceUsd: number | null): string | null {
  if (priceUsd === null) return null;
  const eth = Number(BigInt(weiStr)) / 1e18;
  const usd = eth * priceUsd;
  if (usd < 0.01 && usd > 0) return "<$0.01";
  return `~$${usd.toFixed(2)}`;
}

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

function RevertWarning({ shortError, fullError }: { shortError: string; fullError: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullError);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <HStack
      bg="bauhaus.red"
      border="3px solid"
      borderColor="bauhaus.black"
      boxShadow="3px 3px 0px 0px #121212"
      px={3}
      py={2}
      spacing={2}
    >
      <WarningIcon color="white" boxSize={3.5} flexShrink={0} />
      <Text fontSize="xs" color="white" fontWeight="700" textTransform="uppercase" flex="1" noOfLines={2}>
        TX may revert: {shortError}
      </Text>
      <Tooltip label="Copy full error" fontSize="xs" hasArrow>
        <IconButton
          aria-label="Copy full error"
          icon={copied ? <CheckIcon /> : <CopyIcon />}
          size="xs"
          variant="ghost"
          color={copied ? "bauhaus.yellow" : "whiteAlpha.800"}
          onClick={handleCopy}
          _hover={{ color: "white", bg: "whiteAlpha.200" }}
          flexShrink={0}
        />
      </Tooltip>
    </HStack>
  );
}

function GasEstimateDisplay({ txRequest, accountType, onGasOverrides }: GasEstimateDisplayProps) {
  const [estimate, setEstimate] = useState<GasEstimate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  // Editable fields (gwei strings for fees, decimal string for gas limit)
  const [editGasLimit, setEditGasLimit] = useState("");
  const [editMaxFee, setEditMaxFee] = useState("");
  const [editPriorityFee, setEditPriorityFee] = useState("");
  const [hasEdited, setHasEdited] = useState(false);

  const isEditable = accountType === "privateKey" || accountType === "seedPhrase";

  // Fetch gas estimate on mount
  useEffect(() => {
    let cancelled = false;

    chrome.runtime.sendMessage(
      {
        type: "estimateGas",
        tx: txRequest.tx,
        accountAddress: txRequest.tx.from,
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
        setEditMaxFee(weiToGweiStr(result.maxFeePerGas));
        setEditPriorityFee(weiToGweiStr(result.maxPriorityFeePerGas));
        setLoading(false);
      }
    );

    return () => { cancelled = true; };
  }, [txRequest.id]);

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
  const allValid = isGasLimitValid && isMaxFeeValid && isPriorityFeeValid;

  // Propagate gas overrides to parent
  // For PK/Seed accounts: always send overrides when dapp provided gas or user edited
  useEffect(() => {
    if (!onGasOverrides || !estimate) return;

    const shouldSendOverrides = hasEdited || (isEditable && estimate.dappProvidedGas);

    if (!shouldSendOverrides) {
      onGasOverrides(null);
      return;
    }

    if (!allValid) {
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
  }, [editGasLimit, editMaxFee, editPriorityFee, hasEdited, allValid, estimate, isEditable]);

  const handleEdit = useCallback(
    (setter: (v: string) => void) => (val: string) => {
      setter(val);
      setHasEdited(true);
    },
    []
  );

  // Compute display cost from edited or estimated values
  const displayCostWei = (() => {
    if (!estimate) return "0";
    if (hasEdited && allValid) {
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
        border="3px solid"
        borderColor="bauhaus.black"
        bg="bauhaus.white"
        boxShadow="4px 4px 0px 0px #121212"
      >
        <HStack px={3} py={3} justify="center">
          <Spinner size="xs" color="bauhaus.blue" />
          <Text fontSize="xs" color="text.secondary" fontWeight="700" textTransform="uppercase">
            Estimating gas...
          </Text>
        </HStack>
      </Box>
    );
  }

  // Error state (non-blocking)
  if (error && !estimate) {
    return (
      <Box
        border="3px solid"
        borderColor="bauhaus.black"
        bg="bauhaus.white"
        boxShadow="4px 4px 0px 0px #121212"
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

  const usdDisplay = formatUsd(displayCostWei, estimate.nativePriceUsd);
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
          bg="bauhaus.yellow"
          border="3px solid"
          borderColor="bauhaus.black"
          boxShadow="3px 3px 0px 0px #121212"
          px={3}
          py={2}
          spacing={2}
        >
          <WarningIcon color="bauhaus.black" boxSize={3.5} />
          <Text fontSize="xs" color="bauhaus.black" fontWeight="700" textTransform="uppercase">
            Insufficient balance for gas
          </Text>
        </HStack>
      )}

      {/* Gas estimate box */}
      <Box
        border="3px solid"
        borderColor="bauhaus.black"
        bg="bauhaus.white"
        boxShadow="4px 4px 0px 0px #121212"
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
              {formatEth(displayCostWei, sym)}
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
            <Box h="1px" bg="gray.200" />

            {isEditable ? (
              <>
                <EditableGasRow
                  label="Gas Limit"
                  value={editGasLimit}
                  onChange={handleEdit(setEditGasLimit)}
                  suffix=""
                  isInvalid={hasEdited && !isGasLimitValid}
                />
                <EditableGasRow
                  label="Max Priority Fee"
                  value={editPriorityFee}
                  onChange={handleEdit(setEditPriorityFee)}
                  suffix="Gwei"
                  isInvalid={hasEdited && !isPriorityFeeValid}
                />
                <EditableGasRow
                  label="Max Fee"
                  value={editMaxFee}
                  onChange={handleEdit(setEditMaxFee)}
                  suffix="Gwei"
                  isInvalid={hasEdited && !isMaxFeeValid}
                />
              </>
            ) : (
              <>
                <GasRow label="Gas Limit" value={estimate.gasLimit} />
                <GasRow label="Max Priority Fee" value={formatGwei(estimate.maxPriorityFeePerGas)} />
                <GasRow label="Max Fee" value={formatGwei(estimate.maxFeePerGas)} />
              </>
            )}

            <GasRow label="Base Fee" value={formatGwei(estimate.baseFee)} />

            <Box h="1px" bg="gray.200" mt={0.5} />

            <GasRow
              label="Estimated Cost"
              value={`${formatEth(displayCostWei, sym)}${usdDisplay ? ` (${usdDisplay})` : ""}`}
            />

            {estimate.dappProvidedGas && (
              <Text fontSize="2xs" color="bauhaus.blue" fontWeight="700">
                Gas params suggested by dapp
              </Text>
            )}

            {accountType === "bankr" && (
              <Text fontSize="2xs" color="text.tertiary" fontWeight="600" fontStyle="italic">
                Gas managed by Bankr API
              </Text>
            )}

            {hasEdited && !allValid && (
              <Text fontSize="2xs" color="bauhaus.red" fontWeight="700">
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
