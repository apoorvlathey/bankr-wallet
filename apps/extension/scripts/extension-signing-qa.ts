import AxeBuilder from "@axe-core/playwright";
import {
  chromium,
  type BrowserContext,
  type Page,
  type Worker,
} from "@playwright/test";
import { access, mkdir, mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

type WalletType = "bankr" | "privateKey" | "seedPhrase";
type SignatureMethod = "personal_sign" | "eth_signTypedData_v4";

interface SigningEvidence {
  wallet: WalletType;
  method: SignatureMethod;
  rejectionCode: number | null;
  settlements: number;
  screenshot: string;
}

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(SCRIPT_DIR, "..");
const BUILD_DIR = path.join(APP_DIR, "build");
const OUTPUT_DIR = path.resolve(
  process.env.EXTENSION_SIGNING_QA_OUTPUT ||
    path.join(APP_DIR, "extension-signing-qa"),
);
const PASSWORD = "walletchan-signing-qa-password";
const TEST_ADDRESS = "0x1111111111111111111111111111111111111111";
const TEST_PRIVATE_KEY = `0x${"33".repeat(32)}`;
const METHODS: SignatureMethod[] = ["personal_sign", "eth_signTypedData_v4"];

const DAPP_HTML = String.raw`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <title>WalletChan signing QA</title>
  </head>
  <body>
    <main><h1>WalletChan signing QA</h1></main>
    <script>
      const qa = window.__signQa = {
        provider: null, address: null, status: "booting", settlements: 0,
        code: null, method: null,
      };
      window.addEventListener("eip6963:announceProvider", (event) => {
        if (event.detail?.info?.rdns === "com.walletchan") {
          qa.provider = event.detail.provider;
          if (qa.status === "booting") qa.status = "ready";
        }
      });
      window.dispatchEvent(new Event("eip6963:requestProvider"));
      setInterval(() => window.dispatchEvent(new Event("eip6963:requestProvider")), 100);
      qa.start = async (method) => {
        if (!qa.address) {
          const accounts = await qa.provider.request({ method: "eth_requestAccounts" });
          qa.address = accounts[0];
        }
        qa.status = "pending";
        qa.settlements = 0;
        qa.code = null;
        qa.method = method;
        const typedData = {
          types: {
            EIP712Domain: [
              { name: "name", type: "string" },
              { name: "version", type: "string" },
              { name: "chainId", type: "uint256" },
            ],
            Review: [{ name: "purpose", type: "string" }],
          },
          primaryType: "Review",
          domain: { name: "WalletChan QA", version: "1", chainId: 8453 },
          message: { purpose: "Review presentation without signing" },
        };
        const params = method === "personal_sign"
          ? ["0x57616c6c65744368616e20726576696577206f6e6c79", qa.address]
          : [qa.address, JSON.stringify(typedData)];
        qa.provider.request({ method, params }).then((signature) => {
          qa.signature = signature;
          qa.status = "signed";
          qa.settlements += 1;
        }).catch((error) => {
          qa.error = error?.message || String(error);
          qa.code = error?.code ?? null;
          qa.status = "rejected";
          qa.settlements += 1;
        });
      };
    </script>
  </body>
</html>`;

function startDappServer(): Promise<{ server: Server; origin: string }> {
  const server = createServer((request, response) => {
    if (request.url === "/favicon.svg") {
      response.writeHead(200, { "content-type": "image/svg+xml" });
      response.end(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#2563eb"/><path d="M8 10h4l4 12 4-12h4l-6 16h-4z" fill="white"/></svg>',
      );
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
      if (!address || typeof address === "string") {
        reject(new Error("Could not determine signing QA dapp port"));
        return;
      }
      resolve({ server, origin: `http://127.0.0.1:${address.port}` });
    });
  });
}

async function waitForWorker(context: BrowserContext): Promise<Worker> {
  return (
    context.serviceWorkers()[0] ||
    context.waitForEvent("serviceworker", { timeout: 20_000 })
  );
}

