import {
  Box,
  Button,
  HStack,
  IconButton,
  Text,
} from "@chakra-ui/react";
import { AddIcon, ChatIcon, DeleteIcon, StarIcon } from "@chakra-ui/icons";
import type { Conversation } from "@/chrome/bankr/chat/storage";
import {
  AppHeader,
  AppScreen,
  EmptyState,
  EmptyStateActions,
  EmptyStateDescription,
  EmptyStateHeader,
  EmptyStateMedia,
  EmptyStateTitle,
  ListItem,
  ListItemActions,
  ListItemContent,
  ListItemDescription,
  ListItemTitle,
  ListSurface,
  ScreenBody,
} from "@/components/ui";
import { formatRelativeTime } from "@/lib/timeFormatUtils";

interface ChatListProps {
  conversations: Conversation[];
  onBack: () => void;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  onDeleteConversation: (id: string) => void;
  onToggleFavorite: (id: string) => void;
}

const formatTimestamp = formatRelativeTime;

export function ChatList({
  conversations,
  onBack,
  onSelectConversation,
  onNewChat,
  onDeleteConversation,
  onToggleFavorite,
}: ChatListProps) {
  return (
    <AppScreen>
      <AppHeader
        title="Chat history"
        onBack={onBack}
        backLabel="Back from chat history"
        trailing={
          <IconButton
            aria-label="Start a new chat"
            icon={<AddIcon boxSize={4} />}
            variant="ghost"
            minW="44px"
            w="44px"
            h="44px"
            onClick={onNewChat}
          />
        }
      />

      <ScreenBody pt={4}>
        {conversations.length === 0 ? (
          <EmptyState minH="100%">
            <EmptyStateHeader>
              <EmptyStateMedia>
                <ChatIcon boxSize={7} />
              </EmptyStateMedia>
              <EmptyStateTitle>No conversations yet</EmptyStateTitle>
              <EmptyStateDescription>
                Ask Bankr to check balances, plan a swap, or explain a DeFi action.
              </EmptyStateDescription>
            </EmptyStateHeader>
            <EmptyStateActions>
              <Button variant="primary" onClick={onNewChat}>
                Start a new chat
              </Button>
            </EmptyStateActions>
          </EmptyState>
        ) : (
          <Box as="section" aria-labelledby="conversation-list-title">
            <Text
              id="conversation-list-title"
              as="h2"
              color="fg.secondary"
              fontSize="sm"
              fontWeight={600}
              mb={3}
            >
              Recent conversations
            </Text>

            <ListSurface>
              {conversations.map((conversation) => (
                <ListItem key={conversation.id}>
                  <IconButton
                    aria-label={
                      conversation.favorite
                        ? `Remove ${conversation.title} from favorites`
                        : `Add ${conversation.title} to favorites`
                    }
                    aria-pressed={conversation.favorite || false}
                    icon={<StarIcon boxSize={4} />}
                    variant="ghost"
                    minW="44px"
                    w="44px"
                    h="44px"
                    flexShrink={0}
                    color={conversation.favorite ? "accent.highlight" : "fg.muted"}
                    onClick={() => onToggleFavorite(conversation.id)}
                  />

                  <HStack
                    as="button"
                    type="button"
                    flex="1 1 auto"
                    minW={0}
                    minH="56px"
                    align="center"
                    textAlign="start"
                    borderRadius="md"
                    px={1}
                    py={2}
                    transitionProperty="background-color"
                    transitionDuration="fast"
                    _hover={{ bg: "surface.raisedHover" }}
                    _active={{ bg: "surface.sunken" }}
                    _focus={{ outline: "none" }}
                    _focusVisible={{ boxShadow: "focus" }}
                    onClick={() => onSelectConversation(conversation.id)}
                  >
                    <ListItemContent>
                      <ListItemTitle noOfLines={1}>
                        {conversation.title}
                      </ListItemTitle>
                      <ListItemDescription>
                        {formatTimestamp(conversation.updatedAt)}
                        {conversation.favorite ? " · Favorite" : ""}
                      </ListItemDescription>
                    </ListItemContent>
                  </HStack>

                  <ListItemActions>
                    <IconButton
                      aria-label={`Delete ${conversation.title}`}
                      icon={<DeleteIcon boxSize={4} />}
                      variant="ghost"
                      minW="44px"
                      w="44px"
                      h="44px"
                      color="fg.muted"
                      _hover={{ color: "chart.negative", bg: "status.error.bg" }}
                      onClick={() => onDeleteConversation(conversation.id)}
                    />
                  </ListItemActions>
                </ListItem>
              ))}
            </ListSurface>
          </Box>
        )}
      </ScreenBody>
    </AppScreen>
  );
}

export default ChatList;
