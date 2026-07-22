import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  notifyPrivacyPortfolioUpdated,
  PRIVACY_PORTFOLIO_UPDATED_MESSAGE,
} from "../../src/chrome/privacy/commitments/portfolioNotification";

test("private portfolio invalidation broadcasts no balance or commitment data", async () => {
  const messages: unknown[] = [];
  const originalChrome = globalThis.chrome;
  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: {
      runtime: {
        sendMessage(message: unknown) {
          messages.push(message);
          return Promise.resolve();
        },
      },
    },
  });

  try {
    notifyPrivacyPortfolioUpdated();
    assert.deepEqual(messages, [{ type: PRIVACY_PORTFOLIO_UPDATED_MESSAGE }]);
  } finally {
    Object.defineProperty(globalThis, "chrome", {
      configurable: true,
      value: originalChrome,
    });
  }
});

test("private Assets reloads directly when a commitment mutation is broadcast", async () => {
  const [repositorySource, hookSource] = await Promise.all([
    readFile(
      new URL("../../src/chrome/privacy/commitments/repository.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../src/components/Shield/hooks/useShieldOperations.ts", import.meta.url),
      "utf8",
    ),
  ]);

  assert.equal(
    repositorySource.match(/notifyPrivacyPortfolioUpdated\(\);/g)?.length,
    4,
    "status, Unshield, recovery, and insert commits must invalidate the aggregate",
  );
  assert.match(
    hookSource,
    /message\.type === PRIVACY_PORTFOLIO_UPDATED_MESSAGE[\s\S]*?void load\(\)/,
  );
});
