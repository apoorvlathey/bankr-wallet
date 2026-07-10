import {
  chromium,
  type BrowserContext,
  type Page,
  type Worker,
} from "@playwright/test";
import { access, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

type WalletType = "bankr" | "privateKey" | "seedPhrase";

interface AuthQaEvidence {
  wallet: WalletType;
  productionOnboarding: boolean;
  unlockedExtensionUiReopened: boolean;
  wrongPasswordRejected: boolean;
  masterPasswordUnlocked: boolean;
  settingsNavigated: boolean;
  accountSettingsNavigated: boolean;
  agentPasswordUnlocked: boolean;
  agentPasswordManagementBlocked: boolean;
  protectedAccountActionBlocked: boolean;
  masterPasswordFallback: boolean;
}

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(SCRIPT_DIR, "..");
const BUILD_DIR = path.join(APP_DIR, "build");
const MASTER_PASSWORD = "walletchan-auth-qa-master";
const AGENT_PASSWORD = "walletchan-auth-qa-agent";
const TEST_PRIVATE_KEY = `0x${"22".repeat(32)}`;
const TEST_ADDRESS = "0x1111111111111111111111111111111111111111";

async function waitForWorker(context: BrowserContext): Promise<Worker> {
  return (
    context.serviceWorkers()[0] ||
    context.waitForEvent("serviceworker", { timeout: 20_000 })
  );
}

async function completeOnboarding(page: Page, wallet: WalletType): Promise<void> {
  await page.getByRole("button", { name: "Set up WalletChan" }).waitFor();
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
    await page.getByLabel("Bankr API key").fill("walletchan-auth-qa-key");
    await page.getByLabel("Linked wallet address").fill(TEST_ADDRESS);
    await page.getByRole("button", { name: "Continue" }).click();
  } else if (wallet === "privateKey") {
    await page.getByLabel("Private Key").fill(TEST_PRIVATE_KEY);
    await page.getByRole("button", { name: "Continue" }).click();
  } else {
    await page.getByText("Generate new phrase", { exact: true }).click();
    await page
      .getByRole("button", { name: "I’ve saved my seed phrase" })
      .click();
  }
  await page.getByLabel("Password", { exact: true }).fill(MASTER_PASSWORD);
  await page.getByLabel("Confirm password").fill(MASTER_PASSWORD);
  await page.getByRole("button", { name: "Create wallet" }).click();
  await page
    .getByRole("heading", { name: "Your wallet is ready" })
    .waitFor({ timeout: 30_000 });

  const popupMode = await page.evaluate(() =>
    chrome.runtime.sendMessage({ type: "setSidePanelMode", enabled: false }),
  );
  if (popupMode?.success !== true) {
    throw new Error("Could not enable popup mode after onboarding");
  }
}

