/**
 * Chat API client for submitting prompts to the Bankr agent
 */

import { BankrApiError, getJobStatus, pollJobUntilComplete, JobStatus } from "./bankrApi";
import { BANKR_API_BASE } from "@/constants/externalUrls";

const API_BASE_URL = BANKR_API_BASE;

// Max prompt length for Bankr API
const MAX_PROMPT_LENGTH = 10000;

export interface SubmitChatPromptResponse {
  jobId: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Formats conversation history into a prompt string for the Bankr API
 * Messages are tagged with User: and Assistant: prefixes
 */
export function formatConversationPrompt(
  messages: ChatMessage[],
  currentPrompt: string
): string {
  // If no history, just return the current prompt
  if (messages.length === 0) {
    return currentPrompt;
  }

  // Build history string with role tags
  const historyParts: string[] = [];

  for (const msg of messages) {
    // Skip empty messages or pending/error assistant messages
    if (!msg.content || msg.content.trim() === "") continue;

    const roleTag = msg.role === "user" ? "User" : "Assistant";
    historyParts.push(`${roleTag}: ${msg.content}`);
  }

  // If no valid history, just return the current prompt
  if (historyParts.length === 0) {
    return currentPrompt;
  }

  // Format: history followed by current message
  const historyText = historyParts.join("\n\n");
  const fullPrompt = `[Conversation history]\n${historyText}\n\n[Current message]\nUser: ${currentPrompt}`;

  // Truncate history if prompt exceeds max length
  // Keep current message intact, trim history from the beginning
  if (fullPrompt.length > MAX_PROMPT_LENGTH) {
    const currentMsgSection = `\n\n[Current message]\nUser: ${currentPrompt}`;
    const availableForHistory = MAX_PROMPT_LENGTH - currentMsgSection.length - "[Conversation history]\n".length - 50; // 50 char buffer

    if (availableForHistory < 100) {
      // Not enough room for history, just send current message
      return currentPrompt;
    }

    // Truncate history from the beginning, keeping most recent messages
    let truncatedHistory = historyText;
    while (truncatedHistory.length > availableForHistory && truncatedHistory.includes("\n\n")) {
      // Remove oldest message (first in the string)
      const firstBreak = truncatedHistory.indexOf("\n\n");
      if (firstBreak === -1) break;
      truncatedHistory = truncatedHistory.slice(firstBreak + 2);
    }

    if (truncatedHistory.length > availableForHistory) {
      // Still too long, just send current message
      return currentPrompt;
    }

    return `[Conversation history]\n${truncatedHistory}${currentMsgSection}`;
  }

  return fullPrompt;
}

/**
 * Submits a chat prompt to the Bankr API
 * @param apiKey - The API key for authentication
 * @param prompt - The user's current message
 * @param history - Optional conversation history (previous messages)
 * @param signal - Optional abort signal for cancellation
 */
export async function submitChatPrompt(
  apiKey: string,
  prompt: string,
  history?: ChatMessage[],
  signal?: AbortSignal
): Promise<SubmitChatPromptResponse> {
  // Format prompt with conversation history if provided
  const formattedPrompt = history && history.length > 0
    ? formatConversationPrompt(history, prompt)
    : prompt;

  const response = await fetch(`${API_BASE_URL}/agent/prompt`, {
    method: "POST",
    headers: {
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prompt: formattedPrompt }),
    signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new BankrApiError(
      `Failed to submit chat prompt: ${text}`,
      response.status
    );
  }

  return response.json();
}

/**
 * Polls a chat job until completion and returns the response
 */
export async function pollChatJobUntilComplete(
  apiKey: string,
  jobId: string,
  options: {
    pollInterval?: number;
    maxDuration?: number;
    onStatusUpdate?: (status: JobStatus) => void;
    signal?: AbortSignal;
  } = {}
): Promise<{ success: boolean; response: string; error?: string }> {
  try {
    const status = await pollJobUntilComplete(apiKey, jobId, {
      pollInterval: options.pollInterval || 2000,
      maxDuration: options.maxDuration || 300000, // 5 minutes
      onStatusUpdate: options.onStatusUpdate,
      signal: options.signal,
    });

    if (status.status === "completed") {
      return {
        success: true,
        response: status.response || "No response received",
      };
    } else if (status.status === "failed") {
      return {
        success: false,
        response: "",
        error: status.result?.error || status.response || "Request failed",
      };
    } else {
      return {
        success: false,
        response: "",
        error: "Unexpected job status",
      };
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        success: false,
        response: "",
        error: "Request cancelled",
      };
    }
    if (error instanceof BankrApiError) {
      return {
        success: false,
        response: "",
        error: error.message,
      };
    }
    return {
      success: false,
      response: "",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Re-export useful types and functions from bankrApi
export { getJobStatus, BankrApiError, type JobStatus };
