import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { createChromeStorageHarness } from "../helpers/chromeStorageHarness";

const originalFetch = globalThis.fetch;
const chat = await import("../../src/chrome/bankr/chat/client");
const chatHandlers = await import("../../src/chrome/bankr/chat/handlers");
const chatStorage = await import("../../src/chrome/bankr/chat/storage");

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("Bankr chat caps outgoing prompt and validates the returned job id", async () => {
  assert.equal(chat.formatConversationPrompt([], "x".repeat(20_000)).length, 10_000);

  let request: RequestInit | undefined;
  globalThis.fetch = async (_input, init) => {
    request = init;
    return new Response(JSON.stringify({ jobId: "safe_job-1" }), {
      status: 200,
    });
  };
  assert.deepEqual(
    await chat.submitChatPrompt("secret-api-key", "hello"),
    { jobId: "safe_job-1" },
  );
  assert.equal(request?.redirect, "error");
  assert.equal(
    (request?.headers as Record<string, string>)["X-API-Key"],
    "secret-api-key",
  );

  globalThis.fetch = async () =>
    new Response(JSON.stringify({ jobId: "../wallet/sign" }), { status: 200 });
  await assert.rejects(
    chat.submitChatPrompt("secret-api-key", "hello"),
    /invalid chat job ID/i,
  );
});

test("chat handler rejects malformed renderer fields before credential access", async () => {
  assert.deepEqual(
    await chatHandlers.handleSubmitChatPrompt("conversation", "message", ""),
    { success: false, error: "Invalid chat request" },
  );
  assert.deepEqual(
    await chatHandlers.handleSubmitChatPrompt(
      "conversation",
      "message",
      "x".repeat(10_001),
    ),
    { success: false, error: "Invalid chat request" },
  );
});

test("Bankr chat rejects oversized bodies and sanitizes remote errors", async () => {
  globalThis.fetch = async () =>
    new Response("{}", {
      status: 200,
      headers: { "content-length": String(70 * 1024) },
    });
  await assert.rejects(
    chat.submitChatPrompt("secret-api-key", "hello"),
    /allowed size/i,
  );

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({ error: `denied\u0000${"x".repeat(2_000)}` }),
      { status: 400 },
    );
  await assert.rejects(
    chat.submitChatPrompt("secret-api-key", "hello"),
    (error: unknown) =>
      error instanceof Error &&
      error.message.length <= 1_000 &&
      !error.message.includes("\u0000"),
  );
});

test("chat storage preserves its key, ordering, and bounded message history", async () => {
  const harness = createChromeStorageHarness();
  try {
    const older = await chatStorage.createConversation("Older");
    const newer = await chatStorage.createConversation("Newer");
    older.updatedAt = 1;
    newer.updatedAt = 2;
    await chatStorage.saveConversation(older);
    await chatStorage.saveConversation(newer);
    await chatStorage.toggleConversationFavorite(older.id);

    const ordered = await chatStorage.getConversations();
    assert.deepEqual(
      ordered.map(({ id }) => id),
      [older.id, newer.id],
    );
    for (let index = 0; index < 101; index += 1) {
      await chatStorage.addMessageToConversation(older.id, {
        id: `message-${index}`,
        role: "user",
        content: `message ${index}`,
        timestamp: index,
      });
    }
    const bounded = await chatStorage.getConversation(older.id);
    assert.equal(bounded?.messages.length, 100);
    assert.equal(bounded?.messages[0].id, "message-1");
    assert.deepEqual(Object.keys(harness.stores.local), ["chatHistory"]);

    await chatStorage.clearChatHistory();
    assert.deepEqual(harness.stores.local.chatHistory, []);
  } finally {
    harness.restore();
  }
});
