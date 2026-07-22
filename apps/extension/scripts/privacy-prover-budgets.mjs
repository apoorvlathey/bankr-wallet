import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildRoot = path.join(appRoot, "build");
const budgets = JSON.parse(await readFile(
  path.join(appRoot, "privacy-prover.budgets.json"),
  "utf8",
));
const protocol = JSON.parse(await readFile(
  path.join(appRoot, "privacy-pools.protocol.json"),
  "utf8",
));

function fail(message) {
  throw new Error(`Privacy prover budget: ${message}`);
}

function boundedInteger(name, value, minimum = 1) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    fail(`${name} is invalid`);
  }
}

if (budgets.schemaVersion !== 1 || budgets.maxConcurrentProofs !== 1) {
  fail("budget policy must retain schema v1 and one proof at a time");
}
for (const key of [
  "cleanBuildBytes",
  "artifactBytes",
  "proverWorkerBytes",
  "backgroundBundleBytes",
  "fixedSelfTestMs",
  "restartSelfTestMs",
  "peakBrowserRssDeltaBytes",
]) boundedInteger(key, budgets[key]);

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(target) : [target];
  }));
  return nested.flat();
}

const files = await listFiles(buildRoot);
let buildBytes = 0;
for (const file of files) buildBytes += (await stat(file)).size;
const artifactBytes = protocol.artifacts.entries.reduce(
  (total, entry) => total + entry.bytes,
  0,
);
const workerCandidates = files.filter((file) =>
  /^worker-[A-Za-z0-9_-]+\.js$/.test(path.basename(file)),
);
const proverWorkers = [];
for (const file of workerCandidates) {
  const source = await readFile(file, "utf8");
  if (source.includes("curve_bn128") && source.includes("singleThread")) {
    proverWorkers.push({ file, bytes: Buffer.byteLength(source) });
  }
}
if (proverWorkers.length !== 1) {
  fail(`expected one packaged prover worker, found ${proverWorkers.length}`);
}
const backgroundBytes = (await stat(
  path.join(buildRoot, "static/js/background.js"),
)).size;

const measurements = {
  cleanBuildBytes: buildBytes,
  artifactBytes,
  proverWorkerBytes: proverWorkers[0].bytes,
  backgroundBundleBytes: backgroundBytes,
};
for (const [name, measured] of Object.entries(measurements)) {
  if (measured > budgets[name]) {
    fail(`${name} exceeded: ${measured} > ${budgets[name]}`);
  }
}

process.stdout.write(`${JSON.stringify({ success: true, measurements, budgets })}\n`);
