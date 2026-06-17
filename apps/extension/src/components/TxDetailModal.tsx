import { memo, useState, useEffect, useCallback, useMemo } from "react";
import {
  Box,
  VStack,
  HStack,
  Text,
  Badge,
  Button,
  Code,
  IconButton,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Image,
  Spacer,
  Collapse,
  Spinner,
} from "@chakra-ui/react";
import {
  CheckCircleIcon,
  WarningIcon,
  ExternalLinkIcon,
  CloseIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  RepeatIcon,
} from "@chakra-ui/icons";
import {
  CompletedTransaction,
  GasData,
  type AssetChangeRecord,
  type AssetTransferRecord,
  type ForceInclusionMeta,
} from "@/chrome/txHistoryStorage";
import { getChainConfig } from "@/constants/chainConfig";
import { OP_STACK_CHAIN_IDS } from "@/constants/networks";
import { useNetworks } from "@/contexts/NetworksContext";
import { AddressParam } from "@/components/decodedParams/AddressParam";
import { CopyButton } from "@/components/CopyButton";
import CalldataDecoder from "@/components/CalldataDecoder";
import { formatEth, formatGwei, formatNumber } from "@/lib/gasFormatUtils";
import { FromAccountDisplay } from "@/components/FromAccountDisplay";
import ChainIcon from "@/components/ChainIcon";
import TokenLogo from "@/components/TokenLogo";
import {
  getResolvedChainById,
  getStoredNativeCurrencySymbol,
  getStoredRpcUrl,
} from "@/lib/chains";
import { isDarkThemeId, useTheme, useChainBadgeStyle } from "@/theme";
import { useThemedToast } from "@/hooks/useThemedToast";
import { useCachedAvatarMap } from "@/hooks/useCachedAvatarSrc";
import ClearSignedSummaryCard from "@/components/ClearSignedSummaryCard";
import { ClearSigningView } from "@/components/ClearSigning/ClearSigningView";
import { BatchCallsList } from "@/components/BatchCallsList";
import {
  decodeErc7821Batch,
  looksLikeErc7821SelfBatch,
} from "@/lib/erc7821Decode";
import {
  EIP_7702_DEFAULT_DELEGATE,
  getKnownDelegateName,
} from "@/constants/chainRegistry";
import { hasDefaultDelegateForChain } from "@/utils/delegationResolution";
import { getEthShLabels } from "@/lib/ethShLabelsCache";
import LoadingDots from "@/components/LoadingDots";

interface TxDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  tx: CompletedTransaction;
}

function formatValue(value: string | undefined, symbol = "ETH"): string {
  if (!value || value === "0" || value === "0x0") {
    return `0 ${symbol}`;
  }
  const wei = BigInt(value);
  const eth = Number(wei) / 1e18;
  return `${eth.toFixed(6)} ${symbol}`;
}

/**
 * Format a positive wei amount to a token-friendly decimal string.
 * `decimals` defaults to 18 (native). Returns null when the amount rounds
 * to zero at our display precision — callers use this to hide rows whose
 * display would otherwise read "0".
 */
function formatTokenAmountWei(amountWei: string, decimals: number): string | null {
  let bi: bigint;
  try {
    bi = BigInt(amountWei);
  } catch {
    return null;
  }
  if (bi < 0n) bi = -bi;
  if (bi === 0n) return null;
  const divisor = 10n ** BigInt(decimals);
  const whole = bi / divisor;
  const frac = bi % divisor;
  let fracStr = frac.toString().padStart(decimals, "0").slice(0, 6);
  fracStr = fracStr.replace(/0+$/, "");
  const numStr = fracStr.length > 0 ? `${whole}.${fracStr}` : `${whole}`;
  // Anything that rounded to a literal "0" string at our precision is
  // sub-display dust — suppress the row entirely.
  if (numStr === "0") return null;
  return numStr;
}

/**
 * Sign-prefixed display ("+1.23" / "−1.23"). Returns null when the rounded
 * magnitude would display as zero.
 */
function formatSignedTokenAmount(amountWei: string, decimals: number, isNegative: boolean): string | null {
  const mag = formatTokenAmountWei(amountWei, decimals);
  if (mag === null) return null;
  return `${isNegative ? "−" : "+"}${mag}`;
}

type TokenChangeDirection = "in" | "out";

type RenderableErc20Transfer = {
  t: AssetTransferRecord;
  formatted: string;
};

type Erc20TransferGroup = {
  key: string;
  direction: TokenChangeDirection;
  token: string;
  symbol?: string;
  logoUrl?: string;
  decimals: number;
  /** Positive base-unit amount, summed across all transfers in the group. */
  totalWei: string;
  totalFormatted: string;
  transfers: RenderableErc20Transfer[];
};

type TokenDisplayMetadata = Pick<
  AssetTransferRecord,
  "symbol" | "decimals" | "logoUrl"
>;

function tokenDisplayMetadataKey(chainId: number, token: string): string {
  return `${chainId}-${token.toLowerCase()}`;
}

function collectMissingTokenMetadataRequests(
  record: AssetChangeRecord | undefined,
  chainId: number,
  requests: Map<string, { chainId: number; tokenAddress: string }>,
) {
  if (!record) return;
  for (const transfer of record.erc20Transfers) {
    if (
      transfer.logoUrl &&
      transfer.symbol &&
      transfer.decimals !== undefined
    ) {
      continue;
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(transfer.token)) continue;
    const tokenAddress = transfer.token.toLowerCase();
    requests.set(tokenDisplayMetadataKey(chainId, tokenAddress), {
      chainId,
      tokenAddress,
    });
  }
}

function applyTokenDisplayMetadata(
  record: AssetChangeRecord | undefined,
  chainId: number,
  metadataByKey: Record<string, TokenDisplayMetadata>,
): AssetChangeRecord | undefined {
  if (!record) return undefined;
  let changed = false;
  const erc20Transfers = record.erc20Transfers.map((transfer) => {
    const metadata =
      metadataByKey[tokenDisplayMetadataKey(chainId, transfer.token)];
    if (!metadata) return transfer;

    const next = {
      ...transfer,
      symbol: transfer.symbol || metadata.symbol,
      decimals:
        transfer.decimals !== undefined
          ? transfer.decimals
          : metadata.decimals,
      logoUrl: transfer.logoUrl || metadata.logoUrl,
    };
    if (
      next.symbol !== transfer.symbol ||
      next.decimals !== transfer.decimals ||
      next.logoUrl !== transfer.logoUrl
    ) {
      changed = true;
    }
    return next;
  });

  return changed ? { ...record, erc20Transfers } : record;
}

function absBigInt(value: string): bigint | null {
  try {
    const parsed = BigInt(value);
    return parsed < 0n ? -parsed : parsed;
  } catch {
    return null;
  }
}

/**
 * Shared tx-detail summarizer for ERC-20 transfer rows. It groups duplicate
 * token+direction transfers so every tx-details surface reports the same
 * total amount while preserving the per-counterparty breakdown for expansion.
 */
function getErc20TransferGroups(
  record: AssetChangeRecord | undefined,
  direction?: TokenChangeDirection,
): Erc20TransferGroup[] {
  if (!record) return [];

  const groups = new Map<
    string,
    Omit<Erc20TransferGroup, "totalWei" | "totalFormatted"> & {
      totalWei: bigint;
    }
  >();

  for (const t of record.erc20Transfers) {
    if (direction && t.direction !== direction) continue;
    const amount = absBigInt(t.amountWei);
    if (amount === null || amount === 0n) continue;

    const decimals = t.decimals ?? 18;
    const formatted = formatSignedTokenAmount(
      amount.toString(),
      decimals,
      t.direction === "out",
    );
    if (formatted === null) continue;

    const key = `${t.direction}-${t.token.toLowerCase()}`;
    const existing = groups.get(key);
    if (existing) {
      existing.totalWei += amount;
      existing.transfers.push({ t, formatted });
      existing.symbol = existing.symbol ?? t.symbol;
      existing.logoUrl = existing.logoUrl ?? t.logoUrl;
      continue;
    }

    groups.set(key, {
      key,
      direction: t.direction,
      token: t.token,
      symbol: t.symbol,
      logoUrl: t.logoUrl,
      decimals,
      totalWei: amount,
      transfers: [{ t, formatted }],
    });
  }

  return Array.from(groups.values())
    .map((group) => {
      const totalWei = group.totalWei.toString();
      const totalFormatted = formatSignedTokenAmount(
        totalWei,
        group.decimals,
        group.direction === "out",
      );
      if (totalFormatted === null) return null;
      return {
        ...group,
        totalWei,
        totalFormatted,
      };
    })
    .filter((group): group is Erc20TransferGroup => group !== null);
}

/**
 * Pick the swap-relevant summarized amount for a wallet-initiated swap/bridge:
 * prefer an ERC-20 group whose symbol matches `symbolHint` (case-insensitive);
 * fall back to the first group in the given direction; finally fall back to the
 * native delta if `nativeFallbackIsNative` is true (sell/buy is native).
 */
function pickAssetChangeAmount(
  record: AssetChangeRecord | undefined,
  direction: TokenChangeDirection,
  symbolHint: string | undefined,
  nativeFallbackIsNative: boolean,
  nativeDecimals: number,
): {
  amountLabel: string;
  amountWei: string;
  decimals: number;
  /** Token contract address (lowercase) or "native". */
  source: string | "native";
} | null {
  if (!record) return null;
  const hint = symbolHint?.toLowerCase();
  const directionGroups = getErc20TransferGroups(record, direction);
  const symMatch = hint
    ? directionGroups.find((group) => group.symbol?.toLowerCase() === hint)
    : undefined;
  const picked = symMatch ?? directionGroups[0];
  if (picked) {
    const decimals = picked.decimals ?? 18;
    const label = formatTokenAmountWei(picked.totalWei, decimals);
    if (label !== null)
      return {
        amountLabel: label,
        amountWei: picked.totalWei,
        decimals,
        source: picked.token,
      };
  }
  if (nativeFallbackIsNative && record.nativeDelta) {
    const label = formatTokenAmountWei(record.nativeDelta, nativeDecimals);
    if (label !== null)
      return {
        amountLabel: label,
        amountWei: record.nativeDelta,
        decimals: nativeDecimals,
        source: "native",
      };
  }
  return null;
}

function formatLocalTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
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

/**
 * One ERC-20 row inside `AssetChangesCard`. Extracted so the parent can keep
 * its render simple: it splits transfers into outflows / inflows and calls
 * this for each entry, in that order.
 */
