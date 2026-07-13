import { Box,
  Button,
  HStack,
  IconButton,
  Text,
  VStack,
} from "@chakra-ui/react";
import { AddIcon, CheckIcon, CloseIcon } from "@chakra-ui/icons";
import type { PendingAddChainRequest } from "@/chrome/pendingAddChainStorage";
import type { AccountType } from "@/chrome/types";
import ChainIcon from "@/components/ChainIcon";
import WalletConnectLogoIcon from "@/components/WalletConnectLogoIcon";
import SafeImage from "@/components/SafeImage";
import { isDarkThemeId, ThemedCard, useTheme } from "@/theme";
import type {
  WalletConnectAddChainContext,
  WalletConnectProposalRejection,
  WalletConnectRequestedChain,
  WalletConnectRetryNotice,
} from "@/types/walletConnect";

interface ProposalNoticeProps {
  rejection: WalletConnectProposalRejection;
  accountType?: AccountType;
  onDismiss: () => void;
  onAddChainRequest: (
    request: PendingAddChainRequest,
    context?: WalletConnectAddChainContext,
  ) => void;
}

interface RetryNoticeProps {
  notice: WalletConnectRetryNotice;
  onDismiss: () => void;
}

function getDisplayChains(
  rejection: WalletConnectProposalRejection,
): WalletConnectRequestedChain[] {
  if (rejection.requestedChains?.length > 0) return rejection.requestedChains;
  return rejection.requestedChainIds.map((chainId) => ({ chainId }));
}

function getFirstAddableChain(
  rejection: WalletConnectProposalRejection,
): WalletConnectRequestedChain | null {
  return rejection.unconfiguredChains[0] || null;
}

function getChainName(chain: WalletConnectRequestedChain): string {
  return chain.name ?? `Chain ${chain.chainId}`;
}

function getChainSubtitle(chain: WalletConnectRequestedChain): string {
  return chain.name ? `Chain ID ${chain.chainId}` : "Network details needed";
}

function buildAddChainRequest(
  rejection: WalletConnectProposalRejection,
  chain: WalletConnectRequestedChain,
): PendingAddChainRequest {
  return {
    id: `walletconnect-${rejection.id}-${chain.chainId}`,
    chainId: chain.chainId,
    chainName: getChainName(chain),
    nativeCurrency: chain.nativeCurrency,
    rpcUrls: chain.rpcUrl ? [chain.rpcUrl] : [],
    blockExplorerUrls: chain.explorer ? [chain.explorer] : [],
    origin: rejection.url || rejection.name,
    favicon: rejection.icon,
    timestamp: Date.now(),
  };
}

function DappLogo({
  icon,
  name,
  size = "44px",
}: {
  icon: string | null;
  name: string;
  size?: string;
}) {
  const { themeId } = useTheme();
  const isDarkTheme = isDarkThemeId(themeId);
  const fallback = (
    <Box color="accentFg.secondary">
      <WalletConnectLogoIcon />
    </Box>
  );

  return (
    <Box
      boxSize={size}
      minW={size}
      borderWidth="1px"
      borderColor="border.default"
      borderRadius={isDarkTheme ? "lg" : "0"}
      bg="accent.secondary"
      display="flex"
      alignItems="center"
      justifyContent="center"
      overflow="hidden"
      flexShrink={0}
    >
      {icon ? (
        <SafeImage
          src={icon}
          alt={name}
          boxSize="100%"
          objectFit="cover"
          fallback={fallback}
        />
      ) : (
        fallback
      )}
    </Box>
  );
}

function RequestedChainRow({ chain }: { chain: WalletConnectRequestedChain }) {
  return (
    <HStack
      spacing={3}
      bg="surface.sunken"
      borderWidth="1px"
      borderColor="border.default"
      borderRadius="lg"
      px={3}
      py={2.5}
      minW={0}
    >
      <ChainIcon
        chainId={chain.chainId}
        chainName={chain.name}
        size="28px"
        withChip
      />
      <Box minW={0} flex={1}>
        <Text
          color="text.primary"
          fontSize="sm"
          fontWeight="600"
          lineHeight="1.1"
          noOfLines={1}
        >
          {getChainName(chain)}
        </Text>
        <Text color="text.secondary" fontSize="xs" fontWeight="400">
          {getChainSubtitle(chain)}
        </Text>
      </Box>
    </HStack>
  );
}

