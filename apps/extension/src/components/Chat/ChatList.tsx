import {
  Box,
  VStack,
  HStack,
  Text,
  Flex,
  IconButton,
  Button,
  Tooltip,
} from "@chakra-ui/react";
import { ArrowBackIcon, AddIcon, ChatIcon, DeleteIcon, StarIcon } from "@chakra-ui/icons";
import { Conversation } from "@/chrome/chatStorage";
import { useStripTokens } from "@/theme";
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
  // Same dark-strip pair used by ChatHeader and other inverted bars across
  // the extension — see useStripTokens.
  const { bg: stripBg, fg: stripFg } = useStripTokens();

  return (
    <Box h="100%" display="flex" flexDirection="column" bg="surface.base">
      {/* Header */}
      <Flex
        py={2}
        px={3}
        bg={stripBg}
        alignItems="center"
        position="relative"
      >
        <Box
          position="absolute"
          bottom="0"
          left="0"
          right="0"
          h="2px"
          bg="accent.highlight"
        />

        <IconButton
          aria-label="Back"
          icon={<ArrowBackIcon />}
          variant="ghost"
          size="sm"
          color={stripFg}
          _hover={{ bg: "whiteAlpha.200" }}
          onClick={onBack}
          mr={2}
        />

        <Text
          fontWeight="700"
          color={stripFg}
          fontSize="sm"
          flex="1"
          textTransform="uppercase"
          letterSpacing="wide"
        >
          Chat History
        </Text>

        <IconButton
          aria-label="New chat"
          icon={<AddIcon />}
          size="sm"
          bg="accent.highlight"
          color="accentFg.highlight"
          border="2px solid"
          borderColor="border.default"
          borderRadius="md"
          _hover={{
            bg: "accent.highlight",
            transform: "translateY(-1px)",
          }}
          _active={{
            transform: "translate(1px, 1px)",
          }}
          onClick={onNewChat}
        />
      </Flex>

      {/* Conversation List */}
      <Box flex="1" overflowY="auto" p={3}>
        {conversations.length === 0 ? (
          <VStack spacing={4} py={8}>
            <Box
              w="50px"
              h="50px"
              border="3px solid"
              borderColor="border.default"
              bg="accent.secondary"
              display="flex"
              alignItems="center"
              justifyContent="center"
              boxShadow="card"
            >
              <ChatIcon color="accentFg.secondary" boxSize={6} />
            </Box>
            <Text
              color="text.secondary"
              fontSize="sm"
              fontWeight="700"
              textTransform="uppercase"
              letterSpacing="wider"
              textAlign="center"
            >
              No conversations yet
            </Text>
            <Button
              onClick={onNewChat}
              bg="accent.highlight"
              color="accentFg.highlight"
              border="3px solid"
              borderColor="border.default"
              boxShadow="card"
              borderRadius="md"
              fontWeight="700"
              textTransform="uppercase"
              letterSpacing="wide"
              _hover={{
                transform: "translateY(-2px)",
                boxShadow: "cardHover",
              }}
              _active={{
                transform: "translate(2px, 2px)",
                boxShadow: "none",
              }}
            >
              Start New Chat
            </Button>
          </VStack>
        ) : (
          <VStack spacing={2} align="stretch">
            {conversations.map((conv) => (
              <HStack
                key={conv.id}
                spacing={0}
                bg="surface.raised"
                border="3px solid"
                borderColor="border.default"
                borderRadius="md"
                boxShadow="card"
                position="relative"
                transition="all 0.2s ease-out"
                _hover={{
                  transform: "translateY(-2px)",
                  boxShadow: "cardHover",
                }}
              >
                {/* Star/Favorite Button - Top Left Corner */}
                <Tooltip
                  label={conv.favorite ? "Unfavorite" : "Favorite"}
                  placement="top"
                  hasArrow
                >
                  <IconButton
                    aria-label={conv.favorite ? "Remove from favorites" : "Add to favorites"}
                    icon={<StarIcon boxSize={3} />}
                    position="absolute"
                    top="-8px"
                    left="-8px"
                    size="xs"
                    minW="20px"
                    h="20px"
                    bg={conv.favorite ? "accent.highlight" : "surface.raised"}
                    color={conv.favorite ? "accentFg.highlight" : "text.tertiary"}
                    border="2px solid"
                    borderColor="border.default"
                    borderRadius="sm"
                    zIndex={1}
                    _hover={{
                      bg: "accent.highlight",
                      color: "accentFg.highlight",
                      transform: "scale(1.1)",
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleFavorite(conv.id);
                    }}
                  />
                </Tooltip>

                {/* Main Content - Clickable */}
                <Box
                  flex="1"
                  minW={0}
                  p={3}
                  pl={4}
                  cursor="pointer"
                  overflow="hidden"
                  onClick={() => onSelectConversation(conv.id)}
                  _active={{
                    transform: "translate(1px, 1px)",
                  }}
                >
                  <Text
                    fontWeight="700"
                    fontSize="sm"
                    color="text.primary"
                    noOfLines={1}
                    mb={1}
                  >
                    {conv.title}
                  </Text>
                  <Text
                    fontSize="xs"
                    color="text.tertiary"
                    fontWeight="500"
                  >
                    {formatTimestamp(conv.updatedAt)}
                  </Text>
                </Box>

                {/* Delete Button */}
                <IconButton
                  aria-label="Delete conversation"
                  icon={<DeleteIcon />}
                  size="sm"
                  variant="ghost"
                  color="text.tertiary"
                  borderRadius="md"
                  h="full"
                  minW="36px"
                  _hover={{
                    color: "chart.negative",
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteConversation(conv.id);
                  }}
                />
              </HStack>
            ))}
          </VStack>
        )}
      </Box>
    </Box>
  );
}

export default ChatList;