function renderErc20Row(
  t: AssetTransferRecord,
  formatted: string,
  i: number,
  direction: "in" | "out",
  chainId: number,
  explorer: string | undefined,
  formatUsd: (
    amountWei: string,
    decimals: number,
    chainId: number,
    addressOrNative: string | "native",
  ) => string | null,
) {
  const isNegative = direction === "out";
  const sym = t.symbol || `${t.token.slice(0, 6)}…${t.token.slice(-4)}`;
  const cpShort = `${t.counterparty.slice(0, 6)}…${t.counterparty.slice(-4)}`;
  const cpLink = explorer ? `${explorer}/address/${t.counterparty}` : null;
  const usd = formatUsd(t.amountWei, t.decimals ?? 18, chainId, t.token);
  return (
    <HStack
      key={`${direction}-${t.token}-${i}`}
      justify="space-between"
      align="flex-start"
      spacing={2}
    >
      <HStack spacing={2} minW={0} flex="1">
        <TokenLogo logoUrl={t.logoUrl} symbol={t.symbol} alt={sym} />
        <VStack spacing={0} align="flex-start" minW={0}>
          <Text
            fontSize="xs"
            fontWeight="800"
            color="text.primary"
            isTruncated
            maxW="120px"
          >
            {sym}
          </Text>
          {cpLink ? (
            <Button
              size="xs"
              variant="ghost"
              fontWeight="600"
              fontSize="2xs"
              fontFamily="mono"
              color="text.tertiary"
              onClick={() => chrome.tabs.create({ url: cpLink })}
              rightIcon={<ExternalLinkIcon boxSize={2.5} />}
              _hover={{ bg: "bg.muted", color: "text.secondary" }}
              px={1}
              h="14px"
              minH="14px"
            >
              {isNegative ? "to" : "from"} {cpShort}
            </Button>
          ) : (
            <Text fontSize="2xs" fontFamily="mono" color="text.tertiary">
              {isNegative ? "to" : "from"} {cpShort}
            </Text>
          )}
        </VStack>
      </HStack>
      <VStack spacing={0} align="flex-end">
        <Text
          fontSize="xs"
          fontWeight="800"
          color={isNegative ? "chart.negative" : "chart.positive"}
          fontFamily="mono"
        >
          {formatted} {t.symbol ?? ""}
        </Text>
        {usd && (
          <Text fontSize="2xs" color="text.tertiary" fontWeight="600">
            {usd}
          </Text>
        )}
      </VStack>
    </HStack>
  );
}

/**
 * Renders the "Token Changes" card for one leg of a tx (source-chain by
 * default; bridges also render a second card for the destination leg with
 * `label="On <destChain>"`). Native-row hidden when the extractor couldn't
 * resolve `balance(N-1)`; per-token rows render even without symbol/decimals
 * (the placeholder paints with a short address).
 */
function AssetChangesCard({
  record,
  chainId,
  nativeSym,
  label,
  formatUsd,
}: {
  record: AssetChangeRecord;
  chainId: number;
  nativeSym: string;
  label: string;
  /** Resolves a (chainId, address-or-"native") amount to its USD subtitle. */
  formatUsd: (amountWei: string, decimals: number, chainId: number, addressOrNative: string | "native") => string | null;
}) {
  const explorer = getChainConfig(chainId).explorer;
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Native delta — compute the row data first so we know its sign, then build
  // the JSX. Letting `isNegative` escape the IIFE lets us slot the row into
  // the outflow or inflow bucket below.
  const nativeData = (() => {
    if (!record.nativeDelta) return null;
    let bi: bigint;
    try {
      bi = BigInt(record.nativeDelta);
    } catch {
      return null;
    }
    if (bi === 0n) return null;
    const isNegative = bi < 0n;
    const formatted = formatSignedTokenAmount(record.nativeDelta, 18, isNegative);
    if (formatted === null) return null; // rounds to zero — sub-display dust
    const usd = formatUsd(record.nativeDelta, 18, chainId, "native");
    return { isNegative, formatted, usd };
  })();

  const nativeRow = nativeData ? (
    <HStack justify="space-between" align="flex-start">
      <HStack spacing={2}>
        <TokenLogo
          nativeChainId={chainId}
          symbol={nativeSym}
          alt={nativeSym}
        />
        <Text fontSize="xs" fontWeight="700" color="text.secondary">
          {nativeSym}
        </Text>
      </HStack>
      <VStack spacing={0} align="flex-end">
        <Text
          fontSize="xs"
          fontWeight="800"
          color={nativeData.isNegative ? "chart.negative" : "chart.positive"}
          fontFamily="mono"
        >
          {nativeData.formatted} {nativeSym}
        </Text>
        {nativeData.usd && (
          <Text fontSize="2xs" color="text.tertiary" fontWeight="600">
            {nativeData.usd}
          </Text>
        )}
      </VStack>
    </HStack>
  ) : null;

  const outErc20Groups = getErc20TransferGroups(record, "out");
  const inErc20Groups = getErc20TransferGroups(record, "in");

  // Outflows render above inflows so the "what left the wallet" line is the
  // first thing the user sees — same vertical order the live confirmation
  // surface (`AssetChangesDisplay`) already enforces with its Send / Receive
  // headers. Native row slots into the matching bucket based on its sign.
  const nativeIsOut = !!nativeData?.isNegative;
  if (
    !nativeRow &&
    outErc20Groups.length === 0 &&
    inErc20Groups.length === 0
  ) {
    return null;
  }

  const renderErc20BreakdownRow = (
    item: RenderableErc20Transfer,
    direction: "in" | "out",
    groupKey: string,
    i: number,
  ) => {
    const { t, formatted } = item;
    const isNegative = direction === "out";
    const cpShort = `${t.counterparty.slice(0, 6)}…${t.counterparty.slice(-4)}`;
    const cpLink = explorer ? `${explorer}/address/${t.counterparty}` : null;
    const usd = formatUsd(t.amountWei, t.decimals ?? 18, chainId, t.token);
    return (
      <HStack
        key={`${groupKey}-${t.counterparty}-${i}`}
        justify="space-between"
        align="flex-start"
        spacing={2}
        w="full"
      >
        {cpLink ? (
          <Button
            size="xs"
            variant="ghost"
            fontWeight="600"
            fontSize="2xs"
            fontFamily="mono"
            color="text.tertiary"
            onClick={() => chrome.tabs.create({ url: cpLink })}
            rightIcon={<ExternalLinkIcon boxSize={2.5} />}
            _hover={{ bg: "bg.muted", color: "text.secondary" }}
            px={1}
            h="14px"
            minH="14px"
          >
            {isNegative ? "to" : "from"} {cpShort}
          </Button>
        ) : (
          <Text fontSize="2xs" fontFamily="mono" color="text.tertiary">
            {isNegative ? "to" : "from"} {cpShort}
          </Text>
        )}
        <VStack spacing={0} align="flex-end">
          <Text
            fontSize="2xs"
            fontWeight="800"
            color={isNegative ? "chart.negative" : "chart.positive"}
            fontFamily="mono"
          >
            {formatted} {t.symbol ?? ""}
          </Text>
          {usd && (
            <Text fontSize="2xs" color="text.tertiary" fontWeight="600">
              {usd}
            </Text>
          )}
        </VStack>
      </HStack>
    );
  };

  const renderErc20Group = (
    group: Erc20TransferGroup,
    i: number,
  ) => {
    const uniqueCounterparties = new Set(
      group.transfers.map(({ t }) => t.counterparty.toLowerCase()),
    );

    if (uniqueCounterparties.size === 1) {
      const only = group.transfers[0];
      const aggregateTransfer: AssetTransferRecord = {
        ...only.t,
        amountWei: group.totalWei,
        symbol: group.symbol ?? only.t.symbol,
        decimals: group.decimals,
        logoUrl: group.logoUrl ?? only.t.logoUrl,
      };
      return renderErc20Row(
        aggregateTransfer,
        group.totalFormatted,
        i,
        group.direction,
        chainId,
        explorer,
        formatUsd,
      );
    }

    const sym =
      group.symbol || `${group.token.slice(0, 6)}…${group.token.slice(-4)}`;
    const isNegative = group.direction === "out";
    const totalUsd = formatUsd(
      group.totalWei,
      group.decimals,
      chainId,
      group.token,
    );
    const expanded = expandedGroups.has(group.key);
    const counterpartyCount = uniqueCounterparties.size;
    const subtitle =
      group.direction === "out"
        ? `${counterpartyCount} recipient${counterpartyCount === 1 ? "" : "s"}`
        : `${counterpartyCount} source${counterpartyCount === 1 ? "" : "s"}`;

    return (
      <Box key={group.key}>
        <Box
          as="button"
          type="button"
          w="full"
          textAlign="left"
          onClick={() => toggleGroup(group.key)}
          aria-expanded={expanded}
          _hover={{ bg: "surface.raisedHover" }}
          borderRadius="md"
        >
          <HStack justify="space-between" align="flex-start" spacing={2}>
            <HStack spacing={2} minW={0} flex="1">
              <TokenLogo
                logoUrl={group.logoUrl}
                symbol={group.symbol}
                alt={sym}
              />
              <VStack spacing={0} align="flex-start" minW={0}>
                <Text
                  fontSize="xs"
                  fontWeight="800"
                  color="text.primary"
                  isTruncated
                  maxW="120px"
                >
                  {sym}
                </Text>
                <HStack spacing={1} align="center">
                  {expanded ? (
                    <ChevronUpIcon
                      boxSize={3}
                      color="text.tertiary"
                      flexShrink={0}
                    />
                  ) : (
                    <ChevronDownIcon
                      boxSize={3}
                      color="text.tertiary"
                      flexShrink={0}
                    />
                  )}
                  <Text fontSize="2xs" color="text.tertiary" fontWeight="600">
                    {subtitle}
                  </Text>
                </HStack>
              </VStack>
            </HStack>
            <VStack spacing={0} align="flex-end">
              <Text
                fontSize="xs"
                fontWeight="800"
                color={isNegative ? "chart.negative" : "chart.positive"}
                fontFamily="mono"
              >
                {group.totalFormatted} {group.symbol ?? ""}
              </Text>
              {totalUsd && (
                <Text fontSize="2xs" color="text.tertiary" fontWeight="600">
                  {totalUsd}
                </Text>
              )}
            </VStack>
          </HStack>
        </Box>
        <Collapse in={expanded} animateOpacity>
          <VStack
            spacing={1}
            align="stretch"
            mt={1}
            ml={5}
            pl={2}
            borderLeft="1px solid"
            borderColor="border.subtle"
          >
            {group.transfers.map((item, idx) =>
              renderErc20BreakdownRow(item, group.direction, group.key, idx),
            )}
          </VStack>
        </Collapse>
      </Box>
    );
  };

  return (
    <Box
      bg="surface.sunken"
      border="2px solid"
      borderColor="border.default"
      borderRadius="lg"
      p={2.5}
    >
      <Text
        fontSize="2xs"
        fontWeight="800"
        textTransform="uppercase"
        color="text.tertiary"
        letterSpacing="wide"
        mb={2}
      >
        {label}
      </Text>
      <VStack spacing={1.5} align="stretch">
        {nativeRow && nativeIsOut && nativeRow}
        {outErc20Groups.map(renderErc20Group)}
        {nativeRow && !nativeIsOut && nativeRow}
        {inErc20Groups.map(renderErc20Group)}
      </VStack>
    </Box>
  );
}

