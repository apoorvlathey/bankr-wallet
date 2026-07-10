import {
  chromium,
  type BrowserContext,
  type Locator,
  type Page,
  type Worker,
} from "@playwright/test";
import { access, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface DailyUseResult {
  blockedExternalRequests: number;
  destinations: string[];
  accountSwitching: "passed";
  networkRoundTrip: string;
  receivePresentation: "QR overlay (intentional compact exception)";
}

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(SCRIPT_DIR, "..");
const BUILD_DIR = path.join(APP_DIR, "build");
const PASSWORD = "walletchan-daily-use-qa";
const TEST_PRIVATE_KEY = `0x${"22".repeat(32)}`;
const WATCH_ADDRESS = "0x1111111111111111111111111111111111111111";

async function waitForWorker(context: BrowserContext): Promise<Worker> {
  return (
    context.serviceWorkers()[0] ||
    context.waitForEvent("serviceworker", { timeout: 20_000 })
  );
}

function observePage(page: Page, errors: string[]) {
  page.on("pageerror", (error) => errors.push(`${page.url()}: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const value = message.text();
    if (/failed to load resource|net::ERR_FAILED|net::ERR_ABORTED/i.test(value)) return;
    errors.push(`${page.url()}: ${value}`);
  });
}

async function onboardPrivateKey(page: Page, extensionId: string) {
  await page.goto(`chrome-extension://${extensionId}/onboarding.html`, {
    waitUntil: "domcontentloaded",
  });
  await page.getByRole("button", { name: "Set up WalletChan" }).click();
  await page.getByRole("radio", { name: /^Private key\b/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Private Key").fill(TEST_PRIVATE_KEY);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirm password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create wallet" }).click();
  await page.getByRole("heading", { name: "Your wallet is ready" }).waitFor({
    timeout: 40_000,
  });

  const [mode, networks] = await Promise.all([
    page.evaluate(() =>
      chrome.runtime.sendMessage({ type: "setSidePanelMode", enabled: false }),
    ),
    page.evaluate(() => chrome.runtime.sendMessage({ type: "ensureNetworksInfo" })),
  ]);
  if (mode?.success !== true || networks?.success !== true) {
    throw new Error("Production wallet initialization did not complete");
  }
}

async function inspectSurface(page: Page, label: string) {
  await page.waitForTimeout(100);
  const failures = await page.evaluate(() => {
    const issues: string[] = [];
    const width = Math.max(
      document.documentElement.scrollWidth,
      document.body?.scrollWidth || 0,
    );
    if (width > window.innerWidth + 1) {
      issues.push(`${width - window.innerWidth}px horizontal overflow`);
    }
    const broken = [...document.images].filter(
      (image) => image.src && image.complete && image.naturalWidth === 0,
    );
    if (broken.length) issues.push(`${broken.length} broken image(s)`);
    return issues;
  });
  if (failures.length) throw new Error(`${label}: ${failures.join(", ")}`);
}

async function waitForHome(page: Page) {
  await page.getByRole("button", { name: "Choose account" }).waitFor({
    timeout: 30_000,
  });
  const actions = page.getByRole("navigation", { name: "Wallet actions" });
  await actions.waitFor();
  await assertPointerReady(
    actions.getByRole("button", { name: "Send", exact: true }),
    "Home actions",
  );
}

async function assertPointerReady(locator: Locator, label: string) {
  try {
    await locator.click({ trial: true, timeout: 5_000 });
  } catch (cause) {
    const obstruction = await locator.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const top = document.elementFromPoint(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2,
      );
      const layer = top?.closest("[style*='position: absolute']") as HTMLElement | null;
      return {
        top: top?.outerHTML.slice(0, 400) || null,
        layer: layer
          ? {
              ariaHidden: layer.getAttribute("aria-hidden"),
              inert: layer.hasAttribute("inert"),
              pointerEvents: getComputedStyle(layer).pointerEvents,
              transform: getComputedStyle(layer).transform,
            }
          : null,
      };
    });
    throw new Error(`${label} is obstructed: ${JSON.stringify(obstruction)}`, {
      cause,
    });
  }
}

async function openScreen(
  page: Page,
  action: string,
  heading: string,
  destinations: string[],
) {
  await page
    .getByRole("navigation", { name: "Wallet actions" })
    .getByRole("button", { name: action, exact: true })
    .click();
  await page.getByRole("heading", { name: heading, exact: true }).waitFor();
  await inspectSurface(page, heading);
  destinations.push(heading);
  await page.getByRole("button", { name: /^(Go back|Back)$/ }).click();
  await waitForHome(page);
}

async function testNetworkRoundTrip(page: Page, worker: Worker): Promise<string> {
  const trigger = page.getByRole("button", { name: "Choose network" });
  const initial = (await trigger.innerText()).trim();
  const alternate = initial === "Ethereum" ? "Base" : "Ethereum";

  const select = async (name: string) => {
    await trigger.click();
    await page.getByRole("heading", { name: "Choose network" }).waitFor();
    await page.getByRole("button", { name: new RegExp(`^${name}\\b`) }).click();
    await page.waitForFunction(
      (expected) =>
        document.querySelector<HTMLButtonElement>('[aria-label="Choose network"]')
          ?.innerText.trim() === expected,
      name,
    );
  };

  await select(alternate);
  const changed = await worker.evaluate(async () =>
    (await chrome.storage.sync.get("chainName")).chainName,
  );
  if (changed !== alternate) throw new Error("Network change was not persisted");
  await select(initial);
  const restored = await worker.evaluate(async () =>
    (await chrome.storage.sync.get("chainName")).chainName,
  );
  if (restored !== initial) throw new Error("Initial network was not restored");
  return `${initial} → ${alternate} → ${initial}`;
}

