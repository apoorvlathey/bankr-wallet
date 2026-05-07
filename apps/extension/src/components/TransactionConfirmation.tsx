import { useState, useEffect, useMemo, memo, useRef } from "react";
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
  Tooltip,
  Switch,
  Collapse,
} from "@chakra-ui/react";

import { keyframes } from "@emotion/react";
import {
  ArrowBackIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  CheckIcon,
  ExternalLinkIcon,
  SettingsIcon,
} from "@chakra-ui/icons";
import { PendingTxRequest } from "@/chrome/pendingTxStorage";
import type { CrossDappBatch } from "@/chrome/crossDappBatchStorage";
import { GasOverrides } from "@/chrome/txHandlers";
import { getChainConfig } from "@/constants/chainConfig";
import { useNetworks } from "@/contexts/NetworksContext";
import { resolveAddressToName } from "@/lib/ensUtils";
import CalldataDecoder from "@/components/CalldataDecoder";
import GasEstimateDisplay from "@/components/GasEstimateDisplay";
import AssetChangesDisplay from "@/components/AssetChangesDisplay";
import ERC20ApproveDisplay from "@/components/ERC20ApproveDisplay";
import { FromAccountDisplay } from "@/components/FromAccountDisplay";
import ChainIcon from "@/components/ChainIcon";
import { parseApproveCalldata } from "@/lib/erc20Approve";
import { ethShLabelsUrl, googleFaviconUrl } from "@/constants/externalUrls";
import { useTheme, useStripTokens, useChainBadgeStyle, useIconChipBg } from "@/theme";
import {
  getResolvedChainById,
  getStoredNativeCurrencySymbol,
} from "@/lib/chains";
import {
  isForceInclusionSupportedForAccount,
  FORCE_INCLUSION_CHAINS,
} from "@/constants/chainRegistry";
import ForceInclusionProgress from "@/components/ForceInclusionProgress";

// Success animation keyframes
const scaleIn = keyframes`
  0% { transform: scale(0) rotate(-10deg); opacity: 0; }
  50% { transform: scale(1.1) rotate(5deg); }
  100% { transform: scale(1) rotate(0deg); opacity: 1; }
`;

const checkmarkDraw = keyframes`
  0% { stroke-dashoffset: 50; }
  100% { stroke-dashoffset: 0; }
`;

interface TransactionConfirmationProps {
  txRequest: PendingTxRequest;
  currentIndex: number;
  totalCount: number;
  isInSidePanel: boolean;
  accountType?: "bankr" | "privateKey" | "seedPhrase" | "impersonator";
  onBack: () => void;
  onConfirmed: () => void;
  onRejected: () => void;
  onRejectAll: () => void;
  /**
   * Fired *before* the reject message is sent to the background. Parent uses
   * this to pre-navigate to an adjacent pending request so the popup never
   * enters a "view=txConfirm but selectedTx=null" intermediate state (which
   * would flash the main screen for a frame before onRejected routes to the
   * next request).
   */
  onBeforeReject?: () => void;
  onNavigate: (direction: "prev" | "next") => void;
  /**
   * Currently active cross-dapp batch (if any). Used to gate the
   * "Add to Batch" button (account/chain mismatch → disabled with popover)
   * and to surface a "Batch: N calls" sub-label.
   */
  crossDappBatch?: CrossDappBatch | null;
  /**
   * Called after the tx is successfully added to the cross-dapp batch.
   * Parent should switch the view to the cross-dapp batch confirmation
   * screen so the user lands directly on the assembled batch.
   */
  onAddedToBatch?: () => void;
}

type ConfirmationState = "ready" | "submitting" | "sent" | "error" | "forceInclusion";

// Copy button component
function CopyButton({
  value,
  light,
  label,
}: {
  value: string;
  light?: boolean;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard failures in restricted browser contexts.
    }
  };

  const button = (
    <IconButton
      aria-label={label || "Copy"}
      icon={copied ? <CheckIcon /> : <CopyIcon />}
      size="xs"
      variant="ghost"
      color={
        copied
          ? "accent.highlight"
          : light
            ? "whiteAlpha.800"
            : "text.secondary"
      }
      onClick={handleCopy}
      _hover={{
        color: light ? "white" : "accent.secondary",
        bg: light ? "whiteAlpha.200" : "bg.muted",
      }}
    />
  );

  if (!label) return button;

  return (
    <Tooltip label={label} fontSize="xs" hasArrow>
      {button}
    </Tooltip>
  );
}

/**
 * Split-mode gating: when this PendingTxRequest is one slice of a user-split
 * `wallet_sendCalls` bundle and is NOT the first slice, the Confirm button
 * stays disabled until the prior slice has actually landed onchain so the
 * downstream gas estimation runs against fresh state. Returns:
 *   - { ready: true }                            when no prior to wait for
 *   - { ready: false, label: "Waiting for…" }   while prior is processing
 *   - { ready: true, justResolvedAt: number }    instant prior just succeeded
 *                                                (timestamp lets the caller
 *                                                trigger a fresh estimate)
 *   - { ready: false, label: "Previous tx …" }  prior failed/rejected
 */
