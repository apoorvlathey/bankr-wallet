import { Box, HStack, IconButton, Image, Text } from "@chakra-ui/react";
import { CloseIcon, RepeatIcon } from "@chakra-ui/icons";
import WalletConnectLogoIcon from "@/components/WalletConnectLogoIcon";
import {
  EmptyState,
  EmptyStateDescription,
  EmptyStateHeader,
  EmptyStateTitle,
  ListItem,
  ListItemActions,
  ListItemContent,
  ListItemDescription,
  ListItemMedia,
  ListItemTitle,
  ListSurface,
  SkeletonRow,
} from "@/components/ui";
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
  return (
    <Box as="section" aria-labelledby="active-sessions-title">
      <HStack justify="space-between" mb={2}>
        <Box minW={0}>
          <Text id="active-sessions-title" as="h2" fontSize="md" fontWeight="650">
            Active sessions
          </Text>
          <Text color="fg.secondary" fontSize="xs">
            {sessions.length} connected {sessions.length === 1 ? "app" : "apps"}
          </Text>
        </Box>
        <IconButton
          aria-label="Refresh connected apps"
          icon={<RepeatIcon />}
          size="sm"
          variant="ghost"
          onClick={onRefresh}
          isDisabled={isLoading}
        />
      </HStack>

      {isLoading ? (
        <ListSurface aria-label="Loading connected apps">
          <SkeletonRow />
          <SkeletonRow />
        </ListSurface>
      ) : sessions.length === 0 ? (
        <EmptyState>
          <EmptyStateHeader>
            <EmptyStateTitle>No connected apps</EmptyStateTitle>
            <EmptyStateDescription>
              Paste a WalletConnect URI above to start a session.
            </EmptyStateDescription>
          </EmptyStateHeader>
        </EmptyState>
      ) : (
        <ListSurface aria-label="Connected apps">
          {sessions.map((session) => (
            <ListItem key={session.topic}>
              <ListItemMedia>
                <Box
                  boxSize="36px"
                  bg="surface.accentTint"
                  color="accent.secondary"
                  borderRadius="md"
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                  overflow="hidden"
                >
                  {session.icons[0] ? (
                    <Image
                      src={session.icons[0]}
                      alt=""
                      boxSize="36px"
                      objectFit="cover"
                    />
                  ) : (
                    <WalletConnectLogoIcon />
                  )}
                </Box>
              </ListItemMedia>
              <ListItemContent>
                <ListItemTitle noOfLines={1}>{session.name}</ListItemTitle>
                <ListItemDescription noOfLines={1}>
                  {session.url || "WalletConnect session"}
                </ListItemDescription>
              </ListItemContent>
              <ListItemActions>
                <IconButton
                  aria-label={`Disconnect ${session.name}`}
                  title="Disconnect"
                  icon={<CloseIcon />}
                  size="sm"
                  variant="ghost"
                  color="status.error.fg"
                  isLoading={disconnectingTopic === session.topic}
                  onClick={() => onDisconnect(session.topic)}
                />
              </ListItemActions>
            </ListItem>
          ))}
        </ListSurface>
      )}
    </Box>
  );
}
