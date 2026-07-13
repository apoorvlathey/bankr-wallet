import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";

type Listener = (...args: unknown[]) => void;

test("passkey creation reuses creation-time PRF and falls back once when absent", async () => {
  const originalDescriptors = new Map(
    ["window", "document", "navigator", "PublicKeyCredential"].map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );
  const listeners = new Map<string, Listener>();

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      setTimeout,
      clearTimeout,
      addEventListener(type: string, listener: Listener) {
        listeners.set(`window:${type}`, listener);
      },
      removeEventListener(type: string) {
        listeners.delete(`window:${type}`);
      },
    },
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      visibilityState: "visible",
      hasFocus: () => true,
      addEventListener(type: string, listener: Listener) {
        listeners.set(`document:${type}`, listener);
      },
      removeEventListener(type: string) {
        listeners.delete(`document:${type}`);
      },
    },
  });
  Object.defineProperty(globalThis, "PublicKeyCredential", {
    configurable: true,
    value: {
      isUserVerifyingPlatformAuthenticatorAvailable: async () => true,
    },
  });

  let createCalls = 0;
  let getCalls = 0;
  let returnCreationPrf = true;
  const creationPrf = new Uint8Array(32).fill(0x11).buffer;
  const assertionPrf = new Uint8Array(32).fill(0x22).buffer;

  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      userAgent: "Chrome",
      credentials: {
        async create() {
          createCalls++;
          return {
            rawId: new Uint8Array([1, 2, 3, 4]).buffer,
            getClientExtensionResults: () => ({
              prf: returnCreationPrf
                ? { enabled: true, results: { first: creationPrf } }
                : { enabled: true },
            }),
          };
        },
        async get() {
          getCalls++;
          return {
            rawId: new Uint8Array([1, 2, 3, 4]).buffer,
            getClientExtensionResults: () => ({
              prf: { results: { first: assertionPrf } },
            }),
          };
        },
      },
    },
  });

  try {
    const passkey = await import("../../src/lib/passkeyWebAuthn");
    const first = await passkey.createPasskeyUnlockCredential();
    assert.equal(createCalls, 1);
    assert.equal(getCalls, 0);
    assert.equal(
      first.prfKeyMaterial,
      Buffer.from(creationPrf).toString("base64url"),
    );
    assert.equal(Buffer.from(first.prfSalt, "base64url").byteLength, 32);

    returnCreationPrf = false;
    const second = await passkey.createPasskeyUnlockCredential();
    assert.equal(createCalls, 2);
    assert.equal(getCalls, 1);
    assert.equal(
      second.prfKeyMaterial,
      Buffer.from(assertionPrf).toString("base64url"),
    );
    assert.equal(listeners.size, 0);
  } finally {
    for (const [key, descriptor] of originalDescriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
