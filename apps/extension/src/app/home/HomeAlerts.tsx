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
      <HStack align="start" spacing={2}>
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
        <Box flex={1} minW={0}>
          <Text
            fontSize="2xs"
            fontWeight="800"
            color={isDarkTheme ? "status.warning.fg" : "status.info.fg"}
            textTransform="uppercase"
            letterSpacing="wide"
            mb={1}
          >
            RPC Issue Detected
          </Text>
          {hasResolvedChain ? (
            <VStack align="start" spacing={1}>
              <HStack spacing={2} flexWrap="wrap">
                {chainIds.slice(0, 2).map((chainId) => {
                  const chain = getResolvedChainById(chainId, networksInfo);
                  if (!chain) return null;
                  return (
                    <HStack
                      key={chainId}
                      spacing={1.5}
                      bg="surface.raised"
                      border="1.5px solid"
                      borderColor="border.default"
                      borderRadius={isDarkTheme ? "md" : undefined}
                      px={1.5}
                      py={1}
                      cursor="pointer"
                      _hover={{ bg: "bg.muted" }}
                      onClick={() => onEditChain(chain.name)}
                    >
                      <ChainIcon
                        chainId={chain.chainId}
                        chainName={chain.name}
                        size="14px"
                        withChip
                      />
                      <Text
                        fontSize="xs"
                        fontWeight="800"
                        color="text.primary"
                        textTransform="uppercase"
                        letterSpacing="wide"
                      >
                        {chain.name}
                      </Text>
                    </HStack>
                  );
                })}
                {chainIds.length > 2 && (
                  <Text
                    fontSize="2xs"
                    fontWeight="700"
                    color={isDarkTheme ? "fg.secondary" : "status.info.fg"}
                    opacity={0.8}
                  >
                    +{chainIds.length - 2} more
                  </Text>
                )}
              </HStack>
              <Text
                fontSize="xs"
                color={isDarkTheme ? "fg.secondary" : "status.info.fg"}
                fontWeight="600"
                opacity={isDarkTheme ? 1 : 0.9}
              >
                Balance fetch failed. Edit the chain RPC if this persists.
              </Text>
            </VStack>
          ) : (
            <Text
              fontSize="xs"
              color={isDarkTheme ? "fg.secondary" : "status.info.fg"}
              fontWeight="600"
              opacity={isDarkTheme ? 1 : 0.9}
            >
              Balance fetch failed for one or more chains. Edit the chain RPC
              if this persists.
            </Text>
          )}
        </Box>
        <Button
          size="xs"
          variant="ghost"
          color={isDarkTheme ? "status.warning.fg" : "status.info.fg"}
          fontWeight="700"
          _hover={{ bg: "whiteAlpha.200" }}
          onClick={onDismiss}
        >
          Dismiss
        </Button>
      </HStack>
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
