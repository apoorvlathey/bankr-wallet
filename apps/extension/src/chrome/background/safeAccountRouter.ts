import { getAccounts, setActiveAccountId } from "../accountStorage";
import { resolvePasswordType } from "../sessionCache";
import { handleUnlockWallet } from "../authHandlers";
import { withDerivedSafeCapability } from "../safe/capabilities";
import {
  findSafesOwnedByAccount,
  findSafesOwnedByAccountBatch,
  probeSafeAddress,
} from "../safe/discovery";
import {
  getSafeAccountRecords,
  importVerifiedSafeAccount,
} from "../safe/accountRepository";
import { refreshSafeAccountState } from "../safe/accountRefresh";
import { requireSafeFeature } from "../safe/featurePolicy";
import {
  discardSafeImportVerifications,
  registerSafeImportVerification,
  resolveSafeImportVerifications,
} from "../safe/importVerificationCache";

export const BACKGROUND_SAFE_ACCOUNT_MESSAGE_TYPES = [
  "probeSafeAddress",
  "findSafesByOwner",
  "importSafeAccount",
  "getSafeAccounts",
  "refreshSafeAccount",
  "removeSafeAccount",
] as const;

export type SafeAccountRouteResult =
  | { handled: false }
  | { handled: true; keepChannelOpen: boolean };

type Dependencies = {
  probeSafeAddress: typeof probeSafeAddress;
  findSafesOwnedByAccount: typeof findSafesOwnedByAccount;
  findSafesOwnedByAccountBatch: typeof findSafesOwnedByAccountBatch;
  getAccounts: typeof getAccounts;
  getSafeAccountRecords: typeof getSafeAccountRecords;
  importVerifiedSafeAccount: typeof importVerifiedSafeAccount;
  refreshSafeAccountState: typeof refreshSafeAccountState;
  setActiveAccountId: typeof setActiveAccountId;
  resolvePasswordType: typeof resolvePasswordType;
  handleUnlockWallet: typeof handleUnlockWallet;
  sendRuntimeMessage: (message: Record<string, unknown>) => Promise<unknown>;
  registerSafeImportVerification: typeof registerSafeImportVerification;
  resolveSafeImportVerifications: typeof resolveSafeImportVerifications;
  discardSafeImportVerifications: typeof discardSafeImportVerifications;
};

const production: Dependencies = {
  probeSafeAddress,
  findSafesOwnedByAccount,
  findSafesOwnedByAccountBatch,
  getAccounts,
  getSafeAccountRecords,
  importVerifiedSafeAccount,
  refreshSafeAccountState,
  setActiveAccountId,
  resolvePasswordType,
  handleUnlockWallet,
  sendRuntimeMessage: (message) => chrome.runtime.sendMessage(message),
  registerSafeImportVerification,
  resolveSafeImportVerifications,
  discardSafeImportVerifications,
};

function respond<T>(work: Promise<T>, sendResponse: (value: unknown) => void) {
  void work.then(sendResponse).catch((error) =>
    sendResponse({
      success: false,
      error: error instanceof Error ? error.message : "Safe operation failed",
    }),
  );
}

async function requireMaster(dependencies: Dependencies): Promise<void> {
  if (
    (await dependencies.resolvePasswordType(dependencies.handleUnlockWallet)) !==
    "master"
  ) {
    throw new Error("Safe account changes require master password");
  }
}

