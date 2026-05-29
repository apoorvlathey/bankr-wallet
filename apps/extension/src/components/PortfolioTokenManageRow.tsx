import { type KeyboardEvent, type ReactNode } from "react";
import {
  Box,
  Checkbox,
  HStack,
  IconButton,
  Image,
  Text,
  VStack,
} from "@chakra-ui/react";
import { ExternalLinkIcon } from "@chakra-ui/icons";

import ChainIcon from "@/components/ChainIcon";
import { CopyButton } from "@/components/CopyButton";
import { getChainConfig } from "@/constants/chainConfig";
import { getResolvedChainById } from "@/lib/chains";
import type { NetworksInfo } from "@/types";

const ERC20_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export interface ManageablePortfolioToken {
  chainId: number;
  contractAddress: string;
  symbol?: string;
  name?: string;
  logoUrl?: string;
}

interface PortfolioTokenManageRowProps {
  token: ManageablePortfolioToken;
  networksInfo: NetworksInfo;
  logoSrc?: string;
  subtitle?: string;
  valueLabel?: string;
  isSelected?: boolean;
  onToggle?: () => void;
  rightSlot?: ReactNode;
}

export default function PortfolioTokenManageRow({
  token,
  networksInfo,
  logoSrc,
  subtitle,
  valueLabel,
  isSelected = false,
  onToggle,
  rightSlot,
}: PortfolioTokenManageRowProps) {
  const symbol = token.symbol || "TOKEN";
  const resolvedChain = getResolvedChainById(token.chainId, networksInfo);
  const fallbackChain = getChainConfig(token.chainId);
  const chainName =
    resolvedChain?.name ||
    (fallbackChain.name !== "Unknown" ? fallbackChain.name : undefined) ||
    `Chain ${token.chainId}`;
  const explorer = (resolvedChain?.explorer || fallbackChain.explorer || "")
    .replace(/\/+$/, "");
  const canOpenContract =
    ERC20_ADDRESS_REGEX.test(token.contractAddress) &&
    token.contractAddress.toLowerCase() !== ZERO_ADDRESS &&
    !!explorer;
  const canCopyContract =
    ERC20_ADDRESS_REGEX.test(token.contractAddress) &&
    token.contractAddress.toLowerCase() !== ZERO_ADDRESS;
  const isSelectable = !!onToggle;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onToggle) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onToggle();
  };

  return (
    <HStack
      bg="surface.raised"
      border="2px solid"
      borderColor={isSelected ? "accent.secondary" : "border.default"}
      borderRadius="md"
      p={2.5}
      spacing={3}
      cursor={isSelectable ? "pointer" : "default"}
      role={isSelectable ? "button" : undefined}
      tabIndex={isSelectable ? 0 : undefined}
      onClick={onToggle}
      onKeyDown={onKeyDown}
      _hover={isSelectable ? { bg: "surface.raisedHover" } : undefined}
      transition="background 0.15s, border-color 0.15s"
    >
      {isSelectable && (
        <Checkbox
          isChecked={isSelected}
          onChange={onToggle}
          pointerEvents="none"
          flexShrink={0}
        />
      )}

      <Box position="relative" flexShrink={0}>
        <Box
          bg="bg.muted"
          borderRadius="full"
          w="32px"
          h="32px"
          display="flex"
          alignItems="center"
          justifyContent="center"
          overflow="hidden"
        >
          {logoSrc ? (
            <Image
              src={logoSrc}
              alt={symbol}
              boxSize="32px"
              borderRadius="full"
              fallback={
                <Text fontSize="9px" fontWeight="800" color="text.secondary">
                  {symbol.slice(0, 3).toUpperCase()}
                </Text>
              }
            />
          ) : (
            <Text fontSize="9px" fontWeight="800" color="text.secondary">
              {symbol.slice(0, 3).toUpperCase()}
            </Text>
          )}
        </Box>
        <Box
          position="absolute"
          bottom="-2px"
          right="-4px"
          border="1.5px solid"
          borderColor="surface.base"
          borderRadius="full"
          bg="surface.base"
          overflow="hidden"
          boxSize="14px"
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          <ChainIcon
            chainId={token.chainId}
            chainName={chainName}
            size="14px"
            withChip
          />
        </Box>
      </Box>

      <VStack align="start" spacing={0} flex={1} minW={0}>
        <HStack spacing={1.5} minW={0}>
          <Text
            fontSize="sm"
            fontWeight="800"
            color="text.primary"
            noOfLines={1}
            textTransform="uppercase"
          >
            {symbol}
          </Text>
          {(canCopyContract || canOpenContract) && (
            <HStack
              spacing={0}
              onClick={(event) => event.stopPropagation()}
              onMouseDown={(event) => event.stopPropagation()}
              flexShrink={0}
            >
              {canCopyContract && <CopyButton value={token.contractAddress} />}
              {canOpenContract && (
                <IconButton
                  aria-label="View token contract"
                  icon={<ExternalLinkIcon />}
                  size="xs"
                  variant="ghost"
                  color="text.secondary"
                  onClick={() => {
                    chrome.tabs.create({
                      url: `${explorer}/address/${token.contractAddress}`,
                    });
                  }}
                  _hover={{ color: "accent.secondary", bg: "bg.muted" }}
                />
              )}
            </HStack>
          )}
        </HStack>
        <Text fontSize="11px" color="text.tertiary" fontWeight="600" noOfLines={1}>
          {subtitle || token.name || chainName}
        </Text>
      </VStack>

      {valueLabel && (
        <Text fontSize="xs" fontWeight="800" color="text.primary" flexShrink={0}>
          {valueLabel}
        </Text>
      )}

      {rightSlot && (
        <Box
          flexShrink={0}
          onClick={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
        >
          {rightSlot}
        </Box>
      )}
    </HStack>
  );
}
