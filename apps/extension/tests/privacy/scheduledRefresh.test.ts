import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  describePrivacyShieldApprovalNotification,
  shouldNotifyPrivacyShieldApproval,
} from "../../src/chrome/privacy/operations/notification";
import {
  runPrivacyAspScheduledRefresh,
  type PrivacyAspScheduledRefreshDependencies,
} from "../../src/chrome/privacy/asp/scheduledRefresh";
import {
  PRIVACY_ASP_REFRESH_ALARM,
} from "../../src/chrome/privacy/asp/alarmSchedule";
import { registerPrivacyAspRefreshLifecycle } from "../../src/chrome/background/lifecycle/privacyAspRefresh";

function operation(
  accountType: "bankr" | "privateKey" | "seedPhrase" | "ledger",
  state: "awaiting_asp" | "asp_approved" | "private_ready",
): any {
  return {
    summary: { id: `${accountType}-shield`, accountType, state },
    tracking: { state },
  };
}

test("Shield-approval notification is one-time and lock-screen generic", () => {
  const notification = describePrivacyShieldApprovalNotification("operation-1");
  assert.deepEqual(notification, {
    id: "privacy-shield-ready-operation-1",
    title: "Shielding approved",
    message: "Your Shielded ETH passed the Privacy Pools compliance check.",
  });
  assert.doesNotMatch(notification.message, /0x|\d|Ethereum|Sepolia/i);

  assert.equal(shouldNotifyPrivacyShieldApproval({
    status: "updated",
    operation: operation("privateKey", "asp_approved"),
  }), true);
  assert.equal(shouldNotifyPrivacyShieldApproval({
    status: "unchanged",
    operation: operation("privateKey", "asp_approved"),
  }), false);
  assert.equal(shouldNotifyPrivacyShieldApproval({
    status: "updated",
    operation: operation("privateKey", "private_ready"),
  }), false);
});

test("closed-popup ASP refresh supports every custody wallet type", async () => {
  for (const accountType of ["bankr", "privateKey", "seedPhrase", "ledger"] as const) {
    let operations = [operation(accountType, "awaiting_asp")];
    const calls: string[] = [];
    const dependencies: PrivacyAspScheduledRefreshDependencies = {
      listOperations: async () => operations,
      getPrivacyKey: () => ({}) as any,
      tryRestoreSession: async () => {
        calls.push("restore");
        return true;
      },
      materializeCommitments: async () => {
        calls.push("materialize");
        return { status: "current", materialized: 1 };
      },
      refreshOperations: async () => {
        calls.push("operations");
        operations = [operation(accountType, "private_ready")];
        return { status: "current", reviewed: 1, ready: 1 };
      },
      refreshCommitments: async () => {
        calls.push("commitments");
        return { status: "current", reviewed: 1, ready: 1 };
      },
      scheduleNext: () => calls.push("schedule"),
      clearScheduled: () => calls.push("clear"),
    } as PrivacyAspScheduledRefreshDependencies;

    assert.equal(await runPrivacyAspScheduledRefresh(dependencies), "refreshed");
    assert.deepEqual(calls, ["materialize", "operations", "commitments", "clear"]);
  }
});

test("a cold privacy key still verifies and records public ASP approval", async () => {
  const calls: string[] = [];
  let operations = [operation("seedPhrase", "awaiting_asp")];
  const dependencies = {
    listOperations: async () => operations,
    getPrivacyKey: () => null,
    tryRestoreSession: async () => {
      calls.push("restore");
      return false;
    },
    materializeCommitments: async () => {
      calls.push("materialize");
    },
    refreshOperations: async () => {
      calls.push("operations");
      operations = [operation("seedPhrase", "asp_approved")];
      return { status: "current", reviewed: 1, ready: 0 };
    },
    refreshCommitments: async () => {
      calls.push("commitments");
    },
    scheduleNext: () => calls.push("schedule"),
    clearScheduled: () => calls.push("clear"),
  } as unknown as PrivacyAspScheduledRefreshDependencies;

  assert.equal(await runPrivacyAspScheduledRefresh(dependencies), "observed");
  assert.deepEqual(calls, ["restore", "operations", "clear"]);
});

test("only the exact Shield alarm triggers the background refresh", async () => {
  let listener!: (alarm: { name: string }) => void;
  let runs = 0;
  let resolveRun!: () => void;
  const ran = new Promise<void>((resolve) => {
    resolveRun = resolve;
  });
  registerPrivacyAspRefreshLifecycle({
    alarmEvent: { addListener: (next) => { listener = next; } },
    runScheduledRefresh: async () => {
      runs += 1;
      resolveRun();
    },
    warn: () => {},
  });

  listener({ name: "unrelated" });
  assert.equal(runs, 0);
  listener({ name: PRIVACY_ASP_REFRESH_ALARM });
  await ran;
  assert.equal(runs, 1);
});

test("Chrome and Firefox package the alarms and notifications permissions", async () => {
  const manifests = await Promise.all([
    readFile(new URL("../../public/manifest.json", import.meta.url), "utf8"),
    readFile(new URL("../../manifest.firefox.json", import.meta.url), "utf8"),
  ]);
  for (const raw of manifests) {
    const manifest = JSON.parse(raw) as { permissions?: string[] };
    assert.ok(manifest.permissions?.includes("alarms"));
    assert.ok(manifest.permissions?.includes("notifications"));
  }
});
