import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const manifestUrl = new URL("../privacy-pools.protocol.json", import.meta.url);
const publicRoot = fileURLToPath(new URL("../public/", import.meta.url));
const shouldSync = process.argv.includes("--sync");
const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));

function fail(message) {
  throw new Error(`Privacy Pools artifacts: ${message}`);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function exactDestination(basePath, file) {
  if (
    typeof basePath !== "string" ||
    typeof file !== "string" ||
    !/^[a-z0-9-]+(?:\/[a-z0-9-]+)*$/.test(basePath) ||
    !/^[a-z0-9-]+\.(?:wasm|vkey|zkey)$/.test(file)
  ) {
    fail("manifest contains an unsafe packaged path");
  }
  const destination = resolve(publicRoot, basePath, file);
  if (!destination.startsWith(`${resolve(publicRoot)}${sep}`)) {
    fail("artifact destination escaped the extension public directory");
  }
  return destination;
}

function validateEntry(entry) {
  if (
    typeof entry !== "object" ||
    entry === null ||
    typeof entry.id !== "string" ||
    typeof entry.sourcePath !== "string" ||
    !/^packages\/circuits\/[a-zA-Z0-9_./-]+$/.test(entry.sourcePath) ||
    !Number.isSafeInteger(entry.bytes) ||
    entry.bytes <= 0 ||
    typeof entry.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(entry.sha256)
  ) {
    fail("manifest contains an invalid artifact entry");
  }
}

async function readAndVerify(destination, entry) {
  const fileStat = await stat(destination);
  if (fileStat.size !== entry.bytes) {
    fail(`${entry.id} size mismatch: expected ${entry.bytes}, got ${fileStat.size}`);
  }
  const bytes = await readFile(destination);
  const digest = sha256(bytes);
  if (digest !== entry.sha256) {
    fail(`${entry.id} SHA-256 mismatch: expected ${entry.sha256}, got ${digest}`);
  }
}

async function downloadAndVerify(destination, entry, sourceCommit) {
  const sourceUrl = new URL(
    `${sourceCommit}/${entry.sourcePath}`,
    "https://raw.githubusercontent.com/0xbow-io/privacy-pools-core/",
  );
  const response = await fetch(sourceUrl, {
    cache: "no-store",
    credentials: "omit",
    redirect: "error",
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    fail(`${entry.id} download returned HTTP ${response.status}`);
  }
  const contentLength = Number(response.headers.get("content-length"));
  const contentEncoding = response.headers.get("content-encoding");
  if (
    (contentEncoding === null || contentEncoding === "identity") &&
    Number.isFinite(contentLength) &&
    contentLength !== entry.bytes
  ) {
    fail(
      `${entry.id} download size mismatch: expected ${entry.bytes}, got ${contentLength}`,
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength !== entry.bytes || sha256(bytes) !== entry.sha256) {
    fail(`${entry.id} download failed its pinned size or SHA-256 check`);
  }

  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, bytes, { flag: "wx" });
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
}

if (
  manifest?.schemaVersion !== 1 ||
  manifest?.protocol !== "privacy-pools-v1" ||
  typeof manifest?.artifacts?.sourceCommit !== "string" ||
  !/^[a-f0-9]{40}$/.test(manifest.artifacts.sourceCommit) ||
  !Array.isArray(manifest?.artifacts?.entries) ||
  manifest.artifacts.entries.length !== 6
) {
  fail("protocol manifest is invalid");
}

for (const entry of manifest.artifacts.entries) {
  validateEntry(entry);
  const destination = exactDestination(manifest.artifacts.basePath, entry.file);
  try {
    await readAndVerify(destination, entry);
  } catch (error) {
    if (!shouldSync) throw error;
    await downloadAndVerify(destination, entry, manifest.artifacts.sourceCommit);
    await readAndVerify(destination, entry);
  }
}

console.log(
  `Verified ${manifest.artifacts.entries.length} pinned Privacy Pools artifacts.`,
);
