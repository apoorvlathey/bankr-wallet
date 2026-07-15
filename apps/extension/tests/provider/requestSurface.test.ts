import assert from "node:assert/strict";
import test from "node:test";

import {
  isProviderSidePanelModeEnabled,
  shouldRequestProviderSidePanel,
} from "../../src/chrome/provider/contentBridge/requestSurface";
import { providerRequestPassesSurfacePreflight } from "../../src/chrome/provider/contentBridge/requestSurfacePreflight";
import {
  FULLSCREEN_REQUEST_NOTIFICATION_PREFIX,
  clearProviderRequestSurfaceHint,
  fullscreenRequestNotificationWindowId,
  recordProviderRequestSurfaceHint,
  takeProviderRequestSurfaceHint,
} from "../../src/chrome/windowing/providerRequestSurface";

test("active approval gestures use the early panel hop in sidepanel mode", () => {
  for (const [type, message] of [
    ["i_sendTransaction", {}],
    ["i_signatureRequest", {}],
    ["i_walletSendCalls", {}],
    [
      "i_walletExecutionPermissions",
      { method: "wallet_requestExecutionPermissions" },
    ],
  ] as const) {
    assert.equal(
      shouldRequestProviderSidePanel(type, message, true, true),
      true,
      type,
    );
  }
});

test("early panel hop respects mode, activation, and non-request 7715 methods", () => {
  assert.equal(
    shouldRequestProviderSidePanel(
      "i_signatureRequest",
      {},
      true,
      true,
      false,
    ),
    false,
  );
  assert.equal(
    shouldRequestProviderSidePanel("i_sendTransaction", {}, false, true),
    false,
  );
  assert.equal(
    shouldRequestProviderSidePanel("i_signatureRequest", {}, true, false),
    false,
  );
  assert.equal(
    shouldRequestProviderSidePanel(
      "i_walletExecutionPermissions",
      { method: "wallet_getGrantedExecutionPermissions" },
      true,
      true,
    ),
    false,
  );
});

test("provider-rejected account bindings never trigger the early sidepanel hop", () => {
  const activeAddress = "0x0000000000000000000000000000000000000001";
  const otherAddress = "0x0000000000000000000000000000000000000002";
  const baseState = {
    address: activeAddress,
    accountType: "privateKey",
    chainId: 1,
    dappConnected: true,
  };

  for (const [type, message] of [
    [
      "i_sendTransaction",
      {
        id: "tx-request",
        from: otherAddress,
        to: activeAddress,
        data: "0x",
        value: "0x0",
        chainId: 1,
      },
    ],
    [
      "i_signatureRequest",
      {
        id: "sig-request",
        method: "personal_sign",
        params: ["hello", otherAddress],
        chainId: 1,
      },
    ],
    [
      "i_walletSendCalls",
      {
        id: "batch-request",
        params: {
          version: "2.0.0",
          chainId: "0x1",
          from: otherAddress,
          calls: [{ to: activeAddress }],
        },
      },
    ],
    [
      "i_walletExecutionPermissions",
      {
        id: "permission-request",
        method: "wallet_requestExecutionPermissions",
        params: [{ chainId: "0x1", from: otherAddress, to: activeAddress }],
        chainId: 1,
      },
    ],
  ] as const) {
    assert.equal(
      providerRequestPassesSurfacePreflight(type, message, baseState),
      false,
      type,
    );
  }
});

test("valid approval requests pass surface preflight for every wallet path", () => {
  const address = "0x0000000000000000000000000000000000000001";
  const requests = [
    [
      "i_sendTransaction",
      {
        id: "tx-request",
        from: address,
        to: address,
        data: "0x",
        value: "0x0",
        chainId: 1,
      },
    ],
    [
      "i_signatureRequest",
      {
        id: "sig-request",
        method: "personal_sign",
        params: ["hello", address],
        chainId: 1,
      },
    ],
    [
      "i_walletSendCalls",
      {
        id: "batch-request",
        params: {
          version: "2.0.0",
          chainId: "0x1",
          from: address,
          calls: [{ to: address }],
        },
      },
    ],
  ] as const;

  for (const accountType of ["bankr", "privateKey", "seedPhrase"]) {
    for (const [type, message] of requests) {
      assert.equal(
        providerRequestPassesSurfacePreflight(type, message, {
          address,
          accountType,
          chainId: 1,
          dappConnected: true,
        }),
        true,
        `${accountType}:${type}`,
      );
    }
  }

  const permissionRequest = {
    id: "permission-request",
    method: "wallet_requestExecutionPermissions",
    params: [
      {
        chainId: "0x1",
        from: address,
        to: address,
        permission: {
          type: "native-token-allowance",
          isAdjustmentAllowed: false,
          data: { allowanceAmount: "0x1" },
        },
      },
    ],
    chainId: 1,
  };
  for (const accountType of ["privateKey", "seedPhrase"]) {
    assert.equal(
      providerRequestPassesSurfacePreflight(
        "i_walletExecutionPermissions",
        permissionRequest,
        {
          address,
          accountType,
          chainId: 1,
          dappConnected: true,
        },
      ),
      true,
      accountType,
    );
  }
  assert.equal(
    providerRequestPassesSurfacePreflight(
      "i_walletExecutionPermissions",
      permissionRequest,
      {
        address,
        accountType: "bankr",
        chainId: 1,
        dappConnected: true,
      },
    ),
    false,
  );
});

