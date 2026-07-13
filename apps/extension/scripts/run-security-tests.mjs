import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";

const RUNTIME_QA_TESTS = new Set([
  // This is an interactive preview/navigation check, not a security unit test.
  // Keep Playwright out of the release security gate and run it through its
  // dedicated QA workflow instead.
  "portfolioBalanceNavigation.test.ts",
]);

async function collectTests(directory, relativeDirectory = "tests") {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const relativePath = `${relativeDirectory}/${entry.name}`;
      if (entry.isDirectory()) {
        return collectTests(new URL(`${entry.name}/`, directory), relativePath);
      }
      if (
        entry.isFile() &&
        entry.name.endsWith(".test.ts") &&
        !RUNTIME_QA_TESTS.has(entry.name)
      ) {
        return [relativePath];
      }
      return [];
    }),
  );
  return nested.flat();
}

const testFiles = (
  await collectTests(new URL("../tests/", import.meta.url))
).sort();

const child = spawn(
  process.execPath,
  ["--import", "tsx", "--test", ...testFiles],
  { stdio: "inherit" },
);

child.once("error", (error) => {
  console.error("Failed to start extension security tests:", error);
  process.exitCode = 1;
});

child.once("exit", (code, signal) => {
  if (signal) {
    console.error(`Extension security tests terminated by ${signal}`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = code ?? 1;
});