async function openExtensionUi(
  context: BrowserContext,
  extensionId: string,
): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/index.html`, {
    waitUntil: "domcontentloaded",
  });
  await page.getByRole("button", { name: "Lock wallet" }).waitFor({
    timeout: 20_000,
  });
  return page;
}

async function goBack(page: Page): Promise<void> {
  await page
    .getByRole("button", { name: /^(?:Go back|Back)$/ })
    .click();
}

async function openSecurity(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("heading", { name: "Settings" }).waitFor();
  await page.getByRole("button", { name: /^Security\b/ }).click();
  try {
    await page.getByRole("heading", { name: "Security" }).waitFor({ timeout: 5_000 });
  } catch (error) {
    const visibleText = (await page.locator("body").innerText()).slice(0, 2_000);
    throw new Error(`Security screen did not open. Visible UI: ${visibleText}`, {
      cause: error,
    });
  }
}

async function lockAndUnlock(
  page: Page,
  password: string,
  expectedAgentSession: boolean,
): Promise<void> {
  await page.getByRole("button", { name: "Lock wallet" }).click();
  await page.getByRole("heading", { name: "WalletChan", exact: true }).waitFor();
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Unlock", exact: true }).click();
  await page.getByRole("button", { name: "Lock wallet" }).waitFor({
    timeout: 20_000,
  });
  const agentMarker = page.getByLabel("Agent session");
  if (expectedAgentSession) await agentMarker.waitFor();
  else if (await agentMarker.count()) {
    throw new Error("Master-password unlock was incorrectly marked as an agent session");
  }
}

async function openAccountSettings(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Choose account" }).click();
  await page.getByRole("heading", { name: "Choose account" }).waitFor();
  await page.getByRole("button", { name: /^Settings for / }).click();
  await page.getByRole("heading", { name: "Account settings" }).waitFor();
}

async function verifyAccountSettings(page: Page): Promise<void> {
  await openAccountSettings(page);
  await page.getByLabel("Display name").waitFor();
}

async function setAgentPassword(page: Page): Promise<void> {
  await openSecurity(page);
  await page.getByRole("button", { name: /^Agent Password\b/ }).click();
  await page.getByRole("heading", { name: "Agent password" }).waitFor();
  await page.getByRole("button", { name: "Set agent password" }).click();
  await page.getByLabel("Agent password", { exact: true }).fill(AGENT_PASSWORD);
  await page.getByLabel("Confirm agent password").fill(AGENT_PASSWORD);
  await page.getByRole("button", { name: "Enable agent access" }).click();
  await page.getByRole("heading", { name: "Settings" }).waitFor({
    timeout: 20_000,
  });
}

async function verifyAgentRestrictions(page: Page): Promise<void> {
  await openSecurity(page);
  const changePassword = page.getByRole("button", {
    name: /^Change Password\b/,
  });
  if (!(await changePassword.isDisabled())) {
    throw new Error("Change Password remained enabled during an agent session");
  }
  await page.getByRole("button", { name: /^Agent Password\b/ }).click();
  await page
    .getByText("Unlock with the master password to manage this setting.")
    .waitFor();
  if (await page.getByRole("button", { name: "Remove agent password" }).count()) {
    throw new Error("Agent session exposed agent-password management");
  }
  await goBack(page);
  await page.getByRole("heading", { name: "Settings" }).waitFor();
}

async function verifyProtectedAccountAction(
  page: Page,
  wallet: WalletType,
): Promise<void> {
  await openAccountSettings(page);

  if (wallet === "bankr") {
    await page.getByText("Change Bankr connection", { exact: true }).click();
    await page
      .getByText(
        "API key and wallet address changes are blocked during an agent session.",
      )
      .waitFor();
    if (await page.getByLabel("Bankr API key").count()) {
      throw new Error("Agent session exposed the Bankr API key field");
    }
    return;
  }

  const isSeed = wallet === "seedPhrase";
  const action = isSeed ? "Reveal seed phrase" : "Reveal private key";
  await page.getByText(action, { exact: true }).click();
  await page.getByRole("heading", { name: action }).waitFor();
  await page
    .getByText(
      isSeed
        ? "Seed phrases cannot be revealed while WalletChan is unlocked with an agent password."
        : "Private keys cannot be revealed while WalletChan is unlocked with an agent password.",
    )
    .waitFor();
  if (await page.getByRole("textbox", { name: "Password" }).count()) {
    throw new Error(`Agent session exposed the ${action} password field`);
  }
}

async function runWallet(wallet: WalletType): Promise<AuthQaEvidence> {
  await access(path.join(BUILD_DIR, "manifest.json"));
  const profileDir = await mkdtemp(
    path.join(os.tmpdir(), `walletchan-auth-${wallet}-`),
  );
  let context: BrowserContext | undefined;
  const pageErrors: string[] = [];
  try {
    context = await chromium.launchPersistentContext(profileDir, {
      channel: "chromium",
      headless: process.env.EXTENSION_QA_HEADLESS !== "0",
      viewport: { width: 360, height: 680 },
      args: [
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
        `--disable-extensions-except=${BUILD_DIR}`,
        `--load-extension=${BUILD_DIR}`,
      ],
    });
    context.on("page", (page) => {
      page.on("pageerror", (error) => pageErrors.push(error.message));
    });
    const worker = await waitForWorker(context);
    worker.on("close", () => pageErrors.push("Extension service worker closed"));
    const extensionId = new URL(worker.url()).host;
    // Keep a normal browser window alive while real extension popup windows
    // are repeatedly closed and reopened.
    const helper = await context.newPage();
    await helper.goto(`chrome-extension://${extensionId}/onboarding.html`);
    await completeOnboarding(helper, wallet);
    await helper.evaluate(() =>
      chrome.runtime.sendMessage({ type: "ensureNetworksInfo" }),
    );

    console.log(`auth-qa [${wallet}]: account navigation`);
    let popup = await openExtensionUi(context, extensionId);
    await verifyAccountSettings(popup);
    await popup.close();
    popup = await openExtensionUi(context, extensionId);
    console.log(`auth-qa [${wallet}]: settings navigation`);
    await popup.getByRole("button", { name: "Settings" }).click();
    await popup.getByRole("heading", { name: "Settings" }).waitFor();
    await popup.getByRole("button", { name: /^Appearance\b/ }).click();
    await popup.getByRole("heading", { name: "Appearance" }).waitFor();
    await goBack(popup);
    await popup.getByRole("heading", { name: "Settings" }).waitFor();

    console.log(`auth-qa [${wallet}]: unlocked extension UI reopen`);
    await popup.close();
    popup = await openExtensionUi(context, extensionId);

    console.log(`auth-qa [${wallet}]: wrong and master password unlock`);
    await popup.getByRole("button", { name: "Lock wallet" }).click();
    await popup.getByRole("heading", { name: "WalletChan", exact: true }).waitFor();
    const forgotPassword = popup.getByRole("button", { name: "Forgot password?" });
    if (await forgotPassword.count()) {
      throw new Error("Forgot password recovery is visible before a rejected password");
    }
    const unlockButton = popup.getByRole("button", { name: "Unlock", exact: true });
    const unlockPositionBeforeError = await unlockButton.boundingBox();
    await popup.getByLabel("Password", { exact: true }).fill("not-the-password");
    await unlockButton.click();
    await popup.getByText("Incorrect password", { exact: true }).waitFor();
    await forgotPassword.waitFor();
    const unlockPositionAfterError = await unlockButton.boundingBox();
    if (
      !unlockPositionBeforeError ||
      !unlockPositionAfterError ||
      Math.abs(unlockPositionBeforeError.y - unlockPositionAfterError.y) > 0.5
    ) {
      throw new Error("Unlock controls shifted when the password error appeared");
    }
    await popup.getByLabel("Password", { exact: true }).fill(MASTER_PASSWORD);
    await unlockButton.click();
    await popup.getByRole("button", { name: "Lock wallet" }).waitFor();

    console.log(`auth-qa [${wallet}]: agent password setup`);
    await setAgentPassword(popup);
    await popup.close();
    popup = await openExtensionUi(context, extensionId);
    console.log(`auth-qa [${wallet}]: agent restrictions`);
    await lockAndUnlock(popup, AGENT_PASSWORD, true);
    await popup.close();
    popup = await openExtensionUi(context, extensionId);
    await popup.getByLabel("Agent session").waitFor();
    await verifyAgentRestrictions(popup);
    await popup.close();
    popup = await openExtensionUi(context, extensionId);
    await verifyProtectedAccountAction(popup, wallet);
    await popup.close();
    popup = await openExtensionUi(context, extensionId);
    console.log(`auth-qa [${wallet}]: master fallback`);
    await lockAndUnlock(popup, MASTER_PASSWORD, false);

    if (pageErrors.length) {
      throw new Error(`Extension page errors:\n${pageErrors.join("\n")}`);
    }
    return {
      wallet,
      productionOnboarding: true,
      unlockedExtensionUiReopened: true,
      wrongPasswordRejected: true,
      masterPasswordUnlocked: true,
      settingsNavigated: true,
      accountSettingsNavigated: true,
      agentPasswordUnlocked: true,
      agentPasswordManagementBlocked: true,
      protectedAccountActionBlocked: true,
      masterPasswordFallback: true,
    };
  } finally {
    await context?.close();
    await rm(profileDir, { recursive: true, force: true });
  }
}

async function run(): Promise<AuthQaEvidence[]> {
  const results: AuthQaEvidence[] = [];
  for (const wallet of ["bankr", "privateKey", "seedPhrase"] as const) {
    results.push(await runWallet(wallet));
  }
  return results;
}

run()
  .then((evidence) => {
    console.log(JSON.stringify({ status: "passed", evidence }, null, 2));
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
