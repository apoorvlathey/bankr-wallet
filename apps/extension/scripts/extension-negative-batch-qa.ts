import { type Page, type Worker } from "@playwright/test";
import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  activateWithKeyboard,
  assertReviewSurface,
  closeWalletProfile,
  launchWalletProfile,
  reopenPopup,
  startDappServer,
  waitForPopup,
  waitForProvider,
  type WalletProfile,
  type WalletType,
} from "./extension-negative-batch-qa-support";

interface RejectionEvidence {
  method: "eth_sendTransaction" | "personal_sign";
  code: number;
  settlements: number;
  queueCleared: boolean;
  screenshot: string;
}

interface BatchEvidence {
  wallet: WalletType;
  bundleId: string;
  ackSettlements: number;
  callsStatus: number;
  pendingAfterClose: number;
  queueCleared: boolean;
  storedRejection: boolean;
  screenshot: string;
}

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(SCRIPT_DIR, "..");
const BUILD_DIR = path.join(APP_DIR, "build");
const OUTPUT_DIR = path.resolve(
  process.env.EXTENSION_NEGATIVE_BATCH_QA_OUTPUT ||
    path.join(APP_DIR, "extension-negative-batch-qa"),
);
const VIEW_ONLY_ADDRESS = "0x9999999999999999999999999999999999999999";

async function queueLength(worker: Worker, key: string): Promise<number> {
  return worker.evaluate(async (storageKey) => {
    const stored = await chrome.storage.local.get(storageKey);
    return Array.isArray(stored[storageKey]) ? stored[storageKey].length : 0;
  }, key);
}

async function addAndSelectViewOnly(profile: WalletProfile): Promise<void> {
  const result = await profile.helper.evaluate(async (address) => {
    const added = await chrome.runtime.sendMessage({
      type: "addImpersonatorAccount",
      address,
      displayName: "QA view-only",
    });
    if (added?.success !== true || added.account?.type !== "impersonator") return added;
    const selected = await chrome.runtime.sendMessage({
      type: "setActiveAccount",
      accountId: added.account.id,
    });
    const active = await chrome.runtime.sendMessage({ type: "getActiveAccount" });
    const sync = await chrome.storage.sync.get(["address", "displayAddress"]);
    return { added, selected, active, sync };
  }, VIEW_ONLY_ADDRESS);
  if (
    result?.added?.success !== true ||
    result?.selected?.success !== true ||
    result?.active?.type !== "impersonator" ||
    result.active.address?.toLowerCase() !== VIEW_ONLY_ADDRESS ||
    result.sync?.address?.toLowerCase() !== VIEW_ONLY_ADDRESS
  ) {
    throw new Error(`View-only selection failed: ${JSON.stringify(result)}`);
  }
}

async function openDapp(profile: WalletProfile, origin: string): Promise<Page> {
  const dapp = await profile.context.newPage();
  await dapp.goto(origin, { waitUntil: "domcontentloaded" });
  await waitForProvider(dapp);
  return dapp;
}

