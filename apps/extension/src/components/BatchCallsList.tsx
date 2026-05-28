/**
 * Per-call rendering for ERC-7821 / EIP-7702 atomic batches.
 *
 * Two surfaces consume this:
 *   - `BatchTransactionConfirmation` (and `CrossDappBatchConfirmation` via that
 *     same component) on the tx-request screen.
 *   - `TxDetailModal` on the activity tab, for confirmed batches whose
 *     calldata was decoded back from ERC-7821 at open time.
 *
 * Granular exports (`CallCard`, `BatchClearSigningSummary`) let the
 * confirmation surface keep owning its expansion + decoded-name state. The
 * `BatchCallsList` convenience wrapper bundles both for the read-only history
 * surface so it doesn't have to re-implement that plumbing.
 */

import { useMemo, useState } from "react";
import {
  Box,
  VStack,
  HStack,
  Text,
  Badge,
  IconButton,
  Spacer,
  Image,
  Icon,
  Collapse,
} from "@chakra-ui/react";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  ExternalLinkIcon,
} from "@chakra-ui/icons";
import { parseApproveCalldata } from "@/lib/erc20Approve";
import ERC20ApproveDisplay from "@/components/ERC20ApproveDisplay";
import type { ERC5792Call } from "@/chrome/erc5792Types";
import type { TxCallOrigin } from "@/chrome/txHistoryStorage";
import { getChainConfig } from "@/constants/chainConfig";
import CalldataDecoder from "@/components/CalldataDecoder";
import { CalldataDigestDisplay } from "@/components/DigestDisplay";
import { ClearSigningView } from "@/components/ClearSigning/ClearSigningView";
import { isBuiltinCalldataSelector } from "@/lib/clearSigning/builtinDescriptors";
import { useErc20InlineSummary } from "@/hooks/useErc20InlineSummary";
import { CopyButton } from "@/components/CopyButton";
import { googleFaviconUrl } from "@/constants/externalUrls";
import { useNetworks } from "@/contexts/NetworksContext";
import { getResolvedChainById } from "@/lib/chains";
import { useTheme } from "@/theme";

// Per-call accent rotation. The three intent slots (primary/secondary/highlight)
// map to RED/BLUE/YELLOW in Bauhaus and to indigo/cyan/amber in Midnight, so each
// call still gets a distinct identity stripe in either theme.
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
// BatchClearSigningSummary — clear-signing cards for the batch, rendered at
// the very top of the confirmation in call order. Each card carries a small
// "Call N of M" caption so the user knows which tx the human-readable view
// describes. Calls without a registry-matched descriptor render nothing.
// ---------------------------------------------------------------------------

export function BatchClearSigningSummary({
  calls,
  chainId,
}: {
  calls: ERC5792Call[];
  chainId: number;
}) {
  return (
    <VStack spacing={3} align="stretch">
      {calls.map((call, i) => {
        if (!call.data || call.data === "0x" || !call.to) return null;
        // Built-in selectors (ERC-20 transfer, …) are summarized inline on the
        // CallCard header below. Rendering the full descriptor card here too
        // would duplicate the same recipient + amount info on every transfer
        // row. Remote-registry descriptors (Permit2, Uniswap router, etc.) and
        // anything we don't have a built-in for still render here.
        if (isBuiltinCalldataSelector(call.data)) return null;
        return (
          <PerCallClearSigning
            key={i}
            index={i}
            total={calls.length}
            to={call.to}
            data={call.data}
            value={call.value}
            chainId={chainId}
          />
        );
      })}
    </VStack>
  );
}

function PerCallClearSigning({
  index,
  total,
  to,
  data,
  value,
  chainId,
}: {
  index: number;
  total: number;
  to: string;
  data: string;
  value?: string;
  chainId: number;
}) {
  const [matched, setMatched] = useState(false);
  // When `matched` is false, `ClearSigningView` returns null but the wrapping
  // <Box> was still a flex item — N unmatched calls would each contribute a
  // `VStack spacing={3}` gap, leaking ~24px of phantom whitespace below the
  // header. `display="none"` removes the Box from layout entirely while keeping
  // `ClearSigningView` mounted so its descriptor lookup effect still runs and
  // can flip `matched` on a hit.
  return (
    <Box display={matched ? "block" : "none"}>
      {matched && (
        <HStack mb={1.5} spacing={2} align="center">
          <Text
            fontSize="10px"
            color="fg.muted"
            fontWeight="700"
            textTransform="uppercase"
            letterSpacing="0.06em"
            flexShrink={0}
          >
            Call {index + 1}
            {total > 1 ? ` of ${total}` : ""}
          </Text>
          <Box flex={1} h="1px" bg="border.subtle" />
        </HStack>
      )}
      <ClearSigningView
        kind="calldata"
        chainId={chainId}
        to={to}
        calldata={data}
        value={value}
        onResolved={setMatched}
        hideLoadingSkeleton
      />
    </Box>
  );
}

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
  decodedName?: string;
  origin?: string;
  favicon?: string | null;
  onEditCallData?: (
    newData: string,
  ) => Promise<{ success: boolean; error?: string }>;
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
  const { tokens } = useTheme();
  const accent = CALL_ACCENTS[index % CALL_ACCENTS.length];
  const accentFg = CALL_ACCENT_FGS[index % CALL_ACCENT_FGS.length];
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
      border={tokens.borders.thin}
      borderColor="border.default"
      borderLeftWidth="4px"
      borderLeftColor={accent}
      borderTopLeftRadius="0"
      borderBottomLeftRadius="0"
      borderTopRightRadius="lg"
      borderBottomRightRadius="lg"
      bg="surface.raised"
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
          color={accentFg}
          fontSize="2xs"
          fontWeight="800"
          px={1.5}
          py={0}
          border="1px solid"
          borderColor="border.default"
          minW="20px"
          textAlign="center"
        >
          {index + 1}
        </Badge>
        <VStack spacing={0} align="start" flex={1} minW={0}>
          {inlineSummary?.symbol &&
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
              <Image
                src={favicon || googleFaviconUrl(originHostname)}
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
        {call.to &&
          !(
            inlineSummary?.symbol &&
            (inlineSummary.amount || inlineSummary.mode === "revoke")
          ) && (
            <Text fontSize="2xs" fontFamily="mono" color="text.tertiary">
              {call.to.slice(0, 6)}...{call.to.slice(-4)}
            </Text>
          )}
        <Icon
          className="call-chevron"
          as={isExpanded ? ChevronUpIcon : ChevronDownIcon}
          boxSize={4}
          color="text.secondary"
          transition="opacity 0.12s ease-out"
        />
      </HStack>

      <Collapse in={isExpanded} animateOpacity>
        {hasCalldata && call.to && isBuiltinCalldataSelector(call.data) ? (
          <BuiltinExpandedContent
            call={call}
            chainId={chainId}
            config={config}
            hasValue={!!hasValue}
            formatValue={formatValue}
            onFunctionName={onFunctionName}
            onEditCallData={onEditCallData}
          />
        ) : (
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
                  textTransform="uppercase"
                >
                  To
                </Text>
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
                      _hover={{ color: "accent.secondary", bg: "bg.muted" }}
                    />
                  )}
                </HStack>
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
                  textTransform="uppercase"
                >
                  Value
                </Text>
                <Text fontSize="xs" fontWeight="700" color="text.primary">
                  {formatValue(call.value!)}
                </Text>
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
        )}
      </Collapse>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// BuiltinExpandedContent — expanded layout for CallCards whose calldata
