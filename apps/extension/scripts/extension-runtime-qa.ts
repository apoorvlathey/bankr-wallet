import AxeBuilder from "@axe-core/playwright";
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  completeOnboarding,
  getOnboardingPage,
  inspectSurface,
  observePage,
  startDappServer,
  waitForExtensionWorker,
  type WalletType,
} from "./extension-runtime-qa-support";

interface RuntimeResult {
  wallet: WalletType;
  address: string;
  rejectionCode: number | null;
  settlements: number;
  seriousA11yViolations: string[];
  screenshot: string;
}

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(SCRIPT_DIR, "..");
const BUILD_DIR = path.join(APP_DIR, "build");
const OUTPUT_DIR = path.resolve(
  process.env.EXTENSION_QA_OUTPUT || path.join(APP_DIR, "extension-runtime-qa"),
);
const PROVIDER_TIMEOUT_MS = 15_000;

async function requestTransaction(dapp: Page): Promise<void> {
  try {
    await dapp.waitForFunction(
      () => (window as any).__walletQa?.provider,
      undefined,
      { timeout: PROVIDER_TIMEOUT_MS },
    );
  } catch (error) {
    const debug = await dapp.evaluate(() => ({
      documentReadyState: document.readyState,
      hasEthereum: Boolean((window as any).ethereum),
      qaStatus: (window as any).__walletQa?.status,
      htmlClasses: document.documentElement.className,
    }));
    throw new Error(
      `Injected provider did not initialize: ${JSON.stringify(debug)}`,
      { cause: error },
    );
  }
  await dapp.evaluate(() => {
    const state = (window as any).__walletQa;
    state.status = "pending";
    state.provider
      .request({ method: "eth_requestAccounts" })
      .then((accounts: string[]) => {
        state.address = accounts[0];
        return state.provider.request({
          method: "eth_sendTransaction",
          params: [{ to: accounts[0], value: "0x0", data: "0x" }],
        });
      })
      .then((hash: string) => {
        state.status = "confirmed";
        state.hash = hash;
        state.settlements += 1;
      })
      .catch((error: { message?: string; code?: number }) => {
        state.status = "rejected";
        state.error = error?.message || String(error);
        state.code = error?.code ?? null;
        state.settlements += 1;
      });
  });
}

