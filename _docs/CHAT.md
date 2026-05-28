# WalletChan Chat Feature Implementation

## Overview

The chat feature allows users to converse with the Bankr AI agent directly from the extension. Conversation history is persisted in Chrome storage, enabling users to access past chats across sessions.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Extension Popup/Sidepanel                           │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                           ChatView                                   │   │
│  │                    (Mode: "list" | "chat")                          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                    │                              │                         │
│         ┌─────────┴─────────┐          ┌────────┴────────┐                │
│         ▼                   ▼          ▼                 ▼                 │
│  ┌─────────────┐    ┌─────────────┐  ┌──────────┐  ┌───────────┐         │
│  │  ChatList   │    │ ChatHeader  │  │MessageList│  │ ChatInput │         │
│  │ (history)   │    │(nav+actions)│  │(messages) │  │ (input)   │         │
│  └─────────────┘    └─────────────┘  └──────────┘  └───────────┘         │
│                                             │                              │
│                                             ▼                              │
│                                      ┌──────────────┐                     │
│                                      │MessageBubble │                     │
│                                      │(user/assist) │                     │
│                                      └──────────────┘                     │
│                                             │                              │
│                                             ▼                              │
│                                      ┌──────────────┐                     │
│                                      │ ShapesLoader │                     │
│                                      │ (pending)    │                     │
│                                      │+ status text │                     │
│                                      └──────────────┘                     │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ useChat hook
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Background Service Worker (background.js)                │
│                                                                             │
│  Message Handlers:                                                          │
│    - submitChatPrompt: Submit prompt, start polling                         │
│    - getChatConversations: Get all conversations                            │
│    - getChatConversation: Get specific conversation                         │
│    - createChatConversation: Create new conversation                        │
│    - deleteChatConversation: Delete conversation                            │
│    - addChatMessage: Add message to conversation                            │
│    - updateChatMessage: Update message status/content                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Bankr API                                       │
│                          api.bankr.bot                                       │
│                                                                             │
│  Endpoints:                                                                  │
│    - POST /agent/prompt     → Submit chat prompt, returns jobId             │
│    - GET /agent/job/{id}    → Poll job status                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Data Models

### Message

```typescript
interface Message {
  id: string; // UUID
  role: "user" | "assistant"; // Message author
  content: string; // Message text
  timestamp: number; // Unix timestamp (ms)
  status?: "pending" | "complete" | "error"; // Assistant message status
  jobId?: string; // Bankr API job ID (for polling)
  isWalletLockedError?: boolean; // True if error was due to wallet being locked
}
```

### Conversation

```typescript
interface Conversation {
  id: string; // UUID
  title: string; // Auto-generated from first user message
  messages: Message[];
  createdAt: number; // Unix timestamp (ms)
  updatedAt: number; // Unix timestamp (ms)
  favorite?: boolean; // Whether conversation is favorited
}
```

## Storage

### Configuration

| Setting                       | Value                  |
| ----------------------------- | ---------------------- |
| Storage Key                   | `chatHistory`          |
| Storage Type                  | `chrome.storage.local` |
| Max Conversations             | 50                     |
| Max Messages per Conversation | 100                    |

### Storage Functions

`src/chrome/chatStorage.ts`:

| Function                                              | Description                                                |
| ----------------------------------------------------- | ---------------------------------------------------------- |
| `getConversations()`                                  | Get all conversations (favorites first, then by updatedAt) |
| `getConversation(id)`                                 | Get a specific conversation by ID                          |
| `saveConversation(conversation)`                      | Save/update a conversation                                 |
| `createConversation(title?)`                          | Create a new conversation                                  |
| `deleteConversation(id)`                              | Delete a conversation by ID                                |
| `addMessageToConversation(convId, message)`           | Add a message to a conversation                            |
| `updateMessageInConversation(convId, msgId, updates)` | Update a message                                           |
| `toggleConversationFavorite(id)`                      | Toggle favorite status for a conversation                  |
| `deleteMessageFromConversation(convId, msgId)`        | Delete a specific message from a conversation              |
| `clearChatHistory()`                                  | Clear all chat history                                     |

