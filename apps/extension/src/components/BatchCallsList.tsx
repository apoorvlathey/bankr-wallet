/**
 * Per-call rendering for ERC-7821 / EIP-7702 atomic batches.
 *
 * Two surfaces consume this:
 *   - `BatchTransactionConfirmation` (and `CrossDappBatchConfirmation` via that
 *     same component) on the tx-request screen.
 *   - `TxDetailModal` on the activity tab, for confirmed batches whose
 *     calldata was decoded back from ERC-7821 at open time.
 *
 * `CallCard` lets confirmation surfaces own expansion and decoded-name state.
 * `BatchCallsList` supplies that state for read-only history surfaces.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Box,
  VStack,
  HStack,
  Text,
  Badge,
  Image,
  Collapse,
  Button,
  usePrefersReducedMotion,
} from "@chakra-ui/react";
import {
  ChevronDownIcon,
} from "@chakra-ui/icons";
import { parseApproveCalldata } from "@/lib/erc20Approve";
import ERC20ApproveDisplay from "@/components/ERC20ApproveDisplay";
import type { ERC5792Call } from "@/chrome/erc5792Types";
import type { TxCallOrigin } from "@/chrome/txHistoryStorage";
import { getChainConfig } from "@/constants/chainConfig";
import CalldataDecoder from "@/components/CalldataDecoder";
import { CalldataDigestDisplay } from "@/components/DigestDisplay";
import { ClearSigningView } from "@/components/ClearSigning/ClearSigningView";
import { useErc20InlineSummary } from "@/hooks/useErc20InlineSummary";
import { LabeledAddressPopover } from "@/components/shared/LabeledAddressPopover";
import { googleFaviconUrl } from "@/constants/externalUrls";
import { useNetworks } from "@/contexts/NetworksContext";
import { getNativeAssetMeta } from "@/lib/chains";
import NativeValueAmount from "@/components/NativeValueAmount";
import SafeImage from "@/components/SafeImage";
import { isDarkThemeId, useTheme } from "@/theme";
import { getEthShLabels } from "@/lib/ethShLabelsCache";
import { useDappOriginFormatter } from "@/hooks/useDappOriginDisplay";

// Per-call accent rotation for expressive surfaces. CallCard resolves these to
// neutral graphite badges in Midnight while Bauhaus keeps the color sequence;
// other consumers may still opt into the exported accents directly.
// eslint-disable-next-line react-refresh/only-export-components
export const CALL_ACCENTS = [
  "accent.primary",
  "accent.secondary",
  "accent.highlight",
];
// eslint-disable-next-line react-refresh/only-export-components
export const CALL_ACCENT_FGS = [
  "accentFg.primary",
  "accentFg.secondary",
  "accentFg.highlight",
];

// ---------------------------------------------------------------------------
// CallCard — individual call in the batch (collapsible)
// ---------------------------------------------------------------------------

export function CallCard({
  call,
  index,
  chainId,
  isExpanded,
  onToggle,
  onFunctionName,
  onClearSigningAction,
  decodedName,
  origin,
  favicon,
  onEditCallData,
}: {
  call: ERC5792Call;
  index: number;
  chainId: number;
  isExpanded: boolean;
  onToggle: () => void;
  onFunctionName: (name: string) => void;
  onClearSigningAction?: (name?: string) => void;
  decodedName?: string;
  origin?: string;
  favicon?: string | null;
  onEditCallData?: (
    newData: string,
  ) => Promise<{ success: boolean; error?: string }>;
}) {
  const formatOrigin = useDappOriginFormatter();
  const rawOriginHostname = origin
    ? (() => {
        try {
          return new URL(origin).hostname;
        } catch {
          return origin;
        }
      })()
    : null;
  const originDisplay = origin ? formatOrigin(origin) : null;
  const originHostname = originDisplay?.hostname ?? rawOriginHostname;
  const { networksInfo } = useNetworks();
  const { themeId } = useTheme();
  const isDarkTheme = isDarkThemeId(themeId);
  const prefersReducedMotion = usePrefersReducedMotion();
  const accent = CALL_ACCENTS[index % CALL_ACCENTS.length];
  const accentFg = CALL_ACCENT_FGS[index % CALL_ACCENT_FGS.length];
  const config = getChainConfig(chainId);
  const nativeAsset = getNativeAssetMeta(chainId, networksInfo);
  const hasCalldata = call.data && call.data !== "0x";
  const hasValue =
    call.value && call.value !== "0x0" && call.value !== "0x";
  const approve = useMemo(
    () => (call.data ? parseApproveCalldata(call.data) : null),
    [call.data],
  );
  const clearSigningKey = `${chainId}:${call.to ?? ""}:${call.data ?? ""}`;
  const [clearSigningResolution, setClearSigningResolution] = useState({
    key: "",
    matched: false,
    intent: "",
  });
  const [primaryTechnicalDetailsOpen, setPrimaryTechnicalDetailsOpen] =
    useState(false);
  const [targetLabel, setTargetLabel] = useState<string | null>(null);
  useEffect(() => {
    setTargetLabel(null);
    if (!call.to) return;
    let cancelled = false;
    void getEthShLabels(call.to, chainId).then((labels) => {
      if (!cancelled) setTargetLabel(labels[0] ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [call.to, chainId]);
  const clearSigningResolved = clearSigningResolution.key === clearSigningKey;
  const clearSigningMatched =
    clearSigningResolved && clearSigningResolution.matched;
  const hasPrimarySigning = clearSigningMatched;
  const technicalDetailsOpen = approve || hasPrimarySigning
    ? primaryTechnicalDetailsOpen
    : hasCalldata && call.to && !approve && !clearSigningResolved
      ? false
      : isExpanded;

  const sym = nativeAsset?.symbol ?? "ETH";
  const nativeDecimals = nativeAsset?.decimals ?? 18;

  // Unified inline summary — covers ERC-20 transfer ("Send 100 USDC to
  // vitalik.eth"), approve ("Approve unlimited USDC to uniswap-router"),
  // revoke, and native-coin sends ("Send 0.1 ETH to vitalik.eth"). Hook
  // returns null for anything else, so the existing fallback chain handles
  // contract calls unchanged. Passing `call.value` lets the hook detect the
  // empty-data + value > 0 native-send shape.
  const inlineSummary = useErc20InlineSummary(
    call.to,
    call.data,
    chainId,
    call.value,
  );

  const displayName = inlineSummary?.text
    ? inlineSummary.text
    : decodedName
      ? decodedName
      : !hasCalldata && hasValue
        ? `Send ${sym}`
        : hasCalldata
          ? "Contract Call"
          : "Call";

  return (
    <Box
      border="1px solid"
      borderColor="border.default"
      borderRadius="lg"
      bg="surface.raised"
      overflow="hidden"
    >
      {/* Call ownership and technical-detail disclosure. Human-readable clear
          signing, when available, remains visible beneath this row. */}
      <Button
        className="call-card-trigger"
        type="button"
        variant="unstyled"
        display="flex"
        w="full"
        minH="44px"
        h="auto"
        px={3}
        py={2}
        gap={2}
        onClick={() => {
          if (approve || hasPrimarySigning) {
            setPrimaryTechnicalDetailsOpen((open) => !open);
            return;
          }
          onToggle();
        }}
        aria-expanded={technicalDetailsOpen}
        aria-controls={`batch-call-${index}-details`}
        borderRadius={0}
        fontWeight="inherit"
        textTransform="none"
        textAlign="left"
        _hover={{ bg: "surface.raisedHover" }}
      >
        <Badge
          bg={isDarkTheme ? "surface.raisedHover" : accent}
          color={isDarkTheme ? "accent.highlight" : accentFg}
          fontSize="2xs"
          fontWeight="700"
          px={1.5}
          py={0}
          border="1px solid"
          borderColor={isDarkTheme ? "border.strong" : "border.default"}
          minW="20px"
          textAlign="center"
        >
          {index + 1}
        </Badge>
        <VStack spacing={0} align="start" flex={1} minW={0}>
          {hasPrimarySigning ? (
            <Text
              fontSize="md"
              fontWeight="700"
              color="text.primary"
              lineHeight="1.2"
              isTruncated
            >
              {clearSigningResolution.intent || "Action"}
            </Text>
          ) : inlineSummary?.symbol &&
          (inlineSummary.amount || inlineSummary.mode === "revoke") ? (
            <HStack
              spacing={1}
              maxW="100%"
              minW={0}
              align="center"
              overflow="hidden"
            >
              <Text
                fontSize="xs"
                fontWeight="700"
                color="text.primary"
                whiteSpace="nowrap"
              >
                {inlineSummary.prefix}
                {inlineSummary.amount}
              </Text>
              {inlineSummary.logoUrl && (
                <Image
                  src={inlineSummary.logoUrl}
                  alt={inlineSummary.symbol}
                  boxSize="14px"
                  borderRadius="full"
                  flexShrink={0}
                  fallback={
                    <Box boxSize="14px" borderRadius="full" bg="bg.muted" />
                  }
                />
              )}
              <Text
                fontSize="xs"
                fontWeight="700"
                color="text.primary"
                whiteSpace="nowrap"
              >
                {inlineSummary.symbol}
                {inlineSummary.middle}
              </Text>
              {inlineSummary.recipientAvatarSrc && (
                <Image
                  src={inlineSummary.recipientAvatarSrc}
                  alt={inlineSummary.recipient}
                  boxSize="14px"
                  borderRadius={
                    inlineSummary.recipientAvatarKind === "ens" ? "full" : "sm"
                  }
                  flexShrink={0}
                  objectFit="cover"
                  fallback={
                    <Box
                      boxSize="14px"
                      borderRadius={
                        inlineSummary.recipientAvatarKind === "ens"
                          ? "full"
                          : "sm"
                      }
                      bg="bg.muted"
                    />
                  }
                />
              )}
              <Text
                fontSize="xs"
                fontWeight="700"
                color="text.primary"
                isTruncated
              >
                {inlineSummary.recipient}
              </Text>
            </HStack>
          ) : (
            <Text
              fontSize="xs"
              fontWeight="700"
              color="text.primary"
              isTruncated
              maxW="100%"
            >
              {displayName}
            </Text>
          )}
          {originHostname && (
            <HStack spacing={1} maxW="100%">
              <SafeImage
                src={originDisplay?.faviconSrc || favicon || undefined}
                fallbackSrc={
                  originDisplay?.faviconFallbackSrc ||
                  googleFaviconUrl(originHostname)
                }
                alt="favicon"
                boxSize="10px"
                fallback={
                  <Box boxSize="10px" bg="bg.muted" borderRadius="sm" />
                }
              />
              <Text
                fontSize="2xs"
                fontWeight="600"
                color="text.tertiary"
                isTruncated
              >
                {originHostname}
              </Text>
            </HStack>
          )}
        </VStack>
        {hasPrimarySigning && (
          <Text
            fontSize="2xs"
            color="text.tertiary"
            fontWeight="600"
          >
            Calldata
          </Text>
        )}
        {call.to &&
          !hasPrimarySigning &&
          !(
            inlineSummary?.symbol &&
            (inlineSummary.amount || inlineSummary.mode === "revoke")
          ) && (
            <Text fontSize="2xs" fontFamily="mono" color="text.tertiary">
              {call.to.slice(0, 6)}...{call.to.slice(-4)}
            </Text>
          )}
        <ChevronDownIcon
          className="call-chevron"
          boxSize={4}
          color="text.secondary"
          transform={technicalDetailsOpen ? "rotate(180deg)" : "rotate(0deg)"}
          transition={prefersReducedMotion
            ? "none"
            : "transform 150ms cubic-bezier(0.23, 1, 0.32, 1), opacity 120ms ease-out"}
          aria-hidden
        />
      </Button>

      {hasCalldata && call.to ? (
        <CalldataCallContent
          call={call}
          chainId={chainId}
          config={config}
          detailsId={`batch-call-${index}-details`}
          hasValue={!!hasValue}
          nativeSymbol={sym}
          nativeDecimals={nativeDecimals}
          approve={approve}
          clearSigningMatched={clearSigningMatched}
          technicalDetailsOpen={technicalDetailsOpen}
          targetLabel={targetLabel}
          onClearSigningResolved={(matched, intent) => {
            setClearSigningResolution({
              key: clearSigningKey,
              matched,
              intent: matched ? intent || "Action" : "",
            });
            onClearSigningAction?.(matched ? intent : undefined);
          }}
          onFunctionName={onFunctionName}
          onEditCallData={onEditCallData}
        />
      ) : (
        <Collapse
          id={`batch-call-${index}-details`}
          in={technicalDetailsOpen}
          animateOpacity={!prefersReducedMotion}
        >
          <VStack
            spacing={0}
            align="stretch"
            borderTop="1px solid"
            borderColor="border.subtle"
          >
            {/* To */}
            {call.to && (
              <HStack w="full" py={1.5} px={3} justify="space-between">
                <Text
                  fontSize="xs"
                  color="text.secondary"
                  fontWeight="700"
                >
                  To
                </Text>
                <LabeledAddressPopover
                  address={call.to}
                  contextLabel="batch call target"
                  explorer={config.explorer}
                  label={targetLabel ?? `${call.to.slice(0, 6)}...${call.to.slice(-4)}`}
                  maxW="220px"
                />
              </HStack>
            )}

            {/* Value */}
            {hasValue && (
              <HStack
                w="full"
                py={1.5}
                px={3}
                justify="space-between"
                borderTop={call.to ? "1px solid" : undefined}
                borderColor={call.to ? "border.subtle" : undefined}
              >
                <Text
                  fontSize="xs"
                  color="text.secondary"
                  fontWeight="700"
                >
                  Value
                </Text>
                <NativeValueAmount
                  value={call.value}
                  symbol={sym}
                  decimals={nativeDecimals}
                  fontSize="xs"
                  fontWeight="700"
                />
              </HStack>
            )}

            {hasCalldata && call.to && (
              <Box
                w="full"
                px={2}
                py={1.5}
                borderTop={call.to || hasValue ? "1px solid" : undefined}
                borderColor={call.to || hasValue ? "border.subtle" : undefined}
              >
                <CalldataDecoder
                  calldata={call.data!}
                  to={call.to}
                  chainId={chainId}
                  onFunctionName={onFunctionName}
                />
              </Box>
            )}
            {hasCalldata && (
              <Box w="full" px={2} pb={1.5}>
                <CalldataDigestDisplay calldata={call.data!} />
              </Box>
            )}
          </VStack>
        </Collapse>
      )}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// CalldataCallContent — clear signing remains visible while raw technical