async function waitForPopup(
  context: BrowserContext,
  extensionId: string,
  ignoredPages: Set<Page>,
): Promise<Page> {
  const extensionUrl = `chrome-extension://${extensionId}/index.html`;
  const startedAt = Date.now();
  while (Date.now() - startedAt < 20_000) {
    const popup = context
      .pages()
      .find((page) => !ignoredPages.has(page) && page.url().startsWith(extensionUrl));
    if (popup) return popup;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Transaction confirmation popup did not open");
}

async function reopenPopup(
  context: BrowserContext,
  extensionId: string,
  helper: Page,
): Promise<Page> {
  const previousPages = new Set(context.pages());
  const opened = context.waitForEvent("page", { timeout: 15_000 });
  const response = await helper.evaluate(() =>
    chrome.runtime.sendMessage({ type: "openPopupWindow" }),
  );
  if (response?.success !== true) throw new Error("Popup reopen request failed");
  const candidate = await opened;
  const popup = candidate.url().includes(extensionId)
    ? candidate
    : await waitForPopup(context, extensionId, previousPages);
  await popup.waitForLoadState("domcontentloaded");
  return popup;
}

async function rejectWithKeyboard(page: Page): Promise<void> {
  const reject = page.getByRole("button", { name: "Reject", exact: true });
  await reject.waitFor({ timeout: 20_000 });
  for (let index = 0; index < 50; index += 1) {
    const isFocused = await reject.evaluate((element) => element === document.activeElement);
    if (isFocused) {
      await page.keyboard.press("Enter");
      return;
    }
    await page.keyboard.press("Tab");
  }
  throw new Error("Reject action was not reachable through keyboard navigation");
}

async function runWalletScenario(
  wallet: WalletType,
  dappOrigin: string,
): Promise<RuntimeResult> {
  const profileDir = await mkdtemp(path.join(os.tmpdir(), `walletchan-${wallet}-`));
  const errors: string[] = [];
  let context: BrowserContext | undefined;
  try {
    context = await chromium.launchPersistentContext(profileDir, {
      channel: "chromium",
      headless: process.env.EXTENSION_QA_HEADLESS !== "0",
      viewport: { width: 360, height: 680 },
      args: [
        `--disable-extensions-except=${BUILD_DIR}`,
        `--load-extension=${BUILD_DIR}`,
      ],
    });
    context.on("page", (page) => observePage(page, errors));
    for (const page of context.pages()) observePage(page, errors);

    const worker = await waitForExtensionWorker(context);
    const extensionId = new URL(worker.url()).host;
    const onboarding = await getOnboardingPage(context, extensionId);
    await completeOnboarding(onboarding, wallet);

    // The normal first popup load calls this before a dapp can use the provider.
    // The QA keeps onboarding open as its extension helper, so perform the same
    // production initialization explicitly without seeding test-only state.
    const ensuredNetworks = await onboarding.evaluate(() =>
      chrome.runtime.sendMessage({ type: "ensureNetworksInfo" }),
    );
    if (ensuredNetworks?.success !== true) {
      throw new Error("Could not initialize the production network registry");
    }

    const providerState = await worker.evaluate(async () => {
      const stored = await chrome.storage.sync.get([
        "address",
        "displayAddress",
        "chainName",
        "networksInfo",
      ]);
      return {
        hasAddress: typeof stored.address === "string" && stored.address.length > 0,
        hasDisplayAddress:
          typeof stored.displayAddress === "string" && stored.displayAddress.length > 0,
        chainName: stored.chainName,
        networkCount:
          stored.networksInfo && typeof stored.networksInfo === "object"
            ? Object.keys(stored.networksInfo).length
            : 0,
      };
    });
    if (
      !providerState.hasAddress ||
      !providerState.hasDisplayAddress ||
      !providerState.chainName ||
      providerState.networkCount === 0
    ) {
      throw new Error(`Provider bootstrap storage is incomplete: ${JSON.stringify(providerState)}`);
    }

    const onboardingSurfaceFailures = await inspectSurface(onboarding);
    if (onboardingSurfaceFailures.length) {
      throw new Error(`Onboarding: ${onboardingSurfaceFailures.join(", ")}`);
    }

    const dapp = await context.newPage();
    await dapp.goto(dappOrigin, { waitUntil: "domcontentloaded" });
    await requestTransaction(dapp);

    const initialPopup = await waitForPopup(
      context,
      extensionId,
      new Set([onboarding, dapp]),
    );
    await initialPopup.getByRole("heading", { name: "Review transaction" }).waitFor({
      timeout: 20_000,
    });

    const pendingBeforeClose = await worker.evaluate(async () => {
      const stored = await chrome.storage.local.get("pendingTxRequests");
      return Array.isArray(stored.pendingTxRequests)
        ? stored.pendingTxRequests.length
        : 0;
    });
    if (pendingBeforeClose !== 1) {
      throw new Error(`Expected one persisted request, found ${pendingBeforeClose}`);
    }

    await initialPopup.close();
    const helper = await context.newPage();
    await helper.goto(
      `chrome-extension://${extensionId}/onboarding.html?runtime-qa-helper=1`,
      { waitUntil: "domcontentloaded" },
    );
    const reopened = await reopenPopup(context, extensionId, helper);
    await helper.close();
    await reopened.getByRole("heading", { name: "Review transaction" }).waitFor({
      timeout: 20_000,
    });
    await reopened.getByRole("button", { name: "Confirm", exact: true }).waitFor();
    await reopened.waitForTimeout(500);

    const surfaceFailures = await inspectSurface(reopened);
    if (surfaceFailures.length) throw new Error(surfaceFailures.join(", "));
    const axe = await new AxeBuilder({ page: reopened })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    const seriousA11yViolations = axe.violations
      .filter((violation) => violation.impact === "critical" || violation.impact === "serious")
      .map(
        (violation) =>
          `${violation.id}: ${violation.nodes
            .map(
              (node) =>
                `${node.target.map(String).join(" ")} ${node.html.slice(0, 240)}`,
            )
            .join(", ")}`,
      );
    if (seriousA11yViolations.length) {
      throw new Error(`Accessibility: ${seriousA11yViolations.join(", ")}`);
    }

    const screenshot = path.join(OUTPUT_DIR, `${wallet}-confirmation.png`);
    await reopened.screenshot({ path: screenshot });
    await rejectWithKeyboard(reopened);
    await dapp.waitForFunction(
      () => {
        const state = (window as any).__walletQa;
        return state?.settlements === 1 && state?.code === 4001;
      },
      undefined,
      { timeout: 20_000 },
    );
    await dapp.waitForTimeout(500);
    const dappResult = await dapp.evaluate(() => {
      const state = (window as any).__walletQa;
      return {
        address: state.address as string,
        code: state.code as number | null,
        settlements: state.settlements as number,
      };
    });
    if (dappResult.settlements !== 1) {
      throw new Error(`Expected exactly one dapp settlement, found ${dappResult.settlements}`);
    }
    if (dappResult.code !== 4001) {
      throw new Error(`Expected EIP-1193 rejection code 4001, found ${dappResult.code}`);
    }
    const pendingAfterReject = await worker.evaluate(async () => {
      const stored = await chrome.storage.local.get("pendingTxRequests");
      return Array.isArray(stored.pendingTxRequests)
        ? stored.pendingTxRequests.length
        : 0;
    });
    if (pendingAfterReject !== 0) {
      throw new Error(`Rejected request remained in storage (${pendingAfterReject})`);
    }
    if (errors.length) throw new Error(`Runtime errors:\n${errors.join("\n")}`);

    return {
      wallet,
      address: dappResult.address,
      rejectionCode: dappResult.code,
      settlements: dappResult.settlements,
      seriousA11yViolations,
      screenshot: path.relative(APP_DIR, screenshot),
    };
  } finally {
    await context?.close();
    await rm(profileDir, { recursive: true, force: true });
  }
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const { server, origin } = await startDappServer();
  try {
    const results: RuntimeResult[] = [];
    const requestedWallets = (process.env.EXTENSION_QA_WALLETS || "bankr,privateKey,seedPhrase")
      .split(",")
      .filter((wallet): wallet is WalletType =>
        ["bankr", "privateKey", "seedPhrase"].includes(wallet),
      );
    for (const wallet of requestedWallets) {
      results.push(await runWalletScenario(wallet, origin));
      process.stdout.write(`✓ ${wallet}: popup persistence + keyboard reject\n`);
    }
    process.stdout.write(`${JSON.stringify({ passed: results.length, results }, null, 2)}\n`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
