import { type ReactNode, useId } from "react";
import {
  Box,
  Checkbox,
  HStack,
  IconButton,
  Image,
  Popover,
  PopoverBody,
  PopoverContent,
  PopoverTrigger,
  Portal,
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

function TokenContractPopover({
  address,
  explorer,
  symbol,
  triggerTabIndex,
  children,
}: {
  address: string;
  explorer: string;
  symbol: string;
  triggerTabIndex?: number;
  children: ReactNode;
}) {
  const shortAddress = `${address.slice(0, 8)}...${address.slice(-6)}`;

  return (
    <Popover
      trigger="hover"
      placement="bottom-start"
      openDelay={120}
      closeDelay={220}
      gutter={6}
      isLazy
    >
      <PopoverTrigger>
        <Box
          as="button"
          type="button"
          tabIndex={triggerTabIndex}
          aria-label={`Show ${symbol} contract details`}
          display="inline-flex"
          w="fit-content"
          minW={0}
          maxW="full"
          overflow="hidden"
          position="relative"
          zIndex={2}
          pointerEvents="auto"
          color="inherit"
          textAlign="start"
          borderRadius="sm"
          cursor="help"
          _hover={{ color: "accent.secondary" }}
          _focusVisible={{
            outline: "2px solid",
            outlineColor: "border.focus",
            outlineOffset: "2px",
          }}
        >
          {children}
        </Box>
      </PopoverTrigger>
      <Portal>
        <PopoverContent
          w="max-content"
          maxW="calc(100vw - 24px)"
          _focus={{ outline: "none" }}
        >
          <PopoverBody p={1.5}>
            <HStack spacing={1} whiteSpace="nowrap">
              <Text
                px={1.5}
                fontSize="xs"
                fontFamily="mono"
                color="fg.primary"
                fontWeight={600}
              >
                {shortAddress}
              </Text>
              <CopyButton
                value={address}
                label={`Copy ${symbol} contract address`}
              />
              {explorer && (
                <IconButton
                  aria-label={`View ${symbol} contract`}
                  icon={<ExternalLinkIcon boxSize="11px" />}
                  size="xs"
                  minW="24px"
                  w="24px"
                  h="24px"
                  variant="ghost"
                  color="fg.muted"
                  onClick={() => {
                    chrome.tabs.create({
                      url: `${explorer}/address/${address}`,
                    });
                  }}
                  _hover={{
                    color: "accent.secondary",
                    bg: "surface.raisedHover",
                  }}
                />
              )}
            </HStack>
          </PopoverBody>
        </PopoverContent>
      </Portal>
    </Popover>
  );
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
  const selectionId = useId();
  const symbol = token.symbol || "TOKEN";
  const resolvedChain = getResolvedChainById(token.chainId, networksInfo);
  const fallbackChain = getChainConfig(token.chainId);
  const chainName =
    resolvedChain?.name ||
    (fallbackChain.name !== "Unknown" ? fallbackChain.name : undefined) ||
    `Chain ${token.chainId}`;
  const secondaryLabel = subtitle || token.name || chainName;
  const explorer = (resolvedChain?.explorer || fallbackChain.explorer || "")
    .replace(/\/+$/, "");
  const isContractAddress =
    ERC20_ADDRESS_REGEX.test(token.contractAddress) &&
    token.contractAddress.toLowerCase() !== ZERO_ADDRESS;
  const canOpenContract = isContractAddress && !!explorer;
  const tokenLogo = (
    <ListItemMedia position="relative">
      <Box
        bg="surface.sunken"
        borderRadius="full"
        boxSize="32px"
        display="flex"
        alignItems="center"
        justifyContent="center"
        overflow="hidden"
      >
        {logoSrc ? (
          <Image
            src={logoSrc}
            alt=""
            boxSize="32px"
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
        boxSize="14px"
        overflow="hidden"
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
    </ListItemMedia>
  );
  const tokenTitle = (
    <ListItemTitle
      display="block"
      minW={0}
      fontSize="sm"
      lineHeight="1.15"
      noOfLines={1}
      title={symbol}
    >
      {symbol}
    </ListItemTitle>
  );

  return (
    <ListItem
      isSelected={isSelected}
      role="group"
      density="compact"
      px={3}
      py={2}
      gap={2}
      cursor={onToggle ? "pointer" : "default"}
    >
      {onToggle && (
        <Box
          as="label"
          htmlFor={selectionId}
          aria-label={`${isSelected ? "Deselect" : "Select"} ${symbol}`}
          position="absolute"
          inset={0}
          zIndex={1}
          cursor="pointer"
        />
      )}

      {onToggle && (
        <Box
          w="28px"
          minW="28px"
          minH="44px"
          display="flex"
          alignItems="center"
          justifyContent="center"
          ml={-1}
          flexShrink={0}
          position="relative"
          zIndex={2}
        >
          <Checkbox
            id={selectionId}
            aria-label={`${isSelected ? "Deselect" : "Select"} ${symbol}`}
            isChecked={isSelected}
            onChange={onToggle}
          />
        </Box>
      )}

      {isContractAddress ? (
        <TokenContractPopover
          address={token.contractAddress}
          explorer={canOpenContract ? explorer : ""}
          symbol={symbol}
          triggerTabIndex={-1}
        >
          {tokenLogo}
        </TokenContractPopover>
      ) : (
        tokenLogo
      )}

      <ListItemContent gap={0} pointerEvents="none">
        {isContractAddress ? (
          <TokenContractPopover
            address={token.contractAddress}
            explorer={canOpenContract ? explorer : ""}
            symbol={symbol}
          >
            {tokenTitle}
          </TokenContractPopover>
        ) : (
          tokenTitle
        )}
        <Text
          as="span"
          minW={0}
          fontSize="xs"
          lineHeight="1.15"
          color="fg.secondary"
          fontWeight={400}
          noOfLines={1}
          title={secondaryLabel}
        >
          {secondaryLabel}
        </Text>
      </ListItemContent>

      {valueLabel && (
        <ListItemMeta
          flex="0 0 auto"
          maxW="42%"
          overflow="hidden"
          textOverflow="ellipsis"
          color="fg.primary"
          fontWeight={600}
          lineHeight="1.2"
          whiteSpace="nowrap"
          title={valueLabel}
        >
          {valueLabel}
        </ListItemMeta>
      )}

      {rightSlot && (
        <ListItemActions position="relative" zIndex={2}>
          {rightSlot}
        </ListItemActions>
      )}
    </ListItem>
  );
}
