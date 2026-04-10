import { useState, useMemo, memo } from "react";
import {
  Box,
  VStack,
  HStack,
  Text,
  Button,
  Badge,
  Spinner,
  IconButton,
  Flex,
  Spacer,
  Image,
  Icon,
  Collapse,
  Switch,
  Tooltip,
} from "@chakra-ui/react";
import { keyframes } from "@emotion/react";
import {
  ArrowBackIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  DeleteIcon,
  ExternalLinkIcon,
  SettingsIcon,
} from "@chakra-ui/icons";
import type { PendingBatchTxRequest, ERC5792Call } from "@/chrome/erc5792Types";
import type { PendingTxRequest } from "@/chrome/pendingTxStorage";
import type { CrossDappBatch } from "@/chrome/crossDappBatchStorage";
import { getChainConfig } from "@/constants/chainConfig";
import CalldataDecoder from "@/components/CalldataDecoder";
import AssetChangesDisplay from "@/components/AssetChangesDisplay";
import { FromAccountDisplay } from "@/components/FromAccountDisplay";
import { CopyButton } from "@/components/CopyButton";
import ChainIcon from "@/components/ChainIcon";
import MultiTxGasEstimateDisplay from "@/components/MultiTxGasEstimateDisplay";
import ForceInclusionProgress from "@/components/ForceInclusionProgress";
import { encodeBatchCalls } from "@/chrome/batchTxHandlers";
import { isForceInclusionSupportedForAccount, FORCE_INCLUSION_CHAINS } from "@/constants/chainRegistry";
import { googleFaviconUrl } from "@/constants/externalUrls";
import { useNetworks } from "@/contexts/NetworksContext";
import { getResolvedChainById } from "@/lib/chains";

const scaleIn = keyframes`
  0% { transform: scale(0) rotate(-10deg); opacity: 0; }
  50% { transform: scale(1.1) rotate(5deg); }
  100% { transform: scale(1) rotate(0deg); opacity: 1; }
`;

const checkmarkDraw = keyframes`
  0% { stroke-dashoffset: 50; }
  100% { stroke-dashoffset: 0; }
`;

// Bauhaus accent colors for call cards
const CALL_ACCENTS = ["bauhaus.red", "bauhaus.blue", "bauhaus.yellow"];

interface BatchTransactionConfirmationProps {
  batchRequest: PendingBatchTxRequest;
  currentIndex: number;
  totalCount: number;
  isInSidePanel: boolean;
  accountType?: "bankr" | "privateKey" | "seedPhrase" | "impersonator";
  accountAddress: string;
  onBack: () => void;
  onConfirmed: () => void;
  onRejected: () => void;
  onRejectAll: () => void;
  onNavigate: (direction: "prev" | "next") => void;
  /**
   * Cross-dapp batch only: when set, render a trash icon to the LEFT of each
   * call (outside the collapse). The handler is invoked with the call index.
   */
  onRemoveCall?: (callIndex: number) => void;
  /**
   * Cross-dapp batch only: per-call origin/favicon (one entry per call). When
   * set, the call header shows a small favicon + hostname chip so the user
   * knows which dapp each call came from.
   */
  originPerCall?: Array<{ origin: string; favicon: string | null }>;
  /**
   * Override for the title banner label. Defaults to
   * `Batch Transaction (N calls)`. Cross-dapp batches use a different label.
   */
  titleOverride?: string;
  /**
   * Cross-dapp batch only: replaces the default `confirmBatchTransactionAsync`
   * chrome.runtime.sendMessage call. Should resolve `{ success, error? }`.
   */
  customConfirmHandler?: () => Promise<{ success: boolean; error?: string }>;
  /**
   * Cross-dapp batch only: replaces the default `rejectBatchTransaction`
   * chrome.runtime.sendMessage call.
   */
  customRejectHandler?: () => Promise<void>;
  /**
   * Currently active cross-dapp batch (if any). Used to gate the
   * "Add to Batch" button on the dapp-initiated batch screen and to surface
   * a "Batch: N queued" sub-label. Not used by the cross-dapp batch screen
   * itself (the wrapper omits it).
   */
  crossDappBatch?: CrossDappBatch | null;
  /**
   * Called after the dapp's bundle is successfully added to the cross-dapp
   * batch. Parent should switch the view to the cross-dapp batch confirmation
   * screen so the user lands directly on the assembled batch.
   */
  onAddedToBatch?: () => void;
  /**
   * Override for the outer page background. Defaults to `bg.base`. The
   * cross-dapp batch wrapper sets this to a tinted yellow so the screen is
   * instantly recognizable as the user-assembled batch (vs a regular dapp tx
   * confirmation).
   */
  pageBgColor?: string;
}

type ConfirmationState = "ready" | "submitting" | "sent" | "error" | "forceInclusion";