async function verifyViewOnlyRequest(
  profile: WalletProfile,
  dapp: Page,
  kind: "tx" | "sign",
): Promise<RejectionEvidence> {
  const ignored = new Set(profile.context.pages());
  await dapp.evaluate((requestKind) => {
    const qa = (window as any).__walletQa;
    void (requestKind === "tx" ? qa.startTx() : qa.startSign());
  }, kind);
  const popup = await waitForPopup(profile.context, profile.extensionId, ignored);
  const isTx = kind === "tx";
  await popup.getByRole("heading", {
    name: isTx ? "Review transaction" : "Review signature",
  }).waitFor({ timeout: 20_000 });
  await popup.getByText(
    isTx
      ? /Connected via an impersonated account\. Signing is disabled\./i
      : /view-only account and cannot create signatures/i,
  ).waitFor();
  if (await popup.getByRole("button", { name: isTx ? "Confirm" : "Sign", exact: true }).count()) {
    throw new Error(`${isTx ? "Confirm" : "Sign"} was exposed for a view-only account`);
  }
  await assertReviewSurface(popup);
  const screenshotPath = path.join(OUTPUT_DIR, `view-only-${kind}.png`);
  await popup.screenshot({ path: screenshotPath });
  const reject = popup.getByRole("button", {
    name: isTx ? /^Reject$/ : /^Reject request$/,
  });
  await activateWithKeyboard(popup, reject);
  await dapp.waitForFunction(
    (requestKind) => (window as any).__walletQa?.[requestKind]?.status === "rejected",
    kind,
    { timeout: 20_000 },
  );
  await dapp.waitForTimeout(500);
  const result = await dapp.evaluate((requestKind) => {
    const qa = (window as any).__walletQa;
    return {
      address: qa.address as string,
      code: qa[requestKind].code as number,
      settlements: qa[requestKind].settlements as number,
    };
  }, kind);
  const storageKey = isTx ? "pendingTxRequests" : "pendingSignatureRequests";
  const remaining = await queueLength(profile.worker, storageKey);
  if (
    result.address?.toLowerCase() !== VIEW_ONLY_ADDRESS ||
    result.code !== 4001 ||
    result.settlements !== 1 ||
    remaining !== 0
  ) {
    throw new Error(`Bad view-only ${kind} result: ${JSON.stringify({ result, remaining })}`);
  }
  if (!popup.isClosed()) await popup.close();
  return {
    method: isTx ? "eth_sendTransaction" : "personal_sign",
    code: result.code,
    settlements: result.settlements,
    queueCleared: true,
    screenshot: path.relative(APP_DIR, screenshotPath),
  };
}

async function runViewOnly(origin: string): Promise<RejectionEvidence[]> {
  const profile = await launchWalletProfile(BUILD_DIR, "bankr");
  try {
    await addAndSelectViewOnly(profile);
    const dapp = await openDapp(profile, origin);
    const evidence = [
      await verifyViewOnlyRequest(profile, dapp, "tx"),
      await verifyViewOnlyRequest(profile, dapp, "sign"),
    ];
    if (profile.runtimeErrors.length) {
      throw new Error(`View-only runtime errors:\n${profile.runtimeErrors.join("\n")}`);
    }
    return evidence;
  } finally {
    await closeWalletProfile(profile);
  }
}

async function readBatchTerminalState(worker: Worker, bundleId: string) {
  return worker.evaluate(async (id) => {
    const resultKey = `batchTxResult:${id}`;
    const stored = await chrome.storage.local.get([
      "pendingBatchTxRequests",
      "bundleStatuses",
      resultKey,
    ]);
    const status = Array.isArray(stored.bundleStatuses)
      ? stored.bundleStatuses.find((entry: { id?: string }) => entry.id === id)
      : undefined;
    return {
      pending: Array.isArray(stored.pendingBatchTxRequests)
        ? stored.pendingBatchTxRequests.length
        : 0,
      status,
      result: stored[resultKey]?.result,
    };
  }, bundleId);
}

