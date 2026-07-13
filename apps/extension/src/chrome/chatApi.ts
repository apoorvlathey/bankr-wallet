/**
 * Chat API client for submitting prompts to the Bankr agent
 */

import { BankrApiError, getJobStatus, pollJobUntilComplete, JobStatus } from "./bankrApi";
import { BANKR_API_BASE } from "@/constants/externalUrls";
import { fetchTextBounded } from "./boundedHttpResponse";

const API_BASE_URL = BANKR_API_BASE;

// Max prompt length for Bankr API
const MAX_PROMPT_LENGTH = 10000;
const CHAT_SUBMIT_TIMEOUT_MS = 30_000;
const CHAT_RESPONSE_MAX_BYTES = 64 * 1024;

export interface SubmitChatPromptResponse {
  jobId: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

function parseJsonish(value: string): unknown | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;

  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function extractPromptErrorMessage(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;

    const parsed = parseJsonish(trimmed);
    if (parsed !== null) {
      return extractPromptErrorMessage(parsed) || trimmed;
    }

    return trimmed;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const body = value as Record<string, unknown>;

  if (typeof body.message === "string" && body.message.trim()) {
    return body.message.trim();
  }

  if (body.error !== undefined) {
    return extractPromptErrorMessage(body.error);
  }

  return undefined;
}

function formatPromptSubmitError(text: string, status: number): string {
  const message = extractPromptErrorMessage(text);
  if (message) return sanitizeRemoteError(message);

  const trimmed = text.trim();
  if (trimmed) return sanitizeRemoteError(trimmed);

  return `Failed to submit chat prompt (${status})`;
}

function sanitizeRemoteError(value: string): string {
  return (
    value
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
      .trim()
      .slice(0, 1_000) || "Bankr chat request failed"
  );
}

/**
 * Formats conversation history into a prompt string for the Bankr API
 * Messages are tagged with User: and Assistant: prefixes
 */
export function formatConversationPrompt(
  messages: ChatMessage[],
  currentPrompt: string
): string {
  const boundedCurrentPrompt = currentPrompt.slice(0, MAX_PROMPT_LENGTH);
  // If no history, just return the current prompt
  if (messages.length === 0) {
    return boundedCurrentPrompt;
  }

  // Build history string with role tags
  const historyParts: string[] = [];

  for (const msg of messages.slice(-100)) {
    // Skip empty messages or pending/error assistant messages
    if (!msg.content || msg.content.trim() === "") continue;

    const roleTag = msg.role === "user" ? "User" : "Assistant";
    historyParts.push(`${roleTag}: ${msg.content.slice(0, MAX_PROMPT_LENGTH)}`);
  }

  // If no valid history, just return the current prompt
  if (historyParts.length === 0) {
    return currentPrompt;
  }

  // Format: history followed by current message
  const historyText = historyParts.join("\n\n");
  const fullPrompt = `[Conversation history]\n${historyText}\n\n[Current message]\nUser: ${boundedCurrentPrompt}`;

  // Truncate history if prompt exceeds max length
  // Keep current message intact, trim history from the beginning
  if (fullPrompt.length > MAX_PROMPT_LENGTH) {
    const currentMsgSection = `\n\n[Current message]\nUser: ${boundedCurrentPrompt}`;
    const availableForHistory = MAX_PROMPT_LENGTH - currentMsgSection.length - "[Conversation history]\n".length - 50; // 50 char buffer

    if (availableForHistory < 100) {
      // Not enough room for history, just send current message
      return boundedCurrentPrompt;
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
      return boundedCurrentPrompt;
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

  const { response, text } = await fetchTextBounded(
    `${API_BASE_URL}/agent/prompt`,
    {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt: formattedPrompt }),
      signal,
      redirect: "error",
    },
    { timeoutMs: CHAT_SUBMIT_TIMEOUT_MS, maxBytes: CHAT_RESPONSE_MAX_BYTES },
  );

  if (!response.ok) {
    throw new BankrApiError(
      formatPromptSubmitError(text, response.status),
      response.status
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new BankrApiError("Bankr returned invalid JSON for chat submission");
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new BankrApiError("Bankr returned an invalid chat response");
  }
  const jobId = (payload as Record<string, unknown>).jobId;
  if (typeof jobId !== "string" || !/^[A-Za-z0-9_-]{1,256}$/.test(jobId)) {
    throw new BankrApiError("Bankr returned an invalid chat job ID");
  }
  return { jobId };
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
