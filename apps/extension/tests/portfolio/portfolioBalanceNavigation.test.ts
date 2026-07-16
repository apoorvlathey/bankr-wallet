import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { chromium, type Locator } from "@playwright/test";
import { createServer } from "vite";

const APP_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

async function readNumberFlowValue(balance: Locator): Promise<number> {
  const serialized = await balance.locator("number-flow-react").getAttribute("data");
  if (!serialized) return Number.NaN;
  const value = (JSON.parse(serialized) as { value?: unknown }).value;
  return typeof value === "number" ? value : Number.NaN;
}

test(
  "portfolio balance survives Activity -> transaction details -> back for every wallet type",
  { timeout: 30_000 },
  async () => {
    const server = await createServer({
      configFile: path.join(APP_DIR, "vite.config.preview.ts"),
      server: {
        host: "127.0.0.1",
        port: 0,
        hmr: false,
      },
    });
    await server.listen();
    const browser = await chromium.launch({ headless: true });

    try {
      const address = server.httpServer?.address();
      assert.ok(address && typeof address !== "string");

      for (const wallet of ["bankr", "privateKey", "seedPhrase"] as const) {
        const page = await browser.newPage({ viewport: { width: 360, height: 600 } });
        page.setDefaultTimeout(5_000);

        try {
          await page.goto(
            `http://127.0.0.1:${address.port}/preview/portfolio?theme=midnight&frame=popup&scenario=activity-selected&wallet=${wallet}&canvas=1`,
            { waitUntil: "domcontentloaded", timeout: 15_000 },
          );

          const balance = page.getByTestId("portfolio-balance");
          await balance.waitFor();
          const initialBalance = await readNumberFlowValue(balance);
          assert.ok(
            Number.isFinite(initialBalance) && initialBalance > 0,
            `${wallet} should load its initial portfolio balance`,
          );

          const scrollOwner = page.locator("[data-screen-scroll-owner]").first();
          const activityTab = page.getByRole("tab", { name: "Activity" });
          const assetsTab = page.getByRole("tab", { name: "Assets" });
          const activityRows = page.getByRole("button", {
            name: /Open transaction details for/i,
          });
          await activityRows.first().waitFor();
          await page.getByText("To Treasury recipient", { exact: true }).waitFor();
          await page.evaluate(async () => {
            await chrome.runtime.sendMessage({
              type: "updateAddressContactLabel",
              address: "0xb06a00000000000000000000000000000000dac2",
              label: "Operations treasury",
            });
          });
          await page.getByText("To Operations treasury", { exact: true }).waitFor();

          assert.ok(
            (await page.getByRole("button", { name: "View on explorer" }).count()) >
              0,
            `${wallet} should render transaction explorer actions`,
          );
          await page
            .getByRole("button", { name: "View on explorer" })
            .first()
            .click();
          assert.equal(
            await page
              .getByRole("heading", { name: "Transaction details" })
              .count(),
            0,
            `${wallet} explorer actions should not open transaction details`,
          );
          await page
            .getByRole("button", { name: "View on Base explorer" })
            .waitFor({ state: "attached" });
          await page
            .getByRole("button", { name: "View on Polygon explorer" })
            .waitFor({ state: "attached" });
          assert.equal(
            (await page.getByTestId("activity-token-fallback").last().textContent())
              ?.trim(),
            "B",
            `${wallet} should replace an inert cached logo with token initials`,
          );

          const tabScrollTop = await scrollOwner.evaluate((element) => {
            element.scrollTop = Math.min(
              320,
              element.scrollHeight - element.clientHeight,
            );
            return element.scrollTop;
          });
          assert.ok(tabScrollTop > 0, `${wallet} should have a scrollable portfolio`);

          await assetsTab.evaluate((button: HTMLButtonElement) => button.click());
          await assetsTab.waitFor();
          assert.equal(await assetsTab.getAttribute("aria-selected"), "true");
          await activityTab.evaluate((button: HTMLButtonElement) => button.click());
          assert.equal(await activityTab.getAttribute("aria-selected"), "true");
          await page.waitForTimeout(50);
          const restoredTabScrollTop = await scrollOwner.evaluate(
            (element) => element.scrollTop,
          );
          assert.ok(
            Math.abs(restoredTabScrollTop - tabScrollTop) <= 2,
            `${wallet} should preserve scroll when returning to Activity (${tabScrollTop} -> ${restoredTabScrollTop})`,
          );

          const detailRow = activityRows.nth(4);
          await detailRow.scrollIntoViewIfNeeded();
          const detailScrollTop = await scrollOwner.evaluate(
            (element) => element.scrollTop,
          );
          assert.ok(
            detailScrollTop > 0,
            `${wallet} should open details from a scrolled Activity list`,
          );
          await detailRow.click();

          await page
            .getByRole("heading", { name: /Transaction details/i })
            .waitFor();
          await page.getByRole("button", { name: "Go back" }).click();

          await activityTab.waitFor();
          await page.waitForTimeout(500);
          assert.equal(
            await activityTab.getAttribute("aria-selected"),
            "true",
          );
          const restoredDetailScrollTop = await scrollOwner.evaluate(
            (element) => element.scrollTop,
          );
          assert.ok(
            Math.abs(restoredDetailScrollTop - detailScrollTop) <= 2,
            `${wallet} should restore Activity scroll after transaction details (${detailScrollTop} -> ${restoredDetailScrollTop})`,
          );
          await balance.waitFor();
          const restoredBalance = await readNumberFlowValue(balance);
          assert.ok(
            Number.isFinite(restoredBalance) && restoredBalance > 0,
            `${wallet} should retain its balance after returning to Activity`,
          );
        } finally {
          await page.close();
        }
      }
    } finally {
      await browser.close();
      await server.close();
    }
  },
);
