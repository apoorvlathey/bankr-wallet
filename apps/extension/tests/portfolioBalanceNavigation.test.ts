import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const APP_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

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
          const initialBalance = (await balance.textContent())?.trim();
          assert.ok(
            initialBalance && initialBalance !== "$0.00",
            `${wallet} should load its initial portfolio balance`,
          );
          await page
            .getByRole("button", { name: /Open transaction details for/i })
            .first()
            .click();

          await page
            .getByRole("heading", { name: /Transaction details/i })
            .waitFor();
          await page.getByRole("button", { name: "Go back" }).click();

          await page.getByRole("tab", { name: "Activity" }).waitFor();
          assert.equal(
            await page
              .getByRole("tab", { name: "Activity" })
              .getAttribute("aria-selected"),
            "true",
          );
          await balance.waitFor();
          assert.notEqual(
            (await balance.textContent())?.trim(),
            "$0.00",
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
