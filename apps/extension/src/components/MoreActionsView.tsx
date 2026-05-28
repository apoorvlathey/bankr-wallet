import {
  Badge,
  Box,
  HStack,
  Icon,
  IconButton,
  SimpleGrid,
  Spacer,
  Text,
  VStack,
} from "@chakra-ui/react";
import {
  ArrowBackIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
} from "@chakra-ui/icons";
import { ThemedCard, useStripTokens, useTheme } from "@/theme";
import {
  REVOKE_CASH_URL,
  WALLETCHAN_MIGRATE_URL,
  WALLETCHAN_STAKE_URL,
} from "@/constants/externalUrls";
import { FromAccountDisplay } from "@/components/FromAccountDisplay";
import WalletConnectLogoIcon from "@/components/WalletConnectLogoIcon";

interface MoreActionsViewProps {
  onBack: () => void;
  onWalletConnect: () => void;
  fromAddress: string;
  stakeApy: number | null;
}

interface MoreAction {
  title: string;
  detail: string;
  icon: JSX.Element;
  iconBg: string;
  iconColor: string;
  badge?: string;
  external?: boolean;
  onClick?: () => void;
}

const StakeIcon = () => (
  <Icon
    viewBox="0 0 24 24"
    boxSize={5}
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 3v12m0 0l-4-4m4 4l4-4" />
    <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
  </Icon>
);

const MigrateIcon = () => (
  <Icon
    viewBox="0 0 24 24"
    boxSize={5}
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M5 7h11" />
    <path d="M13 4l3 3-3 3" />
    <path d="M19 17H8" />
    <path d="M11 14l-3 3 3 3" />
  </Icon>
);

const RevokeIcon = () => (
  <Icon
    viewBox="0 0 24 24"
    boxSize={5}
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 3l7 3v5c0 5-3.5 8-7 10-3.5-2-7-5-7-10V6l7-3z" />
    <path d="M8 12h8" />
  </Icon>
);

function openExternal(url: string) {
  chrome.tabs.create({ url });
}

function ActionBadge({ children }: { children: string }) {
  return (
    <Badge
      bg="accent.highlight"
      color="accentFg.highlight"
      border="1px solid"
      borderColor="border.default"
      fontSize="9px"
      fontWeight="900"
      px={1.5}
      py="1px"
      lineHeight="1.1"
      textTransform="uppercase"
    >
      {children}
    </Badge>
  );
}

function ActionTile({ action }: { action: MoreAction }) {
  const { themeId } = useTheme();
  const isDarkTheme = themeId === "midnight";

  return (
    <ThemedCard
      as="button"
      type="button"
      weight="medium"
      interactive
      h="104px"
      minW={0}
      cursor="pointer"
      textAlign="left"
      onClick={action.onClick}
    >
      <VStack align="stretch" spacing={3} h="100%">
        <HStack justify="space-between" align="flex-start">
          <Box
            bg={action.iconBg}
            color={action.iconColor}
            borderRadius={isDarkTheme ? "md" : undefined}
            p={2}
          >
            {action.icon}
          </Box>
          {action.badge ? (
            <ActionBadge>{action.badge}</ActionBadge>
          ) : (
            <ExternalLinkIcon color="text.secondary" boxSize={3.5} />
          )}
        </HStack>
        <Box mt="auto" minW={0}>
          <Text
            color="text.primary"
            fontSize="sm"
            fontWeight="900"
            lineHeight="1.1"
            textTransform="uppercase"
          >
            {action.title}
          </Text>
          <Text
            color="text.secondary"
            fontSize="2xs"
            fontWeight="700"
            lineHeight="1.2"
            noOfLines={1}
          >
            {action.detail}
          </Text>
        </Box>
      </VStack>
    </ThemedCard>
  );
}

