import { useEffect, useRef } from "react";
import { ChatIcon } from "@chakra-ui/icons";
import { usePrefersReducedMotion, VStack } from "@chakra-ui/react";
import { Message } from "@/chrome/chatStorage";
import {
  EmptyState,
  EmptyStateDescription,
  EmptyStateHeader,
  EmptyStateMedia,
  EmptyStateTitle,
  ScreenBody,
} from "@/components/ui";
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

export function MessageList({
  messages,
  isLoading,
  statusUpdateText,
  isWalletUnlocked,
  onUnlock,
  onRetry,
  onResend,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  // Keep the newest message and Bankr status in view as the job progresses.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "end",
    });
  }, [messages, isLoading, prefersReducedMotion]);

  if (messages.length === 0) {
    return (
      <ScreenBody display="flex" alignItems="center" justifyContent="center">
        <EmptyState>
          <EmptyStateHeader>
            <EmptyStateMedia>
              <ChatIcon boxSize={7} />
            </EmptyStateMedia>
            <EmptyStateTitle>What can Bankr help with?</EmptyStateTitle>
            <EmptyStateDescription>
              Ask about your balances, a token swap, or a DeFi action. Wallet
              approvals still happen in WalletChan before anything is signed.
            </EmptyStateDescription>
          </EmptyStateHeader>
        </EmptyState>
      </ScreenBody>
    );
  }

  return (
    <ScreenBody px={4} py={0}>
      <VStack as="section" aria-label="Conversation" spacing={0} align="stretch">
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
    </ScreenBody>
  );
}

export default MessageList;
