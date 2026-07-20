import assert from "node:assert/strict";
import test from "node:test";

import {
  announceProvider,
  setWindowEthereum,
} from "../../src/chrome/provider/inpage/announcement";
import {
  ImpersonatorProvider,
  UNCONNECTED_PROVIDER_ADDRESS,
} from "../../src/chrome/provider/inpage/provider";
import { setProviderInstance } from "../../src/chrome/provider/inpage/providerRegistry";
import { installContentResultRouter } from "../../src/chrome/provider/inpage/resultRouter";

test("inpage provider preserves request/result correlation and discovery", async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalCustomEvent = Object.getOwnPropertyDescriptor(
    globalThis,
    "CustomEvent",
  );
  const listeners = new Map<string, Array<(event: any) => void>>();
  const messages: any[] = [];
  const dispatched: any[] = [];
  const fakeWindow: any = {
    location: { href: "https://app.example/" },
    addEventListener(type: string, listener: (event: any) => void) {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    postMessage(message: any) {
      messages.push(message);
    },
    dispatchEvent(event: any) {
      dispatched.push(event);
      for (const listener of listeners.get(event.type) ?? []) listener(event);
      return true;
    },
  };
  class TestCustomEvent {
    type: string;
    detail: unknown;
    constructor(type: string, init: { detail?: unknown } = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  }
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: fakeWindow,
  });
  Object.defineProperty(globalThis, "CustomEvent", {
    configurable: true,
    value: TestCustomEvent,
  });

  const deliver = (data: any) => {
    for (const listener of listeners.get("message") ?? []) {
      listener({ source: fakeWindow, data });
    }
  };

  try {
    installContentResultRouter();
    const provider = new ImpersonatorProvider(
      8453,
      UNCONNECTED_PROVIDER_ADDRESS,
    );
    setProviderInstance(provider);
    assert.equal(provider.selectedAddress, null);
    assert.throws(() => {
      (provider as { selectedAddress: string | null }).selectedAddress =
        "0x0000000000000000000000000000000000000009";
    }, TypeError);

    const accountsPromise = provider.send("eth_requestAccounts");
    const accountsRequest = messages.at(-1);
    assert.deepEqual(accountsRequest.type, "i_dappAccounts");
    deliver({
      type: "dappAccountsResult",
      msg: {
        id: accountsRequest.msg.id,
        success: true,
        accounts: ["0x0000000000000000000000000000000000000002"],
      },
    });
    assert.deepEqual(await accountsPromise, [
      "0x0000000000000000000000000000000000000002",
    ]);
    assert.equal(
      provider.selectedAddress,
      "0x0000000000000000000000000000000000000002",
    );

    const disconnectedAccountsPromise = provider.send("eth_accounts");
    const disconnectedAccountsRequest = messages.at(-1);
    deliver({
      type: "dappAccountsResult",
      msg: {
        id: disconnectedAccountsRequest.msg.id,
        success: true,
        accounts: [],
      },
    });
    assert.deepEqual(await disconnectedAccountsPromise, []);
    assert.equal(provider.selectedAddress, null);

    deliver({
      type: "accountsChanged",
      msg: {
        accounts: ["0x0000000000000000000000000000000000000002"],
      },
    });
    assert.equal(
      provider.selectedAddress,
      "0x0000000000000000000000000000000000000002",
    );

    const txPromise = provider.send("eth_sendTransaction", [
      { to: "0x0000000000000000000000000000000000000003" },
    ]);
    const txRequest = messages.at(-1);
    assert.equal(txRequest.type, "i_sendTransaction");
    assert.equal(txRequest.msg.chainId, 8453);
    deliver({
      type: "sendTransactionResult",
      msg: { id: "different-request", success: true, txHash: "0xwrong" },
    });
    deliver({
      type: "sendTransactionResult",
      msg: { id: txRequest.msg.id, success: true, txHash: "0xhash" },
    });
    assert.equal(await txPromise, "0xhash");

    const batchPromise = provider.send("wallet_sendCalls", [
      { chainId: "0x2105", calls: [] },
    ]);
    const batchRequest = messages.at(-1);
    assert.equal(batchRequest.type, "i_walletSendCalls");
    deliver({
      type: "walletSendCallsResult",
      msg: { id: batchRequest.msg.id, success: true, result: { id: "bundle" } },
    });
    assert.deepEqual(await batchPromise, { id: "bundle" });

    await assert.rejects(
      provider.send("eth_sendRawTransaction", ["0x00"]),
      (error: any) => error?.code === -32601,
    );

    assert.equal(setWindowEthereum(provider), true);
    assert.equal(fakeWindow.ethereum, provider);
    announceProvider();
    const announcement = dispatched.find(
      (event) => event.type === "eip6963:announceProvider",
    );
    assert.equal(announcement.detail.provider, provider);
    assert.equal(announcement.detail.info.rdns, "com.walletchan");

    deliver({ type: "accountsChanged", msg: { accounts: [] } });
    assert.equal(provider.selectedAddress, null);
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (originalCustomEvent) {
      Object.defineProperty(globalThis, "CustomEvent", originalCustomEvent);
    } else {
      Reflect.deleteProperty(globalThis, "CustomEvent");
    }
  }
});
