import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  getOnboardingPage,
  waitForExtensionWorker,
} from "./extension-runtime-qa-support";

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BUILD_DIR = path.join(APP_DIR, "build");
const execFileAsync = promisify(execFile);
const budgets = JSON.parse(await readFile(
  path.join(APP_DIR, "privacy-prover.budgets.json"),
  "utf8",
)) as {
  fixedSelfTestMs: number;
  restartSelfTestMs: number;
  peakBrowserRssDeltaBytes: number;
};

async function browserTreeRssBytes(profile: string): Promise<number> {
  const { stdout } = await execFileAsync("ps", [
    "-axo",
    "pid=,ppid=,rss=,command=",
  ], { maxBuffer: 8 * 1024 * 1024 });
  const rows = stdout.split("\n").flatMap((line) => {
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(line);
    return match ? [{
      pid: Number(match[1]),
      ppid: Number(match[2]),
      rssKiB: Number(match[3]),
      command: match[4],
    }] : [];
  });
  const root = rows.find((row) =>
    row.command.includes(`--user-data-dir=${profile}`) &&
    !row.command.includes("--type="),
  );
  if (!root) throw new Error("Could not identify the packaged Chromium process tree");
  const included = new Set([root.pid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) {
      if (!included.has(row.pid) && included.has(row.ppid)) {
        included.add(row.pid);
        changed = true;
      }
    }
  }
  return rows
    .filter((row) => included.has(row.pid))
    .reduce((total, row) => total + row.rssKiB * 1024, 0);
}

async function runReadinessCheck(
  page: Page,
  getBackgroundFailure: () => string | null,
): Promise<number> {
  const startedAt = Date.now();
  const response = await page.evaluate(() =>
    chrome.runtime.sendMessage({ type: "privacyRunProverSelfTest" }),
  );
  if (response?.success !== true || response?.status !== "ready") {
    throw new Error(
      `Shield readiness check failed: ${JSON.stringify(response)}; background=${getBackgroundFailure() ?? "none"}`,
    );
  }
  return Date.now() - startedAt;
}

async function measureReadinessCheck(
  page: Page,
  profile: string,
  getBackgroundFailure: () => string | null,
): Promise<{ elapsedMs: number; baselineRssBytes: number; peakRssBytes: number; peakRssDeltaBytes: number }> {
  const baselineRssBytes = await browserTreeRssBytes(profile);
  let peakRssBytes = baselineRssBytes;
  let settled = false;
  const execution = runReadinessCheck(page, getBackgroundFailure).then(
    (elapsedMs) => ({ ok: true as const, elapsedMs }),
    (error: unknown) => ({ ok: false as const, error }),
  ).finally(() => {
    settled = true;
  });
  while (!settled) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    peakRssBytes = Math.max(
      peakRssBytes,
      await browserTreeRssBytes(profile),
    );
  }
  peakRssBytes = Math.max(peakRssBytes, await browserTreeRssBytes(profile));
  const result = await execution;
  if (!result.ok) throw result.error;
  return {
    elapsedMs: result.elapsedMs,
    baselineRssBytes,
    peakRssBytes,
    peakRssDeltaBytes: Math.max(0, peakRssBytes - baselineRssBytes),
  };
}

const profile = await mkdtemp(path.join(os.tmpdir(), "walletchan-prover-"));
let context: BrowserContext | undefined;

try {
  context = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: process.env.EXTENSION_QA_HEADLESS !== "0",
    args: [
      `--disable-extensions-except=${BUILD_DIR}`,
      `--load-extension=${BUILD_DIR}`,
    ],
  });
  const worker = await waitForExtensionWorker(context);
  let backgroundFailure: string | null = null;
  worker.on("console", (message) => {
    const text = message.text();
    if (text.startsWith("[privacy-shield] readiness check failed")) {
      backgroundFailure = text;
    }
  });
  const extensionId = new URL(worker.url()).host;
  const firstPage = await getOnboardingPage(context, extensionId);
  const firstRun = await measureReadinessCheck(
    firstPage,
    profile,
    () => backgroundFailure,
  );
  await firstPage.close();

  const reopened = await context.newPage();
  await reopened.goto(
    `chrome-extension://${extensionId}/onboarding.html?privacy-prover-qa=restart`,
    { waitUntil: "domcontentloaded" },
  );
  const restartRun = await measureReadinessCheck(
    reopened,
    profile,
    () => backgroundFailure,
  );

  if (firstRun.elapsedMs > budgets.fixedSelfTestMs) {
    throw new Error(
      `First proof run exceeded budget: ${firstRun.elapsedMs} > ${budgets.fixedSelfTestMs}`,
    );
  }
  if (restartRun.elapsedMs > budgets.restartSelfTestMs) {
    throw new Error(
      `Restart proof run exceeded budget: ${restartRun.elapsedMs} > ${budgets.restartSelfTestMs}`,
    );
  }
  const peakRssDeltaBytes = Math.max(
    firstRun.peakRssDeltaBytes,
    restartRun.peakRssDeltaBytes,
  );
  if (peakRssDeltaBytes > budgets.peakBrowserRssDeltaBytes) {
    throw new Error(
      `Proof RSS delta exceeded budget: ${peakRssDeltaBytes} > ${budgets.peakBrowserRssDeltaBytes}`,
    );
  }

  process.stdout.write(
    `${JSON.stringify({
      success: true,
      firstRunMs: firstRun.elapsedMs,
      restartRunMs: restartRun.elapsedMs,
      firstRunPeakRssDeltaBytes: firstRun.peakRssDeltaBytes,
      restartRunPeakRssDeltaBytes: restartRun.peakRssDeltaBytes,
      peakRssDeltaBytes,
      budgets,
    })}\n`,
  );
} finally {
  await context?.close();
  await rm(profile, { recursive: true, force: true });
}
