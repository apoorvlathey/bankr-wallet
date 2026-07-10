import { type ReactNode } from "react";
import {
  Box,
  Checkbox,
  IconButton,
  Image,
  Text,
} from "@chakra-ui/react";
import { ExternalLinkIcon } from "@chakra-ui/icons";

import ChainIcon from "@/components/ChainIcon";
import { CopyButton } from "@/components/CopyButton";
import {
  ListItem,
  ListItemActions,
  ListItemContent,
  ListItemMedia,
  ListItemMeta,
  ListItemTitle,
} from "@/components/ui";
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
  const isContractAddress =
    ERC20_ADDRESS_REGEX.test(token.contractAddress) &&
    token.contractAddress.toLowerCase() !== ZERO_ADDRESS;
  const canOpenContract = isContractAddress && !!explorer;

  return (
    <ListItem isSelected={isSelected}>
      {onToggle && (
        <Box
          minW="44px"
          minH="44px"
          display="flex"
          alignItems="center"
          justifyContent="center"
          ml={-2}
          flexShrink={0}
        >
          <Checkbox
            aria-label={`${isSelected ? "Deselect" : "Select"} ${symbol}`}
            isChecked={isSelected}
            onChange={onToggle}
          />
        </Box>
      )}

      <ListItemMedia position="relative">
        <Box
          bg="surface.sunken"
          borderRadius="full"
          boxSize="36px"
          display="flex"
          alignItems="center"
          justifyContent="center"
          overflow="hidden"
        >
          {logoSrc ? (
            <Image
              src={logoSrc}
              alt=""
              boxSize="36px"
              borderRadius="full"
              fallback={
                <Text fontSize="xs" fontWeight={600} color="fg.secondary">
                  {symbol.slice(0, 3).toUpperCase()}
                </Text>
              }
            />
          ) : (
            <Text fontSize="xs" fontWeight={600} color="fg.secondary">
              {symbol.slice(0, 3).toUpperCase()}
            </Text>
          )}
        </Box>
        <Box
          position="absolute"
          bottom="-2px"
          right="-4px"
          border="1.5px solid"
          borderColor="surface.raised"
          borderRadius="full"
          bg="surface.raised"
          boxSize="16px"
          overflow="hidden"
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          <ChainIcon
            chainId={token.chainId}
            chainName={chainName}
            size="16px"
            withChip
          />
        </Box>
      </ListItemMedia>

      <ListItemContent>
        <ListItemTitle fontSize="sm">{symbol}</ListItemTitle>
        <Text
          as="span"
          fontSize="xs"
          color="fg.secondary"
          fontWeight={400}
          noOfLines={1}
        >
          {subtitle || token.name || chainName}
        </Text>
      </ListItemContent>

      {valueLabel && (
        <ListItemMeta color="fg.primary" fontWeight={600} whiteSpace="nowrap">
          {valueLabel}
        </ListItemMeta>
      )}

      <ListItemActions>
        {isContractAddress && <CopyButton value={token.contractAddress} />}
        {canOpenContract && (
          <IconButton
            aria-label={`View ${symbol} contract`}
            icon={<ExternalLinkIcon />}
            size="xs"
            variant="ghost"
            color="fg.secondary"
            onClick={() => {
              chrome.tabs.create({
                url: `${explorer}/address/${token.contractAddress}`,
              });
            }}
            _hover={{ color: "accent.secondary", bg: "surface.raisedHover" }}
          />
        )}
        {rightSlot}
      </ListItemActions>
    </ListItem>
  );
}
