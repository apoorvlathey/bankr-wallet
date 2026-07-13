import assert from "node:assert/strict";
import test from "node:test";
import { BungeeStatusCode } from "@walletchan/shared/bungee";
import type { CompletedTransaction } from "../../src/chrome/history/types";
import type { PendingBridge } from "../../src/chrome/requests/pendingBridgeStorage";
import { createChromeStorageHarness } from "../helpers/chromeStorageHarness";

const SOURCE = `0x${"a".repeat(40)}`;
const RECEIVER = `0x${"b".repeat(40)}`;
const SOURCE_HASH = "0xSourceHash";

const pending: PendingBridge = {
  txId: "history-1",
  sourceTxHash: SOURCE_HASH,
  sourceChainId: 1,
  destinationChainId: 8453,
  destinationChainName: "Base",
  receiverAddress: RECEIVER,
  createdAt: 100,
  requestHash: "quote-old",
  routeName: "Old route",
};

function historyEntry(): CompletedTransaction {
  return {
    id: pending.txId,
    status: "success",
    tx: { from: SOURCE },
    origin: "https://dapp.example",
    favicon: null,
    chainName: "Ethereum",
    chainId: 1,
    createdAt: 1,
    txHash: SOURCE_HASH,
    bridge: {
      sourceChainId: 1,
      destinationChainId: 8453,
      destinationChainName: "Base",
      receiverAddress: RECEIVER,
      requestHash: "quote-old",
    },
  } as CompletedTransaction;
}

test("bridge terminal copy and explorer targets remain exact", async () => {
  const { describeBridgeTerminalNotification } = await import(
    "../../src/chrome/bridge/statusNotification"
  );
  assert.deepEqual(
    describeBridgeTerminalNotification(
      pending,
      BungeeStatusCode.FULFILLED,
      "0xdestination",
    ),
    {
      notificationId: "bridge-success-history-1",
      title: "Bridge Complete",
      message: "Funds delivered on Base. Click to view.",
      explorerChainId: 8453,
      explorerTxHash: "0xdestination",
    },
  );
  assert.deepEqual(
    describeBridgeTerminalNotification(
      pending,
      BungeeStatusCode.REFUNDED,
      undefined,
      "0xrefund",
    ),
    {
      notificationId: "bridge-failed-history-1",
      title: "Bridge Refunded",
      message: "Bridge to Base was refunded on source chain. Click to view.",
      explorerChainId: 1,
      explorerTxHash: "0xrefund",
    },
  );
  assert.equal(
    describeBridgeTerminalNotification(pending, BungeeStatusCode.PENDING),
    null,
  );
});

test("history mapping and status application preserve durable transition semantics", async () => {
  const entry = historyEntry();
  const harness = createChromeStorageHarness({
    local: {
      pendingBridges: { [SOURCE_HASH.toLowerCase()]: pending },
      txHistory: [entry],
    },
  });
  const notifications: Array<{
    id: string;
    options: chrome.notifications.NotificationOptions<true>;
  }> = [];
  (globalThis.chrome.runtime as any).getURL = (path: string) => `chrome://${path}`;
  (globalThis.chrome as any).notifications = {
    create(
      id: string,
      options: chrome.notifications.NotificationOptions<true>,
      callback: (createdId: string) => void,
    ) {
      notifications.push({ id, options });
      callback(id);
    },
  };

  try {
    const { pendingBridgeFromHistory } = await import(
      "../../src/chrome/bridge/statusPolling"
    );
    assert.deepEqual(pendingBridgeFromHistory(entry, 500), {
      txId: "history-1",
      sourceTxHash: SOURCE_HASH,
      sourceChainId: 1,
      destinationChainId: 8453,
      destinationChainName: "Base",
      receiverAddress: RECEIVER,
      createdAt: 500,
      requestHash: "quote-old",
      routeName: undefined,
    });
    assert.equal(
      pendingBridgeFromHistory(
        {
          ...entry,
          bridge: { ...entry.bridge!, destinationTxHash: "0xdone" },
        },
        500,
      ),
      null,
    );

    const { applyBridgeStatusEntry } = await import(
      "../../src/chrome/bridge/statusApplication"
    );
    assert.equal(
      await applyBridgeStatusEntry(SOURCE_HASH, pending, {
        bungeeStatusCode: BungeeStatusCode.EXTRACTED,
        hash: "quote-new",
        routeDetails: { name: "Across" },
      }),
      false,
    );
    let storedHistory = (harness.stores.local.txHistory as CompletedTransaction[])[0];
    assert.equal(storedHistory.bridge?.bungeeStatusCode, BungeeStatusCode.EXTRACTED);
    assert.equal(storedHistory.bridge?.requestHash, "quote-new");
    assert.equal(storedHistory.bridge?.routeName, "Across");
    let storedPending = (harness.stores.local.pendingBridges as Record<string, PendingBridge>)[
      SOURCE_HASH.toLowerCase()
    ];
    assert.equal(storedPending.bungeeStatusCode, BungeeStatusCode.EXTRACTED);
    assert.equal(typeof storedPending.lastPolledAt, "number");

    assert.equal(
      await applyBridgeStatusEntry(SOURCE_HASH, storedPending, {
        bungeeStatusCode: BungeeStatusCode.EXPIRED,
      }),
      true,
    );
    assert.deepEqual(harness.stores.local.pendingBridges, {});
    storedHistory = (harness.stores.local.txHistory as CompletedTransaction[])[0];
    assert.equal(storedHistory.bridge?.bungeeStatusCode, BungeeStatusCode.EXPIRED);
    assert.equal(notifications.at(-1)?.id, "bridge-failed-history-1");
    assert.equal(notifications.at(-1)?.options.title, "Bridge Expired");
    assert.equal(
      notifications.at(-1)?.options.message,
      "Bridge request to Base expired before settlement.",
    );
  } finally {
    harness.restore();
  }
});
