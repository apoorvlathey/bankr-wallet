import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  Flex,
  Icon,
  IconButton,
  Image,
  Text,
  type IconProps,
} from "@chakra-ui/react";
import {
  CheckIcon,
  CopyIcon,
  ViewOffIcon,
} from "@chakra-ui/icons";
import type { PortfolioToken } from "@/chrome/portfolioApi";
import ChainIcon from "@/components/ChainIcon";
import {
  ListItem,
  ListItemActions,
  ListItemContent,
  ListItemDescription,
  ListItemMedia,
  ListItemMeta,
  ListItemTitle,
  ActionSheet,
  type ActionSheetChoice,
} from "@/components/ui";
import { getChainConfig } from "@/constants/chainConfig";
import { getChainEnvironmentLabel } from "@/lib/chainIcons";
import { getResolvedChainById } from "@/lib/chains";
import type { NetworksInfo } from "@/types";

const ERC20_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const EllipsisHorizontalIcon = (props: IconProps) => (
  <Icon viewBox="0 0 24 24" fill="none" {...props}>
    <circle cx="5" cy="12" r="1.75" fill="currentColor" />
    <circle cx="12" cy="12" r="1.75" fill="currentColor" />
    <circle cx="19" cy="12" r="1.75" fill="currentColor" />
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
        boxSize="36px"
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
            boxSize="36px"
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
        boxSize="16px"
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
          size="14px"
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
  copiedAddr: string | null;
  setCopiedAddr: Dispatch<SetStateAction<string | null>>;
  hideValue: boolean;
  formatUsd: (value: number) => string;
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
  copiedAddr,
  setCopiedAddr,
  hideValue,
  formatUsd,
}: PortfolioTokenRowProps) {
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const actionsButtonRef = useRef<HTMLButtonElement>(null);
  const isCustom = customTokenKeys.has(tokenKey);
  const resolvedChain = getResolvedChainById(token.chainId, networksInfo);
  const chainName =
    resolvedChain?.name ??
    getChainConfig(token.chainId).name ??
    `Chain ${token.chainId}`;
  const canSwap = !!onSwapClick && resolvedChain?.isSwapSupported === true;
  const canHide =
    ERC20_ADDRESS_REGEX.test(token.contractAddress) &&
    token.contractAddress.toLowerCase() !== ZERO_ADDRESS;
  const canCopy =
    !!token.contractAddress &&
    token.contractAddress !== ZERO_ADDRESS &&
    token.contractAddress !== "native";
  const copiedKey = `${token.chainId}-${token.contractAddress}`;
  const isTestnet =
    !!resolvedChain?.name &&
    getChainEnvironmentLabel(token.chainId, resolvedChain.name) === "TESTNET";
  const actionChoices: ActionSheetChoice[] = [
    ...(onTokenClick
      ? [{ id: "send", label: "Send", description: `Send ${token.symbol} to an address` }]
      : []),
    ...(canSwap
      ? [{ id: "swap", label: "Swap", description: `Trade or bridge ${token.symbol}` }]
      : []),
    ...(isCustom
      ? [{ id: "edit", label: "Edit token", description: "Update local token details" }]
      : []),
    ...(canHide
      ? [{
          id: "hide",
          label: "Hide token",
          description: "Remove this token from the portfolio view",
          icon: <ViewOffIcon boxSize="18px" />,
        }]
      : []),
  ];

  const handleAction = (choiceId: string) => {
    if (choiceId === "send") onTokenClick?.(token);
    else if (choiceId === "swap") onSwapClick?.(token);
    else if (choiceId === "edit") onEditToken(token);
    else if (choiceId === "hide") onHideToken(token);
  };

  const rowContent = (
    <>
      <TokenIdentity
        token={token}
        chainName={chainName}
        resolveLogo={resolveLogo}
      />
      <ListItemContent>
        <ListItemTitle noOfLines={1}>{token.symbol}</ListItemTitle>
        <ListItemDescription noOfLines={1}>
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

  return (
    <ListItem density="default" px={0} py={0} gap={0}>
      {onTokenClick ? (
        <Flex
          as="button"
          type="button"
          aria-label={`Send ${token.symbol}`}
          minW={0}
          minH="44px"
          flex="1 1 auto"
          align="center"
          gap={3}
          px={0}
          py={0}
          textAlign="start"
          bg="transparent"
          color="fg.primary"
          border={0}
          cursor="pointer"
          transitionProperty="background-color, box-shadow"
          transitionDuration="fast"
          _hover={{ bg: "surface.raisedHover" }}
          _active={{ bg: "surface.sunken" }}
          _focus={{ outline: "none" }}
          _focusVisible={{
            boxShadow:
              "inset 0 0 0 2px var(--chakra-colors-border-focus)",
          }}
          onClick={() => onTokenClick(token)}
        >
          {rowContent}
        </Flex>
      ) : (
        <Flex
          minW={0}
          minH="44px"
          flex="1 1 auto"
          align="center"
          gap={3}
          px={0}
          py={0}
        >
          {rowContent}
        </Flex>
      )}

      <ListItemActions pr={2}>
        {canCopy && (
          <IconButton
            aria-label={`Copy ${token.symbol} token address`}
            icon={copiedAddr === copiedKey ? <CheckIcon /> : <CopyIcon />}
            size="sm"
            variant="ghost"
            color={
              copiedAddr === copiedKey ? "accent.highlight" : "fg.secondary"
            }
            onClick={() => {
              void navigator.clipboard.writeText(token.contractAddress);
              setCopiedAddr(copiedKey);
              window.setTimeout(
                () =>
                  setCopiedAddr((current) =>
                    current === copiedKey ? null : current,
                  ),
                2000,
              );
            }}
          />
        )}

        {(onTokenClick || canSwap || isCustom || canHide) && (
          <>
            <IconButton
              ref={actionsButtonRef}
              aria-label={`More actions for ${token.symbol}`}
              icon={<EllipsisHorizontalIcon boxSize="18px" />}
              size="sm"
              variant="ghost"
              color="fg.secondary"
              onClick={() => setIsActionsOpen(true)}
            />
            <ActionSheet
              isOpen={isActionsOpen}
              onClose={() => setIsActionsOpen(false)}
              title={`${token.symbol} actions`}
              description={chainName}
              choices={actionChoices}
              onSelect={handleAction}
              finalFocusRef={actionsButtonRef}
            />
          </>
        )}
      </ListItemActions>
    </ListItem>
  );
}

export { DefiPositionRow } from "@/components/PortfolioDefiPositionRow";
