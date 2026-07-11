import { useRef, useState } from "react";
import {
  Box,
  Button,
  Flex,
  Icon,
  IconButton,
  Image,
  HStack,
  Text,
  type IconProps,
} from "@chakra-ui/react";
import {
  EditIcon,
  ExternalLinkIcon,
  LinkIcon,
  ViewOffIcon,
} from "@chakra-ui/icons";
import type { PortfolioToken } from "@/chrome/portfolioApi";
import ChainIcon from "@/components/ChainIcon";
import {
  ListItem,
  ListItemContent,
  ListItemDescription,
  ListItemMedia,
  ListItemMeta,
  ListItemTitle,
  ActionSheet,
  type ActionSheetChoice,
} from "@/components/ui";
import { CopyButton } from "@/components/CopyButton";
import MiddleTruncatedAddress from "@/components/MiddleTruncatedAddress";
import { isNativePortfolioToken } from "@/components/tokenHoldingsUtils";
import { getChainConfig } from "@/constants/chainConfig";
import { getChainEnvironmentLabel } from "@/lib/chainIcons";
import { getResolvedChainById } from "@/lib/chains";
import type { NetworksInfo } from "@/types";
import { playInteractionSound } from "@/sounds/soundManager";

const ERC20_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const SendIcon = (props: IconProps) => (
  <Icon viewBox="0 0 24 24" fill="none" {...props}>
    <path
      d="M7 17 17 7M10 7h7v7"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Icon>
);

const SwapIcon = (props: IconProps) => (
  <Icon viewBox="0 0 24 24" fill="none" {...props}>
    <path
      d="M5 8h12m0 0-3-3m3 3-3 3M19 16H7m0 0 3 3m-3-3 3-3"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Icon>
);

interface TokenIdentityProps {
  token: PortfolioToken;
  chainName: string;
  resolveLogo: (url: string | undefined) => string | undefined;
}

function TokenIdentity({ token, chainName, resolveLogo }: TokenIdentityProps) {
  return (
    <ListItemMedia position="relative">
      <Flex
        boxSize="28px"
        align="center"
        justify="center"
        overflow="hidden"
        bg="surface.sunken"
        borderRadius="full"
      >
        {token.logoUrl ? (
          <Image
            src={resolveLogo(token.logoUrl)}
            alt=""
            boxSize="28px"
            borderRadius="full"
            fallback={
              <Text fontSize="2xs" fontWeight={700} color="fg.secondary">
                {token.symbol.slice(0, 3)}
              </Text>
            }
          />
        ) : (
          <Text fontSize="2xs" fontWeight={700} color="fg.secondary">
            {token.symbol.slice(0, 3)}
          </Text>
        )}
      </Flex>
      <Flex
        position="absolute"
        right="-4px"
        bottom="-2px"
        boxSize="12px"
        align="center"
        justify="center"
        overflow="hidden"
        bg="surface.raised"
        borderWidth="1px"
        borderColor="surface.raised"
        borderRadius="full"
      >
        <ChainIcon
          chainId={token.chainId}
          chainName={chainName}
          size="10px"
          withChip
        />
      </Flex>
    </ListItemMedia>
  );
}

export interface PortfolioTokenRowProps {
  token: PortfolioToken;
  customTokenKeys: Set<string>;
  tokenKey: string;
  networksInfo: NetworksInfo;
  onTokenClick?: (token: PortfolioToken) => void;
  onSwapClick?: (token: PortfolioToken) => void;
  onEditToken: (token: PortfolioToken) => void;
  onHideToken: (token: PortfolioToken) => void;
  resolveLogo: (url: string | undefined) => string | undefined;
  hideValue: boolean;
  formatUsd: (value: number) => string;
  displayMode?: "token" | "chainBreakdown";
}

