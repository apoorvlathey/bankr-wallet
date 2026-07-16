import assert from "node:assert/strict";
import test from "node:test";

import {
  BACKGROUND_CONTACT_BOOK_MESSAGE_TYPES,
  createBackgroundContactBookMessageRouter,
} from "../../src/chrome/background/contactBookRouter";

function capture() {
  let resolve!: (value: unknown) => void;
  const response = new Promise<unknown>((done) => { resolve = done; });
  return { response, sendResponse: resolve };
}

test("contact router exposes its reviewed manifest and broadcasts ordered results", async () => {
  assert.deepEqual(BACKGROUND_CONTACT_BOOK_MESSAGE_TYPES, [
    "getAddressContacts",
    "createAddressContact",
    "updateAddressContactLabel",
    "removeAddressContact",
    "reorderAddressContacts",
  ]);
  const broadcasts: unknown[] = [];
  const contacts = [{ address: "0x1111111111111111111111111111111111111111", label: "Alice" }];
  const route = createBackgroundContactBookMessageRouter({
    createAddressContact: async () => contacts as any,
    sendRuntimeMessage: async (message) => { broadcasts.push(message); },
  });
  const result = capture();
  assert.deepEqual(route({ type: "createAddressContact", address: contacts[0].address, label: "Alice" }, result.sendResponse), { handled: true, keepChannelOpen: true });
  assert.deepEqual(await result.response, { success: true, contacts });
  await Promise.resolve();
  assert.deepEqual(broadcasts, [{ type: "addressContactsUpdated", contacts }]);
});