test("unconnected origins cannot open an approval sidepanel", () => {
  const address = "0x0000000000000000000000000000000000000001";
  assert.equal(
    providerRequestPassesSurfacePreflight(
      "i_signatureRequest",
      {
        id: "sig-request",
        method: "personal_sign",
        params: ["hello", address],
        chainId: 1,
      },
      {
        address,
        accountType: "privateKey",
        chainId: 1,
        dappConnected: false,
      },
    ),
    false,
  );
});

test("provider schema and chain rejections cannot open an approval sidepanel", () => {
  const address = "0x0000000000000000000000000000000000000001";
  const state = {
    address,
    accountType: "privateKey",
    chainId: 1,
    dappConnected: true,
  };
  assert.equal(
    providerRequestPassesSurfacePreflight(
      "i_sendTransaction",
      {
        id: "tx-request",
        from: address,
        to: address,
        data: "0x",
        value: "not-a-quantity",
        chainId: 1,
      },
      state,
    ),
    false,
    "invalid single transaction",
  );
  assert.equal(
    providerRequestPassesSurfacePreflight(
      "i_signatureRequest",
      {
        id: "sig-request",
        method: "personal_sign",
        params: ["hello", address],
        chainId: 8453,
      },
      state,
    ),
    false,
  );
  const typedData = {
    types: {
      EIP712Domain: [{ name: "chainId", type: "uint256" }],
      Message: [{ name: "contents", type: "string" }],
    },
    primaryType: "Message",
    domain: { chainId: 1 },
    message: { contents: "hello" },
  };
  assert.equal(
    providerRequestPassesSurfacePreflight(
      "i_signatureRequest",
      {
        id: "typed-signature-request",
        method: "eth_signTypedData_v4",
        params: [address, JSON.stringify(typedData)],
        chainId: 8453,
      },
      { ...state, chainId: 8453 },
    ),
    false,
    "typed-data domain.chainId mismatch",
  );
  assert.equal(
    providerRequestPassesSurfacePreflight(
      "i_signatureRequest",
      {
        id: "typed-signature-request",
        method: "eth_signTypedData_v4",
        params: [
          address,
          JSON.stringify({ ...typedData, domain: { chainId: 8453 } }),
        ],
        chainId: 8453,
      },
      { ...state, chainId: 8453 },
    ),
    true,
    "matching typed-data domain.chainId",
  );
  assert.equal(
    providerRequestPassesSurfacePreflight(
      "i_walletSendCalls",
      {
        id: "batch-request",
        params: {
          version: "1.0.0",
          chainId: "0x1",
          from: address,
          calls: [{ to: address }],
        },
      },
      state,
    ),
    false,
    "unsupported batch version",
  );
  assert.equal(
    providerRequestPassesSurfacePreflight(
      "i_walletSendCalls",
      {
        id: "batch-request",
        params: {
          version: "2.0.0",
          chainId: "0x1",
          from: address,
          calls: [{ to: address, data: "0x1234" }],
        },
      },
      state,
    ),
    false,
    "unsafe batch self-recursion",
  );
  assert.equal(
    providerRequestPassesSurfacePreflight(
      "i_walletExecutionPermissions",
      {
        id: "permission-request",
        method: "wallet_requestExecutionPermissions",
        params: [
          {
            chainId: "0x1",
            from: address,
            to: address,
            permission: {
              type: "native-token-allowance",
              isAdjustmentAllowed: false,
              data: { allowanceAmount: "invalid" },
            },
          },
        ],
        chainId: 1,
      },
      state,
    ),
    false,
    "invalid ERC-7715 permission",
  );
});

test("provider sidepanel mode defaults on only after storage hydration", () => {
  assert.equal(isProviderSidePanelModeEnabled(null), false);
  assert.equal(isProviderSidePanelModeEnabled({}), true);
  assert.equal(
    isProviderSidePanelModeEnabled({ sidePanelMode: false }),
    false,
  );
  assert.equal(
    isProviderSidePanelModeEnabled({
      sidePanelMode: true,
      isArcBrowser: true,
    }),
    false,
  );
});

test("fullscreen request notification ids carry only a valid browser window id", () => {
  assert.equal(
    fullscreenRequestNotificationWindowId(
      `${FULLSCREEN_REQUEST_NOTIFICATION_PREFIX}42`,
    ),
    42,
  );
  assert.equal(fullscreenRequestNotificationWindowId("unrelated"), null);
  assert.equal(
    fullscreenRequestNotificationWindowId(
      `${FULLSCREEN_REQUEST_NOTIFICATION_PREFIX}-1`,
    ),
    null,
  );
});

test("provider request surface hints are window-bound, one-shot, and short-lived", () => {
  recordProviderRequestSurfaceHint(42, "i_walletSendCalls", 1_000);
  assert.deepEqual(takeProviderRequestSurfaceHint(42, 1_500), {
    requestType: "i_walletSendCalls",
    createdAt: 1_000,
  });
  assert.equal(takeProviderRequestSurfaceHint(42, 1_500), null);

  recordProviderRequestSurfaceHint(7, "i_signatureRequest", 1_000);
  assert.equal(takeProviderRequestSurfaceHint(8, 1_500), null);
  assert.equal(takeProviderRequestSurfaceHint(7, 11_001), null);

  recordProviderRequestSurfaceHint(9, "i_sendTransaction", 1_000);
  clearProviderRequestSurfaceHint(9);
  assert.equal(takeProviderRequestSurfaceHint(9, 1_500), null);
});
