import assert from "node:assert/strict";
import test from "node:test";

import {
  ADDRESS_CONTACTS_STORAGE_KEY,
  createAddressContact,
  getAddressContacts,
  removeAddressContact,
  reorderAddressContacts,
  updateAddressContactLabel,
} from "../../src/chrome/contactBook/repository";

function installStorage(initial: unknown = []) {
  let value = initial;
  const previous = globalThis.chrome;
  globalThis.chrome = {
    storage: {
      local: {
        get: async () => ({ [ADDRESS_CONTACTS_STORAGE_KEY]: value }),
        set: async (record: Record<string, unknown>) => { value = record[ADDRESS_CONTACTS_STORAGE_KEY]; },
      },
    },
  } as any;
  return { read: () => value, restore: () => { globalThis.chrome = previous; } };
}

test("contacts normalize addresses, insert alphabetically, and retain edit position", async () => {
  const storage = installStorage();
  try {
    await createAddressContact("0x2222222222222222222222222222222222222222", "Zed");
    await createAddressContact("0x1111111111111111111111111111111111111111", "alice");
    assert.deepEqual((await getAddressContacts()).map(({ label }) => label), ["alice", "Zed"]);
    await updateAddressContactLabel("0x1111111111111111111111111111111111111111", "Zulu");
    assert.deepEqual((await getAddressContacts()).map(({ label }) => label), ["Zulu", "Zed"]);
  } finally { storage.restore(); }
});

test("contacts reject duplicates and stale reorder permutations", async () => {
  const storage = installStorage();
  try {
    await createAddressContact("0x1111111111111111111111111111111111111111", "Alice");
    await assert.rejects(createAddressContact("0x1111111111111111111111111111111111111111", "Other"), /already/u);
    await assert.rejects(reorderAddressContacts([]), /out of date/u);
  } finally { storage.restore(); }
});

test("contacts persist exact manual order and delete by normalized address", async () => {
  const storage = installStorage([
    { address: "0x1111111111111111111111111111111111111111", label: "Alice" },
    { address: "0x2222222222222222222222222222222222222222", label: "Bob" },
  ]);
  try {
    const reordered = await reorderAddressContacts([
      "0x2222222222222222222222222222222222222222",
      "0x1111111111111111111111111111111111111111",
    ]);
    assert.deepEqual(reordered.map(({ label }) => label), ["Bob", "Alice"]);
    const remaining = await removeAddressContact("0x2222222222222222222222222222222222222222");
    assert.deepEqual(remaining.map(({ label }) => label), ["Alice"]);
    assert.ok(Array.isArray(storage.read()));
  } finally { storage.restore(); }
});
