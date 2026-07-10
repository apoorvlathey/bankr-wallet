import AxeBuilder from "@axe-core/playwright";
import {
  chromium,
  type BrowserContext,
  type Locator,
  type Page,
  type Worker,
} from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type WalletType = "bankr" | "privateKey" | "seedPhrase";

export interface WalletProfile {
  context: BrowserContext;
  worker: Worker;
  extensionId: string;
  helper: Page;
  profileDir: string;
  runtimeErrors: string[];
}

const PASSWORD = "walletchan-negative-batch-qa";
const TEST_ADDRESS = "0x1111111111111111111111111111111111111111";
const TEST_PRIVATE_KEY = `0x${"44".repeat(32)}`;

const DAPP_HTML = String.raw`<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<link rel="icon" href="/favicon.svg" /><title>WalletChan negative and batch QA</title>
</head><body><main><h1>WalletChan negative and batch QA</h1></main><script>
const qa = window.__walletQa = {
  provider: null, address: null,
  tx: { status: "idle", settlements: 0, code: null },
  sign: { status: "idle", settlements: 0, code: null },
  batch: { status: "idle", settlements: 0, id: null },
  callsStatus: { status: "idle", settlements: 0, value: null },
};
window.addEventListener("eip6963:announceProvider", (event) => {
  if (event.detail?.info?.rdns === "com.walletchan") qa.provider = event.detail.provider;
});
window.dispatchEvent(new Event("eip6963:requestProvider"));
setInterval(() => window.dispatchEvent(new Event("eip6963:requestProvider")), 100);
qa.connect = async () => {
  const accounts = await qa.provider.request({ method: "eth_requestAccounts" });
  qa.address = accounts[0]; return qa.address;
};
qa.startTx = async () => {
  const address = qa.address || await qa.connect();
  Object.assign(qa.tx, { status: "pending", settlements: 0, code: null });
  qa.provider.request({ method: "eth_sendTransaction", params: [
    { from: address, to: "0x2222222222222222222222222222222222222222", value: "0x0", data: "0x" }
  ]}).then((value) => Object.assign(qa.tx, { status: "confirmed", value, settlements: qa.tx.settlements + 1 }))
    .catch((error) => Object.assign(qa.tx, { status: "rejected", code: error?.code ?? null,
      error: error?.message || String(error), settlements: qa.tx.settlements + 1 }));
};
qa.startSign = async () => {
  const address = qa.address || await qa.connect();
  Object.assign(qa.sign, { status: "pending", settlements: 0, code: null });
  qa.provider.request({ method: "personal_sign", params: ["0x57616c6c65744368616e205141", address] })
    .then((value) => Object.assign(qa.sign, { status: "signed", value, settlements: qa.sign.settlements + 1 }))
    .catch((error) => Object.assign(qa.sign, { status: "rejected", code: error?.code ?? null,
      error: error?.message || String(error), settlements: qa.sign.settlements + 1 }));
};
qa.startBatch = async () => {
  const address = qa.address || await qa.connect();
  Object.assign(qa.batch, { status: "pending", settlements: 0, id: null });
  qa.provider.request({ method: "wallet_sendCalls", params: [{
    version: "2.0.0", chainId: "0x2105", from: address, atomicRequired: false,
    calls: [
      { to: "0x2222222222222222222222222222222222222222", value: "0x0", data: "0x" },
      { to: "0x3333333333333333333333333333333333333333", value: "0x0", data: "0x" },
    ],
  }]}).then((value) => Object.assign(qa.batch, { status: "acknowledged", id: value.id,
      settlements: qa.batch.settlements + 1 }))
    .catch((error) => Object.assign(qa.batch, { status: "failed", code: error?.code ?? null,
      error: error?.message || String(error), settlements: qa.batch.settlements + 1 }));
};
qa.readCallsStatus = () => {
  Object.assign(qa.callsStatus, { status: "pending", settlements: 0, value: null });
  qa.provider.request({ method: "wallet_getCallsStatus", params: [qa.batch.id] })
    .then((value) => Object.assign(qa.callsStatus, { status: "resolved", value,
      settlements: qa.callsStatus.settlements + 1 }))
    .catch((error) => Object.assign(qa.callsStatus, { status: "failed", code: error?.code ?? null,
      error: error?.message || String(error), settlements: qa.callsStatus.settlements + 1 }));
};
</script></body></html>`;

export function startDappServer(): Promise<{ server: Server; origin: string }> {
  const server = createServer((request, response) => {
    if (request.url === "/favicon.svg") {
      response.writeHead(200, { "content-type": "image/svg+xml" });
      response.end('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#2563eb"/></svg>');
      return;
    }
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(DAPP_HTML);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("No dapp port"));
      resolve({ server, origin: `http://127.0.0.1:${address.port}` });
    });
  });
}