export function PortfolioTokenRow({
  token,
  customTokenKeys,
  tokenKey,
  networksInfo,
  onTokenClick,
  onSwapClick,
  onEditToken,
  onHideToken,
  resolveLogo,
  hideValue,
  formatUsd,
  displayMode = "token",
}: PortfolioTokenRowProps) {
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const actionsButtonRef = useRef<HTMLButtonElement>(null);
  const isCustom = customTokenKeys.has(tokenKey);
  const resolvedChain = getResolvedChainById(token.chainId, networksInfo);
  const chainName =
    resolvedChain?.name ??
    getChainConfig(token.chainId).name ??
    `Chain ${token.chainId}`;
  const isNativeToken = isNativePortfolioToken(token);
  const canSwap = !!onSwapClick && resolvedChain?.isSwapSupported === true;
  const canHide =
    !isNativeToken &&
    ERC20_ADDRESS_REGEX.test(token.contractAddress) &&
    token.contractAddress.toLowerCase() !== ZERO_ADDRESS;
  const canCopy =
    !isNativeToken && ERC20_ADDRESS_REGEX.test(token.contractAddress);
  const explorer = resolvedChain?.explorer ?? getChainConfig(token.chainId).explorer;
  const tokenExplorerUrl = canCopy && explorer
    ? `${explorer.replace(/\/$/, "")}/token/${token.contractAddress}`
    : null;
  const isTestnet =
    !!resolvedChain?.name &&
    getChainEnvironmentLabel(token.chainId, resolvedChain.name) === "TESTNET";
  const actionChoices: ActionSheetChoice[] = [
    ...(onTokenClick
      ? [{
          id: "send",
          label: "Send",
          description: `Send ${token.symbol} to an address`,
          icon: <SendIcon boxSize="18px" />,
        }]
      : []),
    ...(canSwap
      ? [{
          id: "swap",
          label: "Swap",
          description: `Trade or bridge ${token.symbol}`,
          icon: <SwapIcon boxSize="18px" />,
        }]
      : []),
    ...(isCustom
      ? [{
          id: "edit",
          label: "Edit token",
          description: "Update local token details",
          icon: <EditIcon boxSize="18px" />,
        }]
      : []),
  ];

  const handleAction = (choiceId: string) => {
    if (choiceId === "send") onTokenClick?.(token);
    else if (choiceId === "swap") onSwapClick?.(token);
    else if (choiceId === "edit") onEditToken(token);
  };

  const rowContent = displayMode === "chainBreakdown" ? (
    <>
      <TokenIdentity
        token={token}
        chainName={chainName}
        resolveLogo={resolveLogo}
      />
      <ListItemContent>
        <ListItemTitle fontSize="sm" noOfLines={1}>{chainName}</ListItemTitle>
        <ListItemDescription fontSize="xs" noOfLines={1}>
          {hideValue ? "••••" : `${token.balanceFormatted} ${token.symbol}`}
        </ListItemDescription>
      </ListItemContent>
      <ListItemMeta flex="0 0 auto" minW="76px">
        <Text
          as="span"
          display="block"
          color="fg.primary"
          fontSize="sm"
          fontWeight={600}
          sx={{ fontVariantNumeric: "tabular-nums" }}
          noOfLines={1}
        >
          {formatUsd(token.valueUsd)}
        </Text>
      </ListItemMeta>
    </>
  ) : (
    <>
      <TokenIdentity
        token={token}
        chainName={chainName}
        resolveLogo={resolveLogo}
      />
      <ListItemContent>
        <ListItemTitle fontSize="sm" noOfLines={1}>{token.symbol}</ListItemTitle>
        <ListItemDescription fontSize="xs" noOfLines={1}>
          {hideValue ? "••••" : token.balanceFormatted}
          {isTestnet ? ` · ${resolvedChain?.name}` : ""}
        </ListItemDescription>
      </ListItemContent>
      <ListItemMeta flex="0 0 auto" minW="76px">
        <Text
          as="span"
          display="block"
          color="fg.primary"
          fontSize="sm"
          fontWeight={600}
          sx={{ fontVariantNumeric: "tabular-nums" }}
          noOfLines={1}
        >
          {formatUsd(token.valueUsd)}
        </Text>
        {!hideValue && token.priceUsd > 0 && (
          <Text as="span" display="block" fontSize="xs" noOfLines={1}>
            ${token.priceUsd < 0.01
              ? "<0.01"
              : token.priceUsd.toLocaleString("en-US", {
                  maximumFractionDigits: 2,
                })}
          </Text>
        )}
      </ListItemMeta>
    </>
  );

  const tokenTitle = (
    <HStack spacing={2} minW={0}>
      <Flex
        boxSize="32px"
        flexShrink={0}
        align="center"
        justify="center"
        overflow="hidden"
        bg="surface.sunken"
        borderRadius="full"
      >
        {token.logoUrl ? (
          <Image
            src={resolveLogo(token.logoUrl)}
            alt=""
            boxSize="32px"
            borderRadius="full"
          />
        ) : (
          <Text fontSize="2xs" fontWeight="700" color="fg.secondary">
            {token.symbol.slice(0, 3)}
          </Text>
        )}
      </Flex>
      <Text as="span" fontSize="lg" fontWeight="700" noOfLines={1}>
        {token.symbol}
      </Text>
      <Text as="span" fontSize="sm" fontWeight="500" color="fg.muted">
        on
      </Text>
      <ChainIcon
        chainId={token.chainId}
        chainName={chainName}
        size="18px"
        withChip
      />
      <Text as="span" fontSize="sm" fontWeight="600" color="fg.secondary" noOfLines={1}>
        {chainName}
      </Text>
    </HStack>
  );

  const sheetFooter = (canCopy || canHide) ? (
    <Box>
      {canCopy && (
        <HStack minH="52px" px={3} spacing={3}>
          <Flex
            boxSize="24px"
            flexShrink={0}
            align="center"
            justify="center"
            color="fg.secondary"
          >
            <LinkIcon boxSize="17px" />
          </Flex>
          <Box minW={0} flex={1}>
            <HStack spacing={1.5}>
              <Text fontSize="sm" fontWeight="600" color="fg.primary">
                Address
              </Text>
              <CopyButton
                value={token.contractAddress}
                label={`Copy ${token.symbol} token address`}
              />
              {tokenExplorerUrl && (
                <IconButton
                  as="a"
                  href={tokenExplorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`View ${token.symbol} on ${chainName} explorer`}
                  icon={<ExternalLinkIcon boxSize="14px" />}
                  size="xs"
                  minW="24px"
                  w="24px"
                  h="24px"
                  variant="ghost"
                  color="fg.secondary"
                  _hover={{ color: "accent.highlight", bg: "surface.raisedHover" }}
                />
              )}
            </HStack>
            <HStack minW={0} color="fg.secondary">
              <MiddleTruncatedAddress address={token.contractAddress} />
            </HStack>
          </Box>
        </HStack>
      )}

      {canHide && (
        <Button
          type="button"
          variant="ghost"
          w="full"
          minH="48px"
          mt={3}
          px={3}
          justifyContent="flex-start"
          color="chart.negative"
          borderTopWidth="1px"
          borderTopColor="border.subtle"
          borderRadius={0}
          _hover={{ bg: "status.error.bg", color: "status.error.fg" }}
          _active={{
            bg: "status.error.bg",
            color: "status.error.fg",
            transform: "none",
          }}
          onClick={() => {
            setIsActionsOpen(false);
            onHideToken(token);
          }}
        >
          <HStack w="full" spacing={3} align="center">
            <Flex
              boxSize="24px"
              flexShrink={0}
              align="center"
              justify="center"
            >
              <ViewOffIcon boxSize="18px" />
            </Flex>
            <Text as="span" fontSize="md" fontWeight="600">
              Hide token
            </Text>
          </HStack>
        </Button>
      )}
    </Box>
  ) : undefined;

  return (
    <>
      <ListItem
        ref={actionsButtonRef}
        interactive
        as="button"
        type="button"
        density="default"
        aria-label={`Open actions for ${token.symbol}`}
        onClick={() => setIsActionsOpen(true)}
        onMouseEnter={() => void playInteractionSound("portfolioTokenHover")}
      >
        {rowContent}
      </ListItem>

      <ActionSheet
        isOpen={isActionsOpen}
        onClose={() => setIsActionsOpen(false)}
        title={tokenTitle}
        choices={actionChoices}
        onSelect={handleAction}
        footer={sheetFooter}
        finalFocusRef={actionsButtonRef}
      />
    </>
  );
}

export { DefiPositionRow } from "@/components/PortfolioDefiPositionRow";
