import { Box, HStack, IconButton, Image, Text, VStack } from "@chakra-ui/react";
import { CloseIcon, RepeatIcon } from "@chakra-ui/icons";
import WalletConnectLogoIcon from "@/components/WalletConnectLogoIcon";
import { isDarkThemeId, ThemedCard, useTheme } from "@/theme";
import type { WalletConnectSessionSummary } from "@/types/walletConnect";

interface WalletConnectSessionsListProps {
  sessions: WalletConnectSessionSummary[];
  isLoading: boolean;
  disconnectingTopic: string | null;
  onDisconnect: (topic: string) => void;
  onRefresh: () => void;
}

export default function WalletConnectSessionsList({
  sessions,
  isLoading,
  disconnectingTopic,
  onDisconnect,
  onRefresh,
}: WalletConnectSessionsListProps) {
  const { themeId } = useTheme();
  const isDarkTheme = isDarkThemeId(themeId);

  return (
    <>
      <HStack justify="space-between">
        <Box minW={0}>
          <Text
            color="text.primary"
            fontSize="sm"
            fontWeight="900"
            textTransform="uppercase"
          >
            Connected Dapps
          </Text>
          <Text color="text.secondary" fontSize="xs" fontWeight="600">
            {sessions.length} active session{sessions.length === 1 ? "" : "s"}
          </Text>
        </Box>
        <IconButton
          aria-label="Refresh sessions"
          icon={<RepeatIcon />}
          size="sm"
          variant="ghost"
          onClick={onRefresh}
        />
      </HStack>

      <VStack align="stretch" spacing={2}>
        {isLoading ? (
          <ThemedCard weight="thin">
            <Text color="text.secondary" fontSize="xs" fontWeight="700">
              Loading sessions...
            </Text>
          </ThemedCard>
        ) : sessions.length === 0 ? (
          <ThemedCard weight="thin">
            <Text color="text.secondary" fontSize="xs" fontWeight="700">
              No connected dapps.
            </Text>
          </ThemedCard>
        ) : (
          sessions.map((session) => (
            <ThemedCard key={session.topic} weight="thin">
              <HStack spacing={3} minW={0}>
                <Box
                  w="36px"
                  h="36px"
                  bg="accent.secondary"
                  color="accentFg.secondary"
                  borderRadius={isDarkTheme ? "md" : undefined}
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                  overflow="hidden"
                  flexShrink={0}
                >
                  {session.icons[0] ? (
                    <Image
                      src={session.icons[0]}
                      alt=""
                      w="100%"
                      h="100%"
                      objectFit="cover"
                    />
                  ) : (
                    <WalletConnectLogoIcon />
                  )}
                </Box>
                <Box minW={0} flex={1}>
                  <Text
                    color="text.primary"
                    fontSize="sm"
                    fontWeight="900"
                    lineHeight="1.1"
                    noOfLines={1}
                  >
                    {session.name}
                  </Text>
                  <Text
                    color="text.secondary"
                    fontSize="xs"
                    fontWeight="600"
                    noOfLines={1}
                  >
                    {session.url || "WalletConnect session"}
                  </Text>
                </Box>
                <IconButton
                  aria-label={`Disconnect ${session.name}`}
                  icon={<CloseIcon />}
                  size="sm"
                  variant="ghost"
                  isLoading={disconnectingTopic === session.topic}
                  onClick={() => onDisconnect(session.topic)}
                />
              </HStack>
            </ThemedCard>
          ))
        )}
      </VStack>
    </>
  );
}