// fields stay behind the call row's disclosure. Recognized approvals use the
// dedicated editable approval view; registry and built-in descriptors use the
// shared ClearSigningView.
// ---------------------------------------------------------------------------
function CalldataCallContent({
  call,
  chainId,
  config,
  detailsId,
  hasValue,
  nativeSymbol,
  nativeDecimals,
  approve,
  clearSigningMatched,
  technicalDetailsOpen,
  targetLabel,
  onClearSigningResolved,
  onFunctionName,
  onEditCallData,
}: {
  call: ERC5792Call;
  chainId: number;
  config: ReturnType<typeof getChainConfig>;
  detailsId: string;
  hasValue: boolean;
  nativeSymbol: string;
  nativeDecimals: number;
  approve: ReturnType<typeof parseApproveCalldata>;
  clearSigningMatched: boolean;
  technicalDetailsOpen: boolean;
  targetLabel: string | null;
  onClearSigningResolved: (matched: boolean, intent?: string) => void;
  onFunctionName: (name: string) => void;
  onEditCallData?: (
    newData: string,
  ) => Promise<{ success: boolean; error?: string }>;
}) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [approvalCalldataOpen, setApprovalCalldataOpen] = useState(false);

  const technicalFields = (
    <VStack
      spacing={0}
      align="stretch"
      borderTop="1px solid"
      borderColor="border.subtle"
    >
      {call.to && (
        <HStack w="full" py={1.5} px={3} justify="space-between">
          <Text fontSize="xs" color="text.secondary" fontWeight="700">
            To
          </Text>
          <LabeledAddressPopover
            address={call.to}
            contextLabel="batch call target"
            explorer={config.explorer}
            label={targetLabel ?? `${call.to.slice(0, 6)}...${call.to.slice(-4)}`}
            maxW="220px"
          />
        </HStack>
      )}

      {hasValue && (
        <HStack
          w="full"
          py={1.5}
          px={3}
          justify="space-between"
          borderTop={call.to ? "1px solid" : undefined}
          borderColor={call.to ? "border.subtle" : undefined}
        >
          <Text fontSize="xs" color="text.secondary" fontWeight="700">
            Value
          </Text>
          <NativeValueAmount
            value={call.value}
            symbol={nativeSymbol}
            decimals={nativeDecimals}
            fontSize="xs"
            fontWeight="700"
          />
        </HStack>
      )}

      {call.to && call.data && (
        <Box
          w="full"
          px={2}
          py={1.5}
          borderTop="1px solid"
          borderColor="border.subtle"
        >
          <CalldataDecoder
            calldata={call.data}
            to={call.to}
            chainId={chainId}
            onFunctionName={onFunctionName}
          />
        </Box>
      )}

      {call.data && (
        <Box w="full" px={2} pb={1.5}>
          <CalldataDigestDisplay calldata={call.data} />
        </Box>
      )}
    </VStack>
  );

  if (approve && call.to && call.data) {
    const calldataDetailsId = `${detailsId}-calldata`;

    return (
      <Collapse
        id={detailsId}
        in={technicalDetailsOpen}
        animateOpacity={!prefersReducedMotion}
      >
        <VStack
          spacing={0}
          align="stretch"
          borderTop="1px solid"
          borderColor="border.subtle"
        >
          <ERC20ApproveDisplay
            tokenAddress={call.to}
            approval={approve}
            chainId={chainId}
            embedded
            onSaveCalldata={onEditCallData}
          />

          <Button
            type="button"
            variant="unstyled"
            display="flex"
            w="full"
            minH="40px"
            h="auto"
            px={3}
            py={1.5}
            borderTop="1px solid"
            borderColor="border.subtle"
            borderRadius={0}
            onClick={() => setApprovalCalldataOpen((open) => !open)}
            aria-expanded={approvalCalldataOpen}
            aria-controls={calldataDetailsId}
            _hover={{ bg: "surface.raisedHover" }}
          >
            <HStack w="full" justify="space-between" spacing={2}>
              <Text
                fontSize="xs"
                fontWeight="600"
                color="text.secondary"
              >
                Calldata
              </Text>
              <HStack spacing={1}>
                <Text
                  fontSize="2xs"
                  fontWeight="600"
                  color="text.tertiary"
                >
                  {approvalCalldataOpen ? "Hide" : "Show"}
                </Text>
                <ChevronDownIcon
                  boxSize={3}
                  color="text.tertiary"
                  transform={
                    approvalCalldataOpen ? "rotate(180deg)" : "rotate(0deg)"
                  }
                  transition={
                    prefersReducedMotion
                      ? "none"
                      : "transform 150ms cubic-bezier(0.23, 1, 0.32, 1)"
                  }
                  aria-hidden
                />
              </HStack>
            </HStack>
          </Button>

          <Collapse
            id={calldataDetailsId}
            in={approvalCalldataOpen}
            animateOpacity={!prefersReducedMotion}
          >
            {technicalFields}
          </Collapse>
        </VStack>
      </Collapse>
    );
  }

  return (
    <VStack spacing={0} align="stretch">
      {call.to && call.data ? (
        <Box
          display={clearSigningMatched ? "block" : "none"}
          w="full"
          borderTop="1px solid"
          borderColor="border.subtle"
        >
          <ClearSigningView
            kind="calldata"
            chainId={chainId}
            to={call.to}
            calldata={call.data}
            value={call.value}
            embedded
            hideHeader
            onResolved={onClearSigningResolved}
            hideLoadingSkeleton
          />
        </Box>
      ) : null}

      <Collapse
        id={detailsId}
        in={technicalDetailsOpen}
        animateOpacity={!prefersReducedMotion}
      >
        {technicalFields}
      </Collapse>
    </VStack>
  );
}

