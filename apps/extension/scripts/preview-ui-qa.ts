import AxeBuilder from "@axe-core/playwright";
import { chromium, type Browser, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PREVIEW_ROUTE_REGISTRY,
  PREVIEW_ROUTES,
} from "../src/preview/routeRegistry";
import type {
  FrameMode,
  PreviewWalletType,
} from "../src/preview/types";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(SCRIPT_DIR, "..");
const OUTPUT_DIR = path.resolve(
  process.env.PREVIEW_QA_OUTPUT || path.join(APP_DIR, "preview-qa"),
);
const SCREENSHOT_DIR = path.join(OUTPUT_DIR, "screenshots");
const EXTERNAL_BASE_URL = process.env.PREVIEW_QA_BASE_URL;
const BASE_URL = EXTERNAL_BASE_URL || "http://127.0.0.1:4318";
const MODE = process.env.PREVIEW_QA_MODE === "full" ? "full" : "smoke";
const WORKERS = Math.max(1, Number(process.env.PREVIEW_QA_WORKERS || 3));
const FAIL_A11Y_IMPACTS = new Set(
  (process.env.PREVIEW_QA_A11Y_IMPACTS || "critical,serious")
    .split(",")
    .map((impact) => impact.trim())
    .filter(Boolean),
);

const THEMES = ["midnight", "bauhaus"] as const;
const FRAMES: Record<FrameMode, { width: number; height: number }> = {
  compact: { width: 320, height: 568 },
  popup: { width: 360, height: 600 },
  window: { width: 480, height: 720 },
  sidepanel: { width: 420, height: 760 },
};

const EXPANDED_FRAME_ROUTES = new Set([
  "home",
  "unlock",
  "tx",
  "signature",
  "settings",
  "portfolio",
  "tx-detail",
  "swap",
  "batch",
  "permission",
  "send",
  "account-management",
  "token-management",
]);

const ALLOWED_REQUEST_FAILURE_HOSTS = new Set([
  "www.4byte.directory",
  "repo.sourcify.dev",
  "eth.sh",
  "www.google.com",
  "t1.gstatic.com",
]);

const ALLOWED_CONSOLE_ERROR_PATTERNS = [
  /4byte/i,
  /sourcify/i,
  /eth\.sh/i,
  /favicon/i,
  /failed to load resource/i,
];

interface QaCase {
  route: (typeof PREVIEW_ROUTES)[number];
  theme: (typeof THEMES)[number];
  frame: FrameMode;
  scenario: string;
  wallet: PreviewWalletType;
  screenshot: boolean;
  axe: boolean;
}

interface A11yViolationSummary {
  id: string;
  impact: string | null;
  help: string;
  nodes: Array<{
    target: string[];
    html: string;
    failureSummary: string | null;
  }>;
}

interface QaResult extends QaCase {
  id: string;
  url: string;
  screenshotPath?: string;
  durationMs: number;
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
  httpErrors: string[];
  brokenImages: string[];
  horizontalOverflowPx: number;
  stickyActionCount: number;
  stickyActionProblems: string[];
  a11yViolations: A11yViolationSummary[];
  failures: string[];
}

function caseId(item: QaCase): string {
  return [item.route, item.scenario, item.wallet, item.theme, item.frame]
    .join("--")
    .replace(/[^a-zA-Z0-9_-]+/g, "-");
}

function addCase(target: Map<string, QaCase>, item: QaCase) {
  const id = caseId(item);
  const existing = target.get(id);
  target.set(id, {
    ...item,
    screenshot: item.screenshot || existing?.screenshot || false,
    axe: item.axe || existing?.axe || false,
  });
}

function buildSmokeCases(): QaCase[] {
  const cases = new Map<string, QaCase>();

  for (const route of PREVIEW_ROUTES) {
    const definition = PREVIEW_ROUTE_REGISTRY[route];
    const scenario = definition.defaultScenario;
    const wallet = definition.wallets[0];

    for (const theme of THEMES) {
      addCase(cases, {
        route,
        theme,
        frame: "popup",
        scenario,
        wallet,
        screenshot: true,
        axe: theme === "midnight",
      });
    }

    addCase(cases, {
      route,
      theme: "midnight",
      frame: "compact",
      scenario,
      wallet,
      screenshot: true,
      axe: false,
    });

    if (EXPANDED_FRAME_ROUTES.has(route)) {
      for (const frame of ["window", "sidepanel"] as const) {
        addCase(cases, {
          route,
          theme: "midnight",
          frame,
          scenario,
          wallet,
          screenshot: false,
          axe: false,
        });
      }
    }

    for (const extraScenario of definition.scenarios) {
      if (extraScenario === scenario) continue;
      addCase(cases, {
        route,
        theme: "midnight",
        frame: "popup",
        scenario: extraScenario,
        wallet,
        screenshot: false,
        axe: false,
      });
    }

    for (const extraWallet of definition.wallets) {
      if (extraWallet === wallet) continue;
      addCase(cases, {
        route,
        theme: "midnight",
        frame: "popup",
        scenario,
        wallet: extraWallet,
        screenshot: false,
        axe: false,
      });
    }
  }

  return [...cases.values()];
}

