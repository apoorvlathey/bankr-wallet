import { readFile } from "node:fs/promises";

const [policy, packageJson] = await Promise.all([
  readFile(
    new URL("../privacy-prover.distribution.json", import.meta.url),
    "utf8",
  ).then(JSON.parse),
  readFile(new URL("../package.json", import.meta.url), "utf8").then(JSON.parse),
]);
const targetArgument = process.argv.find((argument) => argument.startsWith("--target="));
const target = targetArgument?.slice("--target=".length);
const releaseTargets = new Set([
  "github-release",
  "chrome-web-store",
  "firefox-addons",
]);

function parseVersion(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value);
  return match?.slice(1).map(Number) ?? null;
}

function isAtLeastVersion(value, minimum) {
  const parsed = parseVersion(value);
  const parsedMinimum = parseVersion(minimum);
  if (!parsed || !parsedMinimum) return false;
  return parsed.some((part, index) => {
    const previousEqual = parsed
      .slice(0, index)
      .every((previous, previousIndex) => previous === parsedMinimum[previousIndex]);
    return previousEqual && part > parsedMinimum[index];
  }) || parsed.every((part, index) => part === parsedMinimum[index]);
}

if (
  policy.schemaVersion !== 1 ||
  policy.snarkjsVersion !== "0.7.5" ||
  policy.license !== "GPL-3.0" ||
  policy.status !== "approved-gpl-v4" ||
  policy.effectiveRelease !== "4.0.0" ||
  packageJson.license !== "GPL-3.0-only" ||
  !Array.isArray(policy.allowedTargets) ||
  !Array.isArray(policy.packagedNotices) ||
  typeof target !== "string"
) {
  throw new Error("Privacy prover distribution policy is invalid");
}
if (!policy.allowedTargets.includes(target)) {
  throw new Error(
    `Privacy prover distribution is ${policy.status}; ${target} packaging is blocked`,
  );
}
if (
  releaseTargets.has(target) &&
  !isAtLeastVersion(packageJson.version, policy.effectiveRelease)
) {
  throw new Error(
    `Release packaging requires extension v${policy.effectiveRelease} or later; ` +
      `current version is ${packageJson.version}`,
  );
}
process.stdout.write(`Privacy prover distribution allows ${target}.\n`);