export function createBackgroundSafeAccountMessageRouter(
  overrides: Partial<Dependencies> = {},
) {
  const dependencies = { ...production, ...overrides };
  return (
    message: any,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (value?: any) => void,
  ): SafeAccountRouteResult => {
    switch (message?.type) {
      case "findSafesByOwner":
        requireSafeFeature("accountSelection");
        respond((async () => {
          const accounts = await dependencies.getAccounts();
          const account = accounts.find((candidate) => candidate.id === message.accountId);
          if (!account) throw new Error("Selected account was not found");
          const isBatched = message.offset !== undefined || message.limit !== undefined;
          const isCountOnly = message.countOnly === true;
          if (isCountOnly && !isBatched) {
            throw new Error("Invalid Safe discovery batch");
          }
          let result;
          if (isBatched) {
            const validCountRequest =
              isCountOnly && message.offset === 0 && message.limit === 0;
            const validScanRequest =
              !isCountOnly &&
              Number.isSafeInteger(message.offset) &&
              message.offset >= 0 &&
              Number.isSafeInteger(message.limit) &&
              message.limit >= 1 &&
              message.limit <= 10;
            if (!validCountRequest && !validScanRequest) {
              throw new Error("Invalid Safe discovery batch");
            }
            result = await dependencies.findSafesOwnedByAccountBatch(account, {
              offset: message.offset,
              limit: message.limit,
            });
          } else {
            result = await dependencies.findSafesOwnedByAccount(account);
          }
          const candidates = result.candidates.map((candidate) => {
            const snapshot = withDerivedSafeCapability(candidate.snapshot, accounts);
            return {
              ...candidate,
              snapshot,
              verificationId: dependencies.registerSafeImportVerification({
                address: candidate.address,
                snapshots: [snapshot],
              }),
            };
          });
          return {
            ...result,
            candidates,
          };
        })(), sendResponse);
        return { handled: true, keepChannelOpen: true };
      case "probeSafeAddress":
        requireSafeFeature("accountSelection");
        respond((async () => {
          const [result, accounts] = await Promise.all([
            dependencies.probeSafeAddress(message.address),
            dependencies.getAccounts(),
          ]);
          const snapshots = result.snapshots.map((snapshot) =>
            withDerivedSafeCapability(snapshot, accounts),
          );
          return {
            ...result,
            snapshots,
            verificationIds: snapshots.length
              ? [dependencies.registerSafeImportVerification({
                  address: result.address,
                  snapshots,
                })]
              : [],
          };
        })(), sendResponse);
        return { handled: true, keepChannelOpen: true };
      case "getSafeAccounts":
        requireSafeFeature("accountSelection");
        respond(dependencies.getSafeAccountRecords(), sendResponse);
        return { handled: true, keepChannelOpen: true };
      case "importSafeAccount":
        requireSafeFeature("accountSelection");
        respond((async () => {
          await requireMaster(dependencies);
          const verified = dependencies.resolveSafeImportVerifications({
            verificationIds: message.verificationIds,
            address: message.address,
            chainIds: message.chainIds,
          });
          const accounts = await dependencies.getAccounts();
          const snapshots = verified.snapshots.map((snapshot) =>
            withDerivedSafeCapability(snapshot, accounts),
          );
          const result = await dependencies.importVerifiedSafeAccount({
            address: verified.address,
            displayName:
              typeof message.displayName === "string" ? message.displayName : undefined,
            importedBy: message.importedBy === "ownerDiscovery" ? "ownerDiscovery" : "manual",
            snapshots,
          });
          await dependencies.setActiveAccountId(result.account.id);
          dependencies.discardSafeImportVerifications(message.verificationIds);
          void dependencies.sendRuntimeMessage({ type: "accountsUpdated" }).catch(() => {});
          return { success: true, ...result };
        })(), sendResponse);
        return { handled: true, keepChannelOpen: true };
      case "refreshSafeAccount":
        requireSafeFeature("security");
        respond((async () => {
          const record = await dependencies.refreshSafeAccountState({
            accountId: message.accountId,
            chainId: message.chainId,
          });
          return { success: true, record };
        })(), sendResponse);
        return { handled: true, keepChannelOpen: true };
      case "removeSafeAccount":
        sendResponse({
          success: false,
          error: "Remove Safes through Account settings so connected sites are detached first",
        });
        return { handled: true, keepChannelOpen: true };
      default:
        return { handled: false };
    }
  };
}
