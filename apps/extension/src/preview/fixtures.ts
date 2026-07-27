import type { Account } from "@/chrome/types";
import type { PendingTxRequest } from "@/chrome/requests/pendingTxStorage";
import type { PendingSignatureRequest } from "@/chrome/requests/pendingSignatureStorage";
import type { PendingBatchTxRequest } from "@/chrome/erc5792Types";
import type { CrossDappBatch } from "@/chrome/crossDappBatch/storage";
import type { PendingErc7715PermissionRequest } from "@/chrome/pendingErc7715PermissionStorage";
import type { PendingWatchAssetRequest } from "@/chrome/requests/pendingWatchAssetStorage";
import type { PendingAddChainRequest } from "@/chrome/requests/pendingAddChainStorage";
import type { CustomToken } from "@/chrome/customTokenStorage";
import type { HiddenPortfolioToken } from "@/chrome/portfolio/hiddenTokens";
import { googleFaviconUrl } from "@/constants/externalUrls";
import {
  ERC7710_EMPTY_CAVEAT_ARGS,
  METAMASK_DELEGATOR_V1_3_CAVEAT_ENFORCERS,
} from "@/chrome/erc7715/caveats";
import { getVisibleChains } from "@/lib/chains";
import { previewAssets } from "./previewAssets";
import { previewNetworks } from "./networkFixtures";
import { applyPreviewBatchScenario } from "./batchScenarioFixtures";
import { createDefillamaSwapData, getReadmeTxOverrides } from "./readmeScenarioFixtures";

export { previewNetworks, previewNetworkRpcUrls } from "./networkFixtures";
import type { PreviewWalletType } from "./types";

export type { PreviewWalletType } from "./types";

/** Fixed clock for deterministic preview fixtures: 2026-07-09T12:00:00.000Z. */
export const PREVIEW_EPOCH_MS = Date.UTC(2026, 6, 9, 12, 0, 0);

/** Compatibility alias for scenarios that import assets from this module. */
export const PREVIEW_ASSETS = previewAssets;

export interface PreviewWallet {
  accountId: string;
  accountType: Exclude<Account["type"], "ledger" | "safe">;
  address: `0x${string}`;
  displayName: string;
  createdAt: number;
  seedGroupId?: string;
  derivationIndex?: number;
}

export const previewAddress = "0x742d35Cc6634C0532925a3b844Bc454e4438f44e";
export const previewSpender = "0x111111125421cA6dc452d289314280a0f8842A65";
export const previewUsdc = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
export const previewBaseUsdc = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const previewWeth = "0x4200000000000000000000000000000000000006";
export const previewCustomTokenAddress =
  "0xba5ed0000e1ca9136a695f0a848012a16008b032";

export const previewCustomToken: CustomToken = {
  contractAddress: previewCustomTokenAddress,
  chainId: 8453,
  symbol: "WCHAN",
  name: "WalletChan",
  decimals: 18,
  image: previewAssets.brand.walletChan,
  addedAt: PREVIEW_EPOCH_MS - 3_600_000,
};

export const previewHiddenTokens: HiddenPortfolioToken[] = [
  {
    chainId: 8453,
    contractAddress: previewUsdc.toLowerCase(),
    symbol: "USDC",
    name: "USD Coin",
    logoUrl: previewAssets.tokens.usdc,
    hiddenAt: PREVIEW_EPOCH_MS - 1_800_000,
  },
];

export const PREVIEW_WALLETS: Record<PreviewWalletType, PreviewWallet> = {
  bankr: {
    accountId: "preview-bankr",
    accountType: "bankr",
    address: previewAddress,
    displayName: "Bankr vault",
    createdAt: PREVIEW_EPOCH_MS - 86_400_000,
  },
  privateKey: {
    accountId: "preview-pk",
    accountType: "privateKey",
    address: "0x1234567890123456789012345678901234567890",
    displayName: "Local signer",
    createdAt: PREVIEW_EPOCH_MS - 43_200_000,
  },
  seedPhrase: {
    accountId: "preview-seed-0",
    accountType: "seedPhrase",
    address: "0x2222222222222222222222222222222222222222",
    displayName: "Seed #1 · #0",
    createdAt: PREVIEW_EPOCH_MS - 21_600_000,
    seedGroupId: "preview-seed",
    derivationIndex: 0,
  },
  viewOnly: {
    accountId: "preview-view-only",
    accountType: "impersonator",
    address: "0x3333333333333333333333333333333333333333",
    displayName: "View-only account",
    createdAt: PREVIEW_EPOCH_MS - 10_800_000,
  },
};

