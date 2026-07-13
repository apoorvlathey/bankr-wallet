import { useState } from "react";
import {
  Box,
  Button,
  Collapse,
  HStack,
  Text,
  VStack,
} from "@chakra-ui/react";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  ExternalLinkIcon,
} from "@chakra-ui/icons";
import type {
  AssetChangeRecord,
  AssetTransferRecord,
} from "@/chrome/txHistoryStorage";
import { getChainConfig } from "@/constants/chainConfig";
import TokenLogo from "@/components/TokenLogo";
import {
  formatSignedTokenAmount,
  getErc20TransferGroups,
  type Erc20TransferGroup,
  type RenderableErc20Transfer,
} from "./formatting";
import { renderErc20Row } from "./Erc20TransferRow";

/**
 * Renders the "Token Changes" card for one leg of a tx (source-chain by
 * default; bridges also render a second card for the destination leg with
 * `label="On <destChain>"`). Native-row hidden when the extractor couldn't
 * resolve `balance(N-1)`; per-token rows render even without symbol/decimals
 * (the placeholder paints with a short address).
 */
export default function AssetChangesCard({
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
    <HStack justify="space-between" align="flex-start" spacing={2} minW={0}>
      <HStack spacing={2} minW={0} flex="1">
        <TokenLogo
          nativeChainId={chainId}
          symbol={nativeSym}
          alt={nativeSym}
        />
        <Text fontSize="xs" fontWeight="700" color="text.secondary">
          {nativeSym}
        </Text>
      </HStack>
      <VStack spacing={0} align="flex-end" minW={0} maxW="58%">
        <Text
          fontSize="xs"
          fontWeight="800"
          color={nativeData.isNegative ? "chart.negative" : "chart.positive"}
          fontFamily="mono"
          textAlign="right"
          overflowWrap="anywhere"
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
        minW={0}
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
            px={1.5}
            h="24px"
            minH="24px"
            minW={0}
            maxW="52%"
          >
            {isNegative ? "to" : "from"} {cpShort}
          </Button>
        ) : (
          <Text fontSize="2xs" fontFamily="mono" color="text.tertiary">
            {isNegative ? "to" : "from"} {cpShort}
          </Text>
        )}
        <VStack spacing={0} align="flex-end" minW={0} maxW="48%">
          <Text
            fontSize="2xs"
            fontWeight="800"
            color={isNegative ? "chart.negative" : "chart.positive"}
            fontFamily="mono"
            textAlign="right"
            overflowWrap="anywhere"
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
          minH="44px"
          py={1}
        >
          <HStack justify="space-between" align="flex-start" spacing={2}>
            <HStack spacing={2} minW={0} flex="1">
              <TokenLogo
                logoUrl={group.logoUrl}
                symbol={group.symbol}
                alt={sym}
              />
              <VStack spacing={0} align="flex-start" minW={0} flex="1">
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
            <VStack spacing={0} align="flex-end" minW={0} maxW="52%">
              <Text
                fontSize="xs"
                fontWeight="800"
                color={isNegative ? "chart.negative" : "chart.positive"}
                fontFamily="mono"
                textAlign="right"
                overflowWrap="anywhere"
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
      border="1px solid"
      borderColor="border.subtle"
      borderRadius="lg"
      p={3}
    >
      <Text
        fontSize="2xs"
        fontWeight="600"
        color="text.secondary"
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