function observePage(page: Page, errors: string[]): void {
  page.on("pageerror", (error) => errors.push(`${page.url()}: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const value = message.text();
    if (/failed to load resource|net::ERR_ABORTED/i.test(value)) return;
    errors.push(`${page.url()}: ${value}`);
  });
}

async function completeOnboarding(page: Page, wallet: WalletType): Promise<void> {
  await page.getByRole("button", { name: "Set up WalletChan" }).click();
  await page
    .getByRole("radio", {
      name:
        wallet === "bankr"
          ? /^Bankr account\b/
          : wallet === "privateKey"
            ? /^Private key\b/
            : /^Seed phrase\b/,
    })
    .click();
  await page.getByRole("button", { name: "Continue" }).click();
  if (wallet === "bankr") {
    await page.getByLabel("Bankr API key").fill("walletchan-signing-qa-key");
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
  await page
    .getByRole("heading", { name: "Your wallet is ready" })
    .waitFor({ timeout: 30_000 });
  const popupMode = await page.evaluate(() =>
    chrome.runtime.sendMessage({ type: "setSidePanelMode", enabled: false }),
  );
  if (popupMode?.success !== true) throw new Error("Could not enable popup mode");
  const networks = await page.evaluate(() =>
    chrome.runtime.sendMessage({ type: "ensureNetworksInfo" }),
  );
  if (networks?.success !== true) throw new Error("Could not initialize networks");
}

async function findPopup(
  context: BrowserContext,
  extensionId: string,
  ignored: Set<Page>,
): Promise<Page> {
  const url = `chrome-extension://${extensionId}/index.html`;
  const startedAt = Date.now();
  while (Date.now() - startedAt < 20_000) {
    const popup = context
      .pages()
      .find((page) => !ignored.has(page) && page.url().startsWith(url));
    if (popup) {
      await popup.waitForLoadState("domcontentloaded");
      return popup;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Signature review popup did not open");
}

async function reopenPopup(
  context: BrowserContext,
  extensionId: string,
): Promise<Page> {
  const helper = await context.newPage();
  await helper.goto(
    `chrome-extension://${extensionId}/onboarding.html?signing-qa-helper=1`,
    { waitUntil: "domcontentloaded" },
  );
  const previous = new Set(context.pages());
  const response = await helper.evaluate(() =>
    chrome.runtime.sendMessage({ type: "openPopupWindow" }),
  );
  if (response?.success !== true) throw new Error("Popup reopen request failed");
  const popup = await findPopup(context, extensionId, previous);
  await helper.close();
  return popup;
}

async function assertReviewSurface(page: Page): Promise<void> {
  await page.getByRole("heading", { name: "Review signature" }).waitFor({
    timeout: 20_000,
  });
  const sign = page.getByRole("button", { name: "Sign", exact: true });
  await sign.waitFor();
  if (!(await sign.isEnabled())) throw new Error("Sign action is disabled");
  await page.getByRole("button", { name: "Reject", exact: true }).waitFor();
  const failures = await page.evaluate(() => {
    const result: string[] = [];
    const owner = document.querySelector("[data-screen-scroll-owner]");
    const screen = owner?.parentElement;
    if (!owner || !screen) result.push("mobile screen structure missing");
    if (document.querySelector('[role="dialog"]')) result.push("review rendered as dialog");
    if (screen) {
      const rect = screen.getBoundingClientRect();
      if (rect.width < window.innerWidth - 2 || rect.height < window.innerHeight - 2) {
        result.push("review does not fill the extension viewport");
      }
    }
    const width = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    if (width > window.innerWidth + 1) result.push(`${width - window.innerWidth}px overflow`);
    const broken = [...document.images].filter(
      (image) => image.src && image.complete && image.naturalWidth === 0,
    );
    if (broken.length) result.push(`${broken.length} broken image(s)`);
    return result;
  });
  if (failures.length) throw new Error(failures.join(", "));
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const severe = axe.violations.filter(
    ({ impact }) => impact === "critical" || impact === "serious",
  );
  if (severe.length) {
    throw new Error(`Accessibility: ${severe.map(({ id }) => id).join(", ")}`);
  }
}

async function rejectWithKeyboard(page: Page): Promise<void> {
  const reject = page.getByRole("button", { name: "Reject", exact: true });
  for (let index = 0; index < 60; index += 1) {
    if (await reject.evaluate((element) => element === document.activeElement)) {
      await page.keyboard.press("Enter");
      return;
    }
    await page.keyboard.press("Tab");
  }
  throw new Error("Reject action was not keyboard reachable");
}

async function runMethod(
  context: BrowserContext,
  worker: Worker,
  extensionId: string,
  dapp: Page,
  wallet: WalletType,
  method: SignatureMethod,
): Promise<SigningEvidence> {
  const ignored = new Set(context.pages());
  await dapp.evaluate((requestedMethod) => {
    void (window as any).__signQa.start(requestedMethod);
  }, method);
  const initial = await findPopup(context, extensionId, ignored);
  await assertReviewSurface(initial);
  const pending = await worker.evaluate(async () => {
    const stored = await chrome.storage.local.get("pendingSignatureRequests");
    return Array.isArray(stored.pendingSignatureRequests)
      ? stored.pendingSignatureRequests.map((request) => request.signature?.method)
      : [];
  });
  if (pending.length !== 1 || pending[0] !== method) {
    throw new Error(`Unexpected pending signatures: ${JSON.stringify(pending)}`);
  }
  await initial.close();
  const reopened = await reopenPopup(context, extensionId);
  await assertReviewSurface(reopened);
  const screenshotPath = path.join(OUTPUT_DIR, `${wallet}-${method}.png`);
  await reopened.screenshot({ path: screenshotPath });
  await rejectWithKeyboard(reopened);
  try {
    await dapp.waitForFunction(
      () => {
        const state = (window as any).__signQa;
        return state?.settlements === 1 && state?.code === 4001;
      },
      undefined,
      // Under the consolidated QA matrix Chromium may be CPU-constrained while
      // the MV3 worker wakes and the storage result crosses back to the dapp.
      { timeout: 45_000 },
    );
  } catch (error) {
    const [dappState, storageState] = await Promise.all([
      dapp.evaluate(() => {
        const state = (window as any).__signQa;
        return { status: state?.status, code: state?.code, settlements: state?.settlements };
      }),
      worker.evaluate(async () => {
        const stored = await chrome.storage.local.get(null);
        return {
          pending: Array.isArray(stored.pendingSignatureRequests)
            ? stored.pendingSignatureRequests.length
            : 0,
          signatureResultKeys: Object.keys(stored).filter((key) => key.startsWith("sigResult:")),
        };
      }),
    ]);
    throw new Error(
      `Signature rejection did not settle: ${JSON.stringify({ dappState, storageState })}`,
      { cause: error },
    );
  }
  await dapp.waitForTimeout(500);
  const result = await dapp.evaluate(() => ({
    code: (window as any).__signQa.code as number | null,
    settlements: (window as any).__signQa.settlements as number,
  }));
  if (result.code !== 4001 || result.settlements !== 1) {
    throw new Error(`Expected one 4001 rejection, got ${JSON.stringify(result)}`);
  }
  const remaining = await worker.evaluate(async () => {
    const stored = await chrome.storage.local.get("pendingSignatureRequests");
    return Array.isArray(stored.pendingSignatureRequests)
      ? stored.pendingSignatureRequests.length
      : 0;
  });
  if (remaining !== 0) throw new Error(`${remaining} signature request(s) remained`);
  await reopened.close();
  return {
    wallet,
    method,
    rejectionCode: result.code,
    settlements: result.settlements,
    screenshot: path.relative(APP_DIR, screenshotPath),
  };
}

async function runWallet(wallet: WalletType, origin: string): Promise<SigningEvidence[]> {
  const profile = await mkdtemp(path.join(os.tmpdir(), `walletchan-signing-${wallet}-`));
  let context: BrowserContext | undefined;
  const errors: string[] = [];
  try {
    context = await chromium.launchPersistentContext(profile, {
      channel: "chromium",
      headless: process.env.EXTENSION_QA_HEADLESS !== "0",
      viewport: { width: 360, height: 680 },
      args: [`--disable-extensions-except=${BUILD_DIR}`, `--load-extension=${BUILD_DIR}`],
    });
    context.on("page", (page) => observePage(page, errors));
    for (const page of context.pages()) observePage(page, errors);
    const worker = await waitForWorker(context);
    const extensionId = new URL(worker.url()).host;
    const helper = context.pages()[0] || (await context.newPage());
    await helper.goto(`chrome-extension://${extensionId}/onboarding.html`);
    await helper.getByRole("button", { name: "Set up WalletChan" }).waitFor();
    await completeOnboarding(helper, wallet);
    const dapp = await context.newPage();
    await dapp.goto(origin, { waitUntil: "domcontentloaded" });
    await dapp.waitForFunction(() => (window as any).__signQa?.provider, undefined, {
      timeout: 15_000,
    });
    const evidence: SigningEvidence[] = [];
    for (const method of METHODS) {
      evidence.push(await runMethod(context, worker, extensionId, dapp, wallet, method));
      process.stdout.write(`  ✓ ${wallet} ${method}\n`);
    }
    if (errors.length) throw new Error(`Runtime errors:\n${errors.join("\n")}`);
    return evidence;
  } finally {
    await context?.close();
    await rm(profile, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  await access(path.join(BUILD_DIR, "manifest.json"));
  await mkdir(OUTPUT_DIR, { recursive: true });
  const { server, origin } = await startDappServer();
  try {
    const evidence: SigningEvidence[] = [];
    const requestedWallets = (
      process.env.EXTENSION_QA_WALLETS || "bankr,privateKey,seedPhrase"
    )
      .split(",")
      .filter((wallet): wallet is WalletType =>
        ["bankr", "privateKey", "seedPhrase"].includes(wallet),
      );
    for (const wallet of requestedWallets) {
      const walletEvidence = await runWallet(wallet, origin);
      evidence.push(...walletEvidence);
      process.stdout.write(`✓ ${wallet}: personal + typed-data rejection\n`);
    }
    process.stdout.write(`${JSON.stringify({ status: "passed", evidence }, null, 2)}\n`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