function BatchTransactionConfirmation({
  batchRequest,
  currentIndex,
  totalCount,
  isInSidePanel,
  accountType,
  accountAddress,
  onBack,
  onConfirmed,
  onRejected,
  onRejectAll,
  onNavigate,
  onRemoveCall,
  originPerCall,
  titleOverride,
  customConfirmHandler,
  customRejectHandler,
  crossDappBatch,
  onAddedToBatch,
  pageBgColor,
}: BatchTransactionConfirmationProps) {
  const { networksInfo } = useNetworks();
  const resolvedChain = getResolvedChainById(batchRequest.chainId, networksInfo);
  const [state, setState] = useState<ConfirmationState>("ready");
  const [error, setError] = useState<string>("");
  const [expandedCalls, setExpandedCalls] = useState<Set<number>>(new Set());
  const [decodedFunctionNames, setDecodedFunctionNames] = useState<
    Record<number, string>
  >({});
  const [cachedGasEstimates, setCachedGasEstimates] = useState<any[] | null>(null);
  const [forceInclusion, setForceInclusion] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const { params, origin, chainName, favicon, chainId } = batchRequest;
  const calls = params.calls;

  const originHostname = (() => {
    try {
      return new URL(origin).hostname;
    } catch {
      return null;
    }
  })();

  // Internal flow (e.g. cross-dapp batch) — origin is a known internal label
  // ("WalletChan" or "Cross-Dapp Batch") with no real dapp favicon. Render the
  // WalletChan extension icon instead of trying to fetch a favicon.
  const isInternalWalletChan =
    origin === "WalletChan" || origin === "Cross-Dapp Batch";

  const fromAddress = params.from || accountAddress;

  // Encode batch calls for simulation and Tenderly
  const encodedBatch = useMemo(
    () => encodeBatchCalls(calls, fromAddress),
    [calls, fromAddress],
  );

  // Synthetic PendingTxRequest for AssetChangesDisplay
  const syntheticTxRequest: PendingTxRequest = useMemo(
    () => ({
      id: batchRequest.id,
      tx: {
        from: fromAddress,
        to: encodedBatch.to,
        data: encodedBatch.data,
        value: encodedBatch.value,
        chainId,
      },
      origin: batchRequest.origin,
      favicon: batchRequest.favicon,
      chainName: batchRequest.chainName,
      timestamp: batchRequest.timestamp,
    }),
    [batchRequest, encodedBatch, fromAddress, chainId],
  );

  const toggleCall = (index: number) => {
    setExpandedCalls((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const handleFunctionName = (index: number, name: string) => {
    setDecodedFunctionNames((prev) => {
      if (prev[index] === name) return prev; // Same value — skip update to avoid infinite loop
      return { ...prev, [index]: name };
    });
  };

  const isNonAtomic =
    accountType === "privateKey" || accountType === "seedPhrase";

  // Force inclusion info — non-null when chain supports it and account can submit.
  // For Bankr accounts this also requires the L1 chain (e.g. Ethereum mainnet) to be
  // in BANKR_SUPPORTED_CHAIN_IDS, since Bankr API submits the L1 deposit on their end.
  const forceInclusionInfo = useMemo(() => {
    if (!isForceInclusionSupportedForAccount(chainId, accountType)) return null;
    const entry = FORCE_INCLUSION_CHAINS.get(chainId)!;
    return { l1ChainId: entry.l1ChainId, l1ChainName: entry.l1ChainName };
  }, [chainId, accountType]);

  const handleConfirm = async () => {
    setState("submitting");
    setError("");

    // Cross-dapp batch path: defer to the wrapper-provided handler. The
    // wrapper owns its own bundle id, message type, and result fan-out.
    if (customConfirmHandler) {
      const result = await customConfirmHandler();
      if (result.success) {
        if (isInSidePanel) {
          onConfirmed();
        } else {
          setState("sent");
          setTimeout(() => {
            window.close();
          }, 1000);
        }
      } else {
        setError(result.error || "Failed to submit batch transaction");
        setState("error");
      }
      return;
    }

    const functionNames = calls.map(
      (_, i) => decodedFunctionNames[i] || undefined,
    ).filter(Boolean) as string[];

    // Route to the appropriate handler based on account type
    const messageType = isNonAtomic
      ? "confirmBatchTransactionAsyncPK"
      : "confirmBatchTransactionAsync";

    chrome.runtime.sendMessage(
      {
        type: messageType,
        bundleId: batchRequest.id,
        password: "",
        functionNames: functionNames.length > 0 ? functionNames : undefined,
        // Pass pre-computed gas estimates so background doesn't re-estimate.
        // For normal non-atomic batches: used directly as gas + fees for signing.
        // For force inclusion batches: only the `gasLimit` field is used (as the L2
        //   `_gasLimit` override in the portal call); L1 fees are computed on-chain.
        ...(isNonAtomic && cachedGasEstimates ? { gasEstimates: cachedGasEstimates } : {}),
        ...(forceInclusion ? { forceInclusion: true } : {}),
      },
      (result: { success: boolean; error?: string }) => {
        if (result.success) {
          // Atomic batch + force inclusion: stay open to show progress
          if (forceInclusion && !isNonAtomic) {
            setState("forceInclusion");
          } else if (isInSidePanel) {
            onConfirmed();
          } else {
            setState("sent");
            setTimeout(() => {
              window.close();
            }, 1000);
          }
        } else {
          setError(result.error || "Failed to submit batch transaction");
          setState("error");
        }
      },
    );
  };

  const handleReject = () => {
    if (customRejectHandler) {
      customRejectHandler().then(() => {
        onRejected();
      });
      return;
    }
    chrome.runtime.sendMessage(
      { type: "rejectBatchTransaction", bundleId: batchRequest.id },
      () => {
        onRejected();
      },
    );
  };

  // ---------------------------------------------------------------------------
  // Add-to-Batch (dapp-initiated batches only)
  // ---------------------------------------------------------------------------
  // Cross-dapp batching is only available for Bankr/impersonator accounts (the
  // ship goes through the Bankr API). The button is hidden entirely on
  // PK/SP non-atomic batches and on the cross-dapp batch screen itself
  // (the wrapper doesn't pass `onAddedToBatch`).
  const canBatchAccount =
    accountType === "bankr" || accountType === "impersonator";

  // If a batch is already pending, the new bundle's from + chain must match.
  // Otherwise show a tooltip explaining why the button is disabled.
  const addToBatchDisabledReason = useMemo<string | null>(() => {
    if (!crossDappBatch) return null; // first add — no constraints
    if (crossDappBatch.fromAddress.toLowerCase() !== fromAddress.toLowerCase()) {
      return "Pending batch on another account — clear it first.";
    }
    if (crossDappBatch.chainId !== chainId) {
      return `Pending batch on ${crossDappBatch.chainName} — clear it first.`;
    }
    return null;
  }, [crossDappBatch, fromAddress, chainId]);

  const handleAddBundleToBatch = () => {
    chrome.runtime.sendMessage(
      { type: "addCallsToCrossDappBatch", bundleId: batchRequest.id },
      (result: { success: boolean; error?: string } | undefined) => {
        if (!result?.success) {
          setError(result?.error || "Failed to add to batch");
          setState("error");
          return;
        }
        // Success — jump to the cross-dapp batch screen so the user sees the
        // assembled batch they just merged into.
        onAddedToBatch?.();
      },
    );
  };

  const batchedCount = crossDappBatch?.entries.length ?? 0;
  const showAddToBatch =
    canBatchAccount &&
    !customConfirmHandler && // hide on the cross-dapp batch screen itself
    !!onAddedToBatch &&
    !isNonAtomic;

  // Force inclusion progress screen (atomic batches only)
  if (state === "forceInclusion" && forceInclusionInfo) {
    return (
      <Box h="100%" overflowY="auto" bg="bg.base">
        <ForceInclusionProgress
          txId={batchRequest.id}
          l1ChainId={forceInclusionInfo.l1ChainId}
          l2ChainId={chainId}
          onComplete={() => {
            if (isInSidePanel) {
              onConfirmed();
            } else {
              setState("sent");
              setTimeout(() => {
                window.close();
              }, 1500);
            }
          }}
          onError={() => {
            setState("error");
          }}
        />
      </Box>
    );
  }

  // Success animation
  if (state === "sent") {
    return (
      <Box
        h="100vh"
        bg="bg.base"
        display="flex"
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        p={8}
        position="relative"
      >
        <Box
          position="absolute"
          top={6}
          left={6}
          w="16px"
          h="16px"
          bg="bauhaus.red"
          border="2px solid"
          borderColor="bauhaus.black"
        />
        <Box
          position="absolute"
          top={6}
          right={6}
          w="16px"
          h="16px"
          bg="bauhaus.blue"
          borderRadius="full"
          border="2px solid"
          borderColor="bauhaus.black"
        />
        <Box
          w="100px"
          h="100px"
          bg="bauhaus.yellow"
          border="4px solid"
          borderColor="bauhaus.black"
          boxShadow="8px 8px 0px 0px #121212"
          display="flex"
          alignItems="center"
          justifyContent="center"
          animation={`${scaleIn} 0.4s ease-out`}
          mb={6}
        >
          <Icon viewBox="0 0 24 24" w="50px" h="50px" color="bauhaus.black">
            <path
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="square"
              strokeLinejoin="miter"
              d="M5 13l4 4L19 7"
              style={{
                strokeDasharray: 50,
                strokeDashoffset: 0,
                animation: `${checkmarkDraw} 0.4s ease-out 0.2s backwards`,
              }}
            />
          </Icon>
        </Box>
        <Text
          fontSize="2xl"
          fontWeight="900"
          color="text.primary"
          mb={2}
          textTransform="uppercase"
          letterSpacing="tight"
        >
          Batch Sent
        </Text>
        <Text fontSize="sm" color="text.secondary" textAlign="center" fontWeight="500">
          Your batch transaction has been submitted
        </Text>
      </Box>
    );
  }

  return (
    <Box
      p={3}
      h="100%"
      overflowY="auto"
      bg={pageBgColor ?? "bg.base"}
      css={{
        "&::-webkit-scrollbar": { width: "4px" },
        "&::-webkit-scrollbar-track": { background: "transparent" },
        "&::-webkit-scrollbar-thumb": { background: "#ccc", borderRadius: "2px" },
      }}
    >
      <VStack spacing={2} align="stretch">
        {/* Top row */}
        <Flex align="center" position="relative" minH="32px">
          <IconButton
            aria-label="Back"
            icon={<ArrowBackIcon />}
            variant="ghost"
            size="sm"
            onClick={onBack}
            minW="auto"
          />
          {totalCount > 1 && (
            <HStack
              spacing={0}
              position="absolute"
              left="50%"
              transform="translateX(-50%)"
            >
              <IconButton
                aria-label="Previous"
                icon={<ChevronLeftIcon />}
                variant="ghost"
                size="xs"
                isDisabled={currentIndex === 0}
                onClick={() => onNavigate("prev")}
                color="text.secondary"
                _hover={{ color: "text.primary", bg: "bg.muted" }}
                minW="auto"
                p={1}
              />
              <Badge
                bg="bauhaus.black"
                color="bauhaus.white"
                fontSize="xs"
                px={3}
                py={1}
                fontWeight="700"
              >
                {currentIndex + 1}/{totalCount}
              </Badge>
              <IconButton
                aria-label="Next"
                icon={<ChevronRightIcon />}
                variant="ghost"
                size="xs"
                isDisabled={currentIndex + 1 === totalCount}
                onClick={() => onNavigate("next")}
                color="text.secondary"
                _hover={{ color: "text.primary", bg: "bg.muted" }}
                minW="auto"
                p={1}
              />
            </HStack>
          )}
          <Spacer />
          <HStack spacing={1}>
            <CopyButton
              value={JSON.stringify(
                calls.map((c) => ({
                  to: c.to || null,
                  value: c.value && c.value !== "0x0" ? c.value : "0",
                  data: c.data || "0x",
                })),
                null,
                2,
              )}
            />
            {totalCount > 1 && (
              <Button
                size="xs"
                variant="ghost"
                color="bauhaus.red"
                fontWeight="700"
                _hover={{ bg: "bauhaus.red", color: "white" }}
                onClick={onRejectAll}
                px={2}
              >
                Reject All
              </Button>
            )}
          </HStack>
        </Flex>

        {/* Title banner */}
        <Box
          bg="bauhaus.blue"
          border="3px solid"
          borderColor="bauhaus.black"
          boxShadow="3px 3px 0px 0px #121212"
          py={1.5}
          px={3}
          position="relative"
        >
          <Box
            position="absolute"
            top="-3px"
            right="-3px"
            w="8px"
            h="8px"
            bg="bauhaus.yellow"
            border="2px solid"
            borderColor="bauhaus.black"
          />
          <VStack spacing={1}>
            <Text
              fontWeight="900"
              fontSize="sm"
              color="white"
              textAlign="center"
              textTransform="uppercase"
              letterSpacing="wider"
            >
              {titleOverride ?? `Batch Transaction (${calls.length} calls)`}
            </Text>
            {isNonAtomic && (
              <Badge
                bg="bauhaus.yellow"
                color="bauhaus.black"
                fontSize="9px"
                fontWeight="900"
                px={1.5}
                py={0.5}
                border="1.5px solid"
                borderColor="bauhaus.black"
                textTransform="uppercase"
                letterSpacing="wider"
              >
                Auto-Sequential
              </Badge>
            )}
          </VStack>
        </Box>

        {/* Info Card */}
        <Box
          bg="bauhaus.white"
          border="2px solid"
          borderColor="bauhaus.black"
          boxShadow="2px 2px 0px 0px #121212"
        >
          <VStack spacing={0} divider={<Box h="1px" bg="gray.300" w="full" />}>
            {/* Origin */}
            <HStack w="full" py={1.5} px={3} justify="space-between">
              <Text
                fontSize="xs"
                color="text.secondary"
                fontWeight="700"
                textTransform="uppercase"
              >
                Origin
              </Text>
              <HStack spacing={1.5}>
                <Box
                  bg={isInternalWalletChan ? "transparent" : "gray.100"}
                  border={isInternalWalletChan ? "none" : "1.5px solid"}
                  borderColor="gray.300"
                  borderRadius="md"
                  p={isInternalWalletChan ? 0 : 0.5}
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                >
                  {isInternalWalletChan ? (
                    <Image
                      src="/walletchan-icon.png"
                      alt="WalletChan"
                      boxSize="20px"
                      sx={{ filter: "drop-shadow(0 0 0.5px rgba(0,0,0,0.4)) drop-shadow(0 0 0.5px rgba(255,255,255,0.4))" }}
                    />
                  ) : (
                    <Image
                      src={
                        favicon ||
                        (originHostname
                          ? googleFaviconUrl(originHostname)
                          : undefined)
                      }
                      alt="favicon"
                      boxSize="14px"
                      sx={{ filter: "drop-shadow(0 0 0.5px rgba(0,0,0,0.4)) drop-shadow(0 0 0.5px rgba(255,255,255,0.4))" }}
                      fallback={<Box boxSize="14px" bg="gray.300" borderRadius="sm" />}
                    />
                  )}
                </Box>
                <Text fontSize="xs" fontWeight="700" color="text.primary">
                  {originHostname || origin}
                </Text>
              </HStack>
            </HStack>

            {/* From */}
            <HStack w="full" py={1.5} px={3} justify="space-between">
              <Text
                fontSize="xs"
                color="text.secondary"
                fontWeight="700"
                textTransform="uppercase"
              >
                From
              </Text>
              <FromAccountDisplay address={fromAddress} />
            </HStack>

            {/* Network */}
            <HStack w="full" py={1.5} px={3} justify="space-between">
              <Text
                fontSize="xs"
                color="text.secondary"
                fontWeight="700"
                textTransform="uppercase"
              >
                Network
              </Text>
              <HStack spacing={1}>
                {(() => {
                  const config = getChainConfig(chainId);
                  const badgeChain = resolvedChain ?? {
                    name: chainName,
                    icon: config.icon,
                    bg: config.bg,
                    text: config.text,
                  };
                  return (
                    <Badge
                      fontSize="xs"
                      bg={badgeChain.bg}
                      color={badgeChain.text}
                      border="1.5px solid"
                      borderColor="bauhaus.black"
                      fontWeight="700"
                      px={2}
                      py={0.5}
                      display="flex"
                      alignItems="center"
                      gap={1}
                    >
                      <ChainIcon chainId={chainId} chainName={badgeChain.name} size="12px" />
                      {badgeChain.name}
                      {forceInclusion && forceInclusionInfo && (
                        <Text as="span" fontSize="2xs" opacity={0.7}>
                          via {forceInclusionInfo.l1ChainName}
                        </Text>
                      )}
                    </Badge>
                  );
                })()}
                {forceInclusionInfo && (
                  <Tooltip label="Advanced options" fontSize="xs" hasArrow>
                    <IconButton
                      aria-label="Advanced options"
                      icon={<SettingsIcon />}
                      variant="ghost"
                      size="xs"
                      onClick={() => setShowAdvanced(!showAdvanced)}
                      color={showAdvanced ? "bauhaus.blue" : "text.tertiary"}
                      _hover={{ color: "bauhaus.blue", bg: "bg.muted" }}
                      minW="auto"
                      h="auto"
                      p={0.5}
                    />
                  </Tooltip>
                )}
              </HStack>
            </HStack>

            {/* Force Inclusion Toggle (advanced options) */}
            {forceInclusionInfo && (
              <Collapse in={showAdvanced} animateOpacity>
                <Box w="full" py={2} px={3} bg="gray.50">
                  <HStack justify="space-between" mb={1}>
                    <Text fontSize="xs" fontWeight="700" color="text.primary">
                      Force Inclusion
                    </Text>
                    <Switch
                      size="sm"
                      isChecked={forceInclusion}
                      onChange={(e) => setForceInclusion(e.target.checked)}
                      colorScheme="blue"
                    />
                  </HStack>
                  <Text fontSize="2xs" color="text.tertiary" fontWeight="500">
                    Submit via L1 deposit ({forceInclusionInfo.l1ChainName}) to guarantee inclusion. Takes ~1-10 min.
                  </Text>
                </Box>
              </Collapse>
            )}
          </VStack>
        </Box>

        {/* Calls List */}
        <VStack spacing={1.5} align="stretch">
          <Text
            fontSize="xs"
            fontWeight="700"
            color="text.secondary"
            textTransform="uppercase"
            px={1}
          >
            Calls
          </Text>
          {calls.map((call, index) => {
            const callOrigin = originPerCall?.[index];
            const card = (
              <CallCard
                call={call}
                index={index}
                chainId={chainId}
                isExpanded={expandedCalls.has(index)}
                onToggle={() => toggleCall(index)}
                onFunctionName={(name) => handleFunctionName(index, name)}
                decodedName={decodedFunctionNames[index]}
                origin={callOrigin?.origin}
                favicon={callOrigin?.favicon ?? null}
              />
            );

            if (!onRemoveCall) {
              return <Box key={index}>{card}</Box>;
            }

            // Cross-dapp batch only: tiny trash button absolutely positioned
            // on the right edge of the call card. Hidden by default, fades in
            // when hovering the call. Absolute positioning means it doesn't
            // take up layout space, so calls don't shift on hover.
            return (
              <Box
                key={index}
                position="relative"
                sx={{
                  "&:hover .delete-call-btn": {
                    opacity: 1,
                    pointerEvents: "auto",
                  },
                }}
              >
                {card}
                <Box
                  className="delete-call-btn"
                  position="absolute"
                  // Anchor to the top of the card (not vertical center) so the
                  // button stays aligned with the always-visible header row
                  // when the call is expanded — otherwise top:50% would push
                  // it into the decoded params area.
                  top={2}
                  right={1.5}
                  opacity={0}
                  pointerEvents="none"
                  transition="opacity 0.15s ease-out"
                  zIndex={2}
                >
                  <Box
                    as="button"
                    type="button"
                    border="2px solid"
                    borderColor="bauhaus.black"
                    bg="bauhaus.white"
                    boxShadow="2px 2px 0px 0px #121212"
                    px={1.5}
                    py={1}
                    cursor="pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveCall(index);
                    }}
                    aria-label={`Remove call ${index + 1}`}
                    sx={{
                      "& svg": { color: "bauhaus.red" },
                      "&:hover": { bg: "bauhaus.red" },
                      "&:hover svg": { color: "white" },
                    }}
                  >
                    <DeleteIcon boxSize={3} />
                  </Box>
                </Box>
              </Box>
            );
          })}
        </VStack>

        {/* Asset Changes (simulate each call individually to avoid self-call issue) */}
        <AssetChangesDisplay
          txRequest={syntheticTxRequest}
          batchCalls={calls.map((c) => ({ to: c.to, data: c.data, value: c.value }))}
          isNonAtomic={isNonAtomic}
        />

        {/* Gas Estimate */}
        <MultiTxGasEstimateDisplay
          transactions={calls.map((c, i) => ({
            tx: {
              from: fromAddress,
              to: c.to || "0x0000000000000000000000000000000000000000",
              data: c.data || "0x",
              value: c.value || "0x0",
              chainId,
            },
            label: decodedFunctionNames[i] || `Call ${i + 1}`,
          }))}
          accountType={accountType || "bankr"}
          isNonAtomic={isNonAtomic}
          // Fire for ANY non-atomic batch (normal or force inclusion) so the user's
          // edited L2 gas limits get passed through to the background.
          onGasEstimates={isNonAtomic ? setCachedGasEstimates : undefined}
          forceInclusion={forceInclusion}
          // Atomic (Bankr): estimate gas for the single ERC-7821 encoded batch tx
          // When force inclusion is on, estimate L1 gas for the encoded batch
          batchedTx={isNonAtomic ? undefined : {
            tx: {
              from: fromAddress,
              to: encodedBatch.to,
              data: encodedBatch.data,
              value: encodedBatch.value,
              chainId,
            },
            label: `Batch Transaction (${calls.length} calls)`,
          }}
        />

        {/* Tenderly link */}
        {(() => {
          const tenderlyUrl = (() => {
            const tenderlyParams = new URLSearchParams({
              from: fromAddress,
              value: encodedBatch.value || "0",
              rawFunctionInput: encodedBatch.data || "0x",
              network: String(chainId),
              contractAddress: encodedBatch.to,
            });
            return `https://dashboard.tenderly.co/simulator/new?${tenderlyParams}`;
          })();
          return (
            <Box
              position="sticky"
              bottom={-3}
              bg={pageBgColor ?? "bg.base"}
              pt={1}
              pb={1}
              mx={-3}
              px={3}
              zIndex={1}
            >
              <VStack spacing={2} align="stretch">
                {/*
                 * Tenderly's dashboard simulator URL only accepts a single tx
                 * (from/to/value/rawFunctionInput/network). For atomic Bankr
                 * batches we encode all calls into one ERC-7821 self-call, which
                 * Tenderly can simulate faithfully. For non-atomic EOA batches
                 * (PK/SP) the EOA has no code and doesn't support ERC-7821, so
                 * the encoded self-call would be misleading. Bundle simulation
                 * only exists via Tenderly's API/RPC, which isn't shareable as
                 * a URL — so we hide the button entirely for non-atomic.
                 */}
                {(!isNonAtomic || showAddToBatch) && (
                  <HStack spacing={1.5} w="full" align="stretch">
                    {!isNonAtomic && (
                      <HStack
                        spacing={2}
                        flex={1}
                        minW={0}
                        border="2px solid"
                        borderColor="bauhaus.black"
                        px={3}
                        py={1.5}
                        justify="center"
                        _hover={{ bg: "bg.muted" }}
                        transition="background 0.15s"
                      >
                        <CopyButton value={tenderlyUrl} />
                        <HStack
                          spacing={2}
                          cursor="pointer"
                          onClick={() => chrome.tabs.create({ url: tenderlyUrl })}
                        >
                          <Image
                            src={googleFaviconUrl("tenderly.co")}
                            boxSize="14px"
                          />
                          <Text
                            fontWeight="700"
                            fontSize="xs"
                            textTransform="uppercase"
                            letterSpacing="wide"
                          >
                            Simulate on Tenderly
                          </Text>
                          <ExternalLinkIcon boxSize={3} />
                        </HStack>
                      </HStack>
                    )}
                    {showAddToBatch && (
                      <Tooltip
                        label={addToBatchDisabledReason ?? ""}
                        isDisabled={!addToBatchDisabledReason}
                        hasArrow
                        fontSize="xs"
                      >
                        {/*
                         * Wrapper Flex stretches to the HStack height (cross
                         * axis) and the inner Button fills it 100%. We avoid
                         * Chakra's `size="sm"` because its fixed `h={8}` wins
                         * over `h="auto"`/`alignSelf="stretch"` and prevents
                         * the button from growing to match a wrapped Tenderly
                         * box.
                         */}
                        <Flex
                          alignSelf="stretch"
                          flexShrink={0}
                        >
                          <Button
                            variant="yellow"
                            onClick={handleAddBundleToBatch}
                            isDisabled={!!addToBatchDisabledReason}
                            fontWeight="800"
                            textTransform="uppercase"
                            letterSpacing="wide"
                            fontSize="2xs"
                            px={2.5}
                            h="full"
                            minH={8}
                          >
                            {batchedCount > 0
                              ? `+ Batch (${batchedCount})`
                              : "+ Batch"}
                          </Button>
                        </Flex>
                      </Tooltip>
                    )}
                  </HStack>
                )}

                {/* Error Display */}
                {error && state === "error" && (
                  <Box
                    bg="bauhaus.red"
                    border="3px solid"
                    borderColor="bauhaus.black"
                    boxShadow="4px 4px 0px 0px #121212"
                    p={3}
                  >
                    <Text color="white" fontSize="sm" fontWeight="700">
                      {error}
                    </Text>
                  </Box>
                )}

                {/* Submitting */}
                {state === "submitting" && (
                  <HStack
                    justify="center"
                    py={3}
                    bg="bauhaus.blue"
                    border="3px solid"
                    borderColor="bauhaus.black"
                  >
                    <Spinner size="sm" color="white" />
                    <Text
                      fontSize="sm"
                      color="white"
                      fontWeight="700"
                      textTransform="uppercase"
                    >
                      Submitting batch...
                    </Text>
                  </HStack>
                )}

                {/* Action Buttons */}
                {state !== "submitting" && (
                  <HStack spacing={3} pb={1}>
                    <Button variant="secondary" flex={1} onClick={handleReject}>
                      Reject
                    </Button>
                    {/*
                     * Cross-dapp batches always show Confirm (the user is on
                     * a Bankr/impersonator account by definition and the ship
                     * goes through the Bankr API). For dapp-initiated batches,
                     * read-only impersonator accounts can't sign, so we hide
                     * the button.
                     */}
                    {(customConfirmHandler || accountType !== "impersonator") && (
                      <Button
                        variant="yellow"
                        flex={1}
                        onClick={handleConfirm}
                        isDisabled={state === "error"}
                        // "Confirm Batch" is longer than the default "Confirm"
                        // — shrink the font so it sits comfortably next to the
                        // Reject button without wrapping or clipping.
                        fontSize={customConfirmHandler ? "sm" : undefined}
                        px={customConfirmHandler ? 2 : undefined}
                      >
                        {customConfirmHandler ? "Confirm Batch" : "Confirm"}
                      </Button>
                    )}
                  </HStack>
                )}
              </VStack>
            </Box>
          );
        })()}
      </VStack>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// CallCard — individual call in the batch (collapsible)
// ---------------------------------------------------------------------------

function CallCard({
  call,
  index,
  chainId,
  isExpanded,
  onToggle,
  onFunctionName,
  decodedName,
  origin,
  favicon,
}: {
  call: ERC5792Call;
  index: number;
  chainId: number;
  isExpanded: boolean;
  onToggle: () => void;
  onFunctionName: (name: string) => void;
  decodedName?: string;
  origin?: string;
  favicon?: string | null;
}) {
  const originHostname = origin
    ? (() => {
        try {
          return new URL(origin).hostname;
        } catch {
          return origin;
        }
      })()
    : null;
  const { networksInfo } = useNetworks();
  const accent = CALL_ACCENTS[index % CALL_ACCENTS.length];
  const config = getChainConfig(chainId);
  const resolvedChain = getResolvedChainById(chainId, networksInfo);
  const hasCalldata = call.data && call.data !== "0x";
  const hasValue =
    call.value && call.value !== "0x0" && call.value !== "0x";

  const sym = resolvedChain?.nativeCurrency.symbol || "ETH";
  const formatValue = (value: string): string => {
    const wei = BigInt(value);
    const eth = Number(wei) / 1e18;
    return `${eth.toFixed(6)} ${sym}`;
  };

  // Display name: decoded function name, or "Native Transfer" for value-only, or "Call"
  const displayName = decodedName
    ? decodedName
    : !hasCalldata && hasValue
      ? "Native Transfer"
      : hasCalldata
        ? "Contract Call"
        : "Call";

  return (
    <Box
      border="2px solid"
      borderColor="bauhaus.black"
      borderLeftWidth="4px"
      borderLeftColor={accent}
      bg="bauhaus.white"
      overflow="hidden"
    >
      {/* Collapsed header */}
      <HStack
        px={3}
        py={2}
        cursor="pointer"
        onClick={onToggle}
        _hover={{ bg: "bg.muted" }}
        transition="background 0.1s"
      >
        <Badge
          bg={accent}
          color={accent === "bauhaus.yellow" ? "bauhaus.black" : "white"}
          fontSize="2xs"
          fontWeight="800"
          px={1.5}
          py={0}
          border="1px solid"
          borderColor="bauhaus.black"
          minW="20px"
          textAlign="center"
        >
          {index + 1}
        </Badge>
        <VStack spacing={0} align="start" flex={1} minW={0}>
          <Text fontSize="xs" fontWeight="700" color="text.primary" isTruncated maxW="100%">
            {displayName}
          </Text>
          {originHostname && (
            <HStack spacing={1} maxW="100%">
              <Image
                src={
                  favicon ||
                  googleFaviconUrl(originHostname)
                }
                alt="favicon"
                boxSize="10px"
                fallback={<Box boxSize="10px" bg="gray.300" borderRadius="sm" />}
              />
              <Text fontSize="2xs" fontWeight="600" color="text.tertiary" isTruncated>
                {originHostname}
              </Text>
            </HStack>
          )}
        </VStack>
        {call.to && (
          <Text fontSize="2xs" fontFamily="mono" color="text.tertiary">
            {call.to.slice(0, 6)}...{call.to.slice(-4)}
          </Text>
        )}
        <Icon
          as={isExpanded ? ChevronUpIcon : ChevronDownIcon}
          boxSize={4}
          color="text.secondary"
        />
      </HStack>

      {/* Expanded content */}
      <Collapse in={isExpanded} animateOpacity>
        <VStack
          spacing={0}
          divider={<Box h="1px" bg="gray.200" w="full" />}
          borderTop="1px solid"
          borderColor="gray.200"
        >
          {/* To */}
          {call.to && (
            <HStack w="full" py={1.5} px={3} justify="space-between">
              <Text
                fontSize="xs"
                color="text.secondary"
                fontWeight="700"
                textTransform="uppercase"
              >
                To
              </Text>
              <HStack
                spacing={0.5}
                px={1.5}
                py={0.5}
                bg="bauhaus.white"
                border="1.5px solid"
                borderColor="bauhaus.black"
              >
                <Text
                  fontSize="xs"
                  color="text.primary"
                  fontFamily="mono"
                  fontWeight="700"
                >
                  {call.to.slice(0, 6)}...{call.to.slice(-4)}
                </Text>
                <CopyButton value={call.to} />
                {config.explorer && (
                  <IconButton
                    aria-label="View on explorer"
                    icon={<ExternalLinkIcon boxSize="10px" />}
                    size="xs"
                    variant="ghost"
                    minW="18px"
                    h="18px"
                    color="text.tertiary"
                    onClick={() =>
                      window.open(
                        `${config.explorer}/address/${call.to}`,
                        "_blank",
                      )
                    }
                    _hover={{ color: "bauhaus.blue", bg: "bg.muted" }}
                  />
                )}
              </HStack>
            </HStack>
          )}

          {/* Value */}
          {hasValue && (
            <HStack w="full" py={1.5} px={3} justify="space-between">
              <Text
                fontSize="xs"
                color="text.secondary"
                fontWeight="700"
                textTransform="uppercase"
              >
                Value
              </Text>
              <Text fontSize="xs" fontWeight="700" color="text.primary">
                {formatValue(call.value!)}
              </Text>
            </HStack>
          )}

          {/* Calldata */}
          {hasCalldata && call.to && (
            <Box w="full" px={2} py={1.5}>
              <CalldataDecoder
                calldata={call.data!}
                to={call.to}
                chainId={chainId}
                onFunctionName={onFunctionName}
              />
            </Box>
          )}
        </VStack>
      </Collapse>
    </Box>
  );
}

export default memo(BatchTransactionConfirmation);
