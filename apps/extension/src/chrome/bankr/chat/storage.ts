/**
 * Persistent storage for chat conversations
 * Conversations are stored in chrome.storage.local and survive popup closes
 */

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  status?: "pending" | "complete" | "error";
  jobId?: string;
  isWalletLockedError?: boolean; // True if error was due to wallet being locked
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  favorite?: boolean;
}

const STORAGE_KEY = "chatHistory";
const MAX_CONVERSATIONS = 50;
const MAX_MESSAGES_PER_CONVERSATION = 100;

/**
 * Get all conversations
 */
export async function getConversations(): Promise<Conversation[]> {
  const { chatHistory } = (await chrome.storage.local.get(STORAGE_KEY)) as {
    chatHistory?: Conversation[];
  };
  return chatHistory || [];
}

/**
 * Get a specific conversation by ID
 */
export async function getConversation(id: string): Promise<Conversation | null> {
  const conversations = await getConversations();
  return conversations.find((c) => c.id === id) || null;
}

/**
 * Save/update a conversation
 */
export async function saveConversation(conversation: Conversation): Promise<void> {
  const conversations = await getConversations();
  const index = conversations.findIndex((c) => c.id === conversation.id);

  // Trim messages if exceeding limit
  if (conversation.messages.length > MAX_MESSAGES_PER_CONVERSATION) {
    conversation.messages = conversation.messages.slice(-MAX_MESSAGES_PER_CONVERSATION);
  }

  if (index >= 0) {
    conversations[index] = conversation;
  } else {
    conversations.unshift(conversation);
  }

  // Sort by favorite first, then by updatedAt (newest first)
  conversations.sort((a, b) => {
    // Favorites come first
    if (a.favorite && !b.favorite) return -1;
    if (!a.favorite && b.favorite) return 1;
    // Then sort by updatedAt
    return b.updatedAt - a.updatedAt;
  });

  // Trim to max conversations
  const trimmed = conversations.slice(0, MAX_CONVERSATIONS);

  await chrome.storage.local.set({ [STORAGE_KEY]: trimmed });
}

/**
 * Create a new conversation
 */
export async function createConversation(
  title?: string
): Promise<Conversation> {
  const now = Date.now();
  const conversation: Conversation = {
    id: crypto.randomUUID(),
    title: title || "New Chat",
    messages: [],
    createdAt: now,
    updatedAt: now,
  };

  await saveConversation(conversation);
  return conversation;
}

/**
 * Delete a conversation by ID
 */
export async function deleteConversation(id: string): Promise<void> {
  const conversations = await getConversations();
  const filtered = conversations.filter((c) => c.id !== id);
  await chrome.storage.local.set({ [STORAGE_KEY]: filtered });
}

/**
 * Add a message to a conversation
 */
export async function addMessageToConversation(
  conversationId: string,
  message: Message
): Promise<Conversation | null> {
  const conversation = await getConversation(conversationId);
  if (!conversation) return null;

  conversation.messages.push(message);
  conversation.updatedAt = Date.now();

  // Update title from first user message if it's still default
  if (
    conversation.title === "New Chat" &&
    message.role === "user" &&
    conversation.messages.filter((m) => m.role === "user").length === 1
  ) {
    conversation.title =
      message.content.length > 50
        ? message.content.substring(0, 50) + "..."
        : message.content;
  }

  await saveConversation(conversation);
  return conversation;
}

/**
 * Update a message in a conversation
 */
export async function updateMessageInConversation(
  conversationId: string,
  messageId: string,
  updates: Partial<Message>
): Promise<Conversation | null> {
  const conversation = await getConversation(conversationId);
  if (!conversation) return null;

  const messageIndex = conversation.messages.findIndex((m) => m.id === messageId);
  if (messageIndex === -1) return null;

  conversation.messages[messageIndex] = {
    ...conversation.messages[messageIndex],
    ...updates,
  };
  conversation.updatedAt = Date.now();

  await saveConversation(conversation);
  return conversation;
}

/**
 * Toggle favorite status for a conversation
 */
export async function toggleConversationFavorite(id: string): Promise<Conversation | null> {
  const conversation = await getConversation(id);
  if (!conversation) return null;

  conversation.favorite = !conversation.favorite;
  await saveConversation(conversation);
  return conversation;
}

/**
 * Delete a message from a conversation
 */
export async function deleteMessageFromConversation(
  conversationId: string,
  messageId: string
): Promise<Conversation | null> {
  const conversation = await getConversation(conversationId);
  if (!conversation) return null;

  conversation.messages = conversation.messages.filter((m) => m.id !== messageId);
  conversation.updatedAt = Date.now();

  await saveConversation(conversation);
  return conversation;
}

/**
 * Clear all chat history
 */
export async function clearChatHistory(): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: [] });
}