function observePage(page: Page, errors: string[]): void {
  page.on("pageerror", (error) => errors.push(`${page.url()}: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (/failed to load resource|net::ERR_|favicon/i.test(text)) return;
    errors.push(`${page.url()}: ${text}`);
  });
}

async function completeOnboarding(page: Page, wallet: WalletType): Promise<void> {
  await page.getByRole("button", { name: "Set up WalletChan" }).waitFor();
  await page.getByRole("button", { name: "Set up WalletChan" }).click();
  await page.getByRole("radio", { name: wallet === "bankr" ? /^Bankr account\b/ :
    wallet === "privateKey" ? /^Private key\b/ : /^Seed phrase\b/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  if (wallet === "bankr") {
    await page.getByLabel("Bankr API key").fill("walletchan-negative-batch-key");
    await page.getByLabel("Linked wallet address").fill(TEST_ADDRESS);
    await page.getByRole("button", { name: "Continue" }).click();
  } else if (wallet === "privateKey") {
    await page.getByLabel("Private Key").fill(TEST_PRIVATE_KEY);
    await page.getByRole("button", { name: "Continue" }).click();
  } else {
    await page.getByText("Generate new phrase", { exact: true }).click();
    await page.getByRole("button", { name: "I’ve saved my seed phrase" }).click();
  }
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirm password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create wallet" }).click();
  await page.getByRole("heading", { name: "Your wallet is ready" }).waitFor({ timeout: 30_000 });
  for (const message of [
    { type: "setSidePanelMode", enabled: false },
    { type: "ensureNetworksInfo" },
  ]) {
    const result = await page.evaluate((value) => chrome.runtime.sendMessage(value), message);
    if (result?.success !== true) throw new Error(`${message.type} failed`);
  }
}

export async function launchWalletProfile(buildDir: string, wallet: WalletType): Promise<WalletProfile> {
  const profileDir = await mkdtemp(path.join(os.tmpdir(), `walletchan-neg-batch-${wallet}-`));
  const runtimeErrors: string[] = [];
  const context = await chromium.launchPersistentContext(profileDir, {
    channel: "chromium",
    headless: process.env.EXTENSION_QA_HEADLESS !== "0",
    viewport: { width: 360, height: 680 },
    args: ["--disable-background-timer-throttling", "--disable-renderer-backgrounding",
      `--disable-extensions-except=${buildDir}`, `--load-extension=${buildDir}`],
  });
  context.on("page", (page) => observePage(page, runtimeErrors));
  for (const page of context.pages()) observePage(page, runtimeErrors);
  const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker", { timeout: 20_000 });
  const extensionId = new URL(worker.url()).host;
  const helper = context.pages()[0] || await context.newPage();
  await helper.goto(`chrome-extension://${extensionId}/onboarding.html`, { waitUntil: "domcontentloaded" });
  await completeOnboarding(helper, wallet);
  return { context, worker, extensionId, helper, profileDir, runtimeErrors };
}

export async function closeWalletProfile(profile: WalletProfile): Promise<void> {
  await profile.context.close();
  await rm(profile.profileDir, { recursive: true, force: true });
}

export async function waitForProvider(dapp: Page): Promise<void> {
  await dapp.waitForFunction(() => (window as any).__walletQa?.provider, undefined, { timeout: 15_000 });
}

export async function waitForPopup(
  context: BrowserContext, extensionId: string, ignored: Set<Page>,
): Promise<Page> {
  const prefix = `chrome-extension://${extensionId}/index.html`;
  const started = Date.now();
  while (Date.now() - started < 20_000) {
    const popup = context.pages().find((page) => !ignored.has(page) && page.url().startsWith(prefix));
    if (popup) { await popup.waitForLoadState("domcontentloaded"); return popup; }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Extension review popup did not open");
}

export async function reopenPopup(profile: WalletProfile): Promise<Page> {
  if (profile.helper.isClosed()) {
    profile.helper = await profile.context.newPage();
    await profile.helper.goto(
      `chrome-extension://${profile.extensionId}/onboarding.html?negative-batch-helper=1`,
      { waitUntil: "domcontentloaded" },
    );
  }
  const previous = new Set(profile.context.pages());
  const result = await profile.helper.evaluate(() =>
    chrome.runtime.sendMessage({ type: "openPopupWindow" }));
  if (result?.success !== true) throw new Error("Popup reopen failed");
  return waitForPopup(profile.context, profile.extensionId, previous);
}

export async function assertReviewSurface(page: Page): Promise<void> {
  await page.waitForTimeout(500);
  const failures = await page.evaluate(() => {
    const result: string[] = [];
    const owner = document.querySelector("[data-screen-scroll-owner]");
    if (!owner) result.push("mobile screen scroll owner missing");
    if (document.querySelector('[role="dialog"]')) result.push("review rendered as a dialog");
    const width = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    if (width > window.innerWidth + 1) result.push(`${width - window.innerWidth}px overflow`);
    const broken = [...document.images].filter((image) =>
      image.src && image.complete && image.naturalWidth === 0);
    if (broken.length) result.push(`${broken.length} broken image(s)`);
    return result;
  });
  if (failures.length) throw new Error(failures.join(", "));
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  const severe = axe.violations.filter(({ impact }) => impact === "critical" || impact === "serious");
  if (severe.length) throw new Error(`Accessibility: ${severe.map(({ id }) => id).join(", ")}`);
}

export async function activateWithKeyboard(page: Page, action: Locator): Promise<void> {
  await action.waitFor({ timeout: 20_000 });
  for (let index = 0; index < 80; index += 1) {
    if (await action.evaluate((element) => element === document.activeElement)) {
      await page.keyboard.press("Enter");
      return;
    }
    await page.keyboard.press("Tab");
  }
  throw new Error("Reject action was not keyboard reachable");
}
