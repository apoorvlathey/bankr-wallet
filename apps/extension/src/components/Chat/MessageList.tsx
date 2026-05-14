import { useEffect, useRef } from "react";
import { Box, VStack, Text } from "@chakra-ui/react";
import { Message } from "@/chrome/chatStorage";
import MessageBubble from "./MessageBubble";

interface MessageListProps {
  messages: Message[];
  isLoading?: boolean;
  statusUpdateText?: string | null;
  isWalletUnlocked?: boolean;
  onUnlock?: () => void;
  onRetry?: () => void;
  onResend?: (content: string) => void;
}

export function MessageList({ messages, isLoading, statusUpdateText, isWalletUnlocked, onUnlock, onRetry, onResend }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  if (messages.length === 0) {
    return (
      <Box
        flex="1"
        display="flex"
        alignItems="center"
        justifyContent="center"
        p={4}
      >
        <VStack spacing={3}>
          <Box
            w="40px"
            h="40px"
            border="3px solid"
            borderColor="border.default"
            bg="accent.highlight"
            color="accentFg.highlight"
            display="flex"
            alignItems="center"
            justifyContent="center"
          >
            <Text fontSize="xl" fontWeight="900">
              ?
            </Text>
          </Box>
          <Text
            color="text.secondary"
            fontSize="sm"
            fontWeight="700"
            textTransform="uppercase"
            letterSpacing="wider"
            textAlign="center"
          >
            Start a conversation
          </Text>
          <Text
            color="text.tertiary"
            fontSize="xs"
            textAlign="center"
            maxW="200px"
          >
            Ask Bankr to check balances, swap tokens, or help with DeFi
          </Text>
        </VStack>
      </Box>
    );
  }

  return (
    <Box
      flex="1"
      w="100%"
      overflowY="auto"
      px={2}
      py={2}
      css={{
        "&::-webkit-scrollbar": {
          width: "6px",
        },
        "&::-webkit-scrollbar-track": {
          background: "transparent",
        },
        "&::-webkit-scrollbar-thumb": {
          background: "var(--chakra-colors-border-strong)",
          borderRadius: "0",
        },
      }}
    >
      <VStack spacing={0} align="stretch">
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            statusText={message.status === "pending" ? statusUpdateText : undefined}
            isWalletUnlocked={isWalletUnlocked}
            onUnlock={onUnlock}
            onRetry={onRetry}
            onResend={onResend}
          />
        ))}
        <div ref={bottomRef} />
      </VStack>
    </Box>
  );
}

export default MessageList;
