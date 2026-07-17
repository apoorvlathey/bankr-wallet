import { useState } from "react";
import { Box, Button, Collapse, HStack, Text, VStack } from "@chakra-ui/react";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  ExternalLinkIcon,
} from "@chakra-ui/icons";
import type { AssetTransferRecord } from "@/chrome/txHistoryStorage";
import { appendTokenSymbol } from "@/lib/tokenAmountFormat";
import type {
  Erc20TransferGroup,
  RenderableErc20Transfer,
} from "./formatting";
import Erc20TransferRow, { Erc20TokenIdentity } from "./Erc20TransferRow";

type FormatUsd = (
  amountWei: string,
  decimals: number,
  chainId: number,
  addressOrNative: string | "native",
) => string | null;

function BreakdownRow({
  item,
  group,
  chainId,
  explorer,
  formatUsd,
}: {
  item: RenderableErc20Transfer;
  group: Erc20TransferGroup;
  chainId: number;
  explorer?: string;
  formatUsd: FormatUsd;
}) {
  const isNegative = group.direction === "out";
  const short = `${item.t.counterparty.slice(0, 6)}…${item.t.counterparty.slice(-4)}`;
  const link = explorer ? `${explorer}/address/${item.t.counterparty}` : null;
  const usd = formatUsd(item.t.amountWei, group.decimals, chainId, group.token);
  return (
    <HStack justify="space-between" spacing={3} minW={0}>
      {link ? (
        <Button
          size="xs"
          variant="ghost"
          justifyContent="flex-start"
          fontWeight="600"
          fontSize="2xs"
          fontFamily="mono"
          color="text.tertiary"
          onClick={() => chrome.tabs.create({ url: link })}
          rightIcon={<ExternalLinkIcon boxSize={2.5} />}
          _hover={{ bg: "transparent", color: "text.secondary" }}
          px={0}
          h="24px"
          minH="24px"
          minW={0}
          maxW="52%"
        >
          {isNegative ? "to" : "from"} {short}
        </Button>
      ) : (
        <Text fontSize="2xs" fontFamily="mono" color="text.tertiary">
          {isNegative ? "to" : "from"} {short}
        </Text>
      )}
      <VStack spacing={0} align="flex-end" minW={0} maxW="48%">
        <Text
          fontSize="2xs"
          fontWeight="700"
          color={isNegative ? "chart.negative" : "chart.positive"}
          fontFamily="mono"
          textAlign="right"
          overflowWrap="anywhere"
        >
          {appendTokenSymbol(item.formatted, item.t.symbol ?? "")}
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

export default function Erc20TransferGroupRow({
  group,
  chainId,
  explorer,
  formatUsd,
}: {
  group: Erc20TransferGroup;
  chainId: number;
  explorer?: string;
  formatUsd: FormatUsd;
}) {
  const [expanded, setExpanded] = useState(false);
  const counterparties = new Set(
    group.transfers.map(({ t }) => t.counterparty.toLowerCase()),
  );

  if (counterparties.size === 1) {
    const only = group.transfers[0];
    const aggregate: AssetTransferRecord = {
      ...only.t,
      amountWei: group.totalWei,
      symbol: group.symbol ?? only.t.symbol,
      decimals: group.decimals,
      logoUrl: group.logoUrl ?? only.t.logoUrl,
    };
    return (
      <Erc20TransferRow
        transfer={aggregate}
        formatted={group.totalFormatted}
        direction={group.direction}
        chainId={chainId}
        explorer={explorer}
        formatUsd={formatUsd}
      />
    );
  }

  const isNegative = group.direction === "out";
  const count = counterparties.size;
  const subtitle = `${count} ${group.direction === "out" ? "recipient" : "source"}${count === 1 ? "" : "s"}`;
  const totalUsd = formatUsd(group.totalWei, group.decimals, chainId, group.token);

  return (
    <Box py={2}>
      <HStack justify="space-between" align="flex-start" spacing={3} minW={0}>
        <Box minW={0} flex="1">
          <Erc20TokenIdentity
            token={group.token}
            logoUrl={group.logoUrl}
            symbol={group.symbol}
            explorer={explorer}
            meta={
              <Button
                type="button"
                variant="ghost"
                size="xs"
                justifyContent="flex-start"
                px={0}
                h="24px"
                minH="24px"
                color="text.tertiary"
                fontSize="2xs"
                fontWeight="600"
                lineHeight="1.2"
                onClick={() => setExpanded((value) => !value)}
                aria-expanded={expanded}
                _hover={{ bg: "transparent", color: "text.secondary" }}
              >
                <HStack spacing={1}>
                  {expanded ? <ChevronUpIcon boxSize={3} /> : <ChevronDownIcon boxSize={3} />}
                  <Text>{subtitle}</Text>
                </HStack>
              </Button>
            }
          />
        </Box>
        <VStack spacing={0} align="flex-end" minW={0} maxW="52%">
          <Text
            fontSize="sm"
            fontWeight="700"
            color={isNegative ? "chart.negative" : "chart.positive"}
            fontFamily="mono"
            textAlign="right"
            overflowWrap="anywhere"
          >
            {appendTokenSymbol(group.totalFormatted, group.symbol ?? "")}
          </Text>
          {totalUsd && (
            <Text fontSize="2xs" color="text.tertiary" fontWeight="600">
              {totalUsd}
            </Text>
          )}
        </VStack>
      </HStack>
      <Collapse in={expanded} animateOpacity>
        <VStack
          spacing={1}
          align="stretch"
          mt={1.5}
          ml="38px"
          pl={2}
          borderLeft="1px solid"
          borderColor="border.subtle"
        >
          {group.transfers.map((item, index) => (
            <BreakdownRow
              key={`${group.key}-${item.t.counterparty}-${index}`}
              item={item}
              group={group}
              chainId={chainId}
              explorer={explorer}
              formatUsd={formatUsd}
            />
          ))}
        </VStack>
      </Collapse>
    </Box>
  );
}
