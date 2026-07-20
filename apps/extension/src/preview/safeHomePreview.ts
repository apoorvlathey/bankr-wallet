import type { Account } from "@/chrome/types";
import type { SafeAccountRecord, SafeProposalRecord } from "@/chrome/safe/types";
import { PREVIEW_EPOCH_MS } from "./fixtures";
import type { PreviewRoute } from "./types";

const SAFE_ADDRESS = "0x3a11e7c2ccd1af51c1edd664800af20d21ee5d34";

export function resolveSafeHomePreviewAccount(
  accounts: Account[],
  route: PreviewRoute,
  scenario: string,
): Account | null {
  if (route !== "home" || scenario !== "safe-account") return null;
  const account: Account = {
    id: "preview-safe",
    type: "safe",
    address: SAFE_ADDRESS,
    displayName: "Treasury Safe",
    createdAt: PREVIEW_EPOCH_MS - 259_200_000,
  };
  accounts.push(account);
  return account;
}

export const previewSafeAccountRecords: SafeAccountRecord[] = [
  {
    version: 1,
    accountId: "preview-safe",
    address: SAFE_ADDRESS,
    importedBy: "ownerDiscovery",
    chains: {
      "8453": {
        chainId: 8453,
        verifiedAtBlock: "33333333",
        configEpoch: "preview-safe-base",
        singleton: "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762",
        version: "1.4.1",
        owners: ["0x1234567890123456789012345678901234567890"],
        contractOwners: [],
        threshold: 1,
        nonce: "4",
        modules: [],
        guard: "0x0000000000000000000000000000000000000000",
        fallbackHandler: "0x0000000000000000000000000000000000000000",
        transactionService: "supported",
        capability: "quorumAvailable",
      },
    },
  },
];

const previewReadyProposal: SafeProposalRecord = {
    version: 1,
    id: `8453:${SAFE_ADDRESS}:0x${"ab".repeat(32)}`,
    chainId: 8453,
    safeAccountId: "preview-safe",
    safeAddress: SAFE_ADDRESS,
    safeTxHash: `0x${"ab".repeat(32)}`,
    safeVersion: "1.4.1",
    safeConfigEpoch: "preview-safe-base",
    verifiedAtBlock: "33333333",
    calls: [
      {
        to: "0x1234567890123456789012345678901234567890",
        value: "1000000000000000",
        data: "0x",
        operation: 0,
      },
    ],
    transaction: {
      to: "0x1234567890123456789012345678901234567890",
      value: "1000000000000000",
      data: "0x",
      operation: 0,
      safeTxGas: "0",
      baseGas: "0",
      gasPrice: "0",
      gasToken: "0x0000000000000000000000000000000000000000",
      refundReceiver: "0x0000000000000000000000000000000000000000",
      nonce: 4,
    },
    state: "readyToExecute",
    confirmations: [
      {
        ownerAddress: "0x1234567890123456789012345678901234567890",
        accountId: "preview-pk",
        accountType: "privateKey",
        signature: `0x${"cd".repeat(64)}1b`,
        createdAt: PREVIEW_EPOCH_MS - 120_000,
        publishedAt: PREVIEW_EPOCH_MS - 90_000,
      },
    ],
    route: {
      kind: "wallet",
      origin: JSON.stringify({ url: "https://app.safe.global/", name: "" }),
    },
    createdAt: PREVIEW_EPOCH_MS - 180_000,
    updatedAt: PREVIEW_EPOCH_MS - 90_000,
};

export const previewSafeProposals: SafeProposalRecord[] = [
  previewReadyProposal,
  {
    ...previewReadyProposal,
    id: `8453:${SAFE_ADDRESS}:0x${"ef".repeat(32)}`,
    safeTxHash: `0x${"ef".repeat(32)}`,
    transaction: {
      ...previewReadyProposal.transaction,
      nonce: 5,
    },
    state: "blocked",
    confirmations: [],
    error: "Future Safe nonce 5; executable nonce is 4",
    createdAt: PREVIEW_EPOCH_MS - 120_000,
    updatedAt: PREVIEW_EPOCH_MS - 60_000,
  },
];
