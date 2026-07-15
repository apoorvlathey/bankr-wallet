import assert from "node:assert/strict";
import test from "node:test";

import type {
  Erc7715PermissionRequest,
  PendingErc7715PermissionRequest,
} from "../../src/chrome/pendingErc7715PermissionStorage";
import {
  buildPermissionPresentation,
  canGrantErc7715Permission,
  formatPermissionExpiry,
  permissionDatePickerError,
} from "../../src/components/Erc7715PermissionConfirmation/permissionPresentation";
import type { Erc7715PermissionAsset } from "../../src/components/Erc7715PermissionConfirmation/useErc7715PermissionAsset";

const account = "0x1111111111111111111111111111111111111111" as const;
const delegate = "0x2222222222222222222222222222222222222222" as const;

const asset: Erc7715PermissionAsset = {
  symbol: "ETH",
  name: "Ether",
  decimals: 18,
  decimalsStatus: "verified",
  priceUsd: 2500,
  balanceLabel: "4 ETH",
  balanceUsdLabel: "$10,000.00",
  tokenExplorerUrl: null,
  tokenAddress: null,
};

function pending(
  permissionType: PendingErc7715PermissionRequest["permissionType"],
  data: Record<string, unknown>,
  rules?: Erc7715PermissionRequest["rules"],
): PendingErc7715PermissionRequest {
  return {
    id: `permission-${permissionType}`,
    origin: "https://app.example.test",
    senderOrigin: "https://trusted.example.test",
    favicon: null,
    timestamp: 1,
    chainName: "Base",
    chainId: 8453,
    permissionType,
    caveats: [],
    accountId: "account-1",
    accountAddress: account,
    accountType: "privateKey",
    request: {
      chainId: "0x2105",
      from: account,
      to: delegate,
      permission: {
        type: permissionType,
        isAdjustmentAllowed: true,
        data: { startTime: 1, ...data },
      },
      rules,
    },
  };
}

test("only local signer account types can grant ERC-7715 authority", () => {
  assert.equal(canGrantErc7715Permission("privateKey"), true);
  assert.equal(canGrantErc7715Permission("seedPhrase"), true);
  assert.equal(canGrantErc7715Permission("bankr"), false);
  assert.equal(canGrantErc7715Permission("impersonator"), false);
  assert.equal(canGrantErc7715Permission(undefined), false);
});

test("permission expiry uses compact relative time", () => {
  const now = 1_900_000_000;
  assert.equal(formatPermissionExpiry(null, now), "No expiration");
  assert.equal(formatPermissionExpiry(now - 1, now), "Expired");
  assert.equal(formatPermissionExpiry(now + 45, now), "Expires in 45 seconds");
  assert.equal(formatPermissionExpiry(now + 120, now), "Expires in 2 minutes");
  assert.equal(formatPermissionExpiry(now + 7_200, now), "Expires in 2 hours");
  assert.equal(formatPermissionExpiry(now + 3 * 86_400, now), "Expires in 3 days");
  assert.equal(
    formatPermissionExpiry(now + 2 * 365 * 86_400, now),
    "Expires in 2 years",
  );
});

test("date validation copy follows the active picker", () => {
  const error = "Expiration must be after start time";
  assert.equal(
    permissionDatePickerError(error, "start"),
    "Start time must be before expiration",
  );
  assert.equal(permissionDatePickerError(error, "expiration"), error);
  assert.equal(permissionDatePickerError("Invalid frequency", "start"), "Invalid frequency");
});

test("allowances explain reusable access and project exact exposure", () => {
  const request = pending("native-token-allowance", {
    allowanceAmount: "0xde0b6b3a7640000",
  });
  const view = buildPermissionPresentation({
    permissionRequest: request,
    editedRequest: request.request,
    asset,
  });

  assert.equal(view.origin, "https://trusted.example.test");
  assert.equal(view.originHostname, "trusted.example.test");
  assert.equal(view.title, "Allow delegated spending");
  assert.match(view.description, /without asking each time/u);
  assert.equal(view.amountLabel, "1 ETH");
  assert.equal(view.limitLabel, "Spending limit");
  assert.equal(view.exposureMeta, "No expiration");
  assert.match(view.fiatEstimate || "", /2,500/u);
});

test("periodic and streaming permissions expose cadence in plain language", () => {
  const periodic = pending("native-token-periodic", {
    periodAmount: "0x1bc16d674ec80000",
    periodDuration: 86400,
  });
  const periodicView = buildPermissionPresentation({
    permissionRequest: periodic,
    editedRequest: periodic.request,
    asset,
  });
  assert.equal(periodicView.title, "Allow recurring spending");
  assert.equal(periodicView.amountLabel, "2 ETH per day");

  const stream = pending("native-token-stream", {
    amountPerSecond: "0xde0b6b3a7640000",
    initialAmount: "0x0",
    maxAmount: "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
  });
  const streamView = buildPermissionPresentation({
    permissionRequest: stream,
    editedRequest: stream.request,
    asset,
  });
  assert.equal(streamView.title, "Allow continuous spending");
  assert.equal(streamView.amountLabel, "86400 ETH per day");
  assert.equal(streamView.limitLabel, "Daily availability");
});

test("approval cleanup stays distinct from delegated spending", () => {
  const request = pending(
    "token-approval-revocation",
    {
      erc20Approve: true,
      erc721Approve: false,
      erc721SetApprovalForAll: false,
      permit2Approve: false,
      permit2Lockdown: false,
      permit2InvalidateNonces: false,
    },
    [{ type: "expiry", data: { timestamp: 2_000_000_000 } }],
  );
  const view = buildPermissionPresentation({
    permissionRequest: request,
    editedRequest: request.request,
    asset: { ...asset, symbol: "Approvals", decimals: null, priceUsd: 0 },
    nowSeconds: 1_900_000_000,
  });

  assert.equal(view.title, "Allow approval cleanup");
  assert.equal(view.assetLabel, "Approval methods");
  assert.equal(view.amountLabel, "ERC-20 approvals");
  assert.equal(view.fiatEstimate, undefined);
  assert.equal(view.exposureMeta, "Expires in 3 years");
});
