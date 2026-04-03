/**
 * Ollama API client for local AI chat
 * Handles settings persistence, health checks, and chat completions
 */

import {
  DEFAULT_OLLAMA_BASE_URL,
  DEFAULT_OLLAMA_MODEL,
} from "@/constants/externalUrls";

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

const OLLAMA_SETTINGS_KEY = "ollamaSettings";

export interface OllamaSettings {
  enabled: boolean;
  baseUrl: string;
  modelName: string;
}

const DEFAULT_SETTINGS: OllamaSettings = {
  enabled: false,
  baseUrl: DEFAULT_OLLAMA_BASE_URL,
  modelName: DEFAULT_OLLAMA_MODEL,
};

export async function getOllamaSettings(): Promise<OllamaSettings> {
  const result = await chrome.storage.sync.get(OLLAMA_SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...result[OLLAMA_SETTINGS_KEY] };
}

export async function saveOllamaSettings(
  settings: Partial<OllamaSettings>
): Promise<void> {
  const current = await getOllamaSettings();
  await chrome.storage.sync.set({
    [OLLAMA_SETTINGS_KEY]: { ...current, ...settings },
  });
}

// ---------------------------------------------------------------------------
// Health Check
// ---------------------------------------------------------------------------

export async function checkOllamaAvailability(
  baseUrl: string
): Promise<{ available: boolean; models: string[] }> {
  try {
    const response = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });
    if (response.status === 403) {
      return { available: false, models: [], error: "Ollama blocked the request. Restart with: OLLAMA_ORIGINS=* ollama serve" } as any;
    }
    if (!response.ok) {
      return { available: false, models: [] };
    }
    const data = (await response.json()) as {
      models?: Array<{ name: string }>;
    };
    const models = (data.models || []).map((m) => m.name);
    return { available: true, models };
  } catch {
    return { available: false, models: [] };
  }
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export interface OllamaMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
}

export interface OllamaChatResponse {
  message: { role: string; content: string };
  done: boolean;
}

// Model parameters from the nani Modelfile
const NANI_MODEL_OPTIONS = {
  temperature: 0.7,
  top_p: 0.8,
  top_k: 20,
  num_ctx: 4096,
  stop: ["<|im_start|>", "<|im_end|>"],
};

export async function ollamaChat(
  baseUrl: string,
  model: string,
  messages: OllamaMessage[],
  signal?: AbortSignal
): Promise<OllamaChatResponse> {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, stream: false, options: NANI_MODEL_OPTIONS }),
    signal,
  });

  handleOllamaError(response, model);

  return response.json();
}

/**
 * Streaming chat — calls onToken for each token, returns full content when done.
 * Automatically hides <think>...</think> blocks from the streamed display.
 */
export async function ollamaChatStream(
  baseUrl: string,
  model: string,
  messages: OllamaMessage[],
  onToken: (displayContent: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, stream: true, options: NANI_MODEL_OPTIONS }),
    signal,
  });

  handleOllamaError(response, model);

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let fullContent = "";
  let insideThink = false;
  let displayContent = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    // Each line is a JSON object
    for (const line of chunk.split("\n")) {
      if (!line.trim()) continue;
      try {
        const data = JSON.parse(line);
        if (data.message?.content) {
          const token = data.message.content;
          fullContent += token;

          // Track <think> blocks — hide from display
          if (fullContent.includes("<think>") && !fullContent.includes("</think>")) {
            insideThink = true;
          }
          if (insideThink && fullContent.includes("</think>")) {
            insideThink = false;
            // Rebuild display content without think block
            displayContent = fullContent
              .replace(/<think>[\s\S]*?<\/think>/g, "")
              .trim();
            onToken(displayContent);
            continue;
          }

          if (!insideThink) {
            displayContent += token;
            onToken(displayContent.trim());
          }
        }
      } catch {
        // Skip malformed JSON lines
      }
    }
  }

  return fullContent;
}

function handleOllamaError(response: Response, model: string): void {
  if (response.ok) return;
  if (response.status === 404) {
    throw new Error(
      `Model '${model}' not found. Run \`ollama pull ${model}\` to download it.`
    );
  }
  if (response.status === 403) {
    throw new Error(
      "Ollama blocked the request (403 Forbidden). Restart Ollama with: OLLAMA_ORIGINS=* ollama serve"
    );
  }
  throw new Error(`Ollama API error (${response.status})`);
}
