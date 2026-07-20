import { InfoIcon, WarningIcon } from "@chakra-ui/icons";
import { Box, Button, HStack, Text, VStack } from "@chakra-ui/react";
import ChainIcon from "@/components/ChainIcon";
import { getResolvedChainById } from "@/lib/chains";
import type { NetworksInfo } from "@/types";

export interface FailedTransactionError {
  error: string;
  origin: string;
}

interface FailedTransactionAlertProps {
  error: FailedTransactionError;
  onDismiss: () => void;
}

export function FailedTransactionAlert({
  error,
  onDismiss,
}: FailedTransactionAlertProps) {
  return (
    <Box
      bg="status.error.bg"
      border="1px solid"
      borderColor="status.error.border"
      borderRadius="lg"
      boxShadow="none"
      p={3}
      position="relative"
    >
      <HStack w="full" justify="space-between" mb={2}>
        <HStack>
          <Box display="flex" color="status.error.fg">
            <WarningIcon boxSize={4} />
          </Box>
          <Text fontSize="sm" color="status.error.fg" fontWeight="600">
            Transaction failed
          </Text>
        </HStack>
        <Button
          size="xs"
          variant="ghost"
          color="status.error.fg"
          onClick={onDismiss}
        >
          Dismiss
        </Button>
      </HStack>
      <Text fontSize="xs" color="fg.secondary" mb={1} fontWeight="500">
        {error.origin}
      </Text>
      <Text fontSize="sm" color="status.error.fg" fontWeight="500">
        {error.error}
      </Text>
    </Box>
  );
}

interface RpcIssueAlertProps {
  chainIds: number[];
  networksInfo: NetworksInfo | undefined;
  isDarkTheme: boolean;
  onEditChain: (chainName: string) => void;
  onDismiss: () => void;
}

export function RpcIssueAlert({
  chainIds,
  networksInfo,
  isDarkTheme,
  onEditChain,
  onDismiss,
}: RpcIssueAlertProps) {
  if (chainIds.length === 0) return null;

  const hasResolvedChain = chainIds.some((chainId) =>
    Boolean(getResolvedChainById(chainId, networksInfo)),
  );

  return (
    <Box
      bg={isDarkTheme ? "status.warning.bg" : "status.info.bg"}
      border={isDarkTheme ? "1px solid" : "2px solid"}
      borderColor={isDarkTheme ? "status.warning.border" : "border.default"}
      borderRadius={isDarkTheme ? "md" : undefined}
      boxShadow={isDarkTheme ? undefined : "card"}
      px={3}
      py={2}
    >
      <VStack align="stretch" spacing={1.5}>
        <HStack spacing={2} w="full">
          <Box
            p={1}
            bg={isDarkTheme ? "status.warning.fg" : "accent.secondary"}
            display="flex"
            alignItems="center"
            justifyContent="center"
            flexShrink={0}
            borderRadius={isDarkTheme ? "sm" : undefined}
          >
            <WarningIcon
              color={isDarkTheme ? "fg.inverse" : "accentFg.secondary"}
              boxSize={3}
            />
          </Box>
          <Text
            flex={1}
            minW={0}
            fontSize="2xs"
            fontWeight="800"
            color={isDarkTheme ? "status.warning.fg" : "status.info.fg"}
            textTransform="uppercase"
            letterSpacing="wide"
          >
            RPC issue detected
          </Text>
          <Button
            size="xs"
            variant="ghost"
            color={isDarkTheme ? "status.warning.fg" : "status.info.fg"}
            fontSize="2xs"
            fontWeight="700"
            h="24px"
            minH="24px"
            minW="auto"
            px={1.5}
            flexShrink={0}
            _hover={{ bg: "whiteAlpha.200" }}
            onClick={onDismiss}
          >
            Dismiss
          </Button>
        </HStack>
        <HStack spacing={2} align="center" minW={0}>
          {hasResolvedChain && (
            <HStack spacing={1} flexShrink={0}>
              {chainIds.slice(0, 1).map((chainId) => {
                const chain = getResolvedChainById(chainId, networksInfo);
                if (!chain) return null;
                return (
                  <Button
                    key={chainId}
                    size="xs"
                    variant="ghost"
                    bg="surface.raised"
                    border="1.5px solid"
                    borderColor="border.default"
                    borderRadius={isDarkTheme ? "md" : undefined}
                    px={1.5}
                    h="26px"
                    minH="26px"
                    minW={0}
                    flexShrink={0}
                    _hover={{ bg: "surface.raisedHover" }}
                    onClick={() => onEditChain(chain.name)}
                  >
                    <HStack spacing={1.5}>
                      <ChainIcon
                        chainId={chain.chainId}
                        chainName={chain.name}
                        size="14px"
                        withChip
                      />
                      <Text
                        fontSize="xs"
                        fontWeight="800"
                        color="fg.primary"
                        textTransform="uppercase"
                        letterSpacing="wide"
                      >
                        {chain.name}
                      </Text>
                    </HStack>
                  </Button>
                );
              })}
              {chainIds.length > 1 && (
                <Text
                  fontSize="2xs"
                  fontWeight="700"
                  color={isDarkTheme ? "fg.secondary" : "status.info.fg"}
                  opacity={0.8}
                  whiteSpace="nowrap"
                >
                  +{chainIds.length - 1}
                </Text>
              )}
            </HStack>
          )}
          <Text
            flex={1}
            minW={0}
            fontSize="xs"
            color={isDarkTheme ? "fg.secondary" : "status.info.fg"}
            fontWeight="600"
            lineHeight="short"
            opacity={isDarkTheme ? 1 : 0.9}
          >
            <Text as="span" display="block">
              Balances may be stale.
            </Text>
            <Text as="span" display="block">
              Check RPC settings.
            </Text>
          </Text>
        </HStack>
      </VStack>
    </Box>
  );
}

interface ReloadRequiredAlertProps {
  onReload: () => void | Promise<void>;
}

export function ReloadRequiredAlert({ onReload }: ReloadRequiredAlertProps) {
  return (
    <Box
      bg="status.warning.bg"
      border="1px solid"
      borderColor="status.warning.border"
      borderRadius="lg"
      boxShadow="none"
      p={3}
    >
      <HStack justify="space-between">
        <HStack spacing={2}>
          <Box display="flex" color="status.warning.fg">
            <InfoIcon boxSize={4} />
          </Box>
          <Box>
            <Text fontSize="sm" color="status.warning.fg" fontWeight="600">
              Reload page required
            </Text>
            <Text fontSize="xs" color="fg.secondary" fontWeight="500">
              To apply changes on the current site
            </Text>
          </Box>
        </HStack>
        <Button size="sm" variant="secondary" onClick={onReload}>
          Reload
        </Button>
      </HStack>
    </Box>
  );
}
