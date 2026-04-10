/**
 * Ollama chat handler for PK/SP accounts.
 * Implements a multi-turn tool execution loop with streaming:
 *   prompt → stream response → parse tool calls → execute → feed result back → repeat
 */

import {
  getOllamaSettings,
  checkOllamaAvailability,
  ollamaChatStream,
  ollamaChat,
  type OllamaMessage,
} from "./ollamaApi";
import {
  getConversation,
  updateMessageInConversation,
} from "./chatStorage";
import {
  buildSystemPrompt,
  parseToolCalls,
  cleanDisplayContent,
  toolStatusMessage,
  executeTool,
  type ToolContext,
} from "./ollamaTools";

const MAX_TOOL_ITERATIONS = 5;
// Throttle stream updates to avoid flooding the UI
const STREAM_UPDATE_INTERVAL_MS = 80;

// Active abort controllers keyed by conversationId
const activeRequests = new Map<string, AbortController>();

/**
 * Cancel an active Ollama chat request.
 */
export function cancelOllamaChat(conversationId: string): boolean {
  const controller = activeRequests.get(conversationId);
  if (controller) {
    controller.abort();
    activeRequests.delete(conversationId);
    return true;
  }
  return false;
}

/**
 * Handle a chat prompt via local Ollama model with tool execution loop.
 * Awaits processing to keep the service worker alive during the Ollama request.
 */
export async function handleOllamaChatPrompt(
  conversationId: string,
  messageId: string,
  prompt: string,
  accountAddress: string,
  chainId: number
): Promise<{ success: boolean; error?: string }> {
  await processOllamaPromptInBackground(
    conversationId,
    messageId,
    prompt,
    accountAddress,
    chainId
  );

  return { success: true };
}

async function processOllamaPromptInBackground(
  conversationId: string,
  messageId: string,
  prompt: string,
  accountAddress: string,
  chainId: number
): Promise<void> {
  // Create abort controller for this request
  const abortController = new AbortController();
  activeRequests.set(conversationId, abortController);
  const { signal } = abortController;

  // Track last streamed display content (accessible in catch for abort)
  let lastStreamedDisplay = "";

  try {
    // 1. Load settings and validate
    const settings = await getOllamaSettings();
    const { available } = await checkOllamaAvailability(settings.baseUrl);
    if (!available) {
      await failWithError(
        conversationId,
        messageId,
        "Ollama is not running. Start it with `ollama serve` and ensure the nani model is loaded (`ollama pull nani`)."
      );
      return;
    }

    // 2. Send initial status update
    sendStatusUpdate(conversationId, messageId, "Thinking...");

    // 3. Build conversation history
    const messages: OllamaMessage[] = [];

    messages.push({
      role: "system",
      content: buildSystemPrompt(accountAddress, chainId),
    });

    const conversation = await getConversation(conversationId);
    if (conversation) {
      for (const msg of conversation.messages) {
        if (msg.id === messageId) continue;
        if (msg.status === "pending" || msg.status === "error") continue;
        if (!msg.content || msg.content.trim() === "") continue;

        messages.push({
          role: msg.role === "user" ? "user" : "assistant",
          content: msg.content,
        });
      }

      if (
        messages.length > 1 &&
        messages[messages.length - 1].role === "user"
      ) {
        messages.pop();
      }
    }

    messages.push({ role: "user", content: prompt });

    // 4. Tool execution loop with streaming
    const toolCtx: ToolContext = {
      address: accountAddress,
      chainId,
    };

    let finalContent = "";
    let lastStreamUpdate = 0;

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      // Stream the response — tokens appear in the UI as they arrive
      const fullContent = await ollamaChatStream(
        settings.baseUrl,
        settings.modelName,
        messages,
        (displayContent) => {
          lastStreamedDisplay = displayContent;
          const now = Date.now();
          if (now - lastStreamUpdate >= STREAM_UPDATE_INTERVAL_MS) {
            lastStreamUpdate = now;
            sendStreamContent(conversationId, messageId, displayContent);
          }
        },
        signal
      );

      const toolCalls = parseToolCalls(fullContent);

      if (toolCalls.length === 0) {
        finalContent = cleanDisplayContent(fullContent);
        // Send final streamed content
        sendStreamContent(conversationId, messageId, finalContent);
        break;
      }

      // Execute tool calls (switch back to status messages during tool execution)
      const toolResults: string[] = [];
      for (const call of toolCalls) {
        sendStatusUpdate(
          conversationId,
          messageId,
          toolStatusMessage(call.functionName)
        );

        const result = await executeTool(call, toolCtx);
        toolResults.push(`${call.functionName}: ${result}`);
      }

      messages.push({ role: "assistant", content: fullContent });
      messages.push({ role: "tool", content: toolResults.join("\n") });

      // Reset for next iteration
      lastStreamUpdate = 0;

      // If this is the last iteration, force a final response
      if (i === MAX_TOOL_ITERATIONS - 1) {
        sendStatusUpdate(conversationId, messageId, "Generating response...");
        const lastContent = await ollamaChatStream(
          settings.baseUrl,
          settings.modelName,
          messages,
          (displayContent) => {
            lastStreamedDisplay = displayContent;
            const now = Date.now();
            if (now - lastStreamUpdate >= STREAM_UPDATE_INTERVAL_MS) {
              lastStreamUpdate = now;
              sendStreamContent(conversationId, messageId, displayContent);
            }
          },
          signal
        );
        finalContent = cleanDisplayContent(lastContent);
        sendStreamContent(conversationId, messageId, finalContent);
      }
    }

    // 5. Update message in storage and notify UI
    await updateMessageInConversation(conversationId, messageId, {
      content: finalContent || "No response generated.",
      status: "complete",
    });

    chrome.runtime.sendMessage({
      type: "chatJobComplete",
      conversationId,
      messageId,
      content: finalContent || "No response generated.",
    }).catch(() => {});
  } catch (error) {
    // Handle abort gracefully — keep whatever was streamed so far
    if (error instanceof DOMException && error.name === "AbortError") {
      const keptContent = lastStreamedDisplay || "Generation stopped.";
      await updateMessageInConversation(conversationId, messageId, {
        content: keptContent,
        status: "complete",
      });
      chrome.runtime.sendMessage({
        type: "chatJobComplete",
        conversationId,
        messageId,
        content: keptContent,
      }).catch(() => {});
      return;
    }

    console.error("[Ollama] Chat error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    await failWithError(conversationId, messageId, errorMessage);
  } finally {
    activeRequests.delete(conversationId);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sendStatusUpdate(
  conversationId: string,
  messageId: string,
  message: string
): void {
  chrome.runtime.sendMessage({
    type: "chatJobUpdate",
    conversationId,
    messageId,
    statusUpdates: [{ message, timestamp: new Date().toISOString() }],
  }).catch(() => {});
}

function sendStreamContent(
  conversationId: string,
  messageId: string,
  content: string
): void {
  chrome.runtime.sendMessage({
    type: "chatJobUpdate",
    conversationId,
    messageId,
    streamContent: content,
  }).catch(() => {});
}

async function failWithError(
  conversationId: string,
  messageId: string,
  errorMessage: string
): Promise<void> {
  await updateMessageInConversation(conversationId, messageId, {
    content: errorMessage,
    status: "error",
  });

  chrome.runtime.sendMessage({
    type: "chatJobComplete",
    conversationId,
    messageId,
    content: errorMessage,
    error: errorMessage,
  }).catch(() => {});
}
