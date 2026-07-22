import { readFile } from "node:fs/promises";

const policy = JSON.parse(await readFile(
  new URL("../privacy-prover.distribution.json", import.meta.url),
  "utf8",
));
const targetArgument = process.argv.find((argument) => argument.startsWith("--target="));
const target = targetArgument?.slice("--target=".length);

if (
  policy.schemaVersion !== 1 ||
  policy.snarkjsVersion !== "0.7.5" ||
  policy.license !== "GPL-3.0" ||
  !Array.isArray(policy.allowedTargets) ||
  typeof target !== "string"
) {
  throw new Error("Privacy prover distribution policy is invalid");
}
if (!policy.allowedTargets.includes(target)) {
  throw new Error(
    `Privacy prover distribution is ${policy.status}; ${target} packaging is blocked`,
  );
}
process.stdout.write(`Privacy prover distribution allows ${target}.\n`);
