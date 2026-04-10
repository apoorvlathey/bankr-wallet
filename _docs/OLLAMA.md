# Local AI Chat (Ollama Integration)

## Overview

PK and Seed Phrase accounts can chat with a local AI model via [Ollama](https://ollama.com), providing an AI assistant without any cloud dependency. Bankr API accounts continue to use the Bankr API chat.

## Model

- **Model**: [NaniDAO/nani-qwen-3.5-2B-gguf-q4km](https://huggingface.co/NaniDAO/nani-qwen-3.5-2B-gguf-q4km) (Q4_K_M quantization, 1.27 GB)
- **Base**: Qwen3.5-2B, fine-tuned with LoRA on 2,029 examples covering 103 blockchain tools
- **Tool calling format**: XML-based (`<tool_call><function=NAME><parameter=KEY>VALUE</parameter></function></tool_call>`)
- **Think blocks**: Model outputs `<think>...</think>` reasoning blocks (hidden from user, shown as "Thinking..." status)
- **Related repos**:
  - [NaniDAO/nani-local](https://github.com/NaniDAO/nani-local) — Vite + React test app with Ollama
  - [NaniDAO/agentek](https://github.com/NaniDAO/agentek) — Tool definitions (103 blockchain tools)

## Setup

```bash
# 1. Install Ollama
brew install ollama

# 2. Pull the model
ollama pull hf.co/NaniDAO/nani-qwen-3.5-2B-gguf-q4km:Q4_K_M
ollama cp hf.co/NaniDAO/nani-qwen-3.5-2B-gguf-q4km:Q4_K_M nani

# 3. Create with proper Modelfile (ChatML template + stop tokens)
cat > /tmp/nani-Modelfile << 'EOF'
FROM nani:latest

PARAMETER temperature 0.7
PARAMETER top_p 0.8
PARAMETER top_k 20
PARAMETER stop "<|im_start|>"
PARAMETER stop "<|im_end|>"
PARAMETER num_ctx 4096

TEMPLATE """{{- if .System }}<|im_start|>system
{{ .System }}<|im_end|>
{{ end }}{{- range .Messages }}{{- if eq .Role "user" }}<|im_start|>user
{{ .Content }}<|im_end|>
{{ else if eq .Role "assistant" }}<|im_start|>assistant
{{ .Content }}<|im_end|>
{{ else if eq .Role "tool" }}<|im_start|>tool
{{ .Content }}<|im_end|>
{{ end }}{{- end }}<|im_start|>assistant
"""

SYSTEM """You are Nani, a crypto wallet assistant."""
EOF

ollama create nani -f /tmp/nani-Modelfile

# 4. Start Ollama (MUST allow extension origin)
OLLAMA_ORIGINS=* ollama serve
```

**Critical**: The `OLLAMA_ORIGINS=*` env var is required. Without it, Ollama rejects requests from the Chrome extension's `chrome-extension://` origin with a 403.

**Critical**: The Modelfile with ChatML template is required. Without it, `ollama pull` creates the model with `TEMPLATE {{ .Prompt }}` which produces garbage output (no role markers, no stop tokens, next-word prediction loops).

## Architecture

```
User prompt → useChat hook → chrome.runtime.sendMessage("submitChatPrompt")
                                         ↓
                              chatHandlers.ts (routes by account type)
                                    ↓                    ↓
                          Bankr API (bankr)    Ollama (PK/SP)
                                                    ↓
                                         ollamaHandlers.ts
                                    ┌───────────────────────┐
                                    │   Tool Execution Loop  │
                                    │                        │
                                    │  1. Stream response    │
                                    │  2. Parse <tool_call>  │
                                    │  3. Execute tool       │
                                    │  4. Feed result back   │
                                    │  5. Repeat (max 5x)    │
                                    └───────────────────────┘
                                                    ↓
                              chatJobUpdate (streaming tokens)
                              chatJobComplete (final message)
                                                    ↓
                                           UI renders response
```

## Files

| File | Purpose |
|------|---------|
| `chrome/ollamaApi.ts` | Ollama HTTP client: settings persistence (`ollamaSettings` in `chrome.storage.sync`), health check (`/api/tags`), chat (`/api/chat` with stream), model parameters (stop tokens, temperature, etc.) |
| `chrome/ollamaTools.ts` | Tool definitions (system prompt builder), XML tool call parser, tool executor, think-tag stripper |
| `chrome/ollamaHandlers.ts` | Multi-turn tool execution loop with streaming, abort controller for stop button |
| `components/Settings/OllamaSettings.tsx` | Settings UI: enable toggle, URL/model config, test connection, setup guide |

## Message Flow

### Routing (chatHandlers.ts)

`handleSubmitChatPrompt` checks the active account type:
- `privateKey` or `seedPhrase` → routes to `handleOllamaChatPrompt` (if Ollama enabled in settings)
- `bankr` or `impersonator` → existing Bankr API flow (unchanged)

### Streaming

Uses `stream: true` with the Ollama `/api/chat` endpoint. Tokens are parsed from newline-delimited JSON and sent to the UI via `chatJobUpdate` messages with a `streamContent` field. The `<think>` block is detected during streaming and hidden — user sees "Thinking..." status until the visible response begins.

Updates are throttled to every 80ms to avoid flooding the UI.

### Tool Execution Loop

1. Stream full response from Ollama
2. Parse for `<tool_call>` XML blocks
3. If tool calls found:
   - Send status update (e.g., "Checking balance...")
   - Execute each tool
   - Append assistant response + tool results to message history
   - Stream next response (go to step 1)
4. If no tool calls → final answer, save and notify UI
5. Max 5 iterations to prevent infinite loops

### Stop Button

An `AbortController` is stored per conversation in `activeRequests` map. The UI sends `cancelOllamaChat` message → handler calls `controller.abort()` → fetch is cancelled → last streamed content is preserved as the final message.

## Supported Tools (MVP)

| Tool | Description | Implementation |
|------|-------------|----------------|
| `getBalance` | Native token balance | viem `client.getBalance()` |
| `getBalanceOf` | ERC20 token balance | viem `client.readContract()` with `erc20Abi` |
| `resolveENS` | Name → address (ENS, Basename, WNS, MegaName) | `lib/ensUtils.ts` `resolveNameToAddress()` |
| `lookupENS` | Address → name (reverse resolution) | `lib/ensUtils.ts` `resolveAddressToName()` |
| `getCryptoPrice` | Native token price in USD | `coingeckoService.ts` `fetchNativeCoinGeckoPrice()` |
| `intentTransfer` | Prepare token transfer (user confirms via tx confirmation UI) | Builds tx, saves as `PendingTxRequest` — never auto-signs |

## Settings

Stored in `chrome.storage.sync` under key `ollamaSettings`:

```typescript
interface OllamaSettings {
  enabled: boolean;    // default: false
  baseUrl: string;     // default: "http://localhost:11434"
  modelName: string;   // default: "nani"
}
```

Settings UI: Settings → Local AI Chat

## Chat Storage

Conversations are stored in the shared `chatHistory` key (same as Bankr API chats). Each conversation has an optional `address` field tagging which wallet initiated it.

- **Default view**: ChatList filters by active wallet address
- **"All wallets" toggle**: Shows conversations from all addresses with address badges

## Model Parameters (sent via API)

```typescript
{
  temperature: 0.7,
  top_p: 0.8,
  top_k: 20,
  num_ctx: 4096,
  stop: ["<|im_start|>", "<|im_end|>"]
}
```

These are also baked into the Modelfile, but sent in the API request as a safety net.

## Known Limitations

- **2B model**: May hallucinate tool names or pick wrong parameters; works best with the defined tool set
- **No vision**: GGUF doesn't include the vision encoder
- **Requires local Ollama**: User must install, configure, and run Ollama separately
- **OLLAMA_ORIGINS**: Must be set to `*` for Chrome extension access
- **Service worker lifecycle**: The `handleOllamaChatPrompt` promise is awaited (not fire-and-forget) to prevent Chrome from suspending the service worker during inference

## Future Improvements

- Additional tools: `intentSwap` (via 0x API), more DeFi interactions
- Streaming think-block display (show reasoning in collapsed section)
- Model selection UI (allow other Ollama models)
- Auto-detect Ollama availability on extension startup