/**
 * Compute the force-inclusion 2-step progress states from a tx record.
 *
 * The discriminator is `hasDistinctL2Hash`: when the L2 receipt poller
 * updates a tx to status="failed" because the L2 tx reverted, it preserves
 * the L2 hash that was set when L1 was originally confirmed. So:
 *   - tx.txHash !== meta.l1TxHash → L1 succeeded, L2 hash was extracted
 *   - tx.txHash === meta.l1TxHash (or absent) → L1 never produced an L2 hash
 *     (either L1 reverted, or extractL2Hash fell back to the L1 hash)
 *
 * This lets us distinguish "L1 failed" from "L2 failed" purely from the
 * stored state, without parsing error strings.
 */
function getForceInclusionState(
  meta: ForceInclusionMeta,
  status: string,
  txHash: string | undefined,
) {
  const hasDistinctL2Hash = !!(txHash && txHash !== meta.l1TxHash);
  const l1Confirmed =
    status === "pending" ||
    status === "success" ||
    (status === "failed" && hasDistinctL2Hash);
  const l1Reverted = status === "failed" && !hasDistinctL2Hash;
  const l2Confirmed = meta.l2Confirmed || status === "success";
  const l2Reverted = status === "failed" && hasDistinctL2Hash;
  return { hasDistinctL2Hash, l1Confirmed, l1Reverted, l2Confirmed, l2Reverted };
}

function ForceInclusionSteps({
  meta,
  status,
  txHash,
}: {
  meta: ForceInclusionMeta;
  status: string;
  txHash: string | undefined;
}) {
  const { themeId } = useTheme();
  const isDarkTheme = isDarkThemeId(themeId);
  // The step circles are vivid filled discs (red/green/blue) with a small icon
  // inside. White contrasts well against the vivid Bauhaus palette but vanishes
  // against Midnight's lighter chart tints — flip to a near-black icon there.
  const stepIconColor = isDarkTheme ? "fg.inverse" : "white";
  const l1Config = getChainConfig(meta.l1ChainId);
  const l2Config = getChainConfig(meta.l2ChainId);
  const l1HasHash = !!meta.l1TxHash;
  const { l1Confirmed, l1Reverted, l2Confirmed, l2Reverted } =
    getForceInclusionState(meta, status, txHash);

  return (
    <Box
      border="2px solid"
      borderColor="border.default"
      bg="bg.muted"
      p={3}
    >
      <Text fontSize="2xs" fontWeight="700" textTransform="uppercase" color="text.secondary" mb={2}>
        Force Inclusion Progress
      </Text>
      <VStack spacing={2} align="stretch">
        {/* Step 1: L1 */}
        <HStack spacing={2}>
          <Box
            w="18px" h="18px" flexShrink={0}
            border="2px solid" borderColor="border.default"
            bg={l1Reverted ? "chart.negative" : l1Confirmed ? "chart.positive" : "accent.secondary"}
            display="flex" alignItems="center" justifyContent="center"
          >
            {l1Reverted ? (
              <WarningIcon boxSize={2.5} color={stepIconColor} />
            ) : l1Confirmed ? (
              <CheckCircleIcon boxSize={2.5} color={stepIconColor} />
            ) : (
              <Spinner size="xs" color={stepIconColor} boxSize="10px" />
            )}
          </Box>
          <Text fontSize="xs" fontWeight="700" color="text.primary">
            L1 Deposit ({l1Config.name || "Ethereum"})
          </Text>
          {l1Reverted ? (
            <Text fontSize="2xs" color="chart.negative" fontWeight="600">Failed</Text>
          ) : l1Confirmed ? (
            <Text fontSize="2xs" color="chart.positive" fontWeight="600">Confirmed</Text>
          ) : l1HasHash ? (
            <Text fontSize="2xs" color="accent.secondary" fontWeight="600">Pending...</Text>
          ) : null}
        </HStack>
        {/* Step 2: L2 */}
        <HStack spacing={2}>
          <Box
            w="18px" h="18px" flexShrink={0}
            border="2px solid" borderColor="border.default"
            bg={
              l2Reverted
                ? "chart.negative"
                : l2Confirmed
                  ? "chart.positive"
                  : l1Confirmed
                    ? "accent.secondary"
                    : "border.subtle"
            }
            display="flex" alignItems="center" justifyContent="center"
          >
            {l2Reverted ? (
              <WarningIcon boxSize={2.5} color={stepIconColor} />
            ) : l2Confirmed ? (
              <CheckCircleIcon boxSize={2.5} color={stepIconColor} />
            ) : l1Confirmed ? (
              <Spinner size="xs" color={stepIconColor} boxSize="10px" />
            ) : (
              <Text fontSize="2xs" fontWeight="800" color="text.tertiary">2</Text>
            )}
          </Box>
          <Text fontSize="xs" fontWeight="700" color={l1Confirmed ? "text.primary" : "text.tertiary"}>
            L2 Sequencer ({l2Config.name || "L2"})
          </Text>
          {l2Reverted ? (
            <Text fontSize="2xs" color="chart.negative" fontWeight="600">Reverted</Text>
          ) : l2Confirmed ? (
            <Text fontSize="2xs" color="chart.positive" fontWeight="600">Confirmed</Text>
          ) : l1Confirmed ? (
            <Text fontSize="2xs" color="accent.secondary" fontWeight="600">Awaiting inclusion...</Text>
          ) : null}
        </HStack>
      </VStack>
    </Box>
  );
}