async function testAccountSwitching(page: Page) {
  await page.getByRole("button", { name: "Choose account" }).click();
  await page.getByRole("heading", { name: "Choose account" }).waitFor();
  await page.getByRole("button", { name: /^Add account\b/ }).click();
  await page.getByRole("heading", { name: "Add account" }).waitFor();
  await page.locator("label").filter({ hasText: "View-only" }).click();
  await page
    .getByPlaceholder("0x..., ENS, Basename, .wei, .gwei, or .mega")
    .fill(WATCH_ADDRESS);
  await page.getByPlaceholder("My wallet").fill("QA watch account");
  await page.getByRole("button", { name: "Add account", exact: true }).click();
  await page.getByRole("button", { name: "Choose account" }).waitFor({
    timeout: 30_000,
  });

  await page.getByRole("button", { name: "Choose account" }).click();
  await page
    .getByRole("button")
    .filter({ hasText: "QA watch account" })
    .first()
    .click();
  await page.getByRole("button", { name: "Choose account" }).filter({
    hasText: "QA watch account",
  }).waitFor();
  if (await page.getByRole("navigation", { name: "Wallet actions" }).isVisible()) {
    throw new Error("View-only account exposed signing actions");
  }

  await page.getByRole("button", { name: "Choose account" }).click();
  await page
    .getByRole("button")
    .filter({ hasText: /^.*Private key.*$/i })
    .first()
    .click();
  await waitForHome(page);
}

async function run(): Promise<DailyUseResult> {
  await access(path.join(BUILD_DIR, "manifest.json"));
  const profileDir = await mkdtemp(path.join(os.tmpdir(), "walletchan-daily-use-"));
  const errors: string[] = [];
  const destinations: string[] = [];
  let blockedExternalRequests = 0;
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
    await context.route(/^https?:\/\//, async (route) => {
      blockedExternalRequests += 1;
      await route.abort("failed");
    });

    const worker = await waitForWorker(context);
    const extensionId = new URL(worker.url()).host;
    const page = context.pages()[0] || (await context.newPage());
    await onboardPrivateKey(page, extensionId);
    await page.goto(`chrome-extension://${extensionId}/index.html`, {
      waitUntil: "domcontentloaded",
    });
    await waitForHome(page);
    await page.waitForFunction(
      () => document.querySelector('[aria-label="Wallet actions"]') !== null,
    );
    for (let attempt = 0; attempt < 30 && blockedExternalRequests === 0; attempt += 1) {
      await page.waitForTimeout(100);
    }
    if (blockedExternalRequests === 0) {
      throw new Error("No external portfolio request was exercised by the home screen");
    }
    await inspectSurface(page, "Home with portfolio services blocked");

    const actions = page.getByRole("navigation", { name: "Wallet actions" });
    await actions.getByRole("button", { name: "Receive", exact: true }).click();
    const receive = page.getByRole("dialog", { name: "Receive" });
    await receive.waitFor();
    await receive.getByRole("img", { name: "Wallet address QR code" }).waitFor();
    await inspectSurface(page, "Receive");
    destinations.push("Receive");
    await receive.getByRole("button", { name: "Close" }).click();
    await openScreen(page, "Send", "Send", destinations);
    await openScreen(page, "Swap", "Swap or bridge", destinations);
    await openScreen(page, "More", "More", destinations);

    await testAccountSwitching(page);

    const networkRoundTrip = await testNetworkRoundTrip(page, worker);

    await page.getByRole("button", { name: "Settings" }).click();
    await page.getByRole("heading", { name: "Settings" }).waitFor();
    await page.getByLabel("Search settings").waitFor();
    await inspectSurface(page, "Settings");
    destinations.push("Settings");
    await page.getByRole("button", { name: "Back" }).click();
    await waitForHome(page);

    await page.getByRole("button", { name: "Lock wallet" }).click();
    await page.getByRole("heading", { name: "WalletChan", exact: true }).waitFor();
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Unlock", exact: true }).click();
    await waitForHome(page);
    destinations.push("Lock and unlock");

    await inspectSurface(page, "Restored home");
    if (errors.length) throw new Error(`Runtime errors:\n${errors.join("\n")}`);

    return {
      blockedExternalRequests,
      destinations,
      accountSwitching: "passed",
      networkRoundTrip,
      receivePresentation: "QR overlay (intentional compact exception)",
    };
  } finally {
    await context?.close();
    await rm(profileDir, { recursive: true, force: true });
  }
}

run()
  .then((result) => process.stdout.write(`✓ packaged daily-use QA\n${JSON.stringify(result, null, 2)}\n`))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
