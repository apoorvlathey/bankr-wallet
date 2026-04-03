/**
 * Chat prompt handlers for Bankr AI chat and local Ollama chat
 * Routes to Bankr API (bankr accounts) or Ollama (PK/SP accounts)
 */

import {
  submitChatPrompt,
  pollChatJobUntilComplete,
  ChatMessage,
} from "./chatApi";
import {
  getConversation,
  updateMessageInConversation,
} from "./chatStorage";
import {
  getCachedApiKey,
  getAutoLockTimeout,
  tryRestoreSession,
} from "./sessionCache";
import { handleUnlockWallet } from "./authHandlers";
import { getActiveAccount } from "./accountStorage";
import { handleOllamaChatPrompt } from "./ollamaHandlers";
import { getOllamaSettings } from "./ollamaApi";

/**
 * Handles chat prompt submission - routes to Ollama for PK/SP or Bankr API for bankr accounts
 */
export async function handleSubmitChatPrompt(
  conversationId: string,
  messageId: string,
  prompt: string,
  chainId?: number
): Promise<{ success: boolean; error?: string }> {
  // Check account type to route chat
  const activeAccount = await getActiveAccount();

  if (
    activeAccount &&
    (activeAccount.type === "privateKey" ||
      activeAccount.type === "seedPhrase")
  ) {
    // Route to Ollama handler for PK/SP accounts
    const ollamaSettings = await getOllamaSettings();
    if (!ollamaSettings.enabled) {
      chrome.runtime
        .sendMessage({
          type: "chatJobComplete",
          conversationId,
          messageId,
          error:
            "Local AI chat is not configured. Enable Ollama in Settings → Local AI Chat.",
        })
        .catch(() => {});
      return {
        success: false,
        error: "Local AI chat is not configured",
      };
    }
    return handleOllamaChatPrompt(
      conversationId,
      messageId,
      prompt,
      activeAccount.address,
      chainId || 1
    );
  }

  // Bankr API flow for bankr/impersonator accounts
  // Get cached API key
  let apiKey = getCachedApiKey();

  // If no cached API key, try session restoration (for "Never" auto-lock mode)
  // This handles the case where service worker restarted while user was chatting
  if (!apiKey) {
    const autoLockTimeout = await getAutoLockTimeout();
    if (autoLockTimeout === 0) {
      // Auto-lock is "Never" - try to restore session
      const restored = await tryRestoreSession(handleUnlockWallet);
      if (restored) {
        apiKey = getCachedApiKey();
      }
    }
  }

  if (!apiKey) {
    // Notify UI that API key is not available
    chrome.runtime.sendMessage({
      type: "chatJobComplete",
      conversationId,
      messageId,
      error: "Wallet is locked. Please unlock first.",
    }).catch(() => {});
    return { success: false, error: "Wallet is locked. Please unlock first." };
  }

  // Fetch conversation history to provide context
  let history: ChatMessage[] = [];
  try {
    const conversation = await getConversation(conversationId);
    if (conversation && conversation.messages.length > 0) {
      // Get all completed messages except the current pending assistant message
      // and the current user message (which is already in 'prompt')
      history = conversation.messages
        .filter((msg) => {
          // Skip the pending assistant message we just created
          if (msg.id === messageId) return false;
          // Only include completed messages with content
          if (msg.status === "pending" || msg.status === "error") return false;
          if (!msg.content || msg.content.trim() === "") return false;
          return true;
        })
        .map((msg) => ({
          role: msg.role,
          content: msg.content,
        }));

      // Remove the last user message since it's the current prompt
      // (it was just added to the conversation before the pending assistant message)
      if (history.length > 0 && history[history.length - 1].role === "user") {
        history.pop();
      }
    }
  } catch (error) {
    // If we can't get history, continue without it
    console.error("Failed to fetch conversation history:", error);
  }

  // Start background processing with history
  processChatPromptInBackground(conversationId, messageId, prompt, apiKey, history);

  return { success: true };
}

/**
 * Processes chat prompt in background and sends updates to UI
 */
async function processChatPromptInBackground(
  conversationId: string,
  messageId: string,
  prompt: string,
  apiKey: string,
  history: ChatMessage[] = []
): Promise<void> {
  try {
    // Submit prompt to Bankr API with conversation history for context
    const { jobId } = await submitChatPrompt(apiKey, prompt, history);

    // Poll for completion with status updates
    const result = await pollChatJobUntilComplete(apiKey, jobId, {
      pollInterval: 2000,
      maxDuration: 300000, // 5 minutes
      onStatusUpdate: (status) => {
        // Send status updates to UI
        chrome.runtime.sendMessage({
          type: "chatJobUpdate",
          conversationId,
          messageId,
          status: status.status,
          statusUpdates: status.statusUpdates,
        }).catch(() => {});
      },
    });

    // Update message with result
    if (result.success) {
      await updateMessageInConversation(conversationId, messageId, {
        content: result.response,
        status: "complete",
      });
    } else {
      await updateMessageInConversation(conversationId, messageId, {
        content: result.error || "Request failed",
        status: "error",
      });
    }

    // Notify UI
    chrome.runtime.sendMessage({
      type: "chatJobComplete",
      conversationId,
      messageId,
      content: result.success ? result.response : result.error,
      error: result.success ? undefined : result.error,
    }).catch(() => {});
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    // Update message with error
    await updateMessageInConversation(conversationId, messageId, {
      content: errorMessage,
      status: "error",
    });

    // Notify UI
    chrome.runtime.sendMessage({
      type: "chatJobComplete",
      conversationId,
      messageId,
      error: errorMessage,
    }).catch(() => {});
  }
}