function TxDetailModal({ isOpen, onClose, tx }: TxDetailModalProps) {
  const { networksInfo } = useNetworks();
  const resolvedChain = getResolvedChainById(tx.chainId, networksInfo);
  const config = getChainConfig(tx.chainId);
  const cachedLogoMap = useCachedAvatarMap(
    useMemo(
      () => [
        tx.swapMeta?.sellTokenLogo,
        tx.swapMeta?.buyTokenLogo,
        tx.transferMeta?.tokenLogo,
      ],
      [
        tx.swapMeta?.sellTokenLogo,
        tx.swapMeta?.buyTokenLogo,
        tx.transferMeta?.tokenLogo,
      ],
    ),
  );
  const resolveLogo = useCallback(
    (url: string | null | undefined): string | undefined =>
      (url && cachedLogoMap.get(url)) || url || undefined,
    [cachedLogoMap],
  );
  // Chain badge colors — all per-theme branching lives in `useChainBadgeStyle`.
  const chainBadgeStyle = useChainBadgeStyle(
    resolvedChain?.bg ?? config.bg,
    resolvedChain?.text ?? config.text,
    resolvedChain?.isCustom ?? false,
  );
  const hasCalldata = tx.tx.data && tx.tx.data !== "0x";
  const isContractDeploy = !tx.tx.to;
  const isL2 = OP_STACK_CHAIN_IDS.has(tx.chainId);
  // Atomic batches (Bankr ERC-7821, EIP-7702 PK/SP) land on-chain as a self-
  // call whose data is `execute(mode, encodedCalls)`. Decode it back into the
  // per-call list so we can render the same clear-signing UI the confirmation
  // surface uses — instead of FROM=EOA / TO=EOA + an opaque blob. Returns null
  // for non-batch txs so this is a no-op for the rest of history.
  const batchCalls = useMemo(() => {
    if (!looksLikeErc7821SelfBatch(tx.tx)) return null;
    return decodeErc7821Batch(tx.tx.data);
  }, [tx.tx]);
  const hasBatchCalls = !!batchCalls && batchCalls.length > 0;
  const delegationMeta = tx.delegation7702Meta;
  const hasDelegation = !!delegationMeta;
  // eth.sh label for the delegation target — shared cache, so this is free
  // on reopen and free if any other surface (tx-confirmation screen, etc.)
  // already fetched it.
  const [delegateLabels, setDelegateLabels] = useState<string[]>([]);
  useEffect(() => {
    if (!isOpen || !delegationMeta || delegationMeta.kind === "revoke") {
      setDelegateLabels([]);
      return;
    }
    let cancelled = false;
    getEthShLabels(delegationMeta.targetDelegate, tx.chainId).then((labels) => {
      if (cancelled) return;
      setDelegateLabels(labels);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, delegationMeta, tx.chainId]);
  // When the modal already has a hero summary that answers "what did this
  // tx do?", the raw From/To/Value/Calldata rows are power-user details so
  // we default them collapsed. Hero sources, in priority order:
  //   - clear-signed snapshot (Approved/Transferred/Native-send/ERC-7730)
  //   - batch calls (decoded ERC-7821 self-call from atomic-7702 / Bankr)
  //   - delegation7702 (Set / Revoke smart-account tx — target lives in the
  //     authorization list, not in calldata, so the raw FROM/TO/data view
  //     would otherwise look like a no-op self-call)
  //   - swap meta (sell→buy tokens; rendered by SwapSummaryCard above)
  //   - bridge meta (destination chain block also above)
  // Bridge / swap txs are virtually always wallet-initiated, so this is
  // also the place to honor "collapse for wallet-initiated swap txs".
  const hasHero =
    !!tx.clearSignedMeta ||
    hasBatchCalls ||
    hasDelegation ||
    !!tx.swapMeta ||
    !!tx.bridge;
  const [rawDetailsExpanded, setRawDetailsExpanded] = useState(!hasHero);
  const [gasExpanded, setGasExpanded] = useState(false);
  const [errorExpanded, setErrorExpanded] = useState(false);
  const [isRebroadcasting, setIsRebroadcasting] = useState(false);
  // Source-chain native USD price for the Value + Transaction Fee rows.
  // Fetched lazily once the modal opens. Almost every recorded tx has a
  // non-zero gas fee, so we don't bother gating on value/fee here — the
  // single CoinGecko call covers both rows.
  const [nativePriceUsd, setNativePriceUsd] = useState<number | null>(null);
  useEffect(() => {
    if (!isOpen) return;
    chrome.runtime.sendMessage(
      { type: "fetchNativePrice", chainId: tx.chainId },
      (res) => {
        if (res?.success && typeof res.priceUsd === "number" && res.priceUsd > 0) {
          setNativePriceUsd(res.priceUsd);
        }
      },
    );
  }, [isOpen, tx.chainId]);

  const bridgeDestinationChainId = tx.bridge?.destinationChainId;

  const [assetTokenMetadata, setAssetTokenMetadata] = useState<
    Record<string, TokenDisplayMetadata>
  >({});

  useEffect(() => {
    if (!isOpen) return;
    const requests = new Map<
      string,
      { chainId: number; tokenAddress: string }
    >();
    collectMissingTokenMetadataRequests(
      tx.assetChanges,
      tx.chainId,
      requests,
    );
    if (bridgeDestinationChainId && tx.destAssetChanges) {
      collectMissingTokenMetadataRequests(
        tx.destAssetChanges,
        bridgeDestinationChainId,
        requests,
      );
    }
    if (requests.size === 0) return;

    let cancelled = false;
    Promise.all(
      Array.from(requests.entries()).map(
        ([key, req]) =>
          new Promise<{
            key: string;
            metadata: TokenDisplayMetadata | null;
          }>((resolve) => {
            chrome.runtime.sendMessage(
              {
                type: "resolveTokenMetadata",
                chainId: req.chainId,
                tokenAddress: req.tokenAddress,
              },
              (response) => {
                resolve({
                  key,
                  metadata: response?.success ? response.data ?? null : null,
                });
              },
            );
          }),
      ),
    ).then((results) => {
      if (cancelled) return;
      const found = results.filter(
        (result): result is {
          key: string;
          metadata: TokenDisplayMetadata;
        } => result.metadata !== null,
      );
      if (found.length === 0) return;
      setAssetTokenMetadata((prev) => {
        const next = { ...prev };
        for (const { key, metadata } of found) {
          const existing = next[key] ?? {};
          next[key] = {
            symbol: existing.symbol ?? metadata.symbol,
            decimals: existing.decimals ?? metadata.decimals,
            logoUrl: existing.logoUrl ?? metadata.logoUrl,
          };
        }
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [
    isOpen,
    tx.assetChanges,
    bridgeDestinationChainId,
    tx.chainId,
    tx.destAssetChanges,
  ]);

  const sourceAssetChanges = useMemo(
    () =>
      applyTokenDisplayMetadata(
        tx.assetChanges,
        tx.chainId,
        assetTokenMetadata,
      ),
    [assetTokenMetadata, tx.assetChanges, tx.chainId],
  );
  const destinationAssetChanges = useMemo(
    () =>
      applyTokenDisplayMetadata(
        tx.destAssetChanges,
        bridgeDestinationChainId ?? tx.chainId,
        assetTokenMetadata,
      ),
    [
      assetTokenMetadata,
      bridgeDestinationChainId,
      tx.chainId,
      tx.destAssetChanges,
    ],
  );

  useEffect(() => {
    if (!isOpen) return;
    if (tx.assetChanges || tx.status !== "success" || !tx.txHash) return;
    chrome.runtime.sendMessage({
      type: "backfillAssetChanges",
      txId: tx.id,
    });
  }, [isOpen, tx.id, tx.status, tx.txHash, tx.assetChanges]);

  // USD prices keyed by `${chainId}-${address-lowercase}` for ERC-20s and
  // `${chainId}-native` for native deltas. Populated lazily from assetChanges
  // + destAssetChanges + bridge dest chain native so the Token Changes rows
  // and Source / Destination cards can show a USD subtitle. Uses the same
  // backend chain as the rest of the wallet — proxy `fetchTokenPrice` (which
  // already short-circuits via portfolio API + CoinGecko fallback) for ERC-20s
  // and `fetchNativePrice` for native; results are cached at the background
  // layer so re-opens are free.
  const [tokenPricesUsd, setTokenPricesUsd] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!isOpen) return;
    const requests: Array<{ key: string; chainId: number; address: string | "native" }> = [];
    const seen = new Set<string>();
    const addReq = (chainId: number, address: string | "native") => {
      const addrLower = address === "native" ? "native" : address.toLowerCase();
      const key = `${chainId}-${addrLower}`;
      if (seen.has(key)) return;
      seen.add(key);
      requests.push({ key, chainId, address: addrLower });
    };
    const collect = (record: AssetChangeRecord | undefined, chainId: number) => {
      if (!record) return;
      if (record.nativeDelta) addReq(chainId, "native");
      for (const t of record.erc20Transfers) addReq(chainId, t.token);
    };
    collect(sourceAssetChanges, tx.chainId);
    if (bridgeDestinationChainId && destinationAssetChanges) {
      collect(destinationAssetChanges, bridgeDestinationChainId);
    }
    if (requests.length === 0) return;
    let cancelled = false;
    Promise.all(
      requests.map(
        (req) =>
          new Promise<{ key: string; priceUsd: number }>((resolve) => {
            const msg =
              req.address === "native"
                ? { type: "fetchNativePrice", chainId: req.chainId }
                : { type: "fetchTokenPrice", chainId: req.chainId, address: req.address };
            chrome.runtime.sendMessage(msg, (res) => {
              const price = res?.success ? Number(res.priceUsd ?? 0) : 0;
              resolve({ key: req.key, priceUsd: price > 0 ? price : 0 });
            });
          }),
      ),
    ).then((results) => {
      if (cancelled) return;
      setTokenPricesUsd((prev) => {
        const next = { ...prev };
        for (const { key, priceUsd } of results) {
          if (priceUsd > 0) next[key] = priceUsd;
        }
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [
    isOpen,
    tx.chainId,
    sourceAssetChanges,
    destinationAssetChanges,
    bridgeDestinationChainId,
  ]);

  /**
   * Format a (possibly signed) base-units token amount as `$N.NN` using the
   * price map. Returns null when the price is unknown or the USD result
   * rounds to zero.
   */
  const formatTokenAmountUsd = useCallback(
    (
      amountWei: string,
      decimals: number,
      chainId: number,
      addressOrNative: string | "native",
    ): string | null => {
      const key = `${chainId}-${addressOrNative === "native" ? "native" : addressOrNative.toLowerCase()}`;
      const price = tokenPricesUsd[key];
      if (!price || price <= 0) return null;
      let bi: bigint;
      try {
        bi = BigInt(amountWei);
      } catch {
        return null;
      }
      if (bi < 0n) bi = -bi;
      if (bi === 0n) return null;
      const divisor = 10n ** BigInt(decimals);
      const whole = Number(bi / divisor);
      const frac = Number(bi % divisor) / Number(divisor);
      const usd = (whole + frac) * price;
      if (usd <= 0) return null;
      return usd < 0.01 ? "<$0.01" : `$${usd.toFixed(2)}`;
    },
    [tokenPricesUsd],
  );

  // Format a wei-amount as `$N.NN`, returning null when the price is missing
  // or the wei amount is zero. Used by both the Value and Transaction Fee
  // rows to render the inline USD equivalent.
  const formatWeiUsd = useCallback(
    (raw: string | undefined | null): string | null => {
      if (!raw || !nativePriceUsd || nativePriceUsd <= 0) return null;
      try {
        const wei = BigInt(raw);
        if (wei === 0n) return null;
        const usd = (Number(wei) / 1e18) * nativePriceUsd;
        if (usd <= 0) return null;
        return usd < 0.01 ? "<$0.01" : `$${usd.toFixed(2)}`;
      } catch {
        return null;
      }
    },
    [nativePriceUsd],
  );
  const toast = useThemedToast();
  const { themeId } = useTheme();
  // On midnight, the error.fg coral reads as another "error" cue on top of the
  // already-red container — use a neutral light surface so the CTA feels like
  // an action, not a warning. Bauhaus error.fg is already WHITE, so it's fine.
  const rebroadcastBg = isDarkThemeId(themeId) ? "fg.primary" : "status.error.fg";
  const rebroadcastFg = isDarkThemeId(themeId) ? "fg.inverse" : "status.error.bg";

  const canRebroadcast =
    tx.status === "failed" &&
    !!tx.error &&
    tx.error.toLowerCase().includes("dropped from the mempool") &&
    !!tx.tx.to;

  const handleRebroadcast = async () => {
    if (!tx.tx.to) return;
    setIsRebroadcasting(true);
    try {
      const result = await new Promise<{ success: boolean; error?: string }>(
        (resolve) => {
          chrome.runtime.sendMessage(
            {
              type: "initiateTransfer",
              tx: {
                from: tx.tx.from,
                to: tx.tx.to,
                data: tx.tx.data,
                value: tx.tx.value,
                chainId: tx.tx.chainId,
              },
              chainName: tx.chainName,
            },
            resolve,
          );
        },
      );
      if (result.success) {
        onClose();
      } else {
        toast({
          title: "Rebroadcast failed",
          description: result.error || "Could not create a new transaction request",
          status: "error",
        });
      }
    } catch (e) {
      toast({
        title: "Rebroadcast failed",
        description: e instanceof Error ? e.message : "Unknown error",
        status: "error",
      });
    } finally {
      setIsRebroadcasting(false);
    }
  };

  // Native currency symbol — fast for hardcoded chains, async for custom
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

  // On-demand gas data fetching for txs that don't have it yet
  const [gasData, setGasData] = useState<GasData | undefined>(tx.gasData);

  useEffect(() => {
    setGasData(tx.gasData);
    setGasExpanded(false);

    if (tx.gasData || !tx.txHash || tx.status !== "success" || !isOpen) return;

    let cancelled = false;

    (async () => {
      const rpcUrl = await getStoredRpcUrl(tx.chainId);
      if (!rpcUrl || cancelled) return;

      try {
        const rpcCall = (method: string, params: any[]) =>
          fetch(rpcUrl!, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
          }).then((r) => r.json()).then((r) => r.result);

        const [txData, receipt] = await Promise.all([
          rpcCall("eth_getTransactionByHash", [tx.txHash!]),
          rpcCall("eth_getTransactionReceipt", [tx.txHash!]),
        ]);
        if (!receipt || cancelled) return;

        const data: GasData = {
          gasUsed: BigInt(receipt.gasUsed).toString(),
          gasLimit: txData?.gas ? BigInt(txData.gas).toString() : BigInt(receipt.gasUsed).toString(),
          effectiveGasPrice: BigInt(receipt.effectiveGasPrice).toString(),
        };

        if (OP_STACK_CHAIN_IDS.has(tx.chainId)) {
          if (receipt.l1Fee) data.l1Fee = BigInt(receipt.l1Fee).toString();
          if (receipt.l1GasUsed) data.l1GasUsed = BigInt(receipt.l1GasUsed).toString();
          if (receipt.l1GasPrice) data.l1GasPrice = BigInt(receipt.l1GasPrice).toString();
        }

        if (!cancelled) setGasData(data);
      } catch { /* non-critical */ }
    })();

    return () => { cancelled = true; };
  }, [tx.id, tx.gasData, tx.txHash, tx.status, tx.chainId, isOpen]);

  // Resolve explorer: hardcoded chain config first, then custom chain in networksInfo
  const explorerBase = resolvedChain?.explorer || config.explorer || "";

  const handleViewOnExplorer = () => {
    if (tx.txHash && explorerBase) {
      const hash = tx.txHash.match(/0x[a-fA-F0-9]{64}/)?.[0];
      if (hash) {
        chrome.tabs.create({ url: `${explorerBase}/tx/${hash}` });
      }
    }
  };

  // Compute derived gas values
  const txFee = gasData
    ? (BigInt(gasData.gasUsed) * BigInt(gasData.effectiveGasPrice) + BigInt(gasData.l1Fee || "0")).toString()
    : undefined;
  const gasUsagePercent = gasData
    ? ((Number(gasData.gasUsed) / Number(gasData.gasLimit)) * 100).toFixed(2)
    : undefined;
  const displayTimestamp = tx.completedAt ?? tx.createdAt;

  // Gas params we set / signed with. For PK/Seed paths these reflect the
  // tier-picker / Custom override; for Bankr / dapp-sponsored txs they
  // mirror whatever the dapp suggested. Used as a pre-confirmation fallback
  // so pending txs still show gas info before a receipt arrives.
  const setGas = tx.tx.gas;
  const setMaxFee = tx.tx.maxFeePerGas;
  const setPriority = tx.tx.maxPriorityFeePerGas;
  const setGasPrice = tx.tx.gasPrice;
  const hasSetGasParams = !!(setGas || setMaxFee || setPriority || setGasPrice);
  const estimatedMaxCost = (() => {
    if (!setGas) return undefined;
    const priceStr = setMaxFee || setGasPrice;
    if (!priceStr) return undefined;
    try {
      return (BigInt(setGas) * BigInt(priceStr)).toString();
    } catch {
      return undefined;
    }
  })();

  return (
    <Modal isOpen={isOpen} onClose={onClose} scrollBehavior="inside" isCentered>
      <ModalOverlay bg="surface.overlay" />
      <ModalContent
        mx={3}
        my={3}
        maxH="calc(100vh - 24px)"
      >
        <ModalHeader
          color="text.primary"
          fontSize="md"
          pb={2}
          textTransform="uppercase"
          letterSpacing="wider"
          borderBottom="3px solid"
          borderColor="border.default"
          display="flex"
          alignItems="center"
          justifyContent="space-between"
        >
          Transaction Details
          <IconButton
            aria-label="Close"
            icon={<CloseIcon boxSize="10px" />}
            size="sm"
            variant="ghost"
            onClick={onClose}
            _hover={{ bg: "bg.muted" }}
          />
        </ModalHeader>

        <ModalBody px={4} py={3}>
          <VStack spacing={3} align="stretch">
            {/* Status + Chain row */}
            <HStack spacing={2} flexWrap="wrap">
              <Badge
                fontSize="xs"
                bg={chainBadgeStyle.bg}
                color={chainBadgeStyle.fg}
                border="2px solid"
                borderColor={chainBadgeStyle.border}
                px={2}
                py={0.5}
                display="flex"
                alignItems="center"
                gap={1}
              >
                <ChainIcon
                  chainId={tx.chainId}
                  chainName={resolvedChain?.name ?? tx.chainName}
                  size="10px"
                  withChip
                />
                {resolvedChain?.name ?? tx.chainName}
              </Badge>
              {tx.status === "pending" && !tx.forceInclusionMeta && (
                <Badge
                  bg="status.info.bg"
                  color="status.info.fg"
                  border="2px solid"
                  borderColor="border.default"
                  px={2}
                  py={0.5}
                  fontSize="xs"
                  display="flex"
                  alignItems="center"
                  gap={1}
                >
                  <Text fontSize="xs" lineHeight="1">
                    ⌛
                  </Text>
                  Pending...
                </Badge>
              )}
              {tx.status === "success" && (
                <Badge
                  bg="accent.highlight"
                  color="accentFg.highlight"
                  border="2px solid"
                  borderColor="border.default"
                  px={2}
                  py={0.5}
                  fontSize="xs"
                  display="flex"
                  alignItems="center"
                  gap={1}
                >
                  <CheckCircleIcon boxSize={3} />
                  {tx.forceInclusionMeta ? "L1 + L2 Confirmed" : "Confirmed"}
                </Badge>
              )}
              {tx.status === "failed" && (() => {
                // For force inclusion, distinguish L1 vs L2 failure so the user
                // immediately sees which side broke. The discriminator is
                // hasDistinctL2Hash — see getForceInclusionState above.
                let label = "Failed";
                if (tx.forceInclusionMeta) {
                  const { l1Reverted, l2Reverted } = getForceInclusionState(
                    tx.forceInclusionMeta,
                    tx.status,
                    tx.txHash,
                  );
                  if (l1Reverted) label = "L1 Failed";
                  else if (l2Reverted) label = "L2 Failed";
                }
                return (
                  <Badge
                    bg="status.error.bg"
                    color="status.error.fg"
                    border="2px solid"
                    borderColor="border.default"
                    px={2}
                    py={0.5}
                    fontSize="xs"
                    display="flex"
                    alignItems="center"
                    gap={1}
                  >
                    <WarningIcon boxSize={3} />
                    {label}
                  </Badge>
                );
              })()}
            </HStack>

            {/* Force Inclusion 2-step status */}
            {tx.forceInclusionMeta && (
              <ForceInclusionSteps
                meta={tx.forceInclusionMeta}
                status={tx.status}
                txHash={tx.txHash}
              />
            )}

            {/* Cross-chain destination block. Appears once the user has
                bridged: shows the destination chain + (if known) the
                destination tx hash, route name, and current Bungee status
                code label. Source explorer link is the regular "View on
                explorer" button below; this block adds the destination
                counterpart. */}
            {tx.bridge && tx.swapMeta && (() => {
              // Source block: mirror the destination card's visual hierarchy
              // (chain icon + 2-line label, "You Sent" token row) so the
              // user sees the bridge route at a glance — source chain +
              // sell token at top, destination chain + buy token below.
              const sellLogo = resolveLogo(tx.swapMeta.sellTokenLogo);
              const sellSymbol = tx.swapMeta.sellTokenSymbol;
              const srcChainName = resolvedChain?.name ?? tx.chainName;
              // Match the actual on-chain outflow to the swap's sell token
              // so the row reads "1.234 USDC" once assetChanges lands. Native
              // sells fall back to abs(nativeDelta).
              const sellAmount = pickAssetChangeAmount(
                sourceAssetChanges,
                "out",
                sellSymbol,
                sellSymbol?.toLowerCase() === nativeSym.toLowerCase(),
                18,
              );
              return (
                <Box
                  bg="surface.sunken"
                  border="2px solid"
                  borderColor="border.default"
                  borderRadius="lg"
                  p={2.5}
                >
                  <HStack justify="space-between" align="center" mb={sellSymbol ? 2.5 : 0}>
                    <HStack spacing={2} flexShrink={0}>
                      <ChainIcon
                        chainId={tx.chainId}
                        chainName={srcChainName}
                        size="16px"
                        withChip
                      />
                      <VStack spacing={0} align="flex-start">
                        <Text
                          fontSize="2xs"
                          fontWeight="800"
                          textTransform="uppercase"
                          color="text.tertiary"
                          letterSpacing="wide"
                          lineHeight="1"
                        >
                          Source
                        </Text>
                        <Text
                          fontSize="sm"
                          fontWeight="800"
                          color="text.primary"
                          lineHeight="1.2"
                        >
                          {srcChainName}
                        </Text>
                      </VStack>
                    </HStack>
                    {tx.txHash && explorerBase && (
                      <IconButton
                        aria-label="View source tx on explorer"
                        icon={<ExternalLinkIcon boxSize={3} />}
                        size="xs"
                        variant="ghost"
                        h="20px"
                        minW="20px"
                        color="text.tertiary"
                        onClick={(e) => {
                          e.stopPropagation();
                          const hash = tx.txHash!.match(/0x[a-fA-F0-9]{64}/)?.[0];
                          if (hash) chrome.tabs.create({ url: `${explorerBase}/tx/${hash}` });
                        }}
                        _hover={{ bg: "bg.muted", color: "text.primary" }}
                      />
                    )}
                  </HStack>
                  {sellSymbol && (
                    <VStack spacing={1.5} align="stretch" fontSize="xs">
                      <HStack justify="space-between" align="flex-start">
                        <Text fontWeight="700" color="text.secondary">
                          You Sent
                        </Text>
                        <VStack spacing={0} align="flex-end">
                          <HStack spacing={1.5}>
                            {sellAmount && (
                              <Text
                                fontWeight="800"
                                color="chart.negative"
                                fontFamily="mono"
                              >
                                −{sellAmount.amountLabel}
                              </Text>
                            )}
                            {sellLogo && (
                              <Image
                                src={sellLogo}
                                alt={sellSymbol}
                                boxSize="16px"
                                borderRadius="full"
                              />
                            )}
                            <Text fontWeight="800">{sellSymbol}</Text>
                          </HStack>
                          {sellAmount &&
                            (() => {
                              const usd = formatTokenAmountUsd(
                                sellAmount.amountWei,
                                sellAmount.decimals,
                                tx.chainId,
                                sellAmount.source,
                              );
                              return usd ? (
                                <Text fontSize="2xs" color="text.tertiary" fontWeight="600">
                                  {usd}
                                </Text>
                              ) : null;
                            })()}
                        </VStack>
                      </HStack>
                    </VStack>
                  )}
                </Box>
              );
            })()}

            {tx.bridge && (() => {
              const statusLabels = [
                "Pending",
                "Assigned",
                "Extracted",
                "Fulfilled",
                "Settled",
                "Expired",
                "Cancelled",
                "Refunded",
              ] as const;
              const statusCode = tx.bridge.bungeeStatusCode;
              const statusLabel =
                statusCode !== undefined
                  ? statusLabels[statusCode] ?? `Code ${statusCode}`
                  : null;
              // Color-code: green for settled-good (3/4), red for bad terminal
              // (5/6/7), accent (in-flight blue) for everything else.
              const statusTone: "good" | "bad" | "pending" =
                statusCode === 3 || statusCode === 4
                  ? "good"
                  : statusCode === 5 || statusCode === 6 || statusCode === 7
                    ? "bad"
                    : "pending";
              const statusBg =
                statusTone === "good"
                  ? "status.success.bg"
                  : statusTone === "bad"
                    ? "status.error.bg"
                    : "status.info.bg";
              const statusFg =
                statusTone === "good"
                  ? "status.success.fg"
                  : statusTone === "bad"
                    ? "status.error.fg"
                    : "status.info.fg";
              const destChain =
                getResolvedChainById(tx.bridge.destinationChainId, networksInfo);
              const destExplorer =
                destChain?.explorer ||
                getChainConfig(tx.bridge.destinationChainId).explorer;
              const destLink =
                tx.bridge.destinationTxHash && destExplorer
                  ? `${destExplorer}/tx/${tx.bridge.destinationTxHash}`
                  : null;
              const buyLogo = resolveLogo(tx.swapMeta?.buyTokenLogo);
              const buySymbol = tx.swapMeta?.buyTokenSymbol;
              return (
                <Box
                  bg="surface.sunken"
                  border="2px solid"
                  borderColor="border.default"
                  borderRadius="lg"
                  p={2.5}
                >
                  {/* Header: chain logo + destination chain name + status pill */}
                  <HStack justify="space-between" align="center" mb={2.5}>
                    <HStack spacing={2} flexShrink={0}>
                      <ChainIcon
                        chainId={tx.bridge.destinationChainId}
                        chainName={tx.bridge.destinationChainName}
                        size="16px"
                        withChip
                      />
                      <VStack spacing={0} align="flex-start">
                        <Text
                          fontSize="2xs"
                          fontWeight="800"
                          textTransform="uppercase"
                          color="text.tertiary"
                          letterSpacing="wide"
                          lineHeight="1"
                        >
                          Destination
                        </Text>
                        <Text
                          fontSize="sm"
                          fontWeight="800"
                          color="text.primary"
                          lineHeight="1.2"
                        >
                          {tx.bridge.destinationChainName}
                        </Text>
                      </VStack>
                    </HStack>
                    <HStack spacing={1.5} flexShrink={0}>
                      {statusLabel && (
                        <Box
                          bg={statusBg}
                          color={statusFg}
                          px={2}
                          py={0.5}
                          borderRadius="md"
                          fontSize="2xs"
                          fontWeight="800"
                          textTransform="uppercase"
                          letterSpacing="wide"
                        >
                          {statusLabel}
                        </Box>
                      )}
                      {destLink ? (
                        <IconButton
                          aria-label="View destination tx on explorer"
                          icon={<ExternalLinkIcon boxSize={3} />}
                          size="xs"
                          variant="ghost"
                          h="20px"
                          minW="20px"
                          color="text.tertiary"
                          onClick={(e) => {
                            e.stopPropagation();
                            chrome.tabs.create({ url: destLink });
                          }}
                          _hover={{ bg: "bg.muted", color: "text.primary" }}
                        />
                      ) : (
                        // Still waiting on Bungee — show a spinner so the
                        // user knows the dest hash is in-flight.
                        !tx.bridge.destinationTxHash && <LoadingDots />
                      )}
                    </HStack>
                  </HStack>

                  <VStack spacing={1.5} align="stretch" fontSize="xs">
                    {/* You received — token logo + symbol + on-chain amount
                        once destAssetChanges lands. The dest-chain receiver
                        didn't pay gas, so abs(nativeDelta) is a clean fallback
                        when the buy token is the destination chain's native. */}
                    {buySymbol && (() => {
                      const destNativeSym =
                        destChain?.nativeCurrency.symbol ??
                        getChainConfig(tx.bridge!.destinationChainId)
                          .nativeCurrency?.symbol ??
                        "ETH";
                      const buyAmount = pickAssetChangeAmount(
                        destinationAssetChanges,
                        "in",
                        buySymbol,
                        buySymbol.toLowerCase() === destNativeSym.toLowerCase(),
                        18,
                      );
                      return (
                        <HStack justify="space-between" align="flex-start">
                          <Text fontWeight="700" color="text.secondary">
                            You Received
                          </Text>
                          <VStack spacing={0} align="flex-end">
                            <HStack spacing={1.5}>
                              {buyAmount && (
                                <Text
                                  fontWeight="800"
                                  color="chart.positive"
                                  fontFamily="mono"
                                >
                                  +{buyAmount.amountLabel}
                                </Text>
                              )}
                              {buyLogo && (
                                <Image
                                  src={buyLogo}
                                  alt={buySymbol}
                                  boxSize="16px"
                                  borderRadius="full"
                                />
                              )}
                              <Text fontWeight="800">{buySymbol}</Text>
                            </HStack>
                            {buyAmount &&
                              (() => {
                                const usd = formatTokenAmountUsd(
                                  buyAmount.amountWei,
                                  buyAmount.decimals,
                                  tx.bridge!.destinationChainId,
                                  buyAmount.source,
                                );
                                return usd ? (
                                  <Text fontSize="2xs" color="text.tertiary" fontWeight="600">
                                    {usd}
                                  </Text>
                                ) : null;
                              })()}
                          </VStack>
                        </HStack>
                      );
                    })()}
                    {tx.bridge.refundTxHash && (
                      <HStack justify="space-between">
                        <Text fontWeight="700" color="text.secondary">Refund</Text>
                        <Text fontFamily="mono" fontSize="2xs" color="chart.negative">
                          {`${tx.bridge.refundTxHash.slice(0, 8)}…${tx.bridge.refundTxHash.slice(-4)}`}
                        </Text>
                      </HStack>
                    )}
                  </VStack>
                </Box>
              );
            })()}

            {/* Post-confirm asset changes — what *actually* flowed in/out of
                the user's wallet on chain (decoded from the receipt's
                Transfer logs + native balance diff). For wallet-initiated
                bridges (`swapMeta + bridge`) the sell/buy rows are already
                shown inline in the Source / Destination blocks above, so we
                suppress these cards to avoid duplication. */}
            {sourceAssetChanges && !(tx.bridge && tx.swapMeta) && (
              <AssetChangesCard
                record={sourceAssetChanges}
                chainId={tx.chainId}
                nativeSym={nativeSym}
                label="Token Changes"
                formatUsd={formatTokenAmountUsd}
              />
            )}
            {destinationAssetChanges && tx.bridge && !tx.swapMeta && (
              <AssetChangesCard
                record={destinationAssetChanges}
                chainId={tx.bridge.destinationChainId}
                nativeSym={
                  getChainConfig(tx.bridge.destinationChainId).nativeCurrency
                    ?.symbol ?? "ETH"
                }
                label={`On ${tx.bridge.destinationChainName}`}
                formatUsd={formatTokenAmountUsd}
              />
            )}

            <HStack justify="space-between" align="center" spacing={3}>
              {tx.forceInclusionMeta ? (
                <HStack spacing={2}>
                  {/* L1 explorer link */}
                  {tx.forceInclusionMeta.l1TxHash && (
                    <Button
                      size="xs"
                      variant="ghost"
                      fontWeight="700"
                      fontSize="2xs"
                      textTransform="uppercase"
                      letterSpacing="wide"
                      border="2px solid"
                      borderColor="border.default"
                      px={2}
                      h="22px"
                      onClick={() => {
                        const l1Explorer = getChainConfig(tx.forceInclusionMeta!.l1ChainId).explorer;
                        if (l1Explorer) chrome.tabs.create({ url: `${l1Explorer}/tx/${tx.forceInclusionMeta!.l1TxHash}` });
                      }}
                      rightIcon={<ExternalLinkIcon boxSize={2.5} />}
                      _hover={{ bg: "bg.muted" }}
                    >
                      L1 Tx
                    </Button>
                  )}
                  {/* L2 explorer link — show whenever we have a distinct L2 hash
                       AND the L2 tx has resolved (success or failed/reverted).
                       During the L1-Confirmed/L2-Pending window (status === "pending")
                       the L2 explorer doesn't have the tx yet, so we still hide it.
                       Also hidden when txHash falls back to the L1 hash
                       (extractL2Hash failed — no real L2 hash to link). */}
                  {(tx.status === "success" || tx.status === "failed") && tx.txHash && tx.txHash !== tx.forceInclusionMeta.l1TxHash && explorerBase && (
                    <Button
                      size="xs"
                      variant="ghost"
                      fontWeight="700"
                      fontSize="2xs"
                      textTransform="uppercase"
                      letterSpacing="wide"
                      border="2px solid"
                      borderColor="border.default"
                      px={2}
                      h="22px"
                      onClick={handleViewOnExplorer}
                      rightIcon={<ExternalLinkIcon boxSize={2.5} />}
                      _hover={{ bg: "bg.muted" }}
                    >
                      L2 Tx
                    </Button>
                  )}
                </HStack>
              ) : tx.txHash && explorerBase ? (
                <Button
                  size="xs"
                  variant="ghost"
                  fontWeight="700"
                  fontSize="2xs"
                  textTransform="uppercase"
                  letterSpacing="wide"
                  border="2px solid"
                  borderColor="border.default"
                  px={2}
                  h="22px"
                  onClick={handleViewOnExplorer}
                  rightIcon={<ExternalLinkIcon boxSize={2.5} />}
                  _hover={{ bg: "bg.muted" }}
                >
                  View on Explorer
                </Button>
              ) : (
                <Box />
              )}
              <Text fontSize="2xs" fontWeight="600" color="text.tertiary" textAlign="right">
                {formatLocalTimestamp(displayTimestamp)}
              </Text>
            </HStack>

            {/* Per-call hero for atomic batches. Decoded from the ERC-7821
                self-call calldata on open (no storage cost). Reuses the same
                CallCard + clear-signing pipeline the tx-confirmation surface
                uses, so transfers / approves / Permit2 / etc. read as human
                actions instead of a blob. The raw FROM=EOA / TO=EOA / opaque
                calldata stays available inside the collapsed "Transaction
                Details" section below for power-users. */}
            {hasBatchCalls && (
              <VStack spacing={2} align="stretch">
                <HStack spacing={2}>
                  <Text
                    fontSize="xs"
                    color="text.secondary"
                    fontWeight="700"
                    textTransform="uppercase"
                    letterSpacing="wide"
                  >
                    Calls
                  </Text>
                  <Badge
                    bg="accent.secondary"
                    color="accentFg.secondary"
                    fontSize="2xs"
                    fontWeight="800"
                    px={1.5}
                    py={0}
                    border="1px solid"
                    borderColor="border.default"
                  >
                    {batchCalls!.length}
                  </Badge>
                </HStack>
                <BatchCallsList
                  calls={batchCalls!}
                  chainId={tx.chainId}
                  origin={tx.origin}
                  favicon={tx.favicon}
                  originPerCall={tx.batchCallOrigins}
                  originCallIndex={
                    tx.bridge ? batchCalls!.length - 1 : undefined
                  }
                />
              </VStack>
            )}

            {/* EIP-7702 delegation hero — Set / Revoke txs whose actual
                effect lives in the authorization tuple, not the calldata.
                The raw FROM/TO view shows EOA → EOA so without this card
                the user can't see which contract they delegated to. The
                target address gets the standard copy + explorer pattern. */}
            {hasDelegation && delegationMeta && (() => {
              const isRevoke = delegationMeta.kind === "revoke";
              const target = delegationMeta.targetDelegate;
              const explorer = explorerBase;
              // Prefer the eth.sh label when it resolves; fall back to the
              // built-in "MetaMask DeleGator" tag so the WalletChan default
              // still paints something instantly on first open before the
              // cache warms.
              const ethShLabel = !isRevoke ? delegateLabels[0] ?? null : null;
              const knownName = isRevoke ? null : getKnownDelegateName(target);
              const badgeLabel = ethShLabel ?? knownName;
              const hasDefaultDelegate = hasDefaultDelegateForChain(tx.chainId);
              const isDefault =
                !isRevoke &&
                target.toLowerCase() ===
                  EIP_7702_DEFAULT_DELEGATE.toLowerCase();
              return (
                <Box
                  bg="surface.sunken"
                  border="2px solid"
                  borderColor="border.default"
                  borderRadius="lg"
                  p={2.5}
                >
                  <VStack align="stretch" spacing={2}>
                    <Text
                      fontSize="2xs"
                      fontWeight="800"
                      textTransform="uppercase"
                      color="text.tertiary"
                      letterSpacing="wide"
                    >
                      Smart Account
                    </Text>
                    <Text
                      fontSize="sm"
                      fontWeight="800"
                      color="text.primary"
                      lineHeight="short"
                    >
                      {isRevoke
                        ? "Removed onchain delegation"
                        : isDefault
                          ? "Delegated to WalletChan default"
                          : "Delegated to custom contract"}
                    </Text>
                    {!isRevoke && (
                      <Box>
                        <HStack justify="space-between" align="center" mb={1}>
                          <Text
                            fontSize="2xs"
                            color="text.tertiary"
                            fontWeight="700"
                            textTransform="uppercase"
                          >
                            Delegate
                          </Text>
                          {badgeLabel && (
                            <Badge
                              bg="accent.secondary"
                              color="accentFg.secondary"
                              fontSize="2xs"
                              fontWeight="800"
                              px={1.5}
                              py={0}
                              border="1px solid"
                              borderColor="border.default"
                              maxW="60%"
                              overflow="hidden"
                              textOverflow="ellipsis"
                              whiteSpace="nowrap"
                            >
                              {badgeLabel}
                            </Badge>
                          )}
                        </HStack>
                        <HStack
                          spacing={1}
                          px={1.5}
                          py={1}
                          bg="surface.raised"
                          border="1.5px solid"
                          borderColor="border.subtle"
                          borderRadius="md"
                          align="center"
                        >
                          <Text
                            fontSize="xs"
                            fontFamily="mono"
                            fontWeight="700"
                            color="text.primary"
                            isTruncated
                            flex="1"
                            minW={0}
                          >
                            {target.slice(0, 10)}…{target.slice(-8)}
                          </Text>
                          <CopyButton value={target} />
                          {explorer && (
                            <IconButton
                              aria-label="View delegate on explorer"
                              icon={<ExternalLinkIcon boxSize="10px" />}
                              size="xs"
                              variant="ghost"
                              minW="18px"
                              h="18px"
                              color="text.tertiary"
                              onClick={() =>
                                chrome.tabs.create({
                                  url: `${explorer}/address/${target}`,
                                })
                              }
                              _hover={{
                                color: "accent.secondary",
                                bg: "bg.muted",
                              }}
                            />
                          )}
                        </HStack>
                      </Box>
                    )}
                    <Text
                      fontSize="2xs"
                      color="text.tertiary"
                      lineHeight="short"
                    >
                      {isRevoke
                        ? `Account is no longer a smart account on this chain.${
                            hasDefaultDelegate
                              ? " Future batches fall back to WalletChan default delegation if present."
                              : ""
                          }`
                        : "Future multi-call batches on this chain execute atomically via this contract."}
                    </Text>
                  </VStack>
                </Box>
              );
            })()}

            {/* Human-readable clear-signed hero. Snapshot-driven, so it
                paints synchronously on every reopen — no RPC / eth.sh / ENS
                calls. Hidden when no snapshot was captured (older entries,
                contract deploys, opaque calldata).

                For erc7730 kinds the snapshot only stores intent +
                contractName + counterparty (no parameter values), so we
                render the full ClearSigningView instead — same component the
                tx-confirmation surface uses. It re-decodes the calldata
                against the descriptor to produce per-field rows (e.g.
                "Amount to supply: 2 USDC", "Collateral recipient: …"). */}
            {tx.clearSignedMeta && tx.clearSignedMeta.kind === "erc7730" && tx.tx.to && tx.tx.data ? (
              <ClearSigningView
                kind="calldata"
                chainId={tx.chainId}
                from={tx.tx.from}
                to={tx.tx.to}
                calldata={tx.tx.data}
                value={tx.tx.value}
              />
            ) : tx.clearSignedMeta ? (
              <ClearSignedSummaryCard meta={tx.clearSignedMeta} chainId={tx.chainId} />
            ) : null}

            {/* Toggle for the raw tx details. Default collapsed when the
                hero card is showing (the hero already answers "what did this
                do?"); default expanded for everything else so non-clear-
                signed txs render the same shape they did before. */}
            <HStack
              cursor="pointer"
              onClick={() => setRawDetailsExpanded(!rawDetailsExpanded)}
              _hover={{ bg: "bg.muted" }}
              borderRadius="md"
              px={1}
              py={1}
              justify="space-between"
            >
              <Text fontSize="xs" color="text.secondary" fontWeight="700" textTransform="uppercase">
                Transaction Details
              </Text>
              {rawDetailsExpanded
                ? <ChevronUpIcon boxSize={4} color="text.tertiary" />
                : <ChevronDownIcon boxSize={4} color="text.tertiary" />
              }
            </HStack>

            <Collapse in={rawDetailsExpanded} animateOpacity>
              <VStack spacing={3} align="stretch">
            {/* Function name */}
            {tx.functionName && (
              <Box>
                <Text fontSize="xs" color="text.secondary" fontWeight="700" textTransform="uppercase" mb={1}>
                  Function
                </Text>
                <Code
                  px={2}
                  py={1}
                  fontSize="xs"
                  bg="accent.secondary"
                  color="accentFg.secondary"
                  fontFamily="mono"
                  border="2px solid"
                  borderColor="border.default"
                  fontWeight="700"
                >
                  {tx.functionName}
                </Code>
              </Box>
            )}

            {/* Transfer meta (sponsored transfers) */}
            {tx.transferMeta ? (
              <Box
                bg="surface.sunken"
                border="1px solid"
                borderColor="border.subtle"
                borderRadius="md"
                p={3}
              >
                <VStack align="stretch" spacing={3}>
                  {/* Amount + Token */}
                  <Box>
                    <Text fontSize="xs" color="text.secondary" fontWeight="700" textTransform="uppercase" mb={1}>
                      Amount
                    </Text>
                    <HStack spacing={2}>
                      {tx.transferMeta.tokenLogo && (
                        <Image
                          src={resolveLogo(tx.transferMeta.tokenLogo)}
                          alt={tx.transferMeta.symbol}
                          boxSize="20px"
                          borderRadius="full"
                        />
                      )}
                      <Text fontSize="sm" fontWeight="800" color="text.primary">
                        {tx.transferMeta.amount} {tx.transferMeta.symbol}
                      </Text>
                    </HStack>
                  </Box>

                  {/* From */}
                  <Box>
                    <Text fontSize="xs" color="text.secondary" fontWeight="700" textTransform="uppercase" mb={1}>
                      From
                    </Text>
                    <FromAccountDisplay address={tx.tx.from} />
                  </Box>

                  {/* To (actual recipient) */}
                  <Box>
                    <Text fontSize="xs" color="text.secondary" fontWeight="700" textTransform="uppercase" mb={1}>
                      To
                    </Text>
                    <AddressParam value={tx.transferMeta.recipient} chainId={tx.chainId} />
                  </Box>
                </VStack>
              </Box>
            ) : (
              <>
                {/* From → To card — recessed surface + border gives visual
                    separation from the modal's raised backdrop so each
                    section reads as its own tile. */}
                <Box
                  bg="surface.sunken"
                  border="1px solid"
                  borderColor="border.subtle"
                  borderRadius="md"
                  p={3}
                >
                  <HStack spacing={2} align="start">
                    {/* From (our wallet) */}
                    <VStack align="start" spacing={0} flex={1} minW={0}>
                      <Text fontSize="xs" color="text.secondary" fontWeight="700" textTransform="uppercase" mb={1}>
                        From
                      </Text>
                      <FromAccountDisplay address={tx.tx.from} />
                    </VStack>

                    {/* Arrow */}
                    <Text fontSize="md" fontWeight="800" color="text.tertiary" pt={5}>
                      →
                    </Text>

                    {/* To */}
                    <VStack align="start" spacing={0} flex={1} minW={0}>
                      <Text fontSize="xs" color="text.secondary" fontWeight="700" textTransform="uppercase" mb={1}>
                        {isContractDeploy ? "Type" : "To"}
                      </Text>
                      {isContractDeploy ? (
                        <Badge
                          fontSize="2xs"
                          bg="accent.highlight"
                          color="accentFg.highlight"
                          border="2px solid"
                          borderColor="border.default"
                          fontWeight="700"
                          px={1.5}
                          py={0.5}
                        >
                          Contract Deploy
                        </Badge>
                      ) : (
                        <AddressParam value={tx.tx.to!} chainId={tx.chainId} />
                      )}
                    </VStack>
                  </HStack>
                </Box>

                {/* Value card — single-line layout: label on the left, amount
                    + optional USD on the right so the card stays compact. */}
                <Box
                  bg="surface.sunken"
                  border="1px solid"
                  borderColor="border.subtle"
                  borderRadius="md"
                  px={3}
                  py={2}
                >
                  <HStack justify="space-between" align="center" spacing={2}>
                    <Text
                      fontSize="xs"
                      color="text.secondary"
                      fontWeight="700"
                      textTransform="uppercase"
                    >
                      Value
                    </Text>
                    <HStack spacing={2} align="baseline">
                      <Text fontSize="sm" fontWeight="700" color="text.primary">
                        {formatValue(tx.tx.value, nativeSym)}
                      </Text>
                      {(() => {
                        const usd = formatWeiUsd(tx.tx.value);
                        return usd ? (
                          <Text fontSize="xs" color="text.tertiary" fontWeight="600">
                            {usd}
                          </Text>
                        ) : null;
                      })()}
                    </HStack>
                  </HStack>
                </Box>
              </>
            )}

            {/* Calldata. Lives inside the collapse alongside From/To/Value
                since it answers the same "what is the raw payload?" question.
                The hero card above already provides the human-readable view
                for clear-signed txs. */}
            {hasCalldata && !isContractDeploy && tx.tx.to && (
              <Box>
                <Text fontSize="xs" color="text.secondary" fontWeight="700" textTransform="uppercase" mb={1}>
                  Calldata
                </Text>
                <CalldataDecoder calldata={tx.tx.data!} to={tx.tx.to} chainId={tx.chainId} />
              </Box>
            )}

            {/* Deploy data for contract deployments */}
            {hasCalldata && isContractDeploy && (
              <Box>
                <HStack mb={1}>
                  <Text fontSize="xs" color="text.secondary" fontWeight="700" textTransform="uppercase">
                    Deploy Data
                  </Text>
                  <Spacer />
                  <CopyButton value={tx.tx.data!} />
                </HStack>
                <Box
                  p={3}
                  bg="bg.muted"
                  border="2px solid"
                  borderColor="border.default"
                  maxH="100px"
                  overflowY="auto"
                  css={{
                    "&::-webkit-scrollbar": { width: "6px" },
                    "&::-webkit-scrollbar-track": {
                      background: "var(--chakra-colors-bg-muted)",
                    },
                    "&::-webkit-scrollbar-thumb": {
                      background: "var(--chakra-colors-border-strong)",
                    },
                  }}
                >
                  <Text fontSize="xs" fontFamily="mono" color="text.tertiary" wordBreak="break-all" whiteSpace="pre-wrap">
                    {tx.tx.data}
                  </Text>
                </Box>
              </Box>
            )}
              </VStack>
            </Collapse>

            {/* Gas — collapsible. Shows the receipt-side effective fee once
                gasData lands, and falls back to the gas params we signed
                with (gas limit, max fee, priority fee) so pending txs aren't
                blank. */}
            {(() => {
              const showConfirmedFee = !!(gasData && txFee);
              const showSetParams = !showConfirmedFee && hasSetGasParams;
              if (!showConfirmedFee && !showSetParams) return null;

              const headerLabel = showConfirmedFee ? "Transaction Fee" : "Estimated Max Fee";
              const headerCost = showConfirmedFee
                ? formatEth(txFee!, nativeSym)
                : estimatedMaxCost
                  ? formatEth(estimatedMaxCost, nativeSym)
                  : null;
              const headerCostUsd = formatWeiUsd(
                showConfirmedFee ? txFee : estimatedMaxCost,
              );

              return (
                <Box
                  bg="surface.sunken"
                  border="1px solid"
                  borderColor="border.subtle"
                  borderRadius="md"
                >
                  <HStack
                    px={3}
                    py={2}
                    cursor="pointer"
                    onClick={() => setGasExpanded(!gasExpanded)}
                    _hover={{ bg: "bg.muted" }}
                    justify="space-between"
                  >
                    <HStack spacing={2}>
                      <Text fontSize="xs" color="text.secondary" fontWeight="700" textTransform="uppercase">
                        {headerLabel}
                      </Text>
                    </HStack>
                    <HStack spacing={2}>
                      {headerCost && (
                        <Text fontSize="xs" fontWeight="700" color="text.primary" fontFamily="mono">
                          {headerCost}
                        </Text>
                      )}
                      {headerCostUsd && (
                        <Text fontSize="xs" fontWeight="600" color="text.tertiary">
                          {headerCostUsd}
                        </Text>
                      )}
                      {gasExpanded
                        ? <ChevronUpIcon boxSize={4} color="text.tertiary" />
                        : <ChevronDownIcon boxSize={4} color="text.tertiary" />
                      }
                    </HStack>
                  </HStack>

                  <Collapse in={gasExpanded} animateOpacity>
                    <VStack align="stretch" spacing={1.5} px={3} pb={3} pt={1}>
                      <Box h="1px" bg="border.subtle" />

                      {showConfirmedFee ? (
                        <>
                          <GasRow
                            label="Gas Price"
                            value={formatGwei(gasData!.effectiveGasPrice)}
                          />

                          <GasRow
                            label="Gas Limit & Usage"
                            value={`${formatNumber(gasData!.gasLimit)} | ${formatNumber(gasData!.gasUsed)} (${gasUsagePercent}%)`}
                          />

                          {isL2 && (
                            <>
                              <Box h="1px" bg="border.subtle" mt={0.5} mb={0.5} />
                              <GasRow
                                label="L2 Fees Paid"
                                value={formatEth((BigInt(gasData!.gasUsed) * BigInt(gasData!.effectiveGasPrice)).toString(), nativeSym)}
                              />
                              {gasData!.l1Fee && (
                                <GasRow label="L1 Fees Paid" value={formatEth(gasData!.l1Fee, nativeSym)} />
                              )}
                              {gasData!.l1GasPrice && (
                                <GasRow label="L1 Gas Price" value={formatGwei(gasData!.l1GasPrice)} />
                              )}
                              {gasData!.l1GasUsed && (
                                <GasRow label="L1 Gas Used" value={formatNumber(gasData!.l1GasUsed)} />
                              )}
                            </>
                          )}
                        </>
                      ) : (
                        <>
                          {setGas && (
                            <GasRow
                              label="Gas Limit"
                              value={formatNumber(BigInt(setGas).toString())}
                            />
                          )}
                          {setMaxFee && (
                            <GasRow label="Max Fee" value={formatGwei(setMaxFee)} />
                          )}
                          {setPriority && (
                            <GasRow
                              label="Max Priority Fee"
                              value={formatGwei(setPriority)}
                            />
                          )}
                          {setGasPrice && !setMaxFee && (
                            <GasRow label="Gas Price" value={formatGwei(setGasPrice)} />
                          )}
                        </>
                      )}
                    </VStack>
                  </Collapse>
                </Box>
              );
            })()}

            {/* Error for failed txs. viem errors (e.g. HttpRequestError) render
                as "shortMessage\n\nStatus: …\nURL: …\nRequest body: {giant
                hex…}" — when that lands here verbatim it pushes the modal
                into a wall of unreadable hex. We split on the first newline:
                the line above it is the human-readable summary (viem's
                shortMessage), everything below goes behind a "Show details"
                collapse. Single-line errors render inline as before. */}
            {tx.status === "failed" && tx.error && (() => {
              const errorText = tx.error;
              const newlineIdx = errorText.indexOf("\n");
              const hasDetail = newlineIdx !== -1;
              const errorShort = hasDetail
                ? errorText.slice(0, newlineIdx).trim()
                : errorText;
              const errorDetail = hasDetail
                ? errorText.slice(newlineIdx + 1).trim()
                : "";

              return (
                <Box
                  p={3}
                  bg="status.error.bg"
                  border="2px solid"
                  borderColor="border.default"
                  borderRadius="md"
                >
                  <Text fontSize="xs" color="status.error.fg" fontWeight="700" mb={0.5} textTransform="uppercase">
                    Error
                  </Text>
                  <Text fontSize="xs" color="status.error.fg" fontWeight="500">
                    {errorShort}
                  </Text>

                  {hasDetail && (
                    <>
                      <HStack
                        mt={2}
                        spacing={1}
                        cursor="pointer"
                        onClick={() => setErrorExpanded(!errorExpanded)}
                        w="fit-content"
                        _hover={{ opacity: 0.8 }}
                      >
                        <Text
                          fontSize="2xs"
                          color="status.error.fg"
                          fontWeight="700"
                          textTransform="uppercase"
                          letterSpacing="wider"
                        >
                          {errorExpanded ? "Hide details" : "Show details"}
                        </Text>
                        {errorExpanded
                          ? <ChevronUpIcon boxSize={3} color="status.error.fg" />
                          : <ChevronDownIcon boxSize={3} color="status.error.fg" />
                        }
                      </HStack>
                      <Collapse in={errorExpanded} animateOpacity>
                        <Box
                          mt={2}
                          bg="bg.muted"
                          border="1px solid"
                          borderColor="border.subtle"
                          borderRadius="md"
                          overflow="hidden"
                        >
                          {/* Header strip — "FULL ERROR" label on the left,
                              copy button on the right. Sits OUTSIDE the
                              scrollable area so it stays visible while
                              scrolling through long viem payloads. */}
                          <HStack
                            justify="space-between"
                            align="center"
                            px={2}
                            py={1.5}
                            borderBottom="1px solid"
                            borderColor="border.subtle"
                            bg="surface.sunken"
                          >
                            <Text
                              fontSize="2xs"
                              fontWeight="700"
                              color="text.secondary"
                              textTransform="uppercase"
                              letterSpacing="wider"
                            >
                              Full Error
                            </Text>
                            <CopyButton value={errorText} />
                          </HStack>
                          <Box
                            maxH="200px"
                            overflowY="auto"
                            px={2.5}
                            py={2}
                            css={{
                              "&::-webkit-scrollbar": { width: "6px" },
                              "&::-webkit-scrollbar-track": {
                                background: "var(--chakra-colors-bg-muted)",
                              },
                              "&::-webkit-scrollbar-thumb": {
                                background: "var(--chakra-colors-border-strong)",
                              },
                            }}
                          >
                            <Text
                              fontSize="xs"
                              fontFamily="mono"
                              color="text.secondary"
                              lineHeight="1.55"
                              wordBreak="break-all"
                              whiteSpace="pre-wrap"
                            >
                              {errorDetail}
                            </Text>
                          </Box>
                        </Box>
                      </Collapse>
                    </>
                  )}

                  {canRebroadcast && (
                    <Button
                      size="xs"
                      leftIcon={<RepeatIcon />}
                      onClick={handleRebroadcast}
                      isLoading={isRebroadcasting}
                      mt={2}
                      bg={rebroadcastBg}
                      color={rebroadcastFg}
                      borderColor={rebroadcastBg}
                      _hover={{ bg: rebroadcastBg, opacity: 0.85 }}
                      _active={{ bg: rebroadcastBg, opacity: 0.75 }}
                    >
                      Rebroadcast
                    </Button>
                  )}
                </Box>
              );
            })()}

          </VStack>
        </ModalBody>

        <ModalFooter borderTop="3px solid" borderColor="border.default" pt={3} pb={4}>
          <Button variant="secondary" size="sm" onClick={onClose} w="full">
            Close
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

export default memo(TxDetailModal);
