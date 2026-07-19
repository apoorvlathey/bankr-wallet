import assert from "node:assert/strict";
import test from "node:test";

import {
  BACKGROUND_SECRET_MANAGEMENT_MESSAGE_TYPES,
  createBackgroundSecretManagementMessageRouter,
  type BackgroundSecretManagementDependencies,
} from "../../src/chrome/background/secretManagementRouter";

const trustedSender = { id: "extension-id" } as chrome.runtime.MessageSender;
const externalSender = {
  id: "extension-id",
  tab: { id: 5 },
} as chrome.runtime.MessageSender;

function createDependencies(
  overrides: Partial<BackgroundSecretManagementDependencies> = {},
): BackgroundSecretManagementDependencies {
  return {
    isTrustedWalletUiSender: () => true,
    generateNewMnemonic: () => "twelve safe words",
    handleRevealSeedPhrase: async (_id, _password, respond) =>
      respond({ success: true, mnemonic: "secret" }),
    handleRevealPrivateKey: async (_id, _password, respond) =>
      respond({ success: true, privateKey: "0xsecret" }),
    runPendingRequestResolution: async (options) => options.resolve(),
    pendingResolutionConflict: () => ({ success: false, error: "conflict" }),
    getPendingSignatureRequestById: async () => null,
    getAccountById: async () => null,
    handleConfirmSignatureRequestBankr: async () => ({ success: true }),
    handleConfirmSignatureRequest: async () => ({ success: true }),
    handleConfirmLedgerSignatureRequest: async () => ({ success: true }),
    readLocalStorage: async () => ({}),
    writeResultToStorage: async () => {},
    handleConfirmErc7715PermissionRequest: async () => ({ success: true }),
    handleRejectErc7715PermissionRequest: async () => ({ success: true }),
    ...overrides,
  };
}

function dispatch(
  dependencies: BackgroundSecretManagementDependencies,
  message: Record<string, unknown>,
  sender = trustedSender,
): Promise<{
  response: any;
  route: ReturnType<ReturnType<typeof createBackgroundSecretManagementMessageRouter>>;
}> {
  return new Promise((resolve) => {
    const router = createBackgroundSecretManagementMessageRouter(dependencies);
    let route!: ReturnType<typeof router>;
    route = router(message, sender, (response) => {
      queueMicrotask(() => resolve({ response, route }));
    });
  });
}

test("secret management declares one unique route set", () => {
  assert.equal(
    new Set(BACKGROUND_SECRET_MANAGEMENT_MESSAGE_TYPES).size,
    BACKGROUND_SECRET_MANAGEMENT_MESSAGE_TYPES.length,
  );
});

test("plaintext generation and reveal retain direct trusted-sender checks", async () => {
  let generated = false;
  let revealed = false;
  const dependencies = createDependencies({
    isTrustedWalletUiSender: (sender) => sender === trustedSender,
    generateNewMnemonic: () => {
      generated = true;
      return "words";
    },
    handleRevealPrivateKey: async () => {
      revealed = true;
    },
  });

  const generatedResult = await dispatch(
    dependencies,
    { type: "generateMnemonic" },
    externalSender,
  );
  assert.deepEqual(generatedResult.response, {
    success: false,
    error: "Unauthorized",
  });
  assert.equal(generatedResult.route.keepChannelOpen, false);
  assert.equal(generated, false);

  const revealedResult = await dispatch(
    dependencies,
    { type: "revealPrivateKey" },
    externalSender,
  );
  assert.deepEqual(revealedResult.response, {
    success: false,
    error: "Unauthorized",
  });
  assert.equal(revealedResult.route.keepChannelOpen, true);
  assert.equal(revealed, false);
});

test("mnemonic generation is synchronous and reveal inputs fail closed", async () => {
  let revealArgs: unknown[] = [];
  const dependencies = createDependencies({
    handleRevealSeedPhrase: async (...args) => {
      revealArgs = args.slice(0, 2);
      args[2]({ success: false });
    },
  });

  const generated = await dispatch(dependencies, { type: "generateMnemonic" });
  assert.deepEqual(generated.response, {
    success: true,
    mnemonic: "twelve safe words",
  });
  assert.equal(generated.route.keepChannelOpen, false);

  await dispatch(dependencies, {
    type: "revealSeedPhrase",
    seedGroupId: 42,
    password: null,
  });
  assert.deepEqual(revealArgs, ["", ""]);
});

test("signature confirmation routes only by the pinned account type", async () => {
  for (const [accountType, expectedHandler] of [
    ["bankr", "bankr"],
    ["privateKey", "local"],
    ["seedPhrase", "local"],
    ["ledger", "ledger"],
    ["impersonator", "none"],
  ] as const) {
    const calls: string[] = [];
    const pending = { accountType, accountId: "account-1" };
    const dependencies = createDependencies({
      getPendingSignatureRequestById: async () => pending,
      handleConfirmSignatureRequestBankr: async () => {
        calls.push("bankr");
        return { success: true };
      },
      handleConfirmSignatureRequest: async () => {
        calls.push("local");
        return { success: true };
      },
      handleConfirmLedgerSignatureRequest: async () => {
        calls.push("ledger");
        return { success: true };
      },
    });

    const { response } = await dispatch(dependencies, {
      type: "confirmSignatureRequest",
      sigId: `sig-${accountType}`,
    });
    assert.deepEqual(calls, expectedHandler === "none" ? [] : [expectedHandler]);
    if (expectedHandler === "none") {
      assert.deepEqual(response, {
        success: false,
        error: "Pending request is no longer valid",
      });
    } else {
      assert.deepEqual(response, { success: true });
    }
  }
});

test("signature results publish only after the pinned request becomes terminal", async () => {
  let reads = 0;
  const writes: Array<[string, any]> = [];
  const dependencies = createDependencies({
    getPendingSignatureRequestById: async () => {
      reads += 1;
      return reads === 1 ? { accountType: "privateKey" } : null;
    },
    handleConfirmSignatureRequest: async () => ({
      success: true,
      signature: "0xsigned",
    }),
    writeResultToStorage: async (key, result) => {
      writes.push([key, result]);
    },
  });

  const { response } = await dispatch(dependencies, {
    type: "confirmSignatureRequest",
    sigId: "sig-terminal",
  });
  assert.deepEqual(response, { success: true, signature: "0xsigned" });
  assert.deepEqual(writes, [
    [
      "sigResult:sig-terminal",
      { success: true, signature: "0xsigned" },
    ],
  ]);
});

test("ERC-7715 confirmation and rejection preserve exact arguments", async () => {
  const calls: unknown[][] = [];
  const dependencies = createDependencies({
    handleConfirmErc7715PermissionRequest: async (...args) => {
      calls.push(["confirm", ...args]);
      return { success: true };
    },
    handleRejectErc7715PermissionRequest: async (...args) => {
      calls.push(["reject", ...args]);
      return { success: false };
    },
  });

  await dispatch(dependencies, {
    type: "confirmErc7715PermissionRequest",
    requestId: "permission-1",
    password: undefined,
    editedRequest: { permissions: [] },
  });
  await dispatch(dependencies, {
    type: "rejectErc7715PermissionRequest",
    requestId: "permission-2",
  });
  assert.deepEqual(calls, [
    ["confirm", "permission-1", "", { permissions: [] }],
    ["reject", "permission-2"],
  ]);
});