### Sorting

Conversations are sorted by:

1. **Favorites first**: Favorited conversations appear at the top
2. **Then by updatedAt**: Newest conversations appear first within each group

### Auto Title Generation

When the first user message is added to a conversation with the default title "New Chat":

- Title is updated to the message content
- Truncated to 50 characters with "..." if longer

### Empty Chat Handling

Conversations are NOT saved to storage until the first message is sent:

- `createNewChat()` creates a temporary in-memory conversation
- Conversation is only persisted when `sendMessage()` is called
- This prevents "New Chat" entries from cluttering the history

## API Integration

### Chat API Client

`src/chrome/chatApi.ts`:

```typescript
// Submit a prompt to the Bankr API (with optional conversation history)
async function submitChatPrompt(
  apiKey: string,
  prompt: string,
  history?: ChatMessage[],
  signal?: AbortSignal,
): Promise<{ jobId: string }>;

// Poll until job completes
async function pollChatJobUntilComplete(
  apiKey: string,
  jobId: string,
  options?: {
    pollInterval?: number; // Default: 2000ms
    maxDuration?: number; // Default: 300000ms (5 min)
    onStatusUpdate?: (status) => void;
    signal?: AbortSignal;
  },
): Promise<{ success: boolean; response: string; error?: string }>;
```

### API Flow

1. **Fetch History**: Get conversation from storage, extract completed messages
2. **Format Prompt**: Combine history with current message using role tags (User:/Assistant:)
3. **Submit Prompt**: POST to `/agent/prompt` with formatted prompt (max 10,000 chars). If the POST fails, parse JSON error bodies and surface the user-facing `message` field in the assistant error bubble.
4. **Get Job ID**: API returns `{ jobId: string }`
5. **Poll Status**: GET `/agent/job/{jobId}` every 2 seconds
6. **Show Status Updates**: Display latest `statusUpdates` message in UI alongside loader
7. **Complete**: Job status becomes "completed" with response text
8. **Timeout**: Max 5 minutes before auto-fail

### Status Updates (Live Progress)

During polling, the API response includes a `statusUpdates` array that grows over time:

```json
{
  "statusUpdates": [
    {
      "message": "viewing clanker fees",
      "timestamp": "2026-02-07T23:39:10.846Z"
    },
    {
      "message": "validating response accuracy",
      "timestamp": "2026-02-07T23:39:31.040Z"
    }
  ]
}
```

**Flow**:

1. Background sends `chatJobUpdate` message to UI with `statusUpdates` array on each poll
2. `useChat` hook extracts the **last element** of the array (latest status)
3. `statusUpdateText` state is set and passed through `ChatView` → `MessageList` → `MessageBubble`
4. `MessageBubble` displays it next to the `ShapesLoader` in the pending state
5. Text is cleared when `chatJobComplete` is received or a new message is sent

### Conversation Context Format

When sending a message, the full conversation history is included in the prompt:

```
[Conversation history]
User: What is my ETH balance?

Assistant: You have 0.5 ETH worth approximately $1,825.

User: What about on Base?

Assistant: On Base, you have 0.3 ETH worth approximately $1,095.

[Current message]
User: Now swap half my Base ETH to USDC
```

If the prompt exceeds 10,000 characters, older messages are progressively removed from the history while keeping the current message intact.

## Error Handling

| Error           | Handling                                           |
| --------------- | -------------------------------------------------- |
| Wallet locked   | Shows "Unlock" button in error message             |
| API error       | Message status set to "error", content shows the API error message. `chatJobComplete` should include error text in both `error` and `content`, and the UI falls back to `error` when `content` is absent. |
| Network error   | Message status set to "error", content shows error |
| Timeout (5 min) | Message status set to "error"                      |
| Abort/Cancel    | Message status set to "error", "Request cancelled" |

## Reset Behavior

When the extension is reset (Settings → Reset Extension):

- `chatHistory` storage key is cleared
- All conversations and messages are deleted

When clearing chat history (Settings → Clear Chat History):

- All conversations are deleted
- Current chat view returns to empty state