export function getPreviewWallet(walletType: PreviewWalletType): PreviewWallet {
  return PREVIEW_WALLETS[walletType];
}

const approveData =
  "0x095ea7b3" +
  previewSpender.toLowerCase().replace("0x", "").padStart(64, "0") +
  BigInt(250_000_000).toString(16).padStart(64, "0");
const increaseAllowanceData =
  "0x39509351" +
  previewSpender.toLowerCase().replace("0x", "").padStart(64, "0") +
  BigInt(25_000_000).toString(16).padStart(64, "0");
const previewPermissionStart = Math.floor(PREVIEW_EPOCH_MS / 1000);
const previewPermissionExpiry = previewPermissionStart + 3600;
const previewPermissionAmount = 1_000_000_000_000_000n;

function fixedWidthHex(value: bigint | number, bytes: number): `0x${string}` {
  return `0x${BigInt(value).toString(16).padStart(bytes * 2, "0")}`;
}

function concatHex(parts: `0x${string}`[]): `0x${string}` {
  return `0x${parts.map((part) => part.slice(2)).join("")}`;
}

export function toAccount(wallet: PreviewWallet): Account {
  const base = {
    id: wallet.accountId,
    address: wallet.address,
    displayName: wallet.displayName,
    createdAt: wallet.createdAt,
  };
  if (wallet.accountType === "seedPhrase") {
    return {
      ...base,
      type: "seedPhrase",
      seedGroupId: wallet.seedGroupId ?? "preview-seed",
      derivationIndex: wallet.derivationIndex ?? 0,
    };
  }
  return { ...base, type: wallet.accountType } as Account;
}

export function createPreviewTxRequest(
  walletType: PreviewWalletType = "bankr",
  overrides: Omit<Partial<PendingTxRequest>, "tx"> & {
    tx?: Partial<PendingTxRequest["tx"]>;
  } = {},
): PendingTxRequest {
  const wallet = getPreviewWallet(walletType);
  const base: PendingTxRequest = {
    id: `preview-tx-approve-${walletType}`,
    tx: {
      from: wallet.address,
      to: previewUsdc,
      data: approveData,
      value: "0x0",
      chainId: 8453,
    },
    origin: "https://app.uniswap.org",
    favicon: PREVIEW_ASSETS.dapps.uniswap,
    chainName: "Base",
    timestamp: PREVIEW_EPOCH_MS - 45_000,
    accountId: wallet.accountId,
    accountAddress: wallet.address,
    accountType:
      wallet.accountType === "impersonator" ? "bankr" : wallet.accountType,
    tabId: 1,
    frameId: 0,
    senderOrigin: "https://app.uniswap.org",
    requestChainId: 8453,
  };

  return {
    ...base,
    ...overrides,
    tx: { ...base.tx, ...(overrides.tx ?? {}) },
  };
}

export function createPreviewSignatureRequest(
  walletType: PreviewWalletType = "bankr",
  overrides: Partial<PendingSignatureRequest> = {},
): PendingSignatureRequest {
  const wallet = getPreviewWallet(walletType);
  const base: PendingSignatureRequest = {
    id: `preview-signature-${walletType}`,
    signature: {
      method: "personal_sign",
      params: [
        "0x50726576696577207369676e2d696e207265717565737420666f722057616c6c65744368616e2e",
        wallet.address,
      ],
      chainId: 8453,
    },
    origin: "https://wallet.bankr.bot",
    favicon: PREVIEW_ASSETS.brand.bankr,
    chainName: "Base",
    timestamp: PREVIEW_EPOCH_MS - 32_000,
    accountId: wallet.accountId,
    accountAddress: wallet.address,
    accountType:
      wallet.accountType === "impersonator" ? "bankr" : wallet.accountType,
    tabId: 1,
    frameId: 0,
    senderOrigin: "https://wallet.bankr.bot",
    requestChainId: 8453,
  };

  return {
    ...base,
    ...overrides,
    signature: { ...base.signature, ...(overrides.signature ?? {}) },
  };
}

