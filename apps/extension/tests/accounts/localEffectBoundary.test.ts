import assert from "node:assert/strict";
import test from "node:test";

test("the local account effect boundary rejects removal, type conversion, and address replacement", async () => {
  const originalChrome = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  const intactAccount = {
    id: "local-1",
    type: "privateKey",
    address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    createdAt: 1,
  };
  const state: Record<string, unknown> = { accounts: [intactAccount] };
  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: {
      storage: {
        local: {
          async get(key: string) {
            return { [key]: state[key] };
          },
          async remove(keys: string | string[]) {
            for (const key of Array.isArray(keys) ? keys : [keys]) {
              delete state[key];
            }
          },
        },
      },
    },
  });

  try {
    const { assertLocalAccountEffectBinding } = await import(
      "../../src/chrome/accounts/localEffectBoundary"
    );
    const expected = {
      id: intactAccount.id,
      type: intactAccount.type,
      address: intactAccount.address,
    };
    await assert.doesNotReject(assertLocalAccountEffectBinding(expected));
    await assert.doesNotReject(
      assertLocalAccountEffectBinding({
        ...expected,
        address: expected.address.toUpperCase(),
      }),
    );

    for (const accounts of [
      [],
      [{ ...intactAccount, type: "seedPhrase" }],
      [
        {
          ...intactAccount,
          address: "0x2222222222222222222222222222222222222222",
        },
      ],
    ]) {
      state.accounts = accounts;
      await assert.rejects(
        assertLocalAccountEffectBinding(expected),
        /account is no longer available/i,
      );
      state.accounts = [intactAccount];
    }
  } finally {
    if (originalChrome) {
      Object.defineProperty(globalThis, "chrome", originalChrome);
    } else {
      Reflect.deleteProperty(globalThis, "chrome");
    }
  }
});