type SplitPriorTxState =
  | { ready: true; justResolvedAt?: number }
  | { ready: false; label: string };

function useSplitPriorTxState(txRequest: PendingTxRequest): SplitPriorTxState {
  const parentBundleId = txRequest.parentBundleId;
  const bundleIndex = txRequest.bundleIndex;
  const noPrior = !parentBundleId || bundleIndex === undefined || bundleIndex === 0;

  const [state, setState] = useState<SplitPriorTxState>(
    noPrior
      ? { ready: true }
      : { ready: false, label: "Waiting for previous transaction to confirm…" },
  );

  useEffect(() => {
    if (noPrior) {
      setState({ ready: true });
      return;
    }
    const priorTxId = `${parentBundleId}:split:${(bundleIndex as number) - 1}`;
    let cancelled = false;

    const apply = (tx: { status: string; error?: string }) => {
      if (cancelled) return;
      if (tx.status === "success") {
        setState((prev) =>
          prev.ready ? prev : { ready: true, justResolvedAt: Date.now() },
        );
      } else if (tx.status === "failed") {
        setState({
          ready: false,
          label: `Previous transaction ${
            tx.error?.includes("dropped") ? "was dropped" : "failed"
          } — bundle cancelled`,
        });
      }
    };

    // Initial load via existing getTxHistory message (TxStatusList uses the
    // same channel); no new background handler needed.
    chrome.runtime.sendMessage({ type: "getTxHistory" }, (history) => {
      if (cancelled || !Array.isArray(history)) return;
      const prior = history.find((t: any) => t.id === priorTxId);
      if (prior) apply(prior);
    });

    // Live updates: every history mutation fires `txHistoryUpdated` with the
    // updated entry inline. We just filter for our prior tx id.
    const onMessage = (msg: { type: string; updatedTx?: { id: string; status: string; error?: string } }) => {
      if (msg.type !== "txHistoryUpdated" || !msg.updatedTx) return;
      if (msg.updatedTx.id !== priorTxId) return;
      apply(msg.updatedTx);
    };
    chrome.runtime.onMessage.addListener(onMessage);
    return () => {
      cancelled = true;
      chrome.runtime.onMessage.removeListener(onMessage);
    };
  }, [parentBundleId, bundleIndex, noPrior]);

  return state;
}