function utf8ToHex(value: string): `0x${string}` {
  return `0x${Array.from(new TextEncoder().encode(value), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")}`;
}

export function createPreviewSignatureScenario(
  walletType: PreviewWalletType,
  scenario: string,
): PendingSignatureRequest {
  const wallet = getPreviewWallet(walletType);

  if (scenario === "typed-data-long") {
    const typedData = {
      domain: {
        name: "WalletChan Treasury Operations",
        version: "1",
        chainId: 8453,
        verifyingContract: previewSpender,
      },
      primaryType: "TreasuryAuthorization",
      types: {
        EIP712Domain: [
          { name: "name", type: "string" },
          { name: "version", type: "string" },
          { name: "chainId", type: "uint256" },
          { name: "verifyingContract", type: "address" },
        ],
        TreasuryAuthorization: [
          { name: "operator", type: "address" },
          { name: "beneficiary", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "reference", type: "string" },
          { name: "permissions", type: "string[]" },
        ],
      },
      message: {
        operator: wallet.address,
        beneficiary: previewUsdc,
        amount: "999999999999999999999999999999999999",
        reference:
          "Quarterly treasury authorization with a deliberately long human-readable reference for wrapping and disclosure stress coverage",
        permissions: [
          "rebalance-across-supported-base-market-vaults",
          "claim-and-reinvest-protocol-rewards",
          "report-settlement-status-to-the-requesting-application",
        ],
      },
    };

    return createPreviewSignatureRequest(walletType, {
      id: `preview-signature-typed-long-${walletType}`,
      origin: "https://treasury.operations.walletchan.example",
      senderOrigin: "https://treasury.operations.walletchan.example",
      signature: {
        method: "eth_signTypedData_v4",
        params: [wallet.address, JSON.stringify(typedData)],
        chainId: 8453,
      },
    });
  }

  if (scenario === "siwe-blocked") {
    const message = [
      "malicious.example wants you to sign in with your Ethereum account:",
      previewSpender,
      "",
      "Sign in to manage your WalletChan account.",
      "",
      "URI: https://malicious.example/login",
      "Version: 1",
      "Chain ID: 1",
      "Nonce: weak",
      "Issued At: 2026-07-09T12:00:00.000Z",
      "Expiration Time: 2026-07-09T11:00:00.000Z",
    ].join("\n");

    return createPreviewSignatureRequest(walletType, {
      id: `preview-signature-siwe-blocked-${walletType}`,
      origin: "https://wallet.bankr.bot",
      senderOrigin: "https://wallet.bankr.bot",
      signature: {
        method: "personal_sign",
        params: [utf8ToHex(message), wallet.address],
        chainId: 8453,
      },
    });
  }

  return createPreviewSignatureRequest(walletType, {
    id: `preview-signature-${scenario}-${walletType}`,
  });
}

export function createPreviewBatchRequest(
  walletType: PreviewWalletType = "bankr",
  overrides: Partial<PendingBatchTxRequest> = {},
): PendingBatchTxRequest {
  const wallet = getPreviewWallet(walletType);
  const base: PendingBatchTxRequest = {
    id: `preview-batch-${walletType}`,
    params: {
      version: "2.0.0",
      chainId: "0x2105",
      from: wallet.address,
      atomicRequired: true,
      calls: [
        {
          to: previewUsdc as `0x${string}`,
          data: approveData as `0x${string}`,
          value: "0x0",
        },
        {
          to: previewWeth as `0x${string}`,
          data: "0x095ea7b3000000000000000000000000111111125421ca6dc452d289314280a0f8842a6500000000000000000000000000000000000000000000000000b1a2bc2ec50000",
          value: "0x0",
        },
      ],
    },
    origin: "https://app.aave.com",
    favicon: PREVIEW_ASSETS.dapps.aave,
    chainName: "Base",
    chainId: 8453,
    timestamp: PREVIEW_EPOCH_MS - 25_000,
    accountType: wallet.accountType,
    accountId: wallet.accountId,
    accountAddress: wallet.address,
    tabId: 1,
    frameId: 0,
    senderOrigin: "https://app.aave.com",
    requestChainId: 8453,
  };

  return {
    ...base,
    ...overrides,
    params: { ...base.params, ...(overrides.params ?? {}) },
  };
}