function ActionRow({ action }: { action: MoreAction }) {
  const strip = useStripTokens();
  const { themeId } = useTheme();
  const isDarkTheme = themeId === "midnight";
  const isExternal = action.external !== false;

  return (
    <ThemedCard
      as="button"
      type="button"
      weight="thin"
      interactive
      w="100%"
      cursor="pointer"
      textAlign="left"
      onClick={action.onClick}
    >
      <HStack spacing={3} minW={0}>
        <Box
          bg={action.iconBg}
          color={action.iconColor}
          borderRadius={isDarkTheme ? "md" : undefined}
          p={2}
          flexShrink={0}
        >
          {action.icon}
        </Box>
        <Box minW={0}>
          <Text
            color="text.primary"
            fontWeight="800"
            fontSize="sm"
            lineHeight="1.1"
            noOfLines={1}
          >
            {action.title}
          </Text>
          <Text
            color="text.secondary"
            fontSize="xs"
            fontWeight="600"
            noOfLines={1}
          >
            {action.detail}
          </Text>
        </Box>
        <Spacer />
        <Box
          bg={isDarkTheme ? "transparent" : strip.bg}
          color={isDarkTheme ? "text.secondary" : strip.fg}
          borderRadius={isDarkTheme ? "md" : undefined}
          p={isDarkTheme ? 0 : 1}
          flexShrink={0}
        >
          {isExternal ? (
            <ExternalLinkIcon boxSize={3} />
          ) : (
            <ChevronRightIcon boxSize={4} />
          )}
        </Box>
      </HStack>
    </ThemedCard>
  );
}

export default function MoreActionsView({
  onBack,
  onWalletConnect,
  fromAddress,
  stakeApy,
}: MoreActionsViewProps) {
  const primaryActions: MoreAction[] = [
    {
      title: "Stake",
      detail: "WCHAN vault",
      icon: <StakeIcon />,
      iconBg: "accent.primary",
      iconColor: "accentFg.primary",
      badge: stakeApy !== null ? `${stakeApy.toFixed(1)}% APY` : undefined,
      onClick: () => openExternal(WALLETCHAN_STAKE_URL),
    },
    {
      title: "Migrate Tokens",
      detail: "migrate.eth.sh",
      icon: <MigrateIcon />,
      iconBg: "accent.secondary",
      iconColor: "accentFg.secondary",
      onClick: () => openExternal(WALLETCHAN_MIGRATE_URL),
    },
  ];

  const secondaryActions: MoreAction[] = [
    {
      title: "WalletConnect",
      detail: "Connect dapps by URI",
      icon: <WalletConnectLogoIcon />,
      iconBg: "accent.secondary",
      iconColor: "accentFg.secondary",
      external: false,
      onClick: onWalletConnect,
    },
    {
      title: "Revoke Approvals",
      detail: "revoke.cash",
      icon: <RevokeIcon />,
      iconBg: "accent.highlight",
      iconColor: "accentFg.highlight",
      onClick: () => openExternal(REVOKE_CASH_URL),
    },
  ];

  return (
    <Box
      p={4}
      h="100%"
      minH={0}
      overflowY="auto"
      overflowX="hidden"
      bg="surface.base"
    >
      <VStack spacing={4} align="stretch">
        <HStack spacing={2} justify="space-between">
          <HStack spacing={2} minW={0} flex={1}>
            <IconButton
              aria-label="Back"
              icon={<ArrowBackIcon />}
              variant="ghost"
              size="sm"
              onClick={onBack}
            />
            <Text
              fontSize="lg"
              fontWeight="900"
              color="text.primary"
              textTransform="uppercase"
              noOfLines={1}
            >
              More
            </Text>
          </HStack>
          {fromAddress && <FromAccountDisplay address={fromAddress} />}
        </HStack>

        <SimpleGrid columns={2} spacing={2}>
          {primaryActions.map((action) => (
            <ActionTile key={action.title} action={action} />
          ))}
        </SimpleGrid>

        <VStack align="stretch" spacing={2}>
          {secondaryActions.map((action) => (
            <ActionRow key={action.title} action={action} />
          ))}
        </VStack>
      </VStack>
    </Box>
  );
}
