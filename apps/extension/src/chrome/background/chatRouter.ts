/** Trusted-wallet Bankr chat submission and local conversation transport. */

export const BACKGROUND_CHAT_MESSAGE_TYPES = [
  "submitChatPrompt",
  "getChatConversations",
  "getChatConversation",
  "createChatConversation",
  "deleteChatConversation",
  "addChatMessage",
  "updateChatMessage",
] as const;

export type BackgroundChatRouteResult =
  | { handled: false }
  | { handled: true; keepChannelOpen: true };

export type BackgroundChatDependencies = {
  submitPrompt: (...args: any[]) => Promise<any>;
  getConversations: () => Promise<any>;
  getConversation: (conversationId: any) => Promise<any>;
  createConversation: (title: any) => Promise<any>;
  deleteConversation: (conversationId: any) => Promise<void>;
  addMessage: (conversationId: any, message: any) => Promise<any>;
  updateMessage: (
    conversationId: any,
    messageId: any,
    updates: any,
  ) => Promise<any>;
};

const HANDLED_ASYNC: BackgroundChatRouteResult = {
  handled: true,
  keepChannelOpen: true,
};

export function createBackgroundChatMessageRouter(
  dependencies: BackgroundChatDependencies,
): (
  message: any,
  sendResponse: (response?: any) => void,
) => BackgroundChatRouteResult {
  return (message, sendResponse) => {
    switch (message?.type) {
      case "submitChatPrompt":
        dependencies
          .submitPrompt(
            message.conversationId,
            message.messageId,
            message.prompt,
          )
          .then(sendResponse);
        return HANDLED_ASYNC;
      case "getChatConversations":
        dependencies.getConversations().then(sendResponse);
        return HANDLED_ASYNC;
      case "getChatConversation":
        dependencies.getConversation(message.conversationId).then(sendResponse);
        return HANDLED_ASYNC;
      case "createChatConversation":
        dependencies.createConversation(message.title).then(sendResponse);
        return HANDLED_ASYNC;
      case "deleteChatConversation":
        dependencies.deleteConversation(message.conversationId).then(() => {
          sendResponse({ success: true });
        });
        return HANDLED_ASYNC;
      case "addChatMessage":
        dependencies
          .addMessage(message.conversationId, message.message)
          .then(sendResponse);
        return HANDLED_ASYNC;
      case "updateChatMessage":
        dependencies
          .updateMessage(
            message.conversationId,
            message.messageId,
            message.updates,
          )
          .then(sendResponse);
        return HANDLED_ASYNC;
      default:
        return { handled: false };
    }
  };
}
