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
  Image,
  Icon,
  Collapse,
  Switch,
  Tooltip,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
  usePrefersReducedMotion,
} from "@chakra-ui/react";
import { keyframes } from "@emotion/react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DeleteIcon,
  ExternalLinkIcon,
  SettingsIcon,
  WarningIcon,
} from "@chakra-ui/icons";
import type { PendingBatchTxRequest } from "@/chrome/erc5792Types";
import type { PendingTxRequest } from "@/chrome/pendingTxStorage";
import type { CrossDappBatch } from "@/chrome/crossDappBatchStorage";
import type { GasEstimate } from "@/chrome/gasEstimation";
import { getChainConfig } from "@/constants/chainConfig";
import { useBatchPlan } from "@/hooks/useBatchPlan";
import AssetChangesDisplay, {
  SimulationRevertedBanner,
  SimulationUnavailableBanner,
} from "@/components/AssetChangesDisplay";
import { detectAbiEncodingError } from "@/lib/calldataValidation";
import { MalformedCalldataBanner } from "@/components/MalformedCalldataBanner";
import { CalldataDigestDisplay } from "@/components/DigestDisplay";
import { FromAccountDisplay } from "@/components/FromAccountDisplay";
import { CopyButton } from "@/components/CopyButton";
import ChainIcon from "@/components/ChainIcon";
import MultiTxGasEstimateDisplay from "@/components/MultiTxGasEstimateDisplay";
import ForceInclusionProgress from "@/components/ForceInclusionProgress";
import SmartAccountSetupBanner from "@/components/SmartAccountSetupBanner";
import {
  CallCard,
  BatchClearSigningSummary,
  CALL_ACCENTS,
  CALL_ACCENT_FGS,
} from "@/components/BatchCallsList";
import NativeValueAmount from "@/components/NativeValueAmount";
import { nativeAmountToNumber } from "@/lib/nativeValueFormat";
import {
  encodeBatchCalls,
  omitOuterValueForEip7702,
} from "@/chrome/batchTxHandlers";
import { isForceInclusionSupportedForAccount, FORCE_INCLUSION_CHAINS } from "@/constants/chainRegistry";
import { googleFaviconUrl } from "@/constants/externalUrls";
import { useNetworks } from "@/contexts/NetworksContext";
import { getNativeAssetMeta, getResolvedChainById } from "@/lib/chains";
import { isDarkThemeId, useTheme, useStripTokens, useChainBadgeStyle, useIconChipBg } from "@/theme";
import { normalizeTransactionValue } from "@/chrome/transactionValidation";
import {
  AssetDeltaRow,
  ConfirmationScreen,
  InlineDisclosure,
  OutcomeCard,
} from "@/components/ui";
import { playInteractionSound } from "@/sounds/soundManager";

const scaleIn = keyframes`
  0% { transform: scale(0) rotate(-10deg); opacity: 0; }
  50% { transform: scale(1.1) rotate(5deg); }
  100% { transform: scale(1) rotate(0deg); opacity: 1; }
`;

const checkmarkDraw = keyframes`
  0% { stroke-dashoffset: 50; }
  100% { stroke-dashoffset: 0; }
`;

