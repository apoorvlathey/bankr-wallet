import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path: string) =>
  readFile(new URL(`../../src/components/${path}`, import.meta.url), "utf8");

test("view-only signing prompts place one shared notice in the action bar", async () => {
  const [
    notice,
    stickyActionBar,
    confirmationScreen,
    transaction,
    batch,
    signature,
    permission,
    transactionStatus,
    batchContext,
  ] = await Promise.all([
    source("shared/ViewOnlySigningNotice.tsx"),
    source("ui/StickyActionBar.tsx"),
    source("ui/ConfirmationScreen.tsx"),
    source("TransactionConfirmation/TransactionConfirmation.tsx"),
    source("BatchConfirmation/BatchTransactionConfirmation.tsx"),
    source("SignatureConfirmation/SignatureRequestConfirmation.tsx"),
    source(
      "Erc7715PermissionConfirmation/Erc7715PermissionConfirmation.tsx",
    ),
    source("TransactionConfirmation/RequestStatus.tsx"),
    source("BatchConfirmation/RequestContext.tsx"),
  ]);

  assert.match(notice, /View-only accounts can't sign/u);
  assert.match(stickyActionBar, /\{notice &&[\s\S]*?\{notice\}[\s\S]*?<Grid/u);
  assert.match(confirmationScreen, /notice=\{actionNotice\}/u);

  for (const prompt of [batch, signature, permission]) {
    assert.match(
      prompt,
      /accountType === "impersonator"[\s\S]*?<ViewOnlySigningNotice \/>/u,
    );
  }
  assert.match(
    transaction,
    /actionNotice=\{[\s\S]*?accountType === "impersonator"[\s\S]*?<ViewOnlySigningNotice/u,
  );
  assert.match(transaction, /Developer RPC will send this transaction without a signature/u);

  assert.doesNotMatch(transactionStatus, /impersonated account|Signing is disabled/u);
  assert.doesNotMatch(batchContext, /impersonated account|Signing is disabled/u);
});
