import { useState, useEffect, useCallback } from "react";
import { Box } from "@chakra-ui/react";
import { useChat } from "@/hooks/useChat";
import { AppScreen } from "@/components/ui";
import ChatHeader from "./ChatHeader";
import ChatList from "./ChatList";
import MessageList from "./MessageList";
import ChatInput from "./ChatInput";

interface ChatViewProps {
  onBack: () => void;
  startWithNewChat?: boolean;
  returnToConversationId?: string | null;
  onUnlock?: (conversationId?: string) => void;
  isWalletUnlocked?: boolean;
  onWalletLocked?: () => void;
}

type ChatMode = "list" | "chat";

export function ChatView({ onBack, startWithNewChat = false, returnToConversationId, onUnlock, isWalletUnlocked, onWalletLocked }: ChatViewProps) {
  const {
    conversations,
    currentConversation,
    messages,
    isLoading,
    statusUpdateText,
    sendMessage,
    loadConversation,
    createNewChat,
    deleteChat,
    toggleFavorite,
    refreshConversations,
    retryLastMessage,
  } = useChat();

  // Determine initial mode based on props
  const getInitialMode = (): ChatMode => {
    if (startWithNewChat || returnToConversationId) return "chat";
    return "list";
  };

  const [mode, setMode] = useState<ChatMode>(getInitialMode());
  const [hasInitialized, setHasInitialized] = useState(false);
  // Track if user entered chat directly (via footer button) vs via chat history
  const [enteredDirectly, setEnteredDirectly] = useState(startWithNewChat || !!returnToConversationId);

  // Refresh conversations and optionally create new chat or load specific conversation on mount
  useEffect(() => {
    const init = async () => {
      await refreshConversations();
      if (hasInitialized) return;

      if (returnToConversationId) {
        // Return to a specific conversation (e.g., after unlock)
        await loadConversation(returnToConversationId);
        setHasInitialized(true);
      } else if (startWithNewChat) {
        await createNewChat();
        setHasInitialized(true);
      }
    };
    init();
  }, [refreshConversations, startWithNewChat, returnToConversationId, hasInitialized, createNewChat, loadConversation]);

  // Track wallet locked errors to detect NEW ones (not old ones from loaded conversations)
  // We track the ID of the last processed wallet locked error to avoid re-triggering
  const [trackedConversationId, setTrackedConversationId] = useState<string | null>(null);
  const [processedErrorIds, setProcessedErrorIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const currentConvId = currentConversation?.id || null;

    // Reset tracking when conversation changes
    if (currentConvId !== trackedConversationId) {
      setTrackedConversationId(currentConvId);
      // Mark all existing wallet locked errors as already processed
      const existingErrorIds = new Set(
        messages
          .filter((m) => m.status === "error" && m.isWalletLockedError)
          .map((m) => m.id)
      );
      setProcessedErrorIds(existingErrorIds);
      return;
    }

    // Check for any NEW wallet locked errors (not already processed)
    const walletLockedErrors = messages.filter(
      (m) => m.status === "error" && m.isWalletLockedError
    );

    for (const error of walletLockedErrors) {
      if (!processedErrorIds.has(error.id)) {
        // New error found - trigger callback and mark as processed
        if (onWalletLocked) {
          onWalletLocked();
        }
        setProcessedErrorIds((prev) => new Set([...prev, error.id]));
        break; // Only trigger once per render
      }
    }
  }, [messages, currentConversation?.id, onWalletLocked, trackedConversationId, processedErrorIds]);

  const handleSelectConversation = useCallback(
    async (id: string) => {
      await loadConversation(id);
      setEnteredDirectly(false); // Came from list, not directly
      setMode("chat");
    },
    [loadConversation]
  );

  const handleNewChat = useCallback(async () => {
    await createNewChat();
    setEnteredDirectly(false); // Came from list, not directly
    setMode("chat");
  }, [createNewChat]);

  const handleDeleteChat = useCallback(async () => {
    if (currentConversation) {
      await deleteChat(currentConversation.id);
      if (enteredDirectly) {
        onBack();
      } else {
        setMode("list");
      }
    }
  }, [currentConversation, deleteChat, enteredDirectly, onBack]);

  const handleBackFromChat = useCallback(() => {
    if (enteredDirectly) {
      // Came from footer button, go back to homepage
      onBack();
    } else {
      // Came from chat history, go back to list
      setMode("list");
    }
  }, [enteredDirectly, onBack]);

  const handleBackFromList = useCallback(() => {
    onBack();
  }, [onBack]);

  const handleDeleteConversation = useCallback(
    async (id: string) => {
      await deleteChat(id);
    },
    [deleteChat]
  );

  const handleToggleFavorite = useCallback(
    async (id: string) => {
      await toggleFavorite(id);
    },
    [toggleFavorite]
  );

  // Handle unlock - pass current conversation ID so we can return to it
  const handleUnlock = useCallback(() => {
    if (onUnlock) {
      onUnlock(currentConversation?.id);
    }
  }, [onUnlock, currentConversation?.id]);

  // List view
  if (mode === "list") {
    return (
      <ChatList
        conversations={conversations}
        onBack={handleBackFromList}
        onSelectConversation={handleSelectConversation}
        onNewChat={handleNewChat}
        onDeleteConversation={handleDeleteConversation}
        onToggleFavorite={handleToggleFavorite}
      />
    );
  }

  // Chat view
  return (
    <AppScreen stickyActionClearance={0}>
      <ChatHeader
        title={currentConversation?.title || "New Chat"}
        onBack={handleBackFromChat}
        onNewChat={handleNewChat}
        onDelete={handleDeleteChat}
        showDelete={!!currentConversation && messages.length > 0}
      />

      <MessageList
        messages={messages}
        isLoading={isLoading}
        statusUpdateText={statusUpdateText}
        isWalletUnlocked={isWalletUnlocked}
        onUnlock={handleUnlock}
        onRetry={retryLastMessage}
        onResend={sendMessage}
      />

      <Box
        as="footer"
        w="full"
        flexShrink={0}
        bg="surface.raised"
        borderTop="1px solid"
        borderColor="border.subtle"
        px={4}
        pt={3}
        pb="calc(12px + env(safe-area-inset-bottom, 0px))"
      >
        <ChatInput onSend={sendMessage} isLoading={isLoading} />
      </Box>
    </AppScreen>
  );
}

export default ChatView;