async function runBatch(wallet: WalletType, origin: string): Promise<BatchEvidence> {
  const profile = await launchWalletProfile(BUILD_DIR, wallet);
  try {
    const dapp = await openDapp(profile, origin);
    const ignored = new Set(profile.context.pages());
    await dapp.evaluate(() => void (window as any).__walletQa.startBatch());
    await dapp.waitForFunction(
      () => (window as any).__walletQa?.batch?.status === "acknowledged",
      undefined,
      { timeout: 20_000 },
    );
    const ack = await dapp.evaluate(() => ({
      id: (window as any).__walletQa.batch.id as string,
      settlements: (window as any).__walletQa.batch.settlements as number,
    }));
    if (!ack.id || ack.settlements !== 1) throw new Error(`Bad batch ack: ${JSON.stringify(ack)}`);
    const initial = await waitForPopup(profile.context, profile.extensionId, ignored);
    await initial.getByRole("heading", { name: "Review batch" }).waitFor({ timeout: 20_000 });
    await initial.getByRole("button", { name: "Confirm", exact: true }).waitFor();
    await initial.getByRole("button", { name: "Reject", exact: true }).waitFor();
    await assertReviewSurface(initial);
    if (await queueLength(profile.worker, "pendingBatchTxRequests") !== 1) {
      throw new Error("Batch was not persisted before popup close");
    }
    await initial.close();
    const pendingAfterClose = await queueLength(profile.worker, "pendingBatchTxRequests");
    if (pendingAfterClose !== 1) throw new Error("Batch disappeared when popup closed");
    const reopened = await reopenPopup(profile);
    await reopened.getByRole("heading", { name: "Review batch" }).waitFor({ timeout: 20_000 });
    await reopened.getByRole("button", { name: "Confirm", exact: true }).waitFor();
    await assertReviewSurface(reopened);
    const screenshotPath = path.join(OUTPUT_DIR, `${wallet}-batch.png`);
    await reopened.screenshot({ path: screenshotPath });
    await activateWithKeyboard(
      reopened,
      reopened.getByRole("button", { name: "Reject", exact: true }),
    );
    await dapp.waitForTimeout(500);
    const terminal = await readBatchTerminalState(profile.worker, ack.id);
    if (
      terminal.pending !== 0 ||
      terminal.status?.status !== 400 ||
      !/rejected/i.test(terminal.status?.error || "") ||
      terminal.result?.success !== false ||
      !/rejected/i.test(terminal.result?.error || "")
    ) {
      throw new Error(`Bad terminal batch state: ${JSON.stringify(terminal)}`);
    }
    await dapp.evaluate(() => (window as any).__walletQa.readCallsStatus());
    await dapp.waitForFunction(
      () => (window as any).__walletQa?.callsStatus?.status === "resolved",
      undefined,
      { timeout: 20_000 },
    );
    await dapp.waitForTimeout(500);
    const dappResult = await dapp.evaluate(() => ({
      ackSettlements: (window as any).__walletQa.batch.settlements as number,
      statusSettlements: (window as any).__walletQa.callsStatus.settlements as number,
      callsStatus: (window as any).__walletQa.callsStatus.value?.status as number,
    }));
    if (dappResult.ackSettlements !== 1 || dappResult.statusSettlements !== 1 || dappResult.callsStatus !== 400) {
      throw new Error(`Bad dapp batch status: ${JSON.stringify(dappResult)}`);
    }
    if (profile.runtimeErrors.length) {
      throw new Error(`${wallet} runtime errors:\n${profile.runtimeErrors.join("\n")}`);
    }
    if (!reopened.isClosed()) await reopened.close();
    return {
      wallet,
      bundleId: ack.id,
      ackSettlements: dappResult.ackSettlements,
      callsStatus: dappResult.callsStatus,
      pendingAfterClose,
      queueCleared: true,
      storedRejection: true,
      screenshot: path.relative(APP_DIR, screenshotPath),
    };
  } finally {
    await closeWalletProfile(profile);
  }
}

async function main(): Promise<void> {
  await access(path.join(BUILD_DIR, "manifest.json"));
  await mkdir(OUTPUT_DIR, { recursive: true });
  const { server, origin } = await startDappServer();
  try {
    const viewOnly = await runViewOnly(origin);
    process.stdout.write("✓ view-only: transaction + personal_sign reject-only reviews\n");
    const batches: BatchEvidence[] = [];
    for (const wallet of ["bankr", "privateKey", "seedPhrase"] as const) {
      batches.push(await runBatch(wallet, origin));
      process.stdout.write(`✓ ${wallet}: persistent wallet_sendCalls review + rejection\n`);
    }
    process.stdout.write(`${JSON.stringify({ status: "passed", viewOnly, batches }, null, 2)}\n`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
