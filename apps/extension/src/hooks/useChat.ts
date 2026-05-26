import { useState, useEffect, useCallback } from "react";
import {
  Message,
  Conversation,
  getConversations,
  getConversation,
  createConversation,
  deleteConversation,
  addMessageToConversation,
  updateMessageInConversation,
  toggleConversationFavorite,
  deleteMessageFromConversation,
} from "@/chrome/chatStorage";

interface UseChatReturn {
  conversations: Conversation[];
  currentConversation: Conversation | null;
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  statusUpdateText: string | null;
  sendMessage: (content: string) => Promise<void>;
  loadConversation: (id: string) => Promise<void>;
  createNewChat: () => Promise<Conversation>;
  deleteChat: (id: string) => Promise<void>;
  toggleFavorite: (id: string) => Promise<void>;
  refreshConversations: () => Promise<void>;
  retryLastMessage: () => Promise<void>;
}

export function useChat(): UseChatReturn {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusUpdateText, setStatusUpdateText] = useState<string | null>(null);
  // Track if current conversation is unsaved (only in memory)
  const [isUnsavedChat, setIsUnsavedChat] = useState(false);

  const refreshConversations = useCallback(async () => {
    const convs = await getConversations();
    setConversations(convs);
  }, []);

  // Load conversations on mount
  useEffect(() => {
    refreshConversations();
  }, [refreshConversations]);

  // Listen for chat updates from background
  useEffect(() => {
    const handleMessage = (
      message: {
        type: string;
        conversationId?: string;
        messageId?: string;
        content?: string;
        error?: string;
        statusUpdates?: Array<{ message: string; timestamp: string }>;
      },
    ) => {
      if (message.type === "chatJobComplete" && message.conversationId) {
        // Clear status update text on completion
        setStatusUpdateText(null);
        // Update the message with the response
        if (currentConversation?.id === message.conversationId && message.messageId) {
          updateMessageInConversation(message.conversationId, message.messageId, {
            content: message.content || "",
            status: message.error ? "error" : "complete",
          }).then((updated) => {
            if (updated) {
              setCurrentConversation(updated);
            }
            setIsLoading(false);
          });
        }
        refreshConversations();
      }

      if (message.type === "chatJobUpdate" && message.conversationId) {
        // Extract the latest status update message
        if (message.statusUpdates && message.statusUpdates.length > 0) {
          const latest = message.statusUpdates[message.statusUpdates.length - 1];
          setStatusUpdateText(latest.message);
        }
        // Refresh conversation to get latest state
        if (currentConversation?.id === message.conversationId) {
          getConversation(message.conversationId).then((conv) => {
            if (conv) {
              setCurrentConversation(conv);
            }
          });
        }
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, [currentConversation?.id, refreshConversations]);

  const loadConversation = useCallback(async (id: string) => {
    const conv = await getConversation(id);
    setCurrentConversation(conv);
    setError(null);
  }, []);

  const createNewChat = useCallback(async () => {
    // Create a temporary conversation in memory (not persisted until first message)
    const now = Date.now();
    const tempConv: Conversation = {
      id: crypto.randomUUID(),
      title: "New Chat",
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    setCurrentConversation(tempConv);
    setIsUnsavedChat(true);
    setError(null);
    return tempConv;
  }, []);

  const deleteChat = useCallback(
    async (id: string) => {
      await deleteConversation(id);
      if (currentConversation?.id === id) {
        setCurrentConversation(null);
      }
      await refreshConversations();
    },
    [currentConversation?.id, refreshConversations]
  );

  const toggleFavorite = useCallback(
    async (id: string) => {
      const updated = await toggleConversationFavorite(id);
      if (updated && currentConversation?.id === id) {
        setCurrentConversation(updated);
      }
      await refreshConversations();
    },
    [currentConversation?.id, refreshConversations]
  );

  const sendMessage = useCallback(
    async (content: string) => {
      if (isLoading) return;

      setError(null);
      setStatusUpdateText(null);
      let conv = currentConversation;

      // Create new conversation if none exists
      if (!conv) {
        const now = Date.now();
        conv = {
          id: crypto.randomUUID(),
          title: "New Chat",
          messages: [],
          createdAt: now,
          updatedAt: now,
        };
        setCurrentConversation(conv);
        setIsUnsavedChat(true);
      }

      // Add user message
      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content,
        timestamp: Date.now(),
        status: "complete",
      };

      // If this is an unsaved chat, persist it now with the first message
      if (isUnsavedChat) {
        // Create the conversation in storage
        const savedConv = await createConversation(
          content.length > 50 ? content.substring(0, 50) + "..." : content
        );
        // Update the ID to match the saved one
        conv = { ...savedConv, messages: [] };
        setIsUnsavedChat(false);
      }

      const updatedWithUser = await addMessageToConversation(conv.id, userMessage);
      if (updatedWithUser) {
        setCurrentConversation(updatedWithUser);
        conv = updatedWithUser;
      }

      // Add pending assistant message
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
        timestamp: Date.now(),
        status: "pending",
      };

      const updatedWithAssistant = await addMessageToConversation(conv.id, assistantMessage);
      if (updatedWithAssistant) {
        setCurrentConversation(updatedWithAssistant);
      }

      setIsLoading(true);

      // Send to background
      try {
        const response = await new Promise<{
          success: boolean;
          error?: string;
        }>((resolve) => {
          chrome.runtime.sendMessage(
            {
              type: "submitChatPrompt",
              conversationId: conv!.id,
              messageId: assistantMessage.id,
              prompt: content,
            },
            (res) => {
              if (chrome.runtime.lastError) {
                resolve({
                  success: false,
                  error: chrome.runtime.lastError.message,
                });
              } else {
                resolve(res || { success: false, error: "No response" });
              }
            }
          );
        });

        if (!response.success) {
          // Update message with error
          const errorContent = response.error || "Failed to send message";
          const isWalletLocked = errorContent.includes("Wallet is locked");
          await updateMessageInConversation(conv!.id, assistantMessage.id, {
            content: errorContent,
            status: "error",
            isWalletLockedError: isWalletLocked,
          });
          const updated = await getConversation(conv!.id);
          if (updated) {
            setCurrentConversation(updated);
          }
          setIsLoading(false);
          setError(errorContent);
        }
        // If success, the background will send chatJobComplete when done
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        const isWalletLocked = errorMsg.includes("Wallet is locked");
        await updateMessageInConversation(conv!.id, assistantMessage.id, {
          content: errorMsg,
          status: "error",
          isWalletLockedError: isWalletLocked,
        });
        const updated = await getConversation(conv!.id);
        if (updated) {
          setCurrentConversation(updated);
        }
        setIsLoading(false);
        setError(errorMsg);
      }

      await refreshConversations();
    },
    [currentConversation, isLoading, isUnsavedChat, refreshConversations]
  );

  const retryLastMessage = useCallback(async () => {
    if (!currentConversation || isLoading) return;

    const messages = currentConversation.messages;
    if (messages.length < 2) return;

    // Find the last error assistant message
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role !== "assistant" || lastMessage.status !== "error") return;

    // Find the last user message (should be right before the error)
    const lastUserMessage = messages[messages.length - 2];
    if (lastUserMessage.role !== "user") return;

    // Delete the error message
    const updatedConv = await deleteMessageFromConversation(
      currentConversation.id,
      lastMessage.id
    );
    if (updatedConv) {
      setCurrentConversation(updatedConv);
    }

    // Re-send the last user message content (but don't add a new user message)
    setError(null);
    setIsLoading(true);

    // Add pending assistant message
    const assistantMessage: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      timestamp: Date.now(),
      status: "pending",
    };

    const convWithAssistant = await addMessageToConversation(
      currentConversation.id,
      assistantMessage
    );
    if (convWithAssistant) {
      setCurrentConversation(convWithAssistant);
    }

    // Send to background
    try {
      const response = await new Promise<{
        success: boolean;
        error?: string;
      }>((resolve) => {
        chrome.runtime.sendMessage(
          {
            type: "submitChatPrompt",
            conversationId: currentConversation.id,
            messageId: assistantMessage.id,
            prompt: lastUserMessage.content,
          },
          (res) => {
            if (chrome.runtime.lastError) {
              resolve({
                success: false,
                error: chrome.runtime.lastError.message,
              });
            } else {
              resolve(res || { success: false, error: "No response" });
            }
          }
        );
      });

      if (!response.success) {
        const errorContent = response.error || "Failed to send message";
        const isWalletLocked = errorContent.includes("Wallet is locked");
        await updateMessageInConversation(currentConversation.id, assistantMessage.id, {
          content: errorContent,
          status: "error",
          isWalletLockedError: isWalletLocked,
        });
        const updated = await getConversation(currentConversation.id);
        if (updated) {
          setCurrentConversation(updated);
        }
        setIsLoading(false);
        setError(errorContent);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      const isWalletLocked = errorMsg.includes("Wallet is locked");
      await updateMessageInConversation(currentConversation.id, assistantMessage.id, {
        content: errorMsg,
        status: "error",
        isWalletLockedError: isWalletLocked,
      });
      const updated = await getConversation(currentConversation.id);
      if (updated) {
        setCurrentConversation(updated);
      }
      setIsLoading(false);
      setError(errorMsg);
    }

    await refreshConversations();
  }, [currentConversation, isLoading, refreshConversations]);

  return {
    conversations,
    currentConversation,
    messages: currentConversation?.messages || [],
    isLoading,
    error,
    statusUpdateText,
    sendMessage,
    loadConversation,
    createNewChat,
    deleteChat,
    toggleFavorite,
    refreshConversations,
    retryLastMessage,
  };
}

export default useChat;