export function createPreviewTxScenario(
  walletType: PreviewWalletType,
  scenario: string,
): PendingTxRequest {
  const readmeOverrides = getReadmeTxOverrides(scenario, walletType);
  if (readmeOverrides) return createPreviewTxRequest(walletType, readmeOverrides);

  if (scenario === "increase-allowance") {
    return createPreviewTxRequest(walletType, {
      id: `preview-tx-increase-allowance-${walletType}`,
      tx: { data: increaseAllowanceData },
    });
  }

  if (scenario === "malformed-disabled") {
    return createPreviewTxRequest(walletType, {
      id: `preview-tx-malformed-${walletType}`,
      tx: { data: "0x123" },
    });
  }

  if (scenario === "stress") {
    return createPreviewTxRequest(walletType, {
      id: `preview-tx-stress-${walletType}`,
      origin:
        "https://institutional-treasury-operations-and-settlement.example",
      senderOrigin:
        "https://institutional-treasury-operations-and-settlement.example",
      tx: {
        value: "0x123456789abcdef123456789abcdef",
      },
    });
  }

  return createPreviewTxRequest(walletType, {
    id: `preview-tx-${scenario}-${walletType}`,
  });
}

export function createPreviewBatchScenario(
  walletType: PreviewWalletType,
  scenario: string,
): PendingBatchTxRequest {
  const wallet = getPreviewWallet(walletType);
  return applyPreviewBatchScenario(
    createPreviewBatchRequest(walletType, {
      id: `preview-batch-${scenario}-${walletType}`,
    }),
    scenario,
    {
      spender: previewSpender,
      usdc: previewUsdc,
      defillamaUsdc: previewBaseUsdc,
      weth: previewWeth,
      approveData,
      defillamaFavicon: googleFaviconUrl("swap.defillama.com", 64),
      defillamaSwapData: createDefillamaSwapData(wallet.address, previewSpender, previewBaseUsdc),
    },
  );
}

export function createPreviewCrossDappBatch(
  walletType: PreviewWalletType = "bankr",
  overrides: Partial<CrossDappBatch> = {},
): CrossDappBatch {
  const wallet = getPreviewWallet(walletType);
  const txRequest = createPreviewTxRequest(walletType);
  const base: CrossDappBatch = {
    fromAddress: wallet.address,
    chainId: 8453,
    chainName: "Base",
    accountType:
      wallet.accountType === "impersonator" ? "bankr" : wallet.accountType,
    accountId: wallet.accountId,
    createdAt: PREVIEW_EPOCH_MS - 18_000,
    entries: [
      {
        txId: `preview-cross-1-${walletType}`,
        tx: txRequest.tx,
        origin: "https://app.uniswap.org",
        favicon: PREVIEW_ASSETS.dapps.uniswap,
        addedAt: PREVIEW_EPOCH_MS - 17_000,
        source: { kind: "eth_sendTransaction" },
      },
      {
        txId: `preview-cross-2-${walletType}`,
        tx: {
          from: wallet.address,
          to: previewWeth,
          data: "0xd0e30db0",
          value: "0x9502f900000000",
          chainId: 8453,
        },
        origin: "https://app.aave.com",
        favicon: PREVIEW_ASSETS.dapps.aave,
        addedAt: PREVIEW_EPOCH_MS - 14_000,
        source: { kind: "eth_sendTransaction" },
      },
    ],
  };

  return { ...base, ...overrides };
}