// matches a built-in selector (ERC-20 transfer today; future: approve, swap
// routers, …). The friendly ClearSigningView card is the headline; TO +
// Value + raw decoder + digest collapse behind a single "Calldata" disclosure
// styled exactly like CalldataDecoder.defaultCollapsed so the UX stays
// consistent with the single-tx confirmation.
// ---------------------------------------------------------------------------
function BuiltinExpandedContent({
  call,
  chainId,
  config,
  hasValue,
  formatValue,
  onFunctionName,
  onEditCallData,
}: {
  call: ERC5792Call;
  chainId: number;
  config: ReturnType<typeof getChainConfig>;
  hasValue: boolean;
  formatValue: (value: string) => string;
  onFunctionName: (name: string) => void;
  onEditCallData?: (
    newData: string,
  ) => Promise<{ success: boolean; error?: string }>;
}) {
  const { tokens } = useTheme();
  const [detailsOpen, setDetailsOpen] = useState(false);

  const approve = useMemo(
    () => (call.data ? parseApproveCalldata(call.data) : null),
    [call.data],
  );

  return (
    <VStack
      spacing={0}
      align="stretch"
      borderTop="1px solid"
      borderColor="border.subtle"
    >
      {call.to && call.data && approve ? (
        <Box w="full" px={2} py={1.5}>
          <ERC20ApproveDisplay
            tokenAddress={call.to}
            approval={approve}
            chainId={chainId}
            onSaveCalldata={onEditCallData}
          />
        </Box>
      ) : call.to && call.data ? (
        <Box w="full" px={2} py={1.5}>
          <ClearSigningView
            kind="calldata"
            chainId={chainId}
            to={call.to}
            calldata={call.data}
            value={call.value}
            hideLoadingSkeleton
          />
        </Box>
      ) : null}

      <Box w="full" px={2} pb={1.5}>
        <Box
          w="full"
          maxW="100%"
          bg="surface.raised"
          border={tokens.borders.thin}
          borderColor="border.default"
          borderRadius="lg"
          boxShadow="card"
          overflow="hidden"
        >
          <HStack
            as="button"
            w="full"
            py={2}
            px={3}
            spacing={2}
            onClick={() => setDetailsOpen((v) => !v)}
            _hover={{ bg: "bg.muted" }}
            cursor="pointer"
            role="button"
            aria-label={detailsOpen ? "Hide calldata" : "Show calldata"}
          >
            <Text
              fontSize="xs"
              fontWeight="800"
              textTransform="uppercase"
              letterSpacing="wide"
              color="text.secondary"
            >
              Calldata
            </Text>
            <Spacer />
            <Text
              fontSize="2xs"
              fontWeight="700"
              color="text.tertiary"
              textTransform="uppercase"
            >
              {detailsOpen ? "Hide" : "Show"}
            </Text>
            <Icon
              as={detailsOpen ? ChevronUpIcon : ChevronDownIcon}
              boxSize={3}
              color="text.tertiary"
            />
          </HStack>

          <Collapse in={detailsOpen} animateOpacity>
            <VStack
              spacing={0}
              align="stretch"
              borderTop={tokens.borders.thin}
              borderColor="border.default"
            >
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
                        _hover={{ color: "accent.secondary", bg: "bg.muted" }}
                      />
                    )}
                  </HStack>
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
          </Collapse>
        </Box>
      </Box>
    </VStack>
  );
}

// ---------------------------------------------------------------------------
// BatchCallsList — convenience wrapper that bundles the clear-signing summary
// and the per-call cards with their own expansion + decoded-name state.
// Used by read-only surfaces (tx-detail modal) where the parent doesn't need
// to track that state itself.
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
  const [expandedCalls, setExpandedCalls] = useState<Set<number>>(new Set());
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
    <VStack spacing={3} align="stretch">
      <BatchClearSigningSummary calls={calls} chainId={chainId} />
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
    </VStack>
  );
}
