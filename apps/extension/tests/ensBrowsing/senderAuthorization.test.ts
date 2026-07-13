import assert from "node:assert/strict";
import test from "node:test";

import {
  handleEnsBrowsingMessage,
  isAuthorizedEnsBrowsingSender,
} from "../../src/chrome/ensBrowsing/handlers";

const EXTENSION_ROOT = "chrome-extension://walletchan-test/";

function extensionSender(
  page: string,
  options: { frameId?: number; topUrl?: string; withTab?: boolean } = {},
): chrome.runtime.MessageSender {
  const url = `${EXTENSION_ROOT}${page}`;
  const withTab = options.withTab !== false;
  return {
    url,
    frameId: options.frameId ?? 0,
    ...(withTab
      ? {
          tab: {
            id: 7,
            url: options.topUrl ?? url,
          } as chrome.tabs.Tab,
        }
      : {}),
  };
}

function contentSender(frameId = 0): chrome.runtime.MessageSender {
  return {
    url: "http://bafy.ipfs.localhost:8080/",
    frameId,
    tab: {
      id: 7,
      url: "http://bafy.ipfs.localhost:8080/",
    } as chrome.tabs.Tab,
  };
}

function ordinarySiteSender(): chrome.runtime.MessageSender {
  return {
    url: "https://attacker.example/",
    frameId: 0,
    tab: {
      id: 7,
      url: "https://attacker.example/",
    } as chrome.tabs.Tab,
  };
}

test("ENS browsing messages are bound to their exact page and top frame", () => {
  const originalChrome = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: {
      runtime: {
        getURL(path: string) {
          return new URL(path, EXTENSION_ROOT).toString();
        },
      },
    },
  });

  try {
    const interstitial = extensionSender(
      "interstitial.html#https://example.eth/",
    );
    assert.equal(
      isAuthorizedEnsBrowsingSender("ens-cache-check", interstitial),
      true,
    );
    assert.equal(
      isAuthorizedEnsBrowsingSender("ens-resolve", interstitial),
      true,
    );

    const embeddedInterstitial = extensionSender(
      "interstitial.html#https://example.eth/",
      { frameId: 4, topUrl: "https://attacker.example/" },
    );
    assert.equal(
      isAuthorizedEnsBrowsingSender(
        "ens-cache-check",
        embeddedInterstitial,
      ),
      false,
    );
    assert.equal(
      isAuthorizedEnsBrowsingSender("ens-resolve", embeddedInterstitial),
      false,
    );

    // Defense in depth: even a malformed sender claiming frame zero cannot
    // mutate a tab whose visible top-level URL is still a website.
    const deceptiveInterstitial = extensionSender(
      "interstitial.html#https://example.eth/",
      { frameId: 0, topUrl: "https://attacker.example/" },
    );
    assert.equal(
      isAuthorizedEnsBrowsingSender("ens-resolve", deceptiveInterstitial),
      false,
    );
    assert.equal(
      isAuthorizedEnsBrowsingSender(
        "ens-resolve",
        extensionSender("index.html"),
      ),
      false,
    );

    assert.equal(
      isAuthorizedEnsBrowsingSender(
        "ens-open-on-gateway",
        extensionSender("ens-error.html?name=example.eth"),
      ),
      true,
    );
    assert.equal(
      isAuthorizedEnsBrowsingSender(
        "ens-open-on-gateway",
        extensionSender("ens-error.html", {
          frameId: 2,
          topUrl: "https://attacker.example/",
        }),
      ),
      false,
    );
    assert.equal(
      isAuthorizedEnsBrowsingSender("ens-open-on-gateway", contentSender()),
      true,
    );
    assert.equal(
      isAuthorizedEnsBrowsingSender(
        "ens-open-on-gateway",
        contentSender(3),
      ),
      false,
    );

    assert.equal(
      isAuthorizedEnsBrowsingSender(
        "ens-probe-kubo-api",
        extensionSender("setup-kubo.html"),
      ),
      true,
    );
    assert.equal(
      isAuthorizedEnsBrowsingSender(
        "ens-probe-kubo-api",
        extensionSender("setup-kubo.html", {
          frameId: 3,
          topUrl: "https://attacker.example/",
        }),
      ),
      false,
    );
    assert.equal(
      isAuthorizedEnsBrowsingSender(
        "ens-probe-kubo-api",
        extensionSender("index.html", { withTab: false }),
      ),
      true,
    );

    assert.equal(
      isAuthorizedEnsBrowsingSender("ens-cache-metadata", contentSender(5)),
      false,
    );
    assert.equal(
      isAuthorizedEnsBrowsingSender("ens-cache-metadata", contentSender()),
      true,
    );
    assert.equal(
      isAuthorizedEnsBrowsingSender(
        "ens-cache-metadata",
        ordinarySiteSender(),
      ),
      false,
    );
    assert.equal(
      isAuthorizedEnsBrowsingSender(
        "ens-cache-metadata",
        extensionSender("browse.html"),
      ),
      false,
    );
  } finally {
    if (originalChrome) {
      Object.defineProperty(globalThis, "chrome", originalChrome);
    } else {
      Reflect.deleteProperty(globalThis, "chrome");
    }
  }
});

test("embedded interstitial requests fail before cache or resolver work", () => {
  const originalChrome = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: {
      runtime: {
        getURL(path: string) {
          return new URL(path, EXTENSION_ROOT).toString();
        },
      },
    },
  });

  try {
    const sender = extensionSender("interstitial.html#https://example.eth/", {
      frameId: 5,
      topUrl: "https://attacker.example/",
    });
    for (const type of ["ens-cache-check", "ens-resolve"]) {
      let response: unknown;
      assert.equal(
        handleEnsBrowsingMessage(
          { type, name: "example.eth" },
          sender,
          (value) => {
            response = value;
          },
        ),
        true,
      );
      assert.deepEqual(response, { ok: false, error: "Unauthorized" });
    }
  } finally {
    if (originalChrome) {
      Object.defineProperty(globalThis, "chrome", originalChrome);
    } else {
      Reflect.deleteProperty(globalThis, "chrome");
    }
  }
});
