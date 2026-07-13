import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const readChromeModule = (name: string) =>
  readFile(new URL(`../../src/chrome/${name}`, import.meta.url), "utf8");

test("Bankr transport, response, signing, submission, and authorization are isolated", async () => {
  const [response, transport, signing, submission, jobs, binding, authorization] =
    await Promise.all([
      readChromeModule("bankr/response.ts"),
      readChromeModule("bankr/transport.ts"),
      readChromeModule("bankr/signing.ts"),
      readChromeModule("bankr/submission.ts"),
      readChromeModule("bankr/jobs.ts"),
      readChromeModule("bankr/credentialBinding.ts"),
      readChromeModule("bankr/pendingAuthorization.ts"),
    ]);

  assert.doesNotMatch(response, /fetch\(|chrome\.|sessionCache|accountStorage/);
  assert.match(transport, /fetchTextBounded/);
  assert.doesNotMatch(
    transport,
    /chrome\.|sessionCache|accountStorage|pendingRequestLifecycle|storageLock/,
  );
  assert.match(signing, /from ["'].\/transport["']/);
  assert.match(signing, /from ["'].\/response["']/);
  assert.doesNotMatch(signing, /chrome\.|sessionCache|accountStorage|storageLock/);
  assert.match(submission, /from ["'].\/signing["']/);
  assert.match(submission, /from ["'].\/transport["']/);
  assert.match(submission, /WALLET_SECRET_OPERATION_LOCK_KEY/);
  assert.doesNotMatch(submission, /accountStorage|sessionCache/);
  assert.match(jobs, /from ["'].\/transport["']/);
  assert.doesNotMatch(jobs, /chrome\.|accountStorage|sessionCache|storageLock/);
  assert.doesNotMatch(binding, /getCachedApiKey|decrypt|bankrFetch|fetch\(/);
  assert.match(authorization, /from ["']\.\.\/accountStorage["']/);
  assert.doesNotMatch(
    authorization,
    /\bfetch\(|\b(?:submitTransactionDirect|signMessageViaApi)\(/,
  );
});

test("Bankr chat separates storage, remote client, and session orchestration", async () => {
  const [storage, client, handlers] = await Promise.all([
    readChromeModule("bankr/chat/storage.ts"),
    readChromeModule("bankr/chat/client.ts"),
    readChromeModule("bankr/chat/handlers.ts"),
  ]);
  assert.doesNotMatch(storage, /fetch\(|getCachedApiKey|sessionCache|authHandlers/);
  assert.match(client, /from ["']\.\.\/jobs["']/);
  assert.match(client, /fetchTextBounded/);
  assert.doesNotMatch(client, /chrome\.|sessionCache|authHandlers/);
  assert.match(handlers, /from ["'].\/client["']/);
  assert.match(handlers, /from ["'].\/storage["']/);
  assert.match(handlers, /from ["']\.\.\/\.\.\/sessionCache["']/);
});

test("Bankr domain aggregate preserves every public implementation identity", async () => {
  const [
    client,
    response,
    jobs,
    signing,
    submission,
  ] = await Promise.all([
    import("../../src/chrome/bankr/client"),
    import("../../src/chrome/bankr/response"),
    import("../../src/chrome/bankr/jobs"),
    import("../../src/chrome/bankr/signing"),
    import("../../src/chrome/bankr/submission"),
  ]);
  assert.equal(client.BankrApiError, response.BankrApiError);
  assert.equal(client.getJobStatus, jobs.getJobStatus);
  assert.equal(client.pollJobUntilComplete, jobs.pollJobUntilComplete);
  assert.equal(client.signMessageViaApi, signing.signMessageViaApi);
  assert.equal(
    client.verifyBankrCredentialAddress,
    signing.verifyBankrCredentialAddress,
  );
  assert.equal(
    client.submitTransactionDirect,
    submission.submitTransactionDirect,
  );
});

test("Bankr root clutter is eliminated", async () => {
  const entries = await readdir(
    new URL("../../src/chrome/", import.meta.url),
    { withFileTypes: true },
  );
  const rootModules = entries
    .filter(
      (entry) =>
        entry.isFile() && /^(?:bankr|chat)/.test(entry.name),
    )
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(rootModules, []);
});