export function createPreviewCrossDappBatchScenario(
  walletType: PreviewWalletType,
  scenario: string,
): CrossDappBatch {
  const base = createPreviewCrossDappBatch(walletType);
  if (scenario === "impersonator-disabled") {
    // Cross-dapp persistence intentionally accepts signer accounts only, but
    // the shared production batch presentation has a defensive impersonator
    // path. Exercise that negative UI without changing the storage contract.
    return {
      ...base,
      accountType: "impersonator",
    } as unknown as CrossDappBatch;
  }
  if (scenario !== "stress") return base;

  const origins = [
    ["https://app.uniswap.org", PREVIEW_ASSETS.dapps.uniswap],
    ["https://app.aave.com", PREVIEW_ASSETS.dapps.aave],
    ["https://institutional-treasury-dashboard.example", null],
  ] as const;
  return {
    ...base,
    entries: Array.from({ length: 8 }, (_, index) => {
      const [origin, favicon] = origins[index % origins.length];
      return {
        txId: `preview-cross-stress-${index}-${walletType}`,
        tx: {
          from: base.fromAddress,
          to: index % 2 === 0 ? previewUsdc : previewWeth,
          data: index % 2 === 0 ? approveData : "0xd0e30db0",
          value: index % 2 === 0 ? "0x0" : "0x2386f26fc10000",
          chainId: 8453,
        },
        origin,
        favicon,
        addedAt: PREVIEW_EPOCH_MS - (8 - index) * 1_000,
        source: { kind: "eth_sendTransaction" as const },
      };
    }),
  };
}

export function createPreviewPermissionRequest(
  walletType: PreviewWalletType = "privateKey",
  overrides: Partial<PendingErc7715PermissionRequest> = {},
): PendingErc7715PermissionRequest {
  const wallet = getPreviewWallet(walletType);
  const base: PendingErc7715PermissionRequest = {
    id: `preview-permission-native-${walletType}`,
    origin: "http://localhost:3030",
    favicon: PREVIEW_ASSETS.dapps.aave,
    timestamp: PREVIEW_EPOCH_MS - 12_000,
    chainName: "Base",
    chainId: 8453,
    request: {
      chainId: "0x2105",
      from: wallet.address as `0x${string}`,
      to: previewSpender as `0x${string}`,
      permission: {
        type: "native-token-allowance",
        isAdjustmentAllowed: true,
        data: {
          allowanceAmount: `0x${previewPermissionAmount.toString(16)}`,
          startTime: previewPermissionStart,
        },
      },
      rules: [
        {
          type: "expiry",
          data: { timestamp: previewPermissionExpiry },
        },
      ],
    },
    permissionType: "native-token-allowance",
    caveats: [
      {
        enforcerName: "NativeTokenTransferAmountEnforcer",
        enforcer:
          METAMASK_DELEGATOR_V1_3_CAVEAT_ENFORCERS.NativeTokenTransferAmountEnforcer,
        terms: fixedWidthHex(previewPermissionAmount, 32),
        args: ERC7710_EMPTY_CAVEAT_ARGS,
      },
      {
        enforcerName: "TimestampEnforcer",
        enforcer:
          METAMASK_DELEGATOR_V1_3_CAVEAT_ENFORCERS.TimestampEnforcer,
        terms: concatHex([
          fixedWidthHex(previewPermissionStart, 16),
          fixedWidthHex(previewPermissionExpiry, 16),
        ]),
        args: ERC7710_EMPTY_CAVEAT_ARGS,
      },
    ],
    accountId: wallet.accountId,
    accountAddress: wallet.address,
    accountType:
      wallet.accountType === "seedPhrase" ? "seedPhrase" : "privateKey",
    tabId: 1,
    frameId: 0,
    senderOrigin: "http://localhost:3030",
    requestChainId: 8453,
  };

  return {
    ...base,
    ...overrides,
    request: { ...base.request, ...(overrides.request ?? {}) },
  };
}