// ---------------------------------------------------------------------------
// BatchCallsList — read-only convenience wrapper for the same unified call
// cards used on confirmation surfaces.
// ---------------------------------------------------------------------------

export function BatchCallsList({
  calls,
  chainId,
  origin,
  favicon,
  originPerCall,
  originCallIndex,
}: {
  calls: ERC5792Call[];
  chainId: number;
  origin?: string;
  favicon?: string | null;
  originPerCall?: TxCallOrigin[];
  originCallIndex?: number;
}) {
  const [expandedCalls, setExpandedCalls] = useState<Set<number>>(
    () => new Set(),
  );
  const [decodedFunctionNames, setDecodedFunctionNames] = useState<
    Record<number, string>
  >({});

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
      if (prev[index] === name) return prev;
      return { ...prev, [index]: name };
    });
  };

  return (
    <VStack spacing={2} align="stretch">
      {calls.map((call, index) => {
        const callOrigin = originPerCall?.[index];
        const fallbackOrigin =
          originCallIndex === undefined || originCallIndex === index
            ? origin
            : undefined;
        const fallbackFavicon =
          originCallIndex === undefined || originCallIndex === index
            ? favicon
            : null;

        return (
          <CallCard
            key={index}
            call={call}
            index={index}
            chainId={chainId}
            isExpanded={expandedCalls.has(index)}
            onToggle={() => toggleCall(index)}
            onFunctionName={(name) => handleFunctionName(index, name)}
            decodedName={decodedFunctionNames[index]}
            origin={callOrigin?.origin ?? fallbackOrigin}
            favicon={callOrigin ? callOrigin.favicon : fallbackFavicon}
          />
        );
      })}
    </VStack>
  );
}