function buildFullCases(): QaCase[] {
  const cases: QaCase[] = [];
  for (const route of PREVIEW_ROUTES) {
    const definition = PREVIEW_ROUTE_REGISTRY[route];
    for (const theme of THEMES) {
      for (const frame of Object.keys(FRAMES) as FrameMode[]) {
        for (const scenario of definition.scenarios) {
          for (const wallet of definition.wallets) {
            cases.push({
              route,
              theme,
              frame,
              scenario,
              wallet,
              screenshot:
                scenario === definition.defaultScenario &&
                wallet === definition.wallets[0],
              axe: frame === "popup",
            });
          }
        }
      }
    }
  }
  return cases;
}

function previewUrl(item: QaCase): string {
  const params = new URLSearchParams({
    theme: item.theme,
    frame: item.frame,
    scenario: item.scenario,
    wallet: item.wallet,
    canvas: "1",
  });
  return `${BASE_URL}/preview/${item.route}?${params}`;
}

async function waitForServer(url: string, timeoutMs = 30_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${url}/preview/all`);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Preview server did not become ready at ${url}`);
}

const CONTENT_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

async function startPreviewServer(): Promise<Server | null> {
  if (EXTERNAL_BASE_URL) {
    await waitForServer(BASE_URL);
    return null;
  }

  const buildDir = path.join(APP_DIR, "preview-build");
  const fallbackPath = path.join(buildDir, "preview.html");
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(
        new URL(request.url || "/", BASE_URL).pathname,
      );
      const isAppRoute = pathname === "/" || pathname.startsWith("/preview/");
      const relativePath = isAppRoute
        ? "preview.html"
        : pathname.replace(/^\/+/, "");
      const filePath = path.resolve(buildDir, relativePath);
      if (!filePath.startsWith(`${buildDir}${path.sep}`) && filePath !== fallbackPath) {
        response.writeHead(403).end("Forbidden");
        return;
      }
      const body = await readFile(filePath);
      response.writeHead(200, {
        "content-type": CONTENT_TYPES[path.extname(filePath)] || "application/octet-stream",
        "cache-control": "no-store",
      });
      response.end(body);
    } catch {
      response.writeHead(404).end("Not found");
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(4318, "127.0.0.1", resolve);
  });
  await waitForServer(BASE_URL);
  return server;
}

async function inspectPage(page: Page) {
  return page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const rootWidth = Math.max(
      document.documentElement.scrollWidth,
      document.body?.scrollWidth || 0,
    );
    const brokenImages = [...document.images]
      .filter((image) => image.src && image.complete && image.naturalWidth === 0)
      .map((image) => image.currentSrc || image.src);

    const sticky = [...document.querySelectorAll<HTMLElement>("body *")]
      .filter((element) => {
        const style = getComputedStyle(element);
        return (
          (style.position === "sticky" || style.position === "fixed") &&
          style.bottom !== "auto" &&
          element.getClientRects().length > 0
        );
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          label:
            element.getAttribute("aria-label") ||
            (element.textContent || "").trim().replace(/\s+/g, " ").slice(0, 60),
          rect: {
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
          },
        };
      });

    const stickyProblems = sticky.flatMap((item) => {
      const problems: string[] = [];
      if (item.rect.left < -1 || item.rect.right > viewportWidth + 1) {
        problems.push(`${item.tag} ${item.label}: horizontally clipped`);
      }
      if (item.rect.top < -1 || item.rect.bottom > viewportHeight + 1) {
        problems.push(`${item.tag} ${item.label}: vertically clipped`);
      }
      return problems;
    });

    return {
      brokenImages,
      horizontalOverflowPx: Math.max(0, Math.ceil(rootWidth - viewportWidth)),
      stickyActionCount: sticky.length,
      stickyActionProblems: stickyProblems,
    };
  });
}

