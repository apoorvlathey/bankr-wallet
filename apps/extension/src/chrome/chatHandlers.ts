/**
 * Chat prompt handlers for Bankr AI chat
 * Manages chat submission and background polling
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

/**
 * Handles chat prompt submission - sends to Bankr API and polls for response
 */
export async function handleSubmitChatPrompt(
  conversationId: string,
  messageId: string,
  prompt: string
): Promise<{ success: boolean; error?: string }> {
  if (
    typeof conversationId !== "string" ||
    conversationId.length < 1 ||
    conversationId.length > 256 ||
    typeof messageId !== "string" ||
    messageId.length < 1 ||
    messageId.length > 256 ||
    typeof prompt !== "string" ||
    prompt.length < 1 ||
    prompt.length > 10_000
  ) {
    return { success: false, error: "Invalid chat request" };
  }
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
      content: "Wallet is locked. Please unlock first.",
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
      content: errorMessage,
      error: errorMessage,
    }).catch(() => {});
  }
}
