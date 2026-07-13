import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  BACKGROUND_CHAT_MESSAGE_TYPES,
  createBackgroundChatMessageRouter,
  type BackgroundChatDependencies,
} from "../../src/chrome/background/chatRouter";

test("chat transport preserves local conversation and remote prompt arguments", async () => {
  assert.equal(
    new Set(BACKGROUND_CHAT_MESSAGE_TYPES).size,
    BACKGROUND_CHAT_MESSAGE_TYPES.length,
  );
  const calls: unknown[][] = [];
  const handler = (name: string, result: unknown) => async (...args: unknown[]) => {
    calls.push([name, ...args]);
    return result;
  };
  const dependencies: BackgroundChatDependencies = {
    submitPrompt: handler("submit", { queued: true }),
    getConversations: handler("list", []),
    getConversation: handler("get", { id: "conversation-1" }),
    createConversation: handler("create", { id: "conversation-2" }),
    deleteConversation: handler("delete", undefined),
    addMessage: handler("add", { messages: [1] }),
    updateMessage: handler("update", { messages: [2] }),
  };
  const router = createBackgroundChatMessageRouter(dependencies);
  const dispatch = (message: Record<string, unknown>) =>
    new Promise((resolve) => {
      const route = router(message, resolve);
      assert.deepEqual(route, { handled: true, keepChannelOpen: true });
    });

  assert.deepEqual(
    await dispatch({
      type: "submitChatPrompt",
      conversationId: "conversation-1",
      messageId: "message-1",
      prompt: "hello",
    }),
    { queued: true },
  );
  await dispatch({ type: "getChatConversations" });
  await dispatch({ type: "getChatConversation", conversationId: "conversation-1" });
  await dispatch({ type: "createChatConversation", title: "New chat" });
  assert.deepEqual(
    await dispatch({ type: "deleteChatConversation", conversationId: "conversation-2" }),
    { success: true },
  );
  await dispatch({
    type: "addChatMessage",
    conversationId: "conversation-1",
    message: { id: "message-2" },
  });
  await dispatch({
    type: "updateChatMessage",
    conversationId: "conversation-1",
    messageId: "message-2",
    updates: { status: "done" },
  });

  assert.deepEqual(calls, [
    ["submit", "conversation-1", "message-1", "hello"],
    ["list"],
    ["get", "conversation-1"],
    ["create", "New chat"],
    ["delete", "conversation-2"],
    ["add", "conversation-1", { id: "message-2" }],
    [
      "update",
      "conversation-1",
      "message-2",
      { status: "done" },
    ],
  ]);
});

test("background owns no residual chat cases", async () => {
  const source = await readFile(
    new URL("../../src/chrome/background/messagePipeline.ts", import.meta.url),
    "utf8",
  );
  for (const messageType of BACKGROUND_CHAT_MESSAGE_TYPES) {
    assert.doesNotMatch(source, new RegExp(`case ["']${messageType}["']`));
  }
});
