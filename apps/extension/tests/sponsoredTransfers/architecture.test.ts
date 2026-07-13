import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const removedRootFiles = new Set([
  "sponsoredTransferHandlers.ts",
  "sponsoredTransferIntentStorage.ts",
  "sponsoredTransferReconciliation.ts",
  "sponsoredTransferResponse.ts",
  "sponsoredTransferValidation.ts",
]);

const readSponsoredModule = (name: string) =>
  readFile(
    new URL(`../../src/chrome/sponsoredTransfers/${name}`, import.meta.url),
    "utf8",
  );

test("sponsored transfer implementations have one audit folder and no root family", async () => {
  const rootEntries = await readdir(
    new URL("../../src/chrome/", import.meta.url),
    { withFileTypes: true },
  );
  assert.deepEqual(
    rootEntries
      .filter((entry) => entry.isFile() && removedRootFiles.has(entry.name))
      .map((entry) => entry.name),
    [],
  );

  const domainEntries = await readdir(
    new URL("../../src/chrome/sponsoredTransfers/", import.meta.url),
    { withFileTypes: true },
  );
  for (const entry of domainEntries.filter(
    (candidate) => candidate.isFile() && candidate.name.endsWith(".ts"),
  )) {
    const source = await readSponsoredModule(entry.name);
    assert.ok(
      source.split(/\r?\n/).length <= 400,
      `${entry.name} exceeds the sponsored-transfer audit ceiling`,
    );
  }
});

test("sponsored intent storage retains the encrypted V1 recovery contract", async () => {
  const storage = await readSponsoredModule("intentStorage.ts");
  assert.match(
    storage,
    /SPONSORED_TRANSFER_INTENTS_KEY = "sponsoredTransferIntents"/,
  );
  assert.match(storage, /version: 1/);
  assert.match(storage, /encryptedPayload: EncryptedData/);
  assert.match(storage, /const MAX_INTENTS = 20/);
  assert.match(storage, /state:[\s\S]*"prepared"[\s\S]*"submitting"[\s\S]*"ambiguous"[\s\S]*"submitted"[\s\S]*"consumed"/);
  assert.doesNotMatch(
    storage.slice(
      storage.indexOf("export interface SponsoredTransferIntentRecord"),
      storage.indexOf("export function parseSponsoredTransferRelayPayload"),
    ),
    /\bnonce:|\bsignature:/,
  );
});

test("authorization persistence precedes the sole relayer effect", async () => {
  const [handlers, authorization, submission] = await Promise.all([
    readSponsoredModule("handlers.ts"),
    readSponsoredModule("authorization.ts"),
    readSponsoredModule("submission.ts"),
  ]);
  const prepare = handlers.indexOf("createSponsoredTransferAuthorization({");
  const persist = handlers.indexOf("saveSponsoredTransferIntent(record)");
  const submit = handlers.indexOf("submitSponsoredTransfer(account");
  assert.ok(prepare >= 0 && prepare < persist && persist < submit);
  assert.match(authorization, /encryptWithVaultKey\([\s\S]*JSON\.stringify\(payload\)/);

  const finalAccountCheck = submission.indexOf("getAccountById(account.id)");
  const submittingWrite = submission.indexOf('state: "submitting"');
  const post = submission.indexOf("request = fetchTextBounded(");
  assert.ok(finalAccountCheck >= 0 && finalAccountCheck < submittingWrite);
  assert.ok(submittingWrite < post);
  assert.equal(
    (submission.match(/fetchTextBounded\(/g) ?? []).length,
    1,
    "one prepared authorization must have exactly one relayer POST site",
  );
});

test("ambiguous responses and finalized reconciliation stay fail-closed", async () => {
  const [submission, reconciliation, recovery] = await Promise.all([
    readSponsoredModule("submission.ts"),
    readSponsoredModule("reconciliation.ts"),
    readSponsoredModule("recovery.ts"),
  ]);
  assert.match(
    submission,
    /catch \(error\)[\s\S]*state: "ambiguous"[\s\S]*broadcastUncertain: true[\s\S]*outcomeUncertain: true/,
  );
  assert.match(reconciliation, /https:\/\/mainnet\.base\.org/);
  assert.match(reconciliation, /https:\/\/base\.drpc\.org/);
  assert.match(reconciliation, /\["finalized", false\]/);
  assert.match(reconciliation, /observations\.length !== BASE_RECONCILIATION_RPCS\.length/);
  assert.match(
    recovery,
    /status === "consumed"[\s\S]*state: "consumed"[\s\S]*status === "expired-unused"[\s\S]*removeSponsoredTransferIntent/,
  );
});

test("trusted status ACK and background routing use direct sponsored paths", async () => {
  const [status, hook, executionComposition, accountComposition] = await Promise.all([
    readSponsoredModule("status.ts"),
    readFile(
      new URL(
        "../../src/components/Transfer/hooks/useSponsoredTransfer.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../../src/chrome/background/composition/executionRoutes.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../src/chrome/background/composition/accountRoutes.ts", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(status, /acknowledgeSponsoredTransferIntent\([\s\S]*intentId,[\s\S]*account\.address/);
  const completedStart = hook.indexOf("if (result.completed)");
  const completedEnd = hook.indexOf("if (result.hasUnresolved", completedStart);
  const completed = hook.slice(completedStart, completedEnd);
  const ack = completed.indexOf("acknowledgeTransfer(result.intentId)");
  assert.ok(ack >= 0);
  assert.ok(completed.indexOf("intentRef.current = null") > ack);
  assert.ok(completed.indexOf("onTransferInitiated(true)") > ack);

  assert.match(executionComposition, /sponsoredTransfers\/handlers["']/);
  assert.match(executionComposition, /sponsoredTransfers\/status["']/);
  assert.match(accountComposition, /sponsoredTransfers\/intentStorage["']/);
  assert.doesNotMatch(
    executionComposition + accountComposition,
    /from ["']\.\.\/\.\.\/sponsoredTransfer[A-Z][^"']*["']/,
  );
});
