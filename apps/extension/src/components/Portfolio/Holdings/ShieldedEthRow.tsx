import { useRef, useState } from "react";
import { Box, Flex, HStack, Image, Text } from "@chakra-ui/react";
import { TimeIcon } from "@chakra-ui/icons";
import {
  ActionSheet,
  type ActionSheetChoice,
  ListItem,
  ListItemContent,
  ListItemDescription,
  ListItemMedia,
  ListItemMeta,
  ListItemTitle,
} from "@/components/ui";
import type { ShieldPrivatePortfolio } from "@/components/Shield/model/shieldOperation";
import {
  SHIELDED_ETH_IS_TESTNET,
  SHIELDED_ETH_LOGO_URL,
  SHIELDED_ETH_NETWORK_NAME,
  type ShieldedEthAction,
} from "@/components/Shield/model/shieldedAsset";
import { formatShieldWei } from "@/components/Shield/model/shieldQuote";
import { playInteractionSound } from "@/sounds/soundManager";
import { HomeSendIcon, HomeUnshieldIcon } from "@/components/shared/HomeQuickActionButton";
import { PrivacyShieldIcon } from "@/components/shared/PrivacyShieldIcon";

interface ShieldedEthRowProps {
  portfolio: ShieldPrivatePortfolio;
  hideValue: boolean;
  onAction?: (action: ShieldedEthAction) => void;
}

export function ShieldedEthRow({
  portfolio,
  hideValue,
  onAction,
}: ShieldedEthRowProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const ready = formatShieldWei(portfolio.readyBalanceWei);
  const pending = formatShieldWei(portfolio.pendingBalanceWei);
  const statusCopy = portfolio.pendingBalanceWei > 0n
    ? `${pending} ETH processing`
    : `${ready} ETH available`;
  const choices: ActionSheetChoice[] = [
    {
      id: "shield",
      label: "Shield ETH",
      description: `Move ${SHIELDED_ETH_NETWORK_NAME} ETH into your shielded balance`,
      icon: <PrivacyShieldIcon boxSize="18px" />,
      isDisabled: !onAction,
    },
    {
      id: "unshield",
      label: "Unshield ETH",
      description: "Return Shielded ETH to one of your wallets",
      icon: <HomeUnshieldIcon />,
      isDisabled: !onAction,
    },
    {
      id: "send",
      label: "Send privately",
      description: portfolio.readyBalanceWei > 0n
        ? "Withdraw through a relay to another address"
        : "Open the private-send flow",
      icon: <HomeSendIcon />,
      isDisabled: !onAction,
    },
    {
      id: "activity",
      label: "View activity",
      description: "Show Shield and private-send activity",
      icon: <TimeIcon boxSize="18px" />,
      isDisabled: !onAction,
    },
  ];

  return (
    <>
      <ListItem
        ref={triggerRef}
        interactive
        as="button"
        type="button"
        density="default"
        aria-label="Open actions for Shielded ETH"
        onClick={() => setIsOpen(true)}
        onMouseEnter={() => void playInteractionSound("portfolioTokenHover")}
      >
        <ListItemMedia position="relative">
          <Image src={SHIELDED_ETH_LOGO_URL} alt="" boxSize="30px" />
          {SHIELDED_ETH_IS_TESTNET && (
            <Flex
              position="absolute"
              right="-7px"
              bottom="-4px"
              minW="30px"
              h="14px"
              px={1}
              align="center"
              justify="center"
              bg="surface.raised"
              borderWidth="1px"
              borderColor="border.default"
              borderRadius="full"
            >
              <Text fontSize="7px" fontWeight="800" letterSpacing="wide">
                TEST
              </Text>
            </Flex>
          )}
        </ListItemMedia>
        <ListItemContent>
          <ListItemTitle fontSize="sm" noOfLines={1}>
            Shielded ETH
          </ListItemTitle>
          <ListItemDescription
            fontSize="xs"
            noOfLines={1}
          >
            <Text
              as="span"
              color={portfolio.pendingBalanceWei > 0n ? "accent.highlight" : "fg.secondary"}
            >
              {hideValue ? "••••" : statusCopy}
            </Text>
          </ListItemDescription>
        </ListItemContent>
        <ListItemMeta flex="0 0 auto" minW="76px">
          <Text
            as="span"
            display="block"
            color="fg.primary"
            fontSize="sm"
            fontWeight="600"
            sx={{ fontVariantNumeric: "tabular-nums" }}
            noOfLines={1}
          >
            {hideValue ? "••••" : `${ready} ETH`}
          </Text>
          <Text as="span" display="block" fontSize="xs" noOfLines={1}>
            Available
          </Text>
        </ListItemMeta>
      </ListItem>

      <ActionSheet
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={(
          <HStack spacing={2.5} minW={0}>
            <Image src={SHIELDED_ETH_LOGO_URL} alt="" boxSize="34px" />
            <Box minW={0}>
              <Text fontSize="lg" fontWeight="700">Shielded ETH</Text>
              <Text fontSize="xs" color="fg.secondary">
                Privacy Pools · {SHIELDED_ETH_NETWORK_NAME}
              </Text>
            </Box>
          </HStack>
        )}
        description={hideValue
          ? undefined
          : `${ready} ETH shielded · ${pending} ETH processing`}
        choices={choices}
        onSelect={(choice) => onAction?.(choice as ShieldedEthAction)}
        finalFocusRef={triggerRef}
      />
    </>
  );
}