export function WalletConnectProposalNotice({
  rejection,
  accountType,
  onDismiss,
  onAddChainRequest,
}: ProposalNoticeProps) {
  const displayChains = getDisplayChains(rejection);
  const addableChain = getFirstAddableChain(rejection);
  const canAddChain =
    !!addableChain &&
    (accountType === "privateKey" || accountType === "seedPhrase");
  const primaryChain = addableChain ?? displayChains[0];

  return (
    <ThemedCard weight="medium">
      <VStack align="stretch" spacing={3}>
        <HStack spacing={3} align="start">
          <Box position="relative" flexShrink={0}>
            <DappLogo icon={rejection.icon} name={rejection.name} />
            {primaryChain && (
              <Box
                position="absolute"
                right="-6px"
                bottom="-6px"
                bg="surface.raised"
                borderWidth="1px"
                borderColor="border.default"
                borderRadius="full"
                p="2px"
              >
                <ChainIcon
                  chainId={primaryChain.chainId}
                  chainName={primaryChain.name}
                  size="18px"
                  withChip
                />
              </Box>
            )}
          </Box>
          <Box minW={0} flex={1}>
            <Text
              color="text.primary"
              fontSize="sm"
              fontWeight="600"
              lineHeight="1.1"
            >
              Network needed
            </Text>
            <Text
              color="text.secondary"
              fontSize="xs"
              fontWeight="400"
              noOfLines={2}
            >
              {rejection.name} wants{" "}
              {primaryChain ? getChainName(primaryChain) : "another network"}
            </Text>
          </Box>
          <IconButton
            aria-label="Dismiss WalletConnect issue"
            icon={<CloseIcon />}
            size="xs"
            variant="ghost"
            onClick={onDismiss}
            flexShrink={0}
          />
        </HStack>

        {displayChains.slice(0, 3).map((chain) => (
          <RequestedChainRow key={chain.chainId} chain={chain} />
        ))}

        <Text color="text.secondary" fontSize="xs" fontWeight="400">
          {rejection.error}
        </Text>

        {canAddChain && addableChain && (
          <Button
            leftIcon={<AddIcon />}
            size="sm"
            variant="secondary"
            onClick={() =>
              onAddChainRequest(buildAddChainRequest(rejection, addableChain), {
                dappName: rejection.name,
              })
            }
          >
            Add {getChainName(addableChain)}
          </Button>
        )}
      </VStack>
    </ThemedCard>
  );
}

export function WalletConnectRetryNoticeCard({
  notice,
  onDismiss,
}: RetryNoticeProps) {
  const { themeId } = useTheme();
  const isDarkTheme = isDarkThemeId(themeId);

  return (
    <ThemedCard weight="medium">
      <VStack align="stretch" spacing={3}>
        <HStack spacing={3} align="start">
          <Box
            boxSize="34px"
            minW="34px"
            borderWidth="1px"
            borderColor="status.success.border"
            bg="status.success.bg"
            color="status.success.fg"
            borderRadius={isDarkTheme ? "md" : "0"}
            display="flex"
            alignItems="center"
            justifyContent="center"
            flexShrink={0}
          >
            <CheckIcon />
          </Box>
          <Box minW={0} flex={1}>
            <Text
              color="text.primary"
              fontSize="sm"
              fontWeight="600"
              lineHeight="1.1"
            >
              Network added
            </Text>
            <HStack spacing={2} mt={1} minW={0}>
              <ChainIcon
                chainId={notice.chainId}
                chainName={notice.chainName}
                size="18px"
                withChip
              />
              <Text
                color="text.secondary"
                fontSize="xs"
                fontWeight="400"
                noOfLines={1}
              >
                {notice.chainName} is ready
              </Text>
            </HStack>
          </Box>
          <IconButton
            aria-label="Dismiss WalletConnect retry notice"
            icon={<CloseIcon />}
            size="xs"
            variant="ghost"
            onClick={onDismiss}
            flexShrink={0}
          />
        </HStack>
        <Text color="text.secondary" fontSize="xs" fontWeight="400">
          Try connecting{notice.dappName ? ` ${notice.dappName}` : " the dapp"}{" "}
          again from the dapp. The previous WalletConnect request was rejected
          before this chain was available.
        </Text>
      </VStack>
    </ThemedCard>
  );
}