async function runCase(browser: Browser, item: QaCase): Promise<QaResult> {
  const startedAt = Date.now();
  const frame = FRAMES[item.frame];
  const context = await browser.newContext({
    viewport: frame,
    reducedMotion: "reduce",
    colorScheme: "dark",
  });
  const page = await context.newPage();
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  const httpErrors: string[] = [];

  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (ALLOWED_CONSOLE_ERROR_PATTERNS.some((pattern) => pattern.test(text))) return;
    consoleErrors.push(text);
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("response", (response) => {
    if (response.status() < 400) return;
    const url = response.url();
    try {
      if (ALLOWED_REQUEST_FAILURE_HOSTS.has(new URL(url).hostname)) return;
    } catch {
      // Keep malformed URLs visible in the report.
    }
    httpErrors.push(`${response.status()}: ${url}`);
  });
  page.on("requestfailed", (request) => {
    const url = request.url();
    if (
      request.failure()?.errorText === "net::ERR_ABORTED" &&
      url.startsWith(BASE_URL)
    ) {
      return;
    }
    try {
      if (ALLOWED_REQUEST_FAILURE_HOSTS.has(new URL(url).hostname)) return;
    } catch {
      // Keep malformed URLs visible in the report.
    }
    failedRequests.push(`${request.failure()?.errorText || "failed"}: ${url}`);
  });

  const id = caseId(item);
  const url = previewUrl(item);
  const failures: string[] = [];
  let screenshotPath: string | undefined;
  let inspection = {
    brokenImages: [] as string[],
    horizontalOverflowPx: 0,
    stickyActionCount: 0,
    stickyActionProblems: [] as string[],
  };
  let a11yViolations: A11yViolationSummary[] = [];

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.locator("#preview-root").waitFor({ state: "attached" });
    await page.waitForTimeout(450);
    await page
      .waitForFunction(() => [...document.images].every((image) => image.complete), null, {
        timeout: 2_000,
      })
      .catch(() => undefined);

    inspection = await inspectPage(page);

    if (item.axe) {
      const axeResult = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      a11yViolations = axeResult.violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact ?? null,
        help: violation.help,
        nodes: violation.nodes.map((node) => ({
          target: node.target.map(String),
          html: node.html,
          failureSummary: node.failureSummary ?? null,
        })),
      }));
    }

    if (item.screenshot) {
      const relativePath = path.join("screenshots", `${id}.png`);
      screenshotPath = relativePath;
      await page.screenshot({
        path: path.join(OUTPUT_DIR, relativePath),
        fullPage: false,
        animations: "disabled",
      });
    }
  } catch (error) {
    failures.push(`navigation/runtime: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await context.close();
  }

  if (consoleErrors.length) failures.push(`${consoleErrors.length} console error(s)`);
  if (pageErrors.length) failures.push(`${pageErrors.length} page error(s)`);
  if (failedRequests.length) failures.push(`${failedRequests.length} request failure(s)`);
  if (httpErrors.length) failures.push(`${httpErrors.length} HTTP error response(s)`);
  if (inspection.brokenImages.length) {
    failures.push(`${inspection.brokenImages.length} broken image(s)`);
  }
  if (inspection.horizontalOverflowPx > 1) {
    failures.push(`${inspection.horizontalOverflowPx}px horizontal overflow`);
  }
  if (inspection.stickyActionProblems.length) {
    failures.push(`${inspection.stickyActionProblems.length} sticky action problem(s)`);
  }
  const failingA11y = a11yViolations.filter(
    (violation) => violation.impact && FAIL_A11Y_IMPACTS.has(violation.impact),
  );
  if (failingA11y.length) {
    failures.push(`${failingA11y.length} serious/critical accessibility violation(s)`);
  }

  return {
    ...item,
    id,
    url,
    screenshotPath,
    durationMs: Date.now() - startedAt,
    consoleErrors,
    pageErrors,
    failedRequests,
    httpErrors,
    ...inspection,
    a11yViolations,
    failures,
  };
}

async function runPool<T, R>(
  values: T[],
  workerCount: number,
  worker: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  await Promise.all(
    Array.from({ length: Math.min(workerCount, values.length) }, async () => {
      while (nextIndex < values.length) {
        const index = nextIndex++;
        results[index] = await worker(values[index]);
      }
    }),
  );
  return results;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function buildHtmlIndex(results: QaResult[], generatedAt: string): string {
  const failed = results.filter((result) => result.failures.length > 0).length;
  const cards = results
    .filter((result) => result.screenshotPath || result.failures.length)
    .map((result) => {
      const status = result.failures.length ? "failed" : "passed";
      const a11yDetails = result.a11yViolations
        .map((violation) => {
          const targets = violation.nodes
            .map((node) => node.target.join(" "))
            .join(", ");
          return `<li>${escapeHtml(`${violation.id} (${violation.impact || "unknown"}): ${targets}`)}</li>`;
        })
        .join("");
      const details = result.failures.length
        ? `<ul>${result.failures.map((failure) => `<li>${escapeHtml(failure)}</li>`).join("")}${a11yDetails}</ul>`
        : `<p>${result.a11yViolations.length} reported a11y violation(s); ${result.stickyActionCount} sticky/fixed bottom region(s).</p>`;
      const image = result.screenshotPath
        ? `<a href="${escapeHtml(result.screenshotPath)}"><img loading="lazy" src="${escapeHtml(result.screenshotPath)}" alt="${escapeHtml(result.id)}" /></a>`
        : "";
      return `<article class="${status}"><header><strong>${escapeHtml(result.route)}</strong><span>${escapeHtml(result.scenario)} · ${escapeHtml(result.wallet)} · ${escapeHtml(result.theme)} · ${escapeHtml(result.frame)}</span></header>${image}${details}</article>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>WalletChan preview QA</title><style>
:root{color-scheme:dark;font-family:system-ui,sans-serif;background:#09090b;color:#f4f4f5}body{margin:0;padding:24px}h1{margin:0 0 4px}p{color:#a1a1aa}.summary{margin-bottom:24px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}article{background:#111113;border:1px solid #29292e;border-radius:12px;overflow:hidden}article.failed{border-color:#f87171}header{display:flex;flex-direction:column;gap:4px;padding:12px 14px}header span{color:#a1a1aa;font-size:12px}img{display:block;width:100%;height:auto;background:#18181b}article p,article ul{font-size:12px;margin:12px 14px 14px}li{margin:4px 0}
</style></head><body><h1>WalletChan preview QA</h1><p class="summary">${results.length} states · ${failed} failed · generated ${escapeHtml(generatedAt)} · mode ${MODE}</p><main class="grid">${cards}</main></body></html>`;
}

async function main() {
  const routeFilter = process.env.PREVIEW_QA_ROUTE;
  const allCases = MODE === "full" ? buildFullCases() : buildSmokeCases();
  const cases = routeFilter
    ? allCases.filter((item) => item.route === routeFilter)
    : allCases;
  if (!cases.length) {
    throw new Error(`No preview QA cases matched PREVIEW_QA_ROUTE=${routeFilter}`);
  }
  await rm(OUTPUT_DIR, { recursive: true, force: true });
  await mkdir(SCREENSHOT_DIR, { recursive: true });

  const server = await startPreviewServer();
  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({ headless: true });
    const results = await runPool(cases, WORKERS, (item) => runCase(browser!, item));
    const generatedAt = new Date().toISOString();
    const report = {
      generatedAt,
      mode: MODE,
      baseUrl: BASE_URL,
      failA11yImpacts: [...FAIL_A11Y_IMPACTS],
      caseCount: results.length,
      failedCaseCount: results.filter((result) => result.failures.length).length,
      results,
    };
    await writeFile(
      path.join(OUTPUT_DIR, "index.json"),
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8",
    );
    await writeFile(
      path.join(OUTPUT_DIR, "index.html"),
      buildHtmlIndex(results, generatedAt),
      "utf8",
    );

    const failed = results.filter((result) => result.failures.length);
    console.log(
      `Preview QA: ${results.length - failed.length}/${results.length} states passed. Report: ${path.join(OUTPUT_DIR, "index.html")}`,
    );
    for (const result of failed) {
      console.error(`- ${result.id}: ${result.failures.join("; ")}`);
    }
    if (failed.length) process.exitCode = 1;
  } catch (error) {
    if (
      error instanceof Error &&
      /Executable doesn't exist|browserType\.launch/.test(error.message)
    ) {
      console.error("Playwright Chromium is missing. Run: pnpm --filter @walletchan/extension exec playwright install chromium");
    }
    throw error;
  } finally {
    await browser?.close();
    await new Promise<void>((resolve) => {
      if (!server) {
        resolve();
        return;
      }
      server.close(() => resolve());
    });
  }
}

void main();
