import type { Account } from "@/chrome/types";
import type { PendingTxRequest } from "@/chrome/pendingTxStorage";
import type { PendingSignatureRequest } from "@/chrome/pendingSignatureStorage";
import type { PendingBatchTxRequest } from "@/chrome/erc5792Types";
import type { CrossDappBatch } from "@/chrome/crossDappBatchStorage";
import { getVisibleChains, normalizeNetworksInfo } from "@/lib/chains";
import { DEFAULT_NETWORKS } from "@/constants/networks";

export const previewAddress = "0x742d35Cc6634C0532925a3b844Bc454e4438f44e";
export const previewSpender = "0x111111125421cA6dc452d289314280a0f8842A65";
export const previewUsdc = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
export const previewWeth = "0x4200000000000000000000000000000000000006";

const approveData =
  "0x095ea7b3" +
  previewSpender.toLowerCase().replace("0x", "").padStart(64, "0") +
  BigInt(250_000_000).toString(16).padStart(64, "0");

export const previewAccounts: Account[] = [
  {
    id: "preview-bankr",
    type: "bankr",
    address: previewAddress,
    displayName: "Bankr vault",
    createdAt: Date.now() - 86400000,
  },
  {
    id: "preview-pk",
    type: "privateKey",
    address: "0x1111111111111111111111111111111111111111",
    displayName: "Local signer",
    createdAt: Date.now() - 43200000,
  },
  {
    id: "preview-seed-0",
    type: "seedPhrase",
    address: "0x2222222222222222222222222222222222222222",
    displayName: "Seed #1 · #0",
    seedGroupId: "preview-seed",
    derivationIndex: 0,
    createdAt: Date.now() - 21600000,
  },
];

export const previewHomeAccount: Account = {
  id: "preview-home-pk",
  type: "privateKey",
  address: previewAddress,
  displayName: "walletchan.eth",
  createdAt: Date.now() - 172800000,
};

export const previewHomeAccounts: Account[] = [
  previewHomeAccount,
  ...previewAccounts.filter((account) => account.id !== previewHomeAccount.id),
];

export const previewNetworks = normalizeNetworksInfo(DEFAULT_NETWORKS);

export const previewVisibleChains = getVisibleChains(previewNetworks, "bankr").slice(0, 5);

export const previewTxRequest: PendingTxRequest = {
  id: "preview-tx-approve",
  tx: {
    from: previewAddress,
    to: previewUsdc,
    data: approveData,
    value: "0x0",
    chainId: 8453,
  },
  origin: "https://app.uniswap.org",
  favicon: "https://www.google.com/s2/favicons?domain=app.uniswap.org&sz=64",
  chainName: "Base",
  timestamp: Date.now() - 45000,
  accountId: "preview-bankr",
  accountAddress: previewAddress,
  accountType: "bankr",
  tabId: 1,
  frameId: 0,
  senderOrigin: "https://app.uniswap.org",
  requestChainId: 8453,
};

export const previewSignatureRequest: PendingSignatureRequest = {
  id: "preview-signature",
  signature: {
    method: "personal_sign",
    params: [
      "0x50726576696577207369676e2d696e207265717565737420666f722057616c6c65744368616e2e",
      previewAddress,
    ],
    chainId: 8453,
  },
  origin: "https://wallet.bankr.bot",
  favicon: "https://www.google.com/s2/favicons?domain=wallet.bankr.bot&sz=64",
  chainName: "Base",
  timestamp: Date.now() - 32000,
  accountId: "preview-bankr",
  accountAddress: previewAddress,
  accountType: "bankr",
  tabId: 1,
  frameId: 0,
  senderOrigin: "https://wallet.bankr.bot",
  requestChainId: 8453,
};

export const previewBatchRequest: PendingBatchTxRequest = {
  id: "preview-batch",
  params: {
    version: "2.0.0",
    chainId: "0x2105",
    from: previewAddress,
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
  favicon: "https://www.google.com/s2/favicons?domain=app.aave.com&sz=64",
  chainName: "Base",
  chainId: 8453,
  timestamp: Date.now() - 25000,
  accountType: "bankr",
  accountId: "preview-bankr",
  accountAddress: previewAddress,
  tabId: 1,
  frameId: 0,
  senderOrigin: "https://app.aave.com",
  requestChainId: 8453,
};

export const previewCrossDappBatch: CrossDappBatch = {
  fromAddress: previewAddress,
  chainId: 8453,
  chainName: "Base",
  accountType: "bankr",
  accountId: "preview-bankr",
  createdAt: Date.now() - 18000,
  entries: [
    {
      txId: "preview-cross-1",
      tx: previewTxRequest.tx,
      origin: "https://app.uniswap.org",
      favicon: "https://www.google.com/s2/favicons?domain=app.uniswap.org&sz=64",
      addedAt: Date.now() - 17000,
      source: { kind: "eth_sendTransaction" },
    },
    {
      txId: "preview-cross-2",
      tx: {
        from: previewAddress,
        to: previewWeth,
        data: "0xd0e30db0",
        value: "0x9502f900000000",
        chainId: 8453,
      },
      origin: "https://app.aave.com",
      favicon: "https://www.google.com/s2/favicons?domain=app.aave.com&sz=64",
      addedAt: Date.now() - 14000,
      source: { kind: "eth_sendTransaction" },
    },
  ],
};