// Lucide `Unlink` glyph — two open chain-link halves separated by a gap.
// Used as the affordance for split mode on the CALLS header. Inline because
// the project doesn't depend on react-icons / lucide-react.
const UnlinkIcon = (props: React.ComponentProps<typeof Icon>) => (
  <Icon viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="m18.84 12.25 1.72-1.71h-.02a5.004 5.004 0 0 0-.12-7.07 5.006 5.006 0 0 0-6.95 0l-1.72 1.71" />
    <path d="m5.17 11.75-1.71 1.71a5.004 5.004 0 0 0 .12 7.07 5.006 5.006 0 0 0 6.95 0l1.71-1.71" />
    <line x1="8" x2="8" y1="2" y2="5" />
    <line x1="2" x2="5" y1="8" y2="8" />
    <line x1="16" x2="16" y1="19" y2="22" />
    <line x1="19" x2="22" y1="16" y2="16" />
  </Icon>
);

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
  /**
   * Fired *before* the reject message is sent to the background so the parent
   * can pre-navigate to an adjacent pending request, avoiding a flash of the
   * main screen between storage update and onRejected navigation.
   */
  onBeforeReject?: () => void;
  onNavigate: (direction: "prev" | "next") => void;
  /**
   * Cross-dapp batch only: when set, render a trash icon to the LEFT of each
   * call (outside the collapse). The handler is invoked with the call index.
   */
  onRemoveCall?: (callIndex: number) => void;
  /**
   * Override for persisting an edited call's calldata. Defaults to sending
   * `updateCallInPendingBatch` with the current `batchRequest.id`, which is
   * correct for dapp-initiated batches. The cross-dapp wrapper supplies its
   * own to route through `updateCallInCrossDappBatch` since cross-dapp entries
   * live in a different storage key.
   */
  onEditCallData?: (
    callIndex: number,
    newData: string,
  ) => Promise<{ success: boolean; error?: string }>;
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
  customConfirmHandler?: (
    gasEstimates?: GasEstimate[] | null,
  ) => Promise<{ success: boolean; error?: string }>;
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
  onBeforeReject,
  onNavigate,
  onRemoveCall,
  onEditCallData,
  originPerCall,
  titleOverride,
  customConfirmHandler,
  customRejectHandler,
  crossDappBatch,
  onAddedToBatch,
  pageBgColor,
}: BatchTransactionConfirmationProps) {
  const { themeId, tokens } = useTheme();
  const isDarkTheme = isDarkThemeId(themeId);
  const prefersReducedMotion = usePrefersReducedMotion();
  // Same theme-aware count badge pattern as Phase 5/8 — see useStripTokens.
  const { bg: stripBg, fg: stripFg } = useStripTokens();
  const iconChipBg = useIconChipBg();
  const { networksInfo } = useNetworks();
  const resolvedChain = getResolvedChainById(batchRequest.chainId, networksInfo);
  // Chain badge colors — all theme-specific branching lives in the hook.
  const chainBadgeConfig = getChainConfig(batchRequest.chainId);
  const chainBadgeBrandBg = resolvedChain?.bg ?? chainBadgeConfig.bg;
  const chainBadgeBrandFg = resolvedChain?.text ?? chainBadgeConfig.text;
  const chainBadgeStyle = useChainBadgeStyle(
    chainBadgeBrandBg,
    chainBadgeBrandFg,
    resolvedChain?.isCustom ?? false,
  );
  const [state, setState] = useState<ConfirmationState>("ready");
  const [error, setError] = useState<string>("");
  // Tracks the in-flight reject for immediate spinner feedback while the
  // background tears down the bundle and the parent navigates away.
  const [isRejecting, setIsRejecting] = useState(false);
  const [isAddingToBatch, setIsAddingToBatch] = useState(false);
  const [expandedCalls, setExpandedCalls] = useState<Set<number>>(new Set());
  const [decodedFunctionNames, setDecodedFunctionNames] = useState<
    Record<number, string>
  >({});
  const [cachedGasEstimates, setCachedGasEstimates] = useState<GasEstimate[] | null>(null);
  // Source-chain native USD price piggybacked off the gas estimator's
  // CoinGecko lookup — reused for the Value row USD display so we don't
  // double-fetch.
  const [nativePriceUsd, setNativePriceUsd] = useState<number | null>(null);
  // Bubbled from MultiTxGasEstimateDisplay — false while the user has the
  // Custom-tier shared editor in an inconsistent state.
  const [gasValid, setGasValid] = useState(true);
  const [forceInclusion, setForceInclusion] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  // Fed by AssetChangesDisplay below. Drives the top-of-screen revert
  // banner so the warning lands above the clear-signing summary.
  const [simulationReverted, setSimulationReverted] = useState(false);
  const [simulationUnavailable, setSimulationUnavailable] = useState(false);
  // Fed by MultiTxGasEstimateDisplay below. Drives the top-of-screen
  // "may revert" banner so it lands above asset changes and the call list,
  // not buried next to the gas row.
  const [anyTxMayRevert, setAnyTxMayRevert] = useState(false);
  // EIP-7702 smart-account-setup row stays collapsed by default to keep the
  // confirm screen calm. Users can tap "Details" if they want the delegate.
  // Split-mode modal: opens when the user clicks the gear next to "Calls".
  const {
    isOpen: isSplitModalOpen,
    onOpen: onSplitModalOpen,
    onClose: onSplitModalClose,
  } = useDisclosure();
  const [splitting, setSplitting] = useState(false);

  const { params, origin, chainName, favicon, chainId } = batchRequest;
  const calls = params.calls;
  const hasDeploymentCall = calls.some((call) => !call.to);
  const nativeAsset = getNativeAssetMeta(chainId, networksInfo);
  const nativeSymbol = nativeAsset?.symbol ?? "ETH";
  const nativeDecimals = nativeAsset?.decimals ?? 18;

  const malformedValueInfo = useMemo(() => {
    for (let i = 0; i < calls.length; i++) {
      const result = normalizeTransactionValue(calls[i].value);
      if (!result.ok) {
        return { index: i, reason: result.error };
      }
    }
    return null;
  }, [calls]);
  const isValueMalformed = !!malformedValueInfo;

  // Sum of msg.value across all calls. Surfaced in the top summary box so a
  // user reviewing a multi-call batch (e.g. a bridge whose second call carries
  // a LayerZero relayer fee paid as native) sees the total native outlay at a
  // glance, instead of having to expand each call to find a Value row.
  const totalValueWei = useMemo(() => {
    let total = 0n;
    for (const c of calls) {
      if (!c.value || c.value === "0x" || c.value === "0x0") continue;
      try {
        total += BigInt(c.value);
      } catch {
        /* malformed value — handled elsewhere */
      }
    }
    return total;
  }, [calls]);

  // Strict ABI validation across every call in the batch. If any single call's
  // calldata is malformed (non-zero address padding on a known ERC20 selector,
  // wrong length, …) we block confirmation for the whole batch. See
  // `lib/calldataValidation.ts` for the rationale.
  const malformedCallInfo = useMemo(() => {
    for (let i = 0; i < calls.length; i++) {
      const result = detectAbiEncodingError(calls[i].data);
      if (result.malformed) {
        return { index: i, ...result };
      }
    }
    return null;
  }, [calls]);
  const isCalldataMalformed = !!malformedCallInfo;

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
  const batchPlan = useBatchPlan({
    accountId: batchRequest.accountId ?? null,
    accountType: accountType ?? null,
    chainId: batchRequest.chainId,
  });
  const isLocalSigningAccount =
    accountType === "privateKey" || accountType === "seedPhrase";
  const isEip7702Atomic =
    isLocalSigningAccount && batchPlan.strategy === "atomic-7702";

  // Encode batch calls for simulation and Tenderly. The encoder throws when
  // an inner call targets the user's own EOA with payload — catch so React
  // doesn't crash and we can render a banner instead. Empty placeholder batch
  // keeps downstream simulators/Tenderly inert; signing is blocked separately
  // via `encodingError` below.
  const { encodedBatch, encodingError } = useMemo(() => {
    if (malformedValueInfo) {
      return {
        encodedBatch: {
          to: fromAddress,
          data: "0x" as `0x${string}`,
          value: "0x0",
        },
        encodingError: null,
      };
    }
    try {
      return { encodedBatch: encodeBatchCalls(calls, fromAddress), encodingError: null };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        encodedBatch: {
          to: fromAddress,
          data: "0x" as `0x${string}`,
          value: "0x0",
        },
        encodingError: msg,
      };
    }
  }, [calls, fromAddress, malformedValueInfo]);
  const outerEncodedBatch = useMemo(
    () =>
      isEip7702Atomic
        ? omitOuterValueForEip7702(encodedBatch)
        : encodedBatch,
    [encodedBatch, isEip7702Atomic],
  );

  // Synthetic PendingTxRequest for AssetChangesDisplay
  const syntheticTxRequest: PendingTxRequest = useMemo(
    () => ({
      id: batchRequest.id,
      tx: {
        from: fromAddress,
        to: outerEncodedBatch.to,
        data: outerEncodedBatch.data,
        value: outerEncodedBatch.value,
        chainId,
      },
      origin: batchRequest.origin,
      favicon: batchRequest.favicon,
      chainName: batchRequest.chainName,
      timestamp: batchRequest.timestamp,
    }),
    [batchRequest, outerEncodedBatch, fromAddress, chainId],
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

  // PK/SP defaults to non-atomic (auto-sequential broadcasts). Once we
  // resolve a 7702 delegate for the EOA+chain, flip to atomic — the batch
  // ships as a single type-4 tx that the EOA self-executes via ERC-7821.
  // During the brief resolve window we hold non-atomic to avoid UI flicker.
  const isNonAtomic =
    (accountType === "privateKey" || accountType === "seedPhrase") &&
    batchPlan.strategy !== "atomic-7702";

  // Split mode: only meaningful for PK/Seed accounts. Cross-dapp batches
  // (`customConfirmHandler` present) and Bankr/impersonator accounts are
  // excluded — different code paths that don't have the gas-estimation
  // problem split solves. Force-inclusion is exclusive too: the split path
  // queues plain individual txs and would silently drop the user's force-
  // inclusion choice. Note that `params.atomicRequired` is intentionally
  // NOT checked here: PK/SP auto-sequential broadcast already ignores it
  // (see ERC5792.md), so the dapp's atomicity contract is the same whether
  // the user picks the default Confirm or the Split escape hatch.
  const canSplitBatch =
    isNonAtomic &&
    !customConfirmHandler &&
    !forceInclusion &&
    calls.length > 0;

  const handleConfirmSplit = async () => {
    if (splitting) return;
    void playInteractionSound("transactionConfirm");
    setSplitting(true);
    try {
      const result = await new Promise<{ success: boolean; error?: string }>(
        (resolve) => {
          chrome.runtime.sendMessage(
            { type: "splitBatchIntoIndividualTxs", bundleId: batchRequest.id },
            (r) => resolve(r),
          );
        },
      );
      if (!result?.success) {
        setError(result?.error || "Failed to split batch");
        setState("error");
      }
      // On success the popup closes itself via the same `batchTxResult` ack
      // channel that confirm/reject use — no explicit navigation here.
      onSplitModalClose();
    } finally {
      setSplitting(false);
    }
  };

  // Force inclusion info — non-null when chain supports it and account can submit.
  // For Bankr accounts this also requires the L1 chain (e.g. Ethereum mainnet) to be
  // in BANKR_SUPPORTED_CHAIN_IDS, since Bankr API submits the L1 deposit on their end.
  //
  // Disabled for atomic-7702 batches (PK/SP). Two reasons:
  //   1. If the batch needs an authorization tuple (first-time delegation),
  //      `OptimismPortal.depositTransaction` has no slot for `authorizationList`
  //      — it would get silently dropped and the EOA would execute the ERC-7821
  //      calldata without any delegation, failing.
  //   2. Even when the EOA is already delegated onchain (silent reuse), the
  //      deposit-source tx (type 0x7E) lands on L2 with `tx.origin` set to the
  //      aliased L1 sender rather than the EOA. Any "only-self" check inside
  //      the delegate (e.g. MM DeleGator's self-call gate for batch execute)
  //      would reject.
  // Hide the option so users don't silently lose atomicity.
  const isAtomic7702 = batchPlan.strategy === "atomic-7702";
  const forceInclusionInfo = useMemo(() => {
    if (isAtomic7702) return null;
    if (!isForceInclusionSupportedForAccount(chainId, accountType)) return null;
    const entry = FORCE_INCLUSION_CHAINS.get(chainId)!;
    return { l1ChainId: entry.l1ChainId, l1ChainName: entry.l1ChainName };
  }, [chainId, accountType, isAtomic7702]);

  const handleConfirm = async () => {
    void playInteractionSound("transactionConfirm");
    setState("submitting");
    setError("");

    // Cross-dapp batch path: defer to the wrapper-provided handler. The
    // wrapper owns its own bundle id, message type, and result fan-out.
    if (customConfirmHandler) {
      const result = await customConfirmHandler(cachedGasEstimates);
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

    // Route to the appropriate handler based on the SIGNING source, not the
    // execution atomicity:
    //  - Bankr accounts → Bankr API handler.
    //  - PK / SP → local-signing handler (handles auto-sequential AND atomic
    //    via EIP-7702 internally; the atomicity choice happens at confirm
    //    time in the handler via resolveActiveDelegate).
    const isLocalSigning = isLocalSigningAccount;
    const messageType = isLocalSigning
      ? "confirmBatchTransactionAsyncPK"
      : "confirmBatchTransactionAsync";

    chrome.runtime.sendMessage(
      {
        type: messageType,
        bundleId: batchRequest.id,
        password: "",
        functionNames: functionNames.length > 0 ? functionNames : undefined,
        // Pass pre-computed gas estimates so background doesn't re-estimate.
        // The PK/SP handler uses them for the auto-sequential path; the atomic
        // 7702 path sums them as a single combined estimate. For force
        // inclusion batches: only the `gasLimit` field is used (as the L2
        //   `_gasLimit` override in the portal call); L1 fees are computed onchain.
        ...(isLocalSigning && cachedGasEstimates ? { gasEstimates: cachedGasEstimates } : {}),
        ...(forceInclusion ? { forceInclusion: true } : {}),
      },
      (result: { success: boolean; error?: string }) => {
        if (result.success) {
          // Bankr atomic + force inclusion: stay open to show the L1 deposit
          // progress screen. PK/SP force inclusion runs locally in the
          // background and just resolves into the standard "sent" state.
          if (forceInclusion && accountType === "bankr") {
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
    if (isRejecting) return;
    setIsRejecting(true);
    onBeforeReject?.();
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
  // Cross-dapp batching: Bankr (atomic via API) or PK/SP when useBatchPlan has
  // resolved a usable 7702 delegate. Hidden on the cross-dapp batch screen
  // itself (no `onAddedToBatch`) and on view-only impersonator accounts.
  const canBatchAccount =
    accountType === "bankr" ||
    accountType === "privateKey" ||
    accountType === "seedPhrase";

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
    if (isAddingToBatch) return;
    setIsAddingToBatch(true);
    chrome.runtime.sendMessage(
      { type: "addCallsToCrossDappBatch", bundleId: batchRequest.id },
      (result: { success: boolean; error?: string } | undefined) => {
        if (!result?.success) {
          setIsAddingToBatch(false);
          setError(result?.error || "Failed to add to batch");
          setState("error");
          return;
        }
        // Success — jump to the cross-dapp batch screen so the user sees the
        // assembled batch they just merged into.
        if (onAddedToBatch) {
          onAddedToBatch();
        } else {
          setIsAddingToBatch(false);
        }
      },
    );
  };

  const batchedCount = crossDappBatch?.entries.length ?? 0;
  const showAddToBatch =
    canBatchAccount &&
    !customConfirmHandler && // hide on the cross-dapp batch screen itself
    !!onAddedToBatch &&
    !isNonAtomic &&
    !hasDeploymentCall &&
    !isValueMalformed &&
    !encodingError;

  // Force inclusion progress screen (atomic batches only)
  if (state === "forceInclusion" && forceInclusionInfo) {
    return (
      <Box h="100%" overflowY="auto" bg="surface.base">
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
        bg="surface.base"
        display="flex"
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        p={8}
        position="relative"
      >
        {/* Bauhaus exuberance — red square + blue circle corner ornaments. The
            Midnight aesthetic deliberately omits these geometric flourishes. */}
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
          animation={prefersReducedMotion ? undefined : `${scaleIn} 0.4s ease-out`}
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
                animation: prefersReducedMotion
                  ? undefined
                  : `${checkmarkDraw} 0.4s ease-out 0.2s backwards`,
              }}
            />
          </Icon>
        </Box>
        <Text
          fontSize="2xl"
          fontWeight={isDarkTheme ? "700" : "900"}
          color="text.primary"
          mb={2}
          textTransform={isDarkTheme ? "none" : "uppercase"}
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

  const screenTitle = titleOverride
    ? titleOverride.replace(/\s*\([^)]*\)\s*$/, "")
    : calls.length === 1
      ? "Review transaction"
      : "Review batch";
  const canConfirmBatch = !!customConfirmHandler || accountType !== "impersonator";
  const confirmDisabledReason = isRejecting
    ? "Reject in progress"
    : state === "error"
      ? "Fix the error above before retrying"
      : isValueMalformed
        ? "Transaction value is malformed — signing blocked"
        : encodingError
          ? "Unsafe batch — signing blocked"
          : isCalldataMalformed
            ? "Calldata is malformed — signing blocked"
            : isLocalSigningAccount && batchPlan.strategy === "loading"
              ? "Checking smart account support"
              : !gasValid
                ? "Set a valid gas fee — fee fields can't be empty / max fee must cover base + priority"
                : null;

  const requestStatus = (
    <VStack spacing={2} align="stretch">
      {error && state === "error" && (
        <Box
          bg="status.error.bg"
          border="1px solid"
          borderColor="status.error.border"
          borderRadius="lg"
          p={3}
        >
          <Text color="status.error.fg" fontSize="sm" fontWeight="700">
            {error}
          </Text>
        </Box>
      )}
      {state === "submitting" && (
        <HStack
          justify="center"
          py={3}
          bg="status.info.bg"
          border="1px solid"
          borderColor="status.info.border"
          borderRadius="lg"
        >
          <Spinner size="sm" color="status.info.fg" />
          <Text color="status.info.fg" fontSize="sm" fontWeight="700">
            Submitting batch…
          </Text>
        </HStack>
      )}
      {accountType === "impersonator" && !customConfirmHandler && (
        <Box
          bg="accent.highlight"
          border="1px solid"
          borderColor="border.default"
          borderRadius="lg"
          p={3}
        >
          <Text color="accentFg.highlight" fontSize="sm" fontWeight="700">
            Connected via an impersonated account. Signing is disabled.
          </Text>
        </Box>
      )}
      {canConfirmBatch && confirmDisabledReason && state !== "submitting" && (
        <Text role="status" color="text.secondary" fontSize="xs">
          Confirm unavailable: {confirmDisabledReason}
        </Text>
      )}
    </VStack>
  );

  return (
    <>
      <ConfirmationScreen
        title={screenTitle}
        onBack={onBack}
        bg={pageBgColor ?? "surface.base"}
        trailing={
          <CopyButton
            label="Copy batch JSON"
            value={JSON.stringify(
              calls.map((call) => ({
                to: call.to || null,
                value: call.value && call.value !== "0x0" ? call.value : "0",
                data: call.data || "0x",
              })),
              null,
              2,
            )}
          />
        }
        outcome={
          <OutcomeCard
            outcome={
              calls.length === 1
                ? "Execute 1 action"
                : `Execute ${calls.length} actions together`
            }
            context={
              <VStack align="stretch" spacing={2}>
                <Text fontSize="sm">
                  Requested by {originHostname || origin} on{" "}
                  {resolvedChain?.name ?? chainName}
                </Text>
                <HStack spacing={1.5} flexWrap="wrap">
                <Badge variant={isNonAtomic ? "warning" : "info"}>
                  {isNonAtomic ? "Sequential" : "Atomic"}
                </Badge>
                {simulationReverted && <Badge variant="error">Likely to fail</Badge>}
                {simulationUnavailable && !simulationReverted && (
                  <Badge variant="warning">Not simulated</Badge>
                )}
                </HStack>
              </VStack>
            }
          />
        }
        financialImpact={
          <VStack spacing={0} align="stretch">
            {totalValueWei > 0n && (
              <AssetDeltaRow
                direction="send"
                asset={nativeSymbol}
                amount={
                  <NativeValueAmount
                    value={totalValueWei}
                    symbol={nativeSymbol}
                    decimals={nativeDecimals}
                    fontSize="md"
                    fontWeight="600"
                  />
                }
                meta={`Total native value across ${calls.length} ${calls.length === 1 ? "action" : "actions"}`}
              />
            )}
            <AssetChangesDisplay
              txRequest={syntheticTxRequest}
              batchCalls={calls.map((call) => ({
                to: call.to,
                data: call.data,
                value: call.value,
              }))}
              isNonAtomic={isNonAtomic}
              onRevertedChange={setSimulationReverted}
              onSimulationUnavailableChange={setSimulationUnavailable}
            />
          </VStack>
        }
        context={
          <VStack spacing={3} align="stretch">
        {/* Top row — navigation centered + Reject All on right, only when
            multiple pending requests. */}
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
                minW="32px"
                h="32px"
                p={0}
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
                minW="32px"
                h="32px"
                p={0}
              />
            </HStack>
            <Button
              position="absolute"
              right={0}
              size="xs"
              variant="ghost"
              color="status.error.emphasis"
              fontWeight="700"
              _hover={{ bg: "status.error.bg", color: "status.error.fg" }}
              onClick={onRejectAll}
              px={2}
            >
              Reject All
            </Button>
          </Flex>
        )}

        {/* Simulated-revert banner — top-of-screen warning so the user
            sees "this is likely to fail" before any other banner, the
            clear-signing summary, or the call list. Fed by AssetChangesDisplay
            below. */}
        {simulationReverted && (
          <SimulationRevertedBanner borders={tokens.borders} />
        )}
        {simulationUnavailable && !simulationReverted && (
          <SimulationUnavailableBanner borders={tokens.borders} />
        )}

        {/* "One or more transactions may revert" — bubbled up from the gas
            display so the warning lands at the top of the screen instead of
            being buried next to the gas row. Suppressed if the simulation
            already reverted (the banner above is louder and covers the same
            case). */}
        {anyTxMayRevert && !simulationReverted && (
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
            <WarningIcon
              color="status.error.fg"
              boxSize={3.5}
              flexShrink={0}
            />
            <Text
              fontSize="xs"
              color="status.error.fg"
              fontWeight="700"
              textTransform="uppercase"
            >
              One or more transactions may revert
            </Text>
          </HStack>
        )}

        {/* Malformed-calldata banner — blocks signing when any call in the
            batch has non-canonical ABI encoding for a known ERC20 selector. */}
        {malformedCallInfo && (
          <MalformedCalldataBanner
            borders={tokens.borders}
            reason={`Call #${malformedCallInfo.index + 1}: ${malformedCallInfo.reason}`}
            functionName={malformedCallInfo.functionName}
          />
        )}

        {/* Malformed-value banner — protects older persisted batches and blocks
            signing if any ERC-5792 call carries an invalid native value. */}
        {malformedValueInfo && (
          <MalformedCalldataBanner
            borders={tokens.borders}
            title="Malformed value — signing blocked"
            reason={`Call #${malformedValueInfo.index + 1}: ${malformedValueInfo.reason}`}
          />
        )}

        {/* ERC-7821 self-recursion guard — blocks signing when an inner call
            targets the user's own EOA with calldata or value, which could
            re-enter execute() with auth bypassed. */}
        {encodingError && (
          <MalformedCalldataBanner
            borders={tokens.borders}
            title="Unsafe batch — signing blocked"
            reason={encodingError}
          />
        )}

        {/* EIP-7702 smart-account setup / replacement banner. Shared with
            SwapConfirmation via SmartAccountSetupBanner — see that file for
            the fresh-vs-replace variant rules. */}
        {batchPlan.needsAuthorization && batchPlan.delegate && (
          <SmartAccountSetupBanner
            delegate={batchPlan.delegate}
            onchainDelegate={batchPlan.onchainDelegate}
            explorerUrl={chainBadgeConfig?.explorer}
          />
        )}

        {/* Clear-signing summary — one card per call that has a matching
            ERC-7730 descriptor, labeled with its position in the batch. Lives
            at the very top so the human-readable intent is the first thing
            the user reads; the per-call cards below stay collapsed by default
            and only carry the raw decoder. */}
        <BatchClearSigningSummary calls={calls} chainId={chainId} />

        {/* Info Card */}
        <Box
          bg="surface.raised"
          border={tokens.borders.thin}
          borderColor="border.default"
          borderRadius="lg"
          boxShadow="card"
          overflow="hidden"
        >
          {/* Rows use explicit borderTop on each non-first row instead of
              VStack's `divider` prop — Chakra's Stack silently applies
              `borderBottomWidth: 1px` to divider elements via __css with no
              borderColor set, so the divider inherits currentColor and paints
              as near-white in Midnight. */}
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
                      fallback={<Box boxSize="14px" bg="bg.muted" borderRadius="sm" />}
                    />
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
              <FromAccountDisplay address={fromAddress} />
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
                    chainId={chainId}
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
                      icon={<SettingsIcon />}
                      variant="ghost"
                      size="xs"
                      onClick={() => setShowAdvanced(!showAdvanced)}
                      color={showAdvanced ? "accent.secondary" : "text.tertiary"}
                      _hover={{ color: "accent.secondary", bg: "bg.muted" }}
                      minW="auto"
                      h="auto"
                      p={0.5}
                    />
                  </Tooltip>
                )}
              </HStack>
            </HStack>

            {/* Total native value (sum across calls) — only shown when any
                call carries a non-zero msg.value. Surfaces relayer fees
                buried in bridges / vault deposits so the user sees their
                full native outlay before signing. */}
            {totalValueWei > 0n && (
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
                {(() => {
                  const nativeAmount = nativeAmountToNumber(
                    totalValueWei,
                    nativeDecimals,
                  );
                  const usdValue =
                    nativePriceUsd && nativePriceUsd > 0
                      ? nativeAmount * nativePriceUsd
                      : null;
                  const usdLabel =
                    usdValue === null
                      ? null
                      : usdValue < 0.01 && usdValue > 0
                        ? "<$0.01"
                        : `$${usdValue.toFixed(2)}`;
                  return (
                    <VStack spacing={0} align="flex-end">
                      <NativeValueAmount
                        value={totalValueWei}
                        symbol={nativeSymbol}
                        decimals={nativeDecimals}
                        fontSize="sm"
                        fontWeight="700"
                        fontFamily="mono"
                      />
                      {usdLabel && (
                        <Text
                          fontSize="2xs"
                          color="text.tertiary"
                          fontWeight="600"
                        >
                          {usdLabel}
                        </Text>
                      )}
                    </VStack>
                  );
                })()}
              </HStack>
            )}

            {/* Force Inclusion Toggle (advanced options) */}
            {forceInclusionInfo && (
              <Collapse in={showAdvanced} animateOpacity>
                <Box w="full" py={2} px={3} bg="bg.muted">
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
        {requestStatus}
          </VStack>
        }
        advancedDetails={
          <VStack spacing={3} align="stretch">
            <InlineDisclosure
              label={`Actions (${calls.length})`}
              description="Review decoded calls, edit calldata, or remove eligible actions."
            >
              <VStack spacing={2} align="stretch" pt={3}>

        {/* Calls List */}
        <VStack spacing={1.5} align="stretch">
          <HStack justify="space-between" align="center" px={1}>
            <Text
              fontSize="xs"
              fontWeight="700"
              color="text.secondary"
              textTransform="uppercase"
            >
              Calls
            </Text>
            {/*
             * Split-mode escape hatch. Surfaced only for PK/Seed accounts on
             * non-atomicRequired bundles, so dapp gas-estimation failures on
             * unknown custom chains (MegaETH-like dual-gas models, etc.) can
             * be worked around by confirming each call individually with
             * fresh per-call gas estimates. Hidden — not disabled — for the
             * exempt account/bundle types so the affordance doesn't tease.
             */}
            {canSplitBatch && (
              <Tooltip label="Split into individual transactions" fontSize="xs" hasArrow>
                <IconButton
                  aria-label="Split into individual transactions"
                  icon={<UnlinkIcon boxSize={3} />}
                  variant="ghost"
                  size="xs"
                  onClick={onSplitModalOpen}
                  color="text.tertiary"
                  _hover={{ color: "accent.secondary", bg: "bg.muted" }}
                  minW="auto"
                  h="auto"
                  p={0.5}
                />
              </Tooltip>
            )}
          </HStack>
          {calls.map((call, index) => {
            const callOrigin = originPerCall?.[index];
            // Edit handler for this call slot. The cross-dapp wrapper overrides
            // via onEditCallData (writes to crossDappBatch storage). Default
            // path writes to pendingBatchTxRequests; both downstream sign paths
            // (Bankr ERC-7821 + future EIP-7702, PK/Seed auto-sequential) read
            // the latest calls[] from storage at sign time, so simulation, gas
            // estimation, and signing all pick up the edited calldata with no
            // per-handler plumbing.
            const editCallData = (newData: string) =>
              onEditCallData
                ? onEditCallData(index, newData)
                : new Promise<{ success: boolean; error?: string }>(
                    (resolve) => {
                      chrome.runtime.sendMessage(
                        {
                          type: "updateCallInPendingBatch",
                          bundleId: batchRequest.id,
                          callIndex: index,
                          newData,
                        },
                        (r) =>
                          resolve(
                            r || { success: false, error: "No response" },
                          ),
                      );
                    },
                  );
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
                onEditCallData={editCallData}
              />
            );

            if (!onRemoveCall) {
              return <Box key={index}>{card}</Box>;
            }

            // Cross-dapp batch only: keep the remove action in the chevron's
            // footprint so the card does not shift. It remains visible and
            // keyboard/touch reachable instead of depending on hover.
            return (
              <Box
                key={index}
                position="relative"
                sx={{ "& .call-chevron": { opacity: 0 } }}
              >
                {card}
                <Box
                  className="delete-call-btn"
                  position="absolute"
                  // Drop the trash icon onto the chevron's exact footprint.
                  // The CallCard header is an HStack with py={2} that centers
                  // children; the chevron's Y depends on the row's tallest
                  // child (taller when a hostname row is shown). Mirror that
                  // by spanning the header's full height and flex-centering,
                  // so the trash always lands on the chevron — for both the
                  // no-hostname (32px) and hostname (46px) layouts.
                  top={0}
                  right={3}
                  height={callOrigin?.origin ? "46px" : "32px"}
                  display="flex"
                  alignItems="center"
                  zIndex={2}
                >
                  <Box
                    as="button"
                    type="button"
                    cursor="pointer"
                    bg="transparent"
                    border="none"
                    minW="32px"
                    h="32px"
                    p={0}
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                    lineHeight={0}
                    color="chart.negative"
                    transition="color 0.12s ease-out, transform 0.12s ease-out, filter 0.12s ease-out"
                    _hover={{
                      filter: "brightness(1.25) saturate(1.2)",
                      transform: "scale(1.15)",
                    }}
                    _active={{ transform: "scale(0.95)" }}
                    _focusVisible={{
                      outline: "none",
                      boxShadow: "focus",
                    }}
                    onClick={(e: React.MouseEvent<HTMLElement>) => {
                      e.stopPropagation();
                      onRemoveCall(index);
                    }}
                    aria-label={`Remove call ${index + 1}`}
                  >
                    <DeleteIcon boxSize={4} />
                  </Box>
                </Box>
              </Box>
            );
          })}
        </VStack>

              </VStack>
            </InlineDisclosure>

            <InlineDisclosure
              label="Advanced details"
              description="Network fees, encoded calldata, simulation tools, and batching options."
            >
              <VStack spacing={3} align="stretch" pt={3}>

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
          // Fire for any local-signing batch. Non-atomic passes per-call gas;
          // atomic 7702 passes the single wrapped ERC-7821 tx estimate the user
          // reviewed, so the background signs with the same values.
          onGasEstimates={isLocalSigningAccount ? setCachedGasEstimates : undefined}
          onValidityChange={setGasValid}
          onNativePriceUsd={setNativePriceUsd}
          onAnyFailedChange={setAnyTxMayRevert}
          forceInclusion={forceInclusion}
          // Atomic (Bankr or 7702): estimate gas for the single ERC-7821 encoded batch tx.
          // When force inclusion is on, estimate L1 gas for the encoded batch.
          batchedTx={isNonAtomic ? undefined : {
            tx: {
              from: fromAddress,
              to: outerEncodedBatch.to,
              data: outerEncodedBatch.data,
              value: outerEncodedBatch.value,
              chainId,
            },
            label: `Batch Transaction (${calls.length} calls)`,
          }}
          // For atomic-7702 batches we only need the state-override path when
          // the EOA isn't already onchain-delegated. If it is (needsAuthorization
          // === false), eth_getCode(EOA) already returns 0xef0100<delegate> and
          // the chain dispatches the self-call through the delegate's code
          // natively — applying a redundant override only buys us a dependency
          // on RPC-specific stateOverride support on eth_estimateGas, which is
          // patchier than its eth_call support on some Base providers.
          eip7702Delegate={
            batchPlan.strategy === "atomic-7702" &&
            batchPlan.delegate &&
            batchPlan.needsAuthorization
              ? batchPlan.delegate
              : undefined
          }
        />

        {/* Tenderly link */}
        {(() => {
          const tenderlyUrl = (() => {
            const tenderlyParams = new URLSearchParams({
              from: fromAddress,
              value: outerEncodedBatch.value || "0",
              rawFunctionInput: outerEncodedBatch.data || "0x",
              network: String(chainId),
              contractAddress: outerEncodedBatch.to,
            });
            return `https://dashboard.tenderly.co/simulator/new?${tenderlyParams}`;
          })();
          return (
            <VStack spacing={2} align="stretch">
                {/* ERC-8213: outer calldata digest for the actual ERC-7821
                    self-call signed by PK/SP atomic-7702 batches. Per-call
                    digests still live inside each CallCard. */}
                {isAtomic7702 &&
                  outerEncodedBatch.data &&
                  outerEncodedBatch.data !== "0x" && (
                    <CalldataDigestDisplay calldata={outerEncodedBatch.data} />
                  )}

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
                        border={tokens.borders.thin}
                        borderColor="border.default"
                        borderRadius="md"
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
                            variant="outline"
                            onClick={handleAddBundleToBatch}
                            isDisabled={!!addToBatchDisabledReason || isAddingToBatch}
                            isLoading={isAddingToBatch}
                            aria-label="Add to batch"
                            fontWeight="600"
                            textTransform="none"
                            letterSpacing="normal"
                            fontSize="xs"
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

              </VStack>
          );
        })()}
              </VStack>
            </InlineDisclosure>
          </VStack>
        }
        confirmAction={
          canConfirmBatch ? (
            <Button
              variant="primary"
              w="full"
              onClick={handleConfirm}
              isDisabled={!!confirmDisabledReason || state === "submitting"}
              isLoading={state === "submitting"}
            >
              {customConfirmHandler ? "Confirm batch" : "Confirm"}
            </Button>
          ) : (
            <Button
              variant="secondary"
              w="full"
              onClick={handleReject}
              isLoading={isRejecting}
              isDisabled={state === "submitting"}
              spinner={<Spinner size="sm" sx={{ animationDirection: "reverse" }} />}
            >
              Reject
            </Button>
          )
        }
        rejectAction={
          canConfirmBatch ? (
            <Button
              variant="secondary"
              w="full"
              onClick={handleReject}
              isLoading={isRejecting}
              isDisabled={state === "submitting"}
              spinner={<Spinner size="sm" sx={{ animationDirection: "reverse" }} />}
            >
              Reject
            </Button>
          ) : undefined
        }
      />

      {/* Split-mode confirmation modal */}
      <Modal isOpen={isSplitModalOpen} onClose={onSplitModalClose} isCentered>
        <ModalOverlay bg="surface.overlay" />
        <ModalContent mx={4}>
          <ModalHeader
            color="fg.primary"
            fontWeight="900"
            fontSize="md"
            borderBottomWidth="1px"
            borderColor="border.subtle"
          >
            Split into individual transactions?
          </ModalHeader>
          <ModalBody py={4}>
            <VStack align="stretch" spacing={4}>
              {/* Visual: 1 batched request → N numbered confirmations.
                  Numbered chips reuse the per-call accent palette from the
                  call cards so the mapping is visually consistent. */}
              <HStack justify="center" spacing={3} pt={1}>
                <Box
                  px={3}
                  py={2}
                  borderRadius="md"
                  border="1.5px solid"
                  borderColor="border.default"
                  bg="surface.raised"
                >
                  <Text
                    fontSize="2xs"
                    fontWeight="700"
                    color="text.secondary"
                    textTransform="uppercase"
                    textAlign="center"
                  >
                    1 Batch
                  </Text>
                  <Text
                    fontSize="xs"
                    fontWeight="900"
                    color="text.primary"
                    textAlign="center"
                  >
                    {calls.length} calls
                  </Text>
                </Box>
                <Icon as={ChevronRightIcon} boxSize={5} color="text.tertiary" />
                <HStack spacing={1.5}>
                  {calls.slice(0, 4).map((_, i) => (
                    <Box
                      key={i}
                      w={7}
                      h={7}
                      borderRadius="md"
                      bg={CALL_ACCENTS[i % CALL_ACCENTS.length]}
                      display="flex"
                      alignItems="center"
                      justifyContent="center"
                    >
                      <Text
                        fontSize="xs"
                        fontWeight="900"
                        color={CALL_ACCENT_FGS[i % CALL_ACCENT_FGS.length]}
                      >
                        {i + 1}
                      </Text>
                    </Box>
                  ))}
                  {calls.length > 4 && (
                    <Text fontSize="xs" fontWeight="700" color="text.tertiary">
                      +{calls.length - 4}
                    </Text>
                  )}
                </HStack>
              </HStack>
              <Text color="text.secondary" fontSize="sm" fontWeight="500" textAlign="center">
                You'll confirm each call as its own transaction, in order.
              </Text>
            </VStack>
          </ModalBody>
          <ModalFooter gap={2} borderTopWidth="1px" borderColor="border.subtle">
            <Button
              variant="secondary"
              size="sm"
              onClick={onSplitModalClose}
              isDisabled={splitting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleConfirmSplit}
              isLoading={splitting}
              loadingText="Splitting"
              isDisabled={isCalldataMalformed || isValueMalformed || !!encodingError}
            >
              Split
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}

export default memo(BatchTransactionConfirmation);