function TransactionConfirmation({
  txRequest,
  currentIndex,
  totalCount,
  isInSidePanel,
  accountType,
  onBack,
  onConfirmed,
  onRejected,
  onRejectAll,
  onBeforeReject,
  onNavigate,
  crossDappBatch,
  onAddedToBatch,
}: TransactionConfirmationProps) {
  const { networksInfo } = useNetworks();
  const { themeId, tokens } = useTheme();
  const isDarkTheme = themeId === "midnight";
  // Bauhaus paints the count badge as a stark black strip with white text;
  // Midnight uses a recessed dark surface — see useStripTokens.
  const { bg: stripBg, fg: stripFg } = useStripTokens();
  const iconChipBg = useIconChipBg();
  const resolvedChain = getResolvedChainById(txRequest.tx.chainId, networksInfo);
  // Chain badge colors — all per-theme branching lives in `useChainBadgeStyle`.
  const chainBadgeConfig = getChainConfig(txRequest.tx.chainId);
  const chainBadgeBrandBg = resolvedChain?.bg ?? chainBadgeConfig.bg;
  const chainBadgeBrandFg = resolvedChain?.text ?? chainBadgeConfig.text;
  const chainBadgeStyle = useChainBadgeStyle(
    chainBadgeBrandBg,
    chainBadgeBrandFg,
    resolvedChain?.isCustom ?? false,
  );
  const [state, setState] = useState<ConfirmationState>("ready");
  const [error, setError] = useState<string>("");
  const [toLabels, setToLabels] = useState<string[]>([]);
  const [resolvedToName, setResolvedToName] = useState<string | null>(null);
  const [decodedFunctionName, setDecodedFunctionName] = useState<
    string | undefined
  >();
  const [gasOverrides, setGasOverrides] = useState<GasOverrides | null>(null);
  // Gas-editor validity bubbled up from GasEstimateDisplay. Disables the
  // Confirm button while the user has the Custom-tier editor in an
  // inconsistent state (e.g., Max Fee < Base Fee + Priority).
  const [gasValid, setGasValid] = useState(true);
  const [forceInclusion, setForceInclusion] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Split-mode state. When this tx is part of a user-split wallet_sendCalls
  // bundle we need to (a) gate Confirm until the prior split tx lands and
  // (b) force a fresh gas estimate against the post-prior-tx chain state.
  // The `gasEstimateKey` bumps each time the prior tx flips to success;
  // changing the React `key` on GasEstimateDisplay remounts it so its own
  // useEffect re-runs and pulls a new estimate.
  const splitState = useSplitPriorTxState(txRequest);
  const [gasEstimateKey, setGasEstimateKey] = useState(0);
  const lastSeenSplitResolveRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (splitState.ready && splitState.justResolvedAt &&
        splitState.justResolvedAt !== lastSeenSplitResolveRef.current) {
      lastSeenSplitResolveRef.current = splitState.justResolvedAt;
      setGasEstimateKey((k) => k + 1);
      // Optimistically reset validity so Confirm stays disabled while the
      // remounted GasEstimateDisplay re-runs estimation. It'll flip back to
      // true via onValidityChange once the new estimate resolves.
      setGasValid(false);
    }
  }, [splitState]);

  // Force inclusion info — non-null when the chain supports it and account can submit.
  // For Bankr accounts this also requires the L1 chain (e.g. Ethereum mainnet) to be
  // in BANKR_SUPPORTED_CHAIN_IDS, since Bankr API submits the L1 deposit on their end.
  const forceInclusionInfo = useMemo(() => {
    if (!isForceInclusionSupportedForAccount(txRequest.tx.chainId, accountType)) return null;
    const entry = FORCE_INCLUSION_CHAINS.get(txRequest.tx.chainId)!;
    return { l1ChainId: entry.l1ChainId, l1ChainName: entry.l1ChainName };
  }, [txRequest.tx.chainId, accountType]);

  const { tx, origin, chainName, favicon } = txRequest;
  const isInternalWalletChan = origin === "WalletChan";
  const internalSendTokenLabel = origin.startsWith("Send ")
    ? origin.slice(5).trim()
    : null;

  // ─── Cross-Dapp Batch Eligibility ──────────────────────────────────────
  // The "Add to Batch" action is only meaningful for Bankr accounts
  // (atomic ship via Bankr API). PK / SP accounts are intentionally excluded:
  // for them every call still requires its own signature, so combining them
  // adds friction without benefit. A future 7702 path will lift this.
  // SECURITY: impersonator (view-only) accounts cannot ship batches.
  const canBatchAccount = accountType === "bankr";

  // Reason the button is disabled, or null if it's enabled. Used for the
  // tooltip popover. The button is rendered ONLY when canBatchAccount is true.
  const addToBatchDisabledReason = useMemo<string | null>(() => {
    if (!crossDappBatch) return null; // first add — no constraints yet
    if (
      crossDappBatch.fromAddress.toLowerCase() !== tx.from.toLowerCase()
    ) {
      return "Pending batch on another account — clear it first.";
    }
    if (crossDappBatch.chainId !== tx.chainId) {
      return `Pending batch on ${crossDappBatch.chainName} — clear it first.`;
    }
    return null;
  }, [crossDappBatch, tx.from, tx.chainId]);

  const handleAddToBatch = () => {
    chrome.runtime.sendMessage(
      { type: "addToCrossDappBatch", txId: txRequest.id },
      (result: { success: boolean; error?: string } | undefined) => {
        if (!result?.success) {
          setError(result?.error || "Failed to add to batch");
          setState("error");
          return;
        }
        // Success: jump straight to the cross-dapp batch confirmation
        // screen so the user sees the assembled batch they just added to.
        onAddedToBatch?.();
      },
    );
  };

  const batchedCount = crossDappBatch?.entries.length ?? 0;

  // Native currency symbol for display
  const [nativeSym, setNativeSym] = useState(
    resolvedChain?.nativeCurrency.symbol ?? "ETH",
  );
  useEffect(() => {
    if (resolvedChain?.nativeCurrency.symbol) {
      setNativeSym(resolvedChain.nativeCurrency.symbol);
      return;
    }
    getStoredNativeCurrencySymbol(tx.chainId).then(setNativeSym).catch(() => {});
  }, [resolvedChain, tx.chainId]);

  // Parse origin safely — it may not be a valid URL (e.g. "WalletChan" for internal transfers)
  const originHostname = (() => {
    try {
      return new URL(origin).hostname;
    } catch {
      return null;
    }
  })();

  const originInitials = (() => {
    const label = internalSendTokenLabel || originHostname || origin;
    if (!label) return "WC";
    const words = label.split(/[\s\-_]+/).filter(Boolean);
    if (words.length >= 2) {
      return (words[0][0] + words[1][0]).toUpperCase();
    }
    return label.slice(0, 3).toUpperCase();
  })();

  const originInitialsFallback = (
    <Box
      boxSize="14px"
      borderRadius="sm"
      bg="bg.muted"
      display="flex"
      alignItems="center"
      justifyContent="center"
    >
      <Text fontSize="7px" fontWeight="900" color="text.secondary">
        {originInitials}
      </Text>
    </Box>
  );

  const handleOriginImageError = (e: any) => {
    if (originHostname) {
      const target = e.target as HTMLImageElement;
      const googleFallback = googleFaviconUrl(originHostname);
      if (target.src !== googleFallback) {
        target.src = googleFallback;
        return;
      }
    }
    const target = e.target as HTMLImageElement;
    target.style.display = "none";
  };

  // Fetch labels for the "to" address
  useEffect(() => {
    if (!tx.to) return;

    const fetchLabels = async () => {
      try {
        const response = await fetch(
          ethShLabelsUrl(tx.to, tx.chainId),
        );
        if (response.ok) {
          const labels = await response.json();
          if (Array.isArray(labels) && labels.length > 0) {
            setToLabels(labels);
          }
        }
      } catch (err) {
        // Silently fail - labels are optional
        console.error("Failed to fetch labels:", err);
      }
    };

    fetchLabels();
  }, [tx.to, tx.chainId]);

  // Reverse resolve the "to" address to get ENS/Basename/WNS name
  useEffect(() => {
    if (!tx.to) return;
    resolveAddressToName(tx.to)
      .then((name) => {
        if (name) setResolvedToName(name);
      })
      .catch(() => {});
  }, [tx.to]);

  const handleConfirm = async () => {
    setState("submitting");
    setError("");

    const messageType =
      accountType === "privateKey" || accountType === "seedPhrase"
        ? "confirmTransactionAsyncPK"
        : "confirmTransactionAsync";

    // Determine function name: use decoded name, or "Contract Deployment" for deploys
    const functionName = !tx.to
      ? "Contract Deployment"
      : decodedFunctionName || undefined;

    chrome.runtime.sendMessage(
      {
        type: messageType,
        txId: txRequest.id,
        password: "",
        functionName,
        ...(gasOverrides ? { gasOverrides } : {}),
        ...(forceInclusion ? { forceInclusion: true } : {}),
      },
      (result: { success: boolean; error?: string }) => {
        if (result.success) {
          if (forceInclusion) {
            // Stay open to show force inclusion progress
            setState("forceInclusion");
          } else if (isInSidePanel) {
            // In sidepanel, navigate away immediately
            onConfirmed();
          } else {
            // In popup, show success animation then close
            setState("sent");
            setTimeout(() => {
              window.close();
            }, 1000);
          }
        } else {
          setError(result.error || "Failed to submit transaction");
          setState("error");
        }
      },
    );
  };

  const handleReject = () => {
    onBeforeReject?.();
    chrome.runtime.sendMessage(
      { type: "rejectTransaction", txId: txRequest.id },
      () => {
        onRejected();
      },
    );
  };

  // Detect ERC20 approve calls
  const parsedApproval = useMemo(
    () => (tx.to && tx.data ? parseApproveCalldata(tx.data) : null),
    [tx.to, tx.data],
  );

  const formatValue = (value: string | undefined): string => {
    if (!value || value === "0" || value === "0x0") {
      return `0 ${nativeSym}`;
    }
    const wei = BigInt(value);
    const eth = Number(wei) / 1e18;
    return `${eth.toFixed(6)} ${nativeSym}`;
  };

  const isValueZero =
    !tx.value || tx.value === "0" || tx.value === "0x0" || tx.value === "0x";

  // Force inclusion progress screen
  if (state === "forceInclusion" && forceInclusionInfo) {
    return (
      <Box h="100%" overflowY="auto" bg="surface.base">
        <ForceInclusionProgress
          txId={txRequest.id}
          l1ChainId={forceInclusionInfo.l1ChainId}
          l2ChainId={tx.chainId}
          onComplete={() => {
            if (isInSidePanel) {
              onConfirmed();
            } else {
              setState("sent");
              setTimeout(() => window.close(), 1500);
            }
          }}
          onError={(err) => {
            setError(err);
            setState("error");
          }}
        />
      </Box>
    );
  }

  // Success animation screen (popup mode only)
  if (state === "sent") {
    return (
      <Box
        h="100vh"
        bg="surface.base"
        display="flex"
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        p={8}
        position="relative"
      >
        {/* Geometric decorations — Bauhaus exuberance, Midnight stays restrained */}
        {!isDarkTheme && (
          <>
            <Box
              position="absolute"
              top={6}
              left={6}
              w="16px"
              h="16px"
              bg="accent.primary"
              border="2px solid"
              borderColor="border.default"
            />
            <Box
              position="absolute"
              top={6}
              right={6}
              w="16px"
              h="16px"
              bg="accent.secondary"
              borderRadius="full"
              border="2px solid"
              borderColor="border.default"
            />
            <Box
              position="absolute"
              bottom={6}
              left={6}
              w="0"
              h="0"
              borderLeft="8px solid transparent"
              borderRight="8px solid transparent"
              borderBottom="16px solid"
              borderBottomColor="accent.highlight"
            />
          </>
        )}

        <Box
          w="100px"
          h="100px"
          bg="accent.highlight"
          border={tokens.borders.thick}
          borderColor="border.default"
          borderRadius="lg"
          boxShadow="modal"
          display="flex"
          alignItems="center"
          justifyContent="center"
          animation={`${scaleIn} 0.4s ease-out`}
          mb={6}
        >
          <Icon viewBox="0 0 24 24" w="50px" h="50px" color="accentFg.highlight">
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
          Transaction Sent
        </Text>
        <Text
          fontSize="sm"
          color="text.secondary"
          textAlign="center"
          fontWeight="500"
        >
          Your transaction has been submitted
        </Text>
      </Box>
    );
  }

  return (
    <Box pt="clamp(1.25rem, calc(8vh - 36px), 3rem)" px={3} pb={3} h="100%" overflowY="auto" bg="surface.base" css={{
      "&::-webkit-scrollbar": { width: "4px" },
      "&::-webkit-scrollbar-track": { background: "transparent" },
      "&::-webkit-scrollbar-thumb": { background: "var(--chakra-colors-border-strong)", borderRadius: "2px" },
    }}>
      <VStack spacing={2} align="stretch" minH="100%">
        {/* Top row — navigation centered + Reject All on right, only when
            multiple pending requests are queued. chart.negative is the only
            token that's RED in BOTH themes — status.error.fg is WHITE in
            Bauhaus (it pairs with the RED bg) and would render invisibly
            on this surface. */}
        {totalCount > 1 && (
          <Flex align="center" justify="center" position="relative">
            <HStack spacing={0}>
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
                bg={stripBg}
                color={stripFg}
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
            <Button
              position="absolute"
              right={0}
              size="xs"
              variant="ghost"
              color="chart.negative"
              fontWeight="700"
              _hover={{ bg: "status.error.bg", color: "status.error.fg" }}
              onClick={onRejectAll}
              px={2}
            >
              Reject All
            </Button>
          </Flex>
        )}

        {/* Header row — back + title pill + copy, all inline.
            Title pill: approve uses highlight (amber/yellow) accent, normal
            txs use the secondary (cyan/blue) accent. The corner ornament is
            a Bauhaus exuberance and is hidden under Midnight. `mb` only
            kicks in once the viewport is tall enough (~700px+); popup
            windows stay tight against the info card. */}
        <HStack spacing={2} align="center" mb="clamp(0px, calc(8vh - 56px), 3rem)">
          <IconButton
            aria-label="Back"
            icon={<ArrowBackIcon />}
            variant="ghost"
            size="md"
            px={2}
            onClick={onBack}
            flexShrink={0}
          />

          <Box
            flex="1"
            minW={0}
            bg={parsedApproval ? "accent.highlight" : "accent.secondary"}
            border={tokens.borders.medium}
            borderColor="border.default"
            borderRadius="lg"
            boxShadow="card"
            py={1.5}
            px={3}
            position="relative"
          >
            {!isDarkTheme && (
              <Box
                position="absolute"
                top="-3px"
                right="-3px"
                w="8px"
                h="8px"
                bg={parsedApproval ? "accent.secondary" : "accent.highlight"}
                border="2px solid"
                borderColor="border.default"
              />
            )}
            <Text
              fontWeight="900"
              fontSize="sm"
              color={parsedApproval ? "accentFg.highlight" : "accentFg.secondary"}
              textAlign="center"
              textTransform="uppercase"
              letterSpacing="wider"
              noOfLines={1}
            >
              {parsedApproval ? "Token Approval Request" : "Transaction Request"}
            </Text>
          </Box>

          <Box flexShrink={0}>
            <CopyButton
              label="Copy tx JSON"
              value={JSON.stringify(
                {
                  to: tx.to || null,
                  value:
                    tx.value && tx.value !== "0" && tx.value !== "0x0"
                      ? BigInt(tx.value).toString()
                      : "0",
                  data: tx.data || "0x",
                },
                null,
                2,
              )}
            />
          </Box>
        </HStack>

        {/* Split-mode step indicator. Shown when this confirmation is one
            slice of a user-split wallet_sendCalls bundle. Helps the user
            keep track of "where are we" across the sequence. */}
        {txRequest.parentBundleId !== undefined &&
          txRequest.bundleIndex !== undefined &&
          txRequest.bundleTotalCalls !== undefined && (
            <HStack
              w="full"
              py={2}
              px={3}
              bg="accent.secondary"
              border={tokens.borders.medium}
              borderColor="border.default"
              borderRadius="lg"
              justify="space-between"
            >
              <Text
                fontSize="xs"
                color="accentFg.secondary"
                fontWeight="700"
                textTransform="uppercase"
              >
                Split batch
              </Text>
              <Badge
                fontSize="xs"
                bg="accentFg.secondary"
                color="accent.secondary"
                fontWeight="900"
                px={2}
                py={0.5}
              >
                Step {txRequest.bundleIndex + 1} of {txRequest.bundleTotalCalls}
              </Badge>
            </HStack>
          )}

        {/* ERC20 Approve detection — shown above tx info when present */}
        {tx.to && parsedApproval && (
          <ERC20ApproveDisplay
            tokenAddress={tx.to}
            approval={parsedApproval}
            chainId={tx.chainId}
            txId={txRequest.id}
          />
        )}

        {/* Transaction Info Card */}
        <Box
          bg="surface.raised"
          border={tokens.borders.thin}
          borderColor="border.default"
          borderRadius="lg"
          boxShadow="card"
          overflow="hidden"
          position="relative"
        >
          {/* Rows use explicit borderTop instead of VStack's `divider` prop
              — see BatchTransactionConfirmation info card for the rationale.
              tl;dr Chakra's divider applies borderBottomWidth:1px with no
              color, so it inherits currentColor and paints as near-white. */}
          <VStack spacing={0} align="stretch">
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
                  bg={isInternalWalletChan ? "transparent" : iconChipBg}
                  border={isInternalWalletChan ? "none" : "1.5px solid"}
                  borderColor="border.subtle"
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
                  ) : favicon ? (
                    <Image
                      src={favicon}
                      alt="favicon"
                      boxSize="14px"
                      sx={{ filter: "drop-shadow(0 0 0.5px rgba(0,0,0,0.4)) drop-shadow(0 0 0.5px rgba(255,255,255,0.4))" }}
                      onError={handleOriginImageError}
                      fallback={originInitialsFallback}
                    />
                  ) : originHostname ? (
                    <Image
                      src={googleFaviconUrl(originHostname)}
                      alt="favicon"
                      boxSize="14px"
                      sx={{ filter: "drop-shadow(0 0 0.5px rgba(0,0,0,0.4)) drop-shadow(0 0 0.5px rgba(255,255,255,0.4))" }}
                      onError={handleOriginImageError}
                      fallback={originInitialsFallback}
                    />
                  ) : (
                    originInitialsFallback
                  )}
                </Box>
                <Text fontSize="xs" fontWeight="700" color="text.primary">
                  {originHostname || origin}
                </Text>
              </HStack>
            </HStack>

            {/* From */}
            <HStack
              w="full"
              py={1.5}
              px={3}
              justify="space-between"
              borderTop="1px solid"
              borderColor="border.subtle"
            >
              <Text
                fontSize="xs"
                color="text.secondary"
                fontWeight="700"
                textTransform="uppercase"
              >
                From
              </Text>
              <FromAccountDisplay address={tx.from} />
            </HStack>

            {/* Network */}
            <HStack
              w="full"
              py={1.5}
              px={3}
              justify="space-between"
              borderTop="1px solid"
              borderColor="border.subtle"
            >
              <Text
                fontSize="xs"
                color="text.secondary"
                fontWeight="700"
                textTransform="uppercase"
              >
                Network
              </Text>
              <HStack spacing={1}>
                <Badge
                  fontSize="xs"
                  bg={chainBadgeStyle.bg}
                  color={chainBadgeStyle.fg}
                  border="1.5px solid"
                  borderColor={chainBadgeStyle.border}
                  fontWeight="700"
                  px={2}
                  py={0.5}
                  display="flex"
                  alignItems="center"
                  gap={1}
                >
                  <ChainIcon
                    chainId={tx.chainId}
                    chainName={resolvedChain?.name ?? chainName}
                    size="12px"
                    withChip
                  />
                  {resolvedChain?.name ?? chainName}
                  {forceInclusion && forceInclusionInfo && (
                    <Text as="span" fontSize="2xs" opacity={0.7}>
                      via {forceInclusionInfo.l1ChainName}
                    </Text>
                  )}
                </Badge>
                {forceInclusionInfo && (
                  <Tooltip label="Advanced options" fontSize="xs" hasArrow>
                    <IconButton
                      aria-label="Advanced options"
                      icon={<SettingsIcon boxSize="10px" />}
                      size="xs"
                      variant="ghost"
                      minW="20px"
                      h="20px"
                      color={showAdvanced ? "accent.secondary" : "text.tertiary"}
                      onClick={() => setShowAdvanced(!showAdvanced)}
                      _hover={{ color: "accent.secondary", bg: "bg.muted" }}
                    />
                  </Tooltip>
                )}
              </HStack>
            </HStack>

            {/* Force Inclusion Toggle (advanced options) */}
            {forceInclusionInfo && (
              <Collapse in={showAdvanced} animateOpacity>
                <Box w="full" py={2} px={3} bg="bg.muted">
                  <HStack justify="space-between" mb={1}>
                    <Text fontSize="xs" fontWeight="700" color="text.primary" textTransform="uppercase">
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

            {/* To Address / Contract Deployment.
                Hidden on ERC20 approvals — the token contract is already
                surfaced as the TOKEN row in the approval card above, so
                showing it again here (with the "Circle: USDC Token" label)
                is pure noise. */}
            {!parsedApproval && (
            <Box
              w="full"
              py={1.5}
              px={3}
              borderTop="1px solid"
              borderColor="border.subtle"
            >
              <HStack
                justify="space-between"
                mb={toLabels.length > 0 || resolvedToName ? 1 : 0}
              >
                <Text
                  fontSize="xs"
                  color="text.secondary"
                  fontWeight="700"
                  textTransform="uppercase"
                >
                  {tx.to ? "To" : "Type"}
                </Text>
                {tx.to ? (
                  <VStack spacing={1} align="flex-end">
                    {resolvedToName && (
                      <Badge
                        fontSize="2xs"
                        bg="accent.highlight"
                        color="accentFg.highlight"
                        border="1.5px solid"
                        borderColor="border.default"
                        px={1.5}
                        py={0}
                        fontWeight="700"
                        maxW="200px"
                        isTruncated
                      >
                        {resolvedToName}
                      </Badge>
                    )}
                    <HStack
                      spacing={0.5}
                      px={1.5}
                      py={0.5}
                      bg="surface.raised"
                      border="1.5px solid"
                      borderColor="border.default"
                      borderRadius="md"
                    >
                      <Text
                        fontSize="xs"
                        color="text.primary"
                        fontFamily="mono"
                        fontWeight="700"
                      >
                        {tx.to.slice(0, 6)}...{tx.to.slice(-4)}
                      </Text>
                      <CopyButton value={tx.to} />
                      {(() => {
                        const explorer = resolvedChain?.explorer || getChainConfig(tx.chainId).explorer;
                        return explorer ? (
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
                                `${explorer}/address/${tx.to}`,
                                "_blank"
                              )
                            }
                            _hover={{ color: "accent.secondary", bg: "bg.muted" }}
                          />
                        ) : null;
                      })()}
                    </HStack>
                  </VStack>
                ) : (
                  <Badge
                    fontSize="xs"
                    bg="accent.highlight"
                    color="accentFg.highlight"
                    border="1.5px solid"
                    borderColor="border.default"
                    fontWeight="700"
                    px={2}
                    py={0.5}
                  >
                    Contract Deployment
                  </Badge>
                )}
              </HStack>
              {toLabels.length > 0 && (
                <Flex justify="flex-end">
                  <Badge
                    fontSize="2xs"
                    bg="accent.secondary"
                    color="accentFg.secondary"
                    border="1.5px solid"
                    borderColor="border.default"
                    px={1.5}
                    py={0}
                    fontWeight="700"
                    maxW="200px"
                    isTruncated
                  >
                    {toLabels[0]}
                  </Badge>
                </Flex>
              )}
            </Box>
            )}

            {/* Value — hidden on ERC20 approvals when zero (always the
                common case). A non-zero value on an `approve(...)` call is
                unusual enough that we still surface it. */}
            {(!parsedApproval || !isValueZero) && (
              <HStack
                w="full"
                py={1.5}
                px={3}
                justify="space-between"
                borderTop="1px solid"
                borderColor="border.subtle"
              >
                <Text
                  fontSize="xs"
                  color="text.secondary"
                  fontWeight="700"
                  textTransform="uppercase"
                >
                  Value
                </Text>
                <Text fontSize="xs" fontWeight="700" color="text.primary">
                  {formatValue(tx.value)}
                </Text>
              </HStack>
            )}
          </VStack>
        </Box>

        {/* Asset Changes (simulation) */}
        {tx.to && <AssetChangesDisplay txRequest={txRequest} />}

        {/* Gas Estimate. The `key` includes the split-resolution counter so
            the component remounts after the prior split tx lands, forcing a
            fresh eth_estimateGas against the new chain state. */}
        <GasEstimateDisplay
          key={gasEstimateKey}
          txRequest={txRequest}
          accountType={accountType}
          onGasOverrides={setGasOverrides}
          onValidityChange={setGasValid}
          forceInclusion={forceInclusion}
        />

        {/* Calldata (Decoded + Raw). Collapsed by default on approvals —
            the structured ERC20ApproveDisplay above already shows function
            + spender + amount; the decoder panel is redundant for the
            common case but one click away for power users. */}
        {tx.data && tx.data !== "0x" && tx.to && (
          <CalldataDecoder
            calldata={tx.data}
            to={tx.to}
            chainId={tx.chainId}
            onFunctionName={setDecodedFunctionName}
            defaultCollapsed={!!parsedApproval}
          />
        )}
        {/* Raw-only fallback for contract deployments */}
        {tx.data && tx.data !== "0x" && !tx.to && (
          <Box
            bg="surface.raised"
            p={3}
            border={tokens.borders.medium}
            borderColor="border.default"
            borderRadius="lg"
            boxShadow="card"
          >
            <HStack mb={2} alignItems="center">
              <Text
                fontSize="sm"
                color="text.secondary"
                fontWeight="700"
                textTransform="uppercase"
              >
                Deploy Data
              </Text>
              <Spacer />
              <CopyButton value={tx.data} />
            </HStack>
            <Box
              p={3}
              bg="bg.muted"
              border={tokens.borders.thin}
              borderColor="border.default"
              borderRadius="md"
              maxH="100px"
              overflowY="auto"
              css={{
                "&::-webkit-scrollbar": { width: "6px" },
                "&::-webkit-scrollbar-track": { background: "var(--chakra-colors-bg-muted)" },
                "&::-webkit-scrollbar-thumb": { background: "var(--chakra-colors-border-default)" },
              }}
            >
              <Text
                fontSize="xs"
                fontFamily="mono"
                color="text.primary"
                wordBreak="break-all"
                whiteSpace="pre-wrap"
              >
                {tx.data}
              </Text>
            </Box>
          </Box>
        )}

        {/* Pinned bottom section — `mt="auto"` keeps it at the bottom when
            content is shorter than the viewport; `position:sticky` keeps it
            visible while scrolling long calldata. */}
        <Box
          mt="auto"
          position="sticky"
          bottom={-3}
          bg="surface.base"
          pt={1}
          pb={1}
          mx={-3}
          px={3}
          zIndex={1}
        >
        <VStack spacing={2} align="stretch">
        {/* Simulate on Tenderly + (single-pending) Add-to-Batch pill */}
        {(() => {
          const tenderlyUrl = (() => {
            const params = new URLSearchParams({
              from: tx.from,
              value: tx.value || "0",
              rawFunctionInput: tx.data || "0x",
              network: String(tx.chainId),
              ...(tx.to ? { contractAddress: tx.to } : {}),
            });
            return `https://dashboard.tenderly.co/simulator/new?${params}`;
          })();
          const showInlineBatch = canBatchAccount;
          const tenderlyBox = (
            <HStack
              spacing={2}
              w="full"
              border={tokens.borders.thin}
              borderColor="border.default"
              borderRadius="md"
              px={3}
              py={1.5}
              justify="center"
              _hover={{ bg: "bg.muted" }}
              transition="background 0.15s"
            >
              <CopyButton value={tenderlyUrl} label="Copy Tenderly URL" />
              <HStack
                spacing={2}
                cursor="pointer"
                onClick={() => {
                  chrome.tabs.create({ url: tenderlyUrl });
                }}
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
          );
          if (!showInlineBatch) return tenderlyBox;
          return (
            <HStack spacing={1.5} w="full" align="stretch">
              <Box flex={1} minW={0}>
                {tenderlyBox}
              </Box>
              <Tooltip
                label={addToBatchDisabledReason ?? ""}
                isDisabled={!addToBatchDisabledReason}
                hasArrow
                fontSize="xs"
              >
                {/*
                 * Wrapper Flex stretches to the HStack height (cross axis)
                 * and the inner Button fills it 100%. We avoid Chakra's
                 * `size="sm"` because its fixed `h={8}` wins over
                 * `h="auto"`/`alignSelf="stretch"` and prevents the button
                 * from growing to match a wrapped Tenderly box.
                 */}
                <Flex alignSelf="stretch" flexShrink={0}>
                  <Button
                    variant="highlight"
                    onClick={handleAddToBatch}
                    isDisabled={!!addToBatchDisabledReason}
                    fontWeight="800"
                    textTransform="uppercase"
                    letterSpacing="wide"
                    fontSize="2xs"
                    px={2.5}
                    h="full"
                    minH={8}
                  >
                    {batchedCount > 0 ? `+ Batch (${batchedCount})` : "+ Batch"}
                  </Button>
                </Flex>
              </Tooltip>
            </HStack>
          );
        })()}

        {/* Error Display */}
        {error && state === "error" && (
          <Box
            bg="status.error.bg"
            border={tokens.borders.medium}
            borderColor="status.error.border"
            borderRadius="lg"
            boxShadow="card"
            p={3}
          >
            <Text color="status.error.fg" fontSize="sm" fontWeight="700">
              {error}
            </Text>
          </Box>
        )}

        {/* Status Messages */}
        {state === "submitting" && (
          <HStack
            justify="center"
            py={3}
            bg="accent.secondary"
            border={tokens.borders.medium}
            borderColor="border.default"
            borderRadius="lg"
          >
            <Spinner size="sm" color="accentFg.secondary" />
            <Text
              fontSize="sm"
              color="accentFg.secondary"
              fontWeight="700"
              textTransform="uppercase"
            >
              Submitting transaction...
            </Text>
          </HStack>
        )}

        {/* Impersonator Info Box */}
        {accountType === "impersonator" && (
          <Box
            bg="accent.highlight"
            border={tokens.borders.medium}
            borderColor="border.default"
            borderRadius="lg"
            boxShadow="card"
            p={3}
          >
            <Text fontSize="sm" color="accentFg.highlight" fontWeight="700">
              Connected via Impersonated account — signing is disabled.
            </Text>
          </Box>
        )}

        {/* Split-mode status banner. Shown when this confirmation is part of
            a user-split bundle and we're either waiting for the prior call
            to confirm onchain or re-estimating gas against the new state. */}
        {(!splitState.ready ||
          (txRequest.parentBundleId && txRequest.bundleIndex !== undefined &&
           txRequest.bundleIndex > 0 && !gasValid)) && state !== "submitting" && (
          <HStack
            justify="center"
            py={3}
            bg="bg.muted"
            border={tokens.borders.medium}
            borderColor="border.default"
            borderRadius="lg"
          >
            {splitState.ready ? null : (
              <Spinner size="sm" color="text.secondary" />
            )}
            <Text
              fontSize="sm"
              color="text.secondary"
              fontWeight="700"
              textTransform="uppercase"
            >
              {!splitState.ready
                ? splitState.label
                : "Estimating gas with new chain state…"}
            </Text>
          </HStack>
        )}

        {/* Action Buttons */}
        {state !== "submitting" && (
          <HStack spacing={3} pb={1}>
            <Button variant="secondary" flex={1} onClick={handleReject}>
              Reject
            </Button>
            {accountType !== "impersonator" && (
              <Button
                variant="highlight"
                flex={1}
                onClick={handleConfirm}
                isDisabled={state === "error" || !gasValid || !splitState.ready}
              >
                Confirm
              </Button>
            )}
          </HStack>
        )}
        </VStack>
        </Box>
      </VStack>
    </Box>
  );
}

export default memo(TransactionConfirmation);