export function createPreviewPermissionScenario(
  walletType: PreviewWalletType,
  scenario: string,
): PendingErc7715PermissionRequest {
  const persistedSignerType = walletType === "seedPhrase"
    ? "seedPhrase"
    : "privateKey";
  const selectedWallet = getPreviewWallet(walletType);
  const localBase = createPreviewPermissionRequest(persistedSignerType);
  const base: PendingErc7715PermissionRequest = {
    ...localBase,
    accountId: selectedWallet.accountId,
    accountAddress: selectedWallet.address,
    request: {
      ...localBase.request,
      from: selectedWallet.address as `0x${string}`,
    },
  };
  if (scenario === "default" || scenario === "submitting") return base;

  const startTime = previewPermissionStart;
  const expiry = scenario === "draft-invalid"
    ? startTime
    : previewPermissionExpiry;
  const request = {
    ...base.request,
    permission: {
      type: "erc20-token-allowance" as const,
      isAdjustmentAllowed: true,
      justification:
        scenario === "advanced-stress"
          ? "Allow a settlement automation agent to rebalance a bounded treasury position while preserving the complete technical request for expert review."
          : "Allow a bounded token spend.",
      data: {
        tokenAddress: previewUsdc,
        allowanceAmount:
          scenario === "advanced-stress"
            ? "0xffffffffffffffffffffffffffffffff"
            : "0x3b9aca00",
        startTime,
      },
    },
    rules: [{ type: "expiry", data: { timestamp: expiry } }],
  };

  return {
    ...base,
    id: `preview-permission-${scenario}-${walletType}`,
    origin:
      scenario === "advanced-stress"
        ? "https://institutional-treasury-automation-and-settlement.example"
        : base.origin,
    senderOrigin:
      scenario === "advanced-stress"
        ? "https://institutional-treasury-automation-and-settlement.example"
        : base.senderOrigin,
    permissionType: "erc20-token-allowance",
    request,
  };
}

// Compatibility exports used by the current route registry. New preview
// scenarios should prefer the wallet-aware factories above.
export const previewAccounts: Account[] = [
  toAccount(PREVIEW_WALLETS.bankr),
  toAccount(PREVIEW_WALLETS.privateKey),
  toAccount(PREVIEW_WALLETS.seedPhrase),
  toAccount(PREVIEW_WALLETS.viewOnly),
];

export const previewHomeAccount: Account = {
  ...toAccount(PREVIEW_WALLETS.privateKey),
  id: "preview-home-pk",
  displayName: "walletchan.eth",
  createdAt: PREVIEW_EPOCH_MS - 172_800_000,
};

export const previewHomeAccounts: Account[] = [
  previewHomeAccount,
  ...previewAccounts.filter(
    (account) => account.id !== PREVIEW_WALLETS.privateKey.accountId,
  ),
];

export const previewVisibleChains = getVisibleChains(
  previewNetworks,
  previewHomeAccount.type,
).slice(0, 5);

export const previewTxRequest = createPreviewTxRequest("bankr", {
  id: "preview-tx-approve",
});

export const previewSignatureRequest = createPreviewSignatureRequest("bankr", {
  id: "preview-signature",
});

export const previewBatchRequest = createPreviewBatchRequest("bankr", {
  id: "preview-batch",
});

export const previewCrossDappBatch = createPreviewCrossDappBatch("bankr", {
  entries: [
    {
      ...createPreviewCrossDappBatch("bankr").entries[0],
      txId: "preview-cross-1",
    },
    {
      ...createPreviewCrossDappBatch("bankr").entries[1],
      txId: "preview-cross-2",
    },
  ],
});

export const previewPermissionRequest = createPreviewPermissionRequest(
  "privateKey",
  { id: "preview-permission-native" },
);

export function createPreviewWatchAssetRequest(
  scenario = "default",
): PendingWatchAssetRequest {
  return {
    id: "preview-watch-asset",
    asset: {
      address: "0xBa5ED0000e1CA9136a695f0a848012A16008B032",
      symbol: scenario === "long-symbol" ? "WALLETCHAN-LONG-SYMBOL" : "WCHAN",
      decimals: 18,
      image: previewAssets.brand.walletChan,
    },
    chainId: 8453,
    origin: "https://app.walletchan.example",
    favicon: previewAssets.brand.walletChan,
    timestamp: PREVIEW_EPOCH_MS - 15_000,
  };
}

export function createPreviewAddChainRequest(
  scenario = "default",
): PendingAddChainRequest {
  return {
    id: "preview-add-chain",
    chainId: 34443,
    chainName:
      scenario === "long-name"
        ? "A Very Long Community Network Name for Layout Stress"
        : "Mode Testnet",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://sepolia.mode.network"],
    blockExplorerUrls: ["https://sepolia.explorer.mode.network"],
    origin: "https://app.example.org",
    favicon: previewAssets.dapps.uniswap,
    timestamp: PREVIEW_EPOCH_MS - 10_000,
  };
}
