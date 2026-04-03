import {
  Box,
  VStack,
  HStack,
  Text,
  Flex,
  IconButton,
  Button,
  Tooltip,
  Badge,
} from "@chakra-ui/react";
import { ArrowBackIcon, AddIcon, ChatIcon, DeleteIcon, StarIcon } from "@chakra-ui/icons";
import { Conversation } from "@/chrome/chatStorage";

interface ChatListProps {
  conversations: Conversation[];
  onBack: () => void;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  onDeleteConversation: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  showAllAddresses?: boolean;
  onToggleShowAll?: () => void;
}

function truncateAddress(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatTimestamp(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) {
    return "Just now";
  } else if (diff < hour) {
    const mins = Math.floor(diff / minute);
    return `${mins} min${mins > 1 ? "s" : ""} ago`;
  } else if (diff < day) {
    const hours = Math.floor(diff / hour);
    return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  } else if (diff < 2 * day) {
    return "Yesterday";
  } else {
    return new Date(timestamp).toLocaleDateString();
  }
}

export function ChatList({
  conversations,
  onBack,
  onSelectConversation,
  onNewChat,
  onDeleteConversation,
  onToggleFavorite,
  showAllAddresses = false,
  onToggleShowAll,
}: ChatListProps) {
  return (
    <Box h="100%" display="flex" flexDirection="column" bg="bg.base">
      {/* Header */}
      <Flex
        py={2}
        px={3}
        bg="bauhaus.black"
        alignItems="center"
        position="relative"
      >
        <Box
          position="absolute"
          bottom="0"
          left="0"
          right="0"
          h="2px"
          bg="bauhaus.yellow"
        />

        <IconButton
          aria-label="Back"
          icon={<ArrowBackIcon />}
          variant="ghost"
          size="sm"
          color="bauhaus.white"
          _hover={{ bg: "whiteAlpha.200" }}
          onClick={onBack}
          mr={2}
        />

        <Text
          fontWeight="700"
          color="bauhaus.white"
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
          bg="bauhaus.yellow"
          color="bauhaus.black"
          border="2px solid"
          borderColor="bauhaus.black"
          borderRadius="0"
          _hover={{
            bg: "bauhaus.yellow",
            transform: "translateY(-1px)",
          }}
          _active={{
            transform: "translate(1px, 1px)",
          }}
          onClick={onNewChat}
        />
      </Flex>

      {/* All Wallets Toggle */}
      {onToggleShowAll && (
        <HStack px={3} py={2} spacing={2} borderBottom="2px solid" borderColor="gray.200">
          <Text fontSize="xs" fontWeight="700" color="text.secondary" textTransform="uppercase" letterSpacing="wide" flex="1">
            All wallets
          </Text>
          <Button
            size="xs"
            bg={showAllAddresses ? "bauhaus.yellow" : "gray.200"}
            color="bauhaus.black"
            border="2px solid"
            borderColor="bauhaus.black"
            borderRadius="0"
            fontWeight="700"
            fontSize="10px"
            textTransform="uppercase"
            h="22px"
            _hover={{ opacity: 0.8 }}
            onClick={onToggleShowAll}
          >
            {showAllAddresses ? "ON" : "OFF"}
          </Button>
        </HStack>
      )}

      {/* Conversation List */}
      <Box flex="1" overflowY="auto" p={3}>
        {conversations.length === 0 ? (
          <VStack spacing={4} py={8}>
            <Box
              w="50px"
              h="50px"
              border="3px solid"
              borderColor="bauhaus.black"
              bg="bauhaus.blue"
              display="flex"
              alignItems="center"
              justifyContent="center"
              boxShadow="4px 4px 0px 0px #121212"
            >
              <ChatIcon color="bauhaus.white" boxSize={6} />
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
              bg="bauhaus.yellow"
              color="bauhaus.black"
              border="3px solid"
              borderColor="bauhaus.black"
              boxShadow="4px 4px 0px 0px #121212"
              borderRadius="0"
              fontWeight="700"
              textTransform="uppercase"
              letterSpacing="wide"
              _hover={{
                transform: "translateY(-2px)",
                boxShadow: "6px 6px 0px 0px #121212",
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
                bg="bauhaus.white"
                border="3px solid"
                borderColor="bauhaus.black"
                boxShadow="4px 4px 0px 0px #121212"
                position="relative"
                transition="all 0.2s ease-out"
                _hover={{
                  transform: "translateY(-2px)",
                  boxShadow: "6px 6px 0px 0px #121212",
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
                    bg={conv.favorite ? "bauhaus.yellow" : "bauhaus.white"}
                    color={conv.favorite ? "bauhaus.black" : "text.tertiary"}
                    border="2px solid"
                    borderColor="bauhaus.black"
                    borderRadius="0"
                    zIndex={1}
                    _hover={{
                      bg: "bauhaus.yellow",
                      color: "bauhaus.black",
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
                  <HStack spacing={2}>
                    <Text
                      fontSize="xs"
                      color="text.tertiary"
                      fontWeight="500"
                    >
                      {formatTimestamp(conv.updatedAt)}
                    </Text>
                    {showAllAddresses && conv.address && (
                      <Badge
                        bg="gray.100"
                        color="text.secondary"
                        border="1px solid"
                        borderColor="gray.300"
                        fontSize="10px"
                        fontWeight="600"
                        fontFamily="mono"
                        px={1}
                        py={0}
                        borderRadius="0"
                      >
                        {truncateAddress(conv.address)}
                      </Badge>
                    )}
                  </HStack>
                </Box>

                {/* Delete Button */}
                <IconButton
                  aria-label="Delete conversation"
                  icon={<DeleteIcon />}
                  size="sm"
                  variant="ghost"
                  color="text.tertiary"
                  borderRadius="0"
                  h="full"
                  minW="36px"
                  _hover={{
                    color: "bauhaus.red",
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
