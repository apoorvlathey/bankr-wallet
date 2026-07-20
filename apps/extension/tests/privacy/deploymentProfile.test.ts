import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { build } from "vite";

const extensionRoot = path.resolve(import.meta.dirname, "../..");
const probeEntry = path.join(
  extensionRoot,
  "src/chrome/privacy/deployment/profileProbe.ts",
);

async function buildProbe(mode: "development" | "production") {
  const outDir = await mkdtemp(path.join(tmpdir(), `walletchan-privacy-${mode}-`));
  try {
    await build({
      root: extensionRoot,
      configFile: false,
      mode,
      logLevel: "silent",
      build: {
        outDir,
        emptyOutDir: true,
        minify: false,
        lib: {
          entry: probeEntry,
          formats: ["es"],
          fileName: "probe",
        },
      },
    });
    const outputPath = path.join(outDir, "probe.js");
    const source = await readFile(outputPath, "utf8");
    const imported = await import(
      `${pathToFileURL(outputPath).href}?mode=${mode}-${Date.now()}`
    );
    return { probe: imported.PRIVACY_POOLS_PROFILE_PROBE, source };
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
}

test("Vite development selects only the Sepolia Privacy Pools profile", async () => {
  const { probe, source } = await buildProbe("development");
  assert.deepEqual(probe, {
    profile: "sepolia",
    chainId: 11_155_111,
    chainName: "Sepolia",
    entrypoint: "0x34A2068192b1297f2a7f85D7D8CdE66F8F0921cB",
    pool: "0x644d5A2554d36e27509254F32ccfeBe8cd58861f",
    aspBaseUrl: "https://dw.0xbow.io",
    explorerBaseUrl: "https://sepolia.etherscan.io",
    minimumDepositAmount: "1000000000000000",
    vettingFeeBPS: "100",
    maxRelayFeeBPS: "100",
    mode: "sepolia-local-beta",
    bankrMutations: "blocked",
  });
  assert.doesNotMatch(source, /6818809eefce719e480a7526d76bd3e561526b46/i);
  assert.doesNotMatch(source, /api\.0xbow\.io/);
});

test("Vite production selects only the Ethereum mainnet Privacy Pools profile", async () => {
  const { probe, source } = await buildProbe("production");
  assert.deepEqual(probe, {
    profile: "mainnet",
    chainId: 1,
    chainName: "Ethereum",
    entrypoint: "0x6818809EefCe719E480a7526D76bD3e561526b46",
    pool: "0xF241d57C6DebAe225c0F2e6eA1529373C9A9C9fB",
    aspBaseUrl: "https://api.0xbow.io",
    explorerBaseUrl: "https://etherscan.io",
    minimumDepositAmount: "10000000000000000",
    vettingFeeBPS: "50",
    maxRelayFeeBPS: "1000",
    mode: "mainnet-production",
    bankrMutations: "enabled",
  });
  assert.doesNotMatch(source, /34a2068192b1297f2a7f85d7d8cde66f8f0921cb/i);
  assert.doesNotMatch(source, /dw\.0xbow\.io/);
});
