import { DEFAULT_NETWORKS } from "@/constants/networks";
import type { CompletedTransaction } from "@/chrome/txHistoryStorage";
import { SELECTED_THEME_STORAGE_KEY } from "@/theme";
import { DEFAULT_AUTO_LOCK_TIMEOUT_MS } from "@/constants/securityPolicy";
import extensionPackage from "../../package.json";
import { previewAssets } from "./previewAssets";
import { PREVIEW_EPOCH_MS } from "./fixtures";
import {
  createPreviewEnvironment,
  createPreviewFetch,
  type PreviewEnvironment,
} from "./previewEnvironment";
import { makeStorageArea, type StorageListener } from "./previewChromeStorage";
import {
  activePreviewAccount,
  previewChainIdForName,
  previewCustomTokens,
  previewGasEstimate,
  previewSimulationResult,
  unknownPreviewMessage,
  type PreviewChromeLogger,
} from "./previewChromeSupport";

export type { PreviewChromeLogger } from "./previewChromeSupport";

export function responseForPreviewMessage(
  environment: PreviewEnvironment,
  message: any,
  logger: PreviewChromeLogger = console,
): unknown {
  const { route, scenario } = environment.parsed.state;
  switch (message?.type) {
    case "ensureNetworksInfo":
      return {
        success: true,
        networksInfo: environment.storage.sync.networksInfo ?? DEFAULT_NETWORKS,
      };
    case "getAccounts":
      return environment.accounts.map((account) => ({ ...account }));
    case "getAddressContacts":
      return environment.contacts.map((contact) => ({ ...contact }));
    case "createAddressContact": {
      const address = String(message.address ?? "");
      const label = String(message.label ?? "").trim();
      if (!address || !label) return { success: false, error: "Invalid contact" };
      environment.contacts.push({ address: address as `0x${string}`, label });
      return {
        success: true,
        contacts: environment.contacts.map((contact) => ({ ...contact })),
      };
    }
    case "updateAddressContactLabel": {
      const normalized = String(message.address ?? "").toLowerCase();
      const contact = environment.contacts.find(
        (candidate) => candidate.address.toLowerCase() === normalized,
      );
      if (!contact) return { success: false, error: "Contact not found" };
      contact.label = String(message.label ?? "").trim();
      return {
        success: true,
        contacts: environment.contacts.map((candidate) => ({ ...candidate })),
      };
    }
    case "removeAddressContact": {
      const normalized = String(message.address ?? "").toLowerCase();
      environment.contacts = environment.contacts.filter(
        (contact) => contact.address.toLowerCase() !== normalized,
      );
      return {
        success: true,
        contacts: environment.contacts.map((contact) => ({ ...contact })),
      };
    }
    case "reorderAddressContacts": {
      const byAddress = new Map(
        environment.contacts.map((contact) => [contact.address.toLowerCase(), contact]),
      );
      const addresses: string[] = Array.isArray(message.addresses)
        ? message.addresses.filter(
            (address: unknown): address is string => typeof address === "string",
          )
        : [];
      const reordered: typeof environment.contacts = [];
      for (const address of addresses) {
        const contact = byAddress.get(address.toLowerCase());
        if (contact) reordered.push(contact);
      }
      environment.contacts = reordered;
      return {
        success: true,
        contacts: environment.contacts.map((contact) => ({ ...contact })),
      };
    }
    case "reorderAccounts": {
      const byId = new Map(environment.accounts.map((account) => [account.id, account]));
      const accountIds = Array.isArray(message.accountIds) ? message.accountIds : [];
      if (
        accountIds.length !== environment.accounts.length ||
        new Set(accountIds).size !== accountIds.length ||
        accountIds.some((accountId: string) => !byId.has(accountId))
      ) {
        return { success: false, error: "Invalid account order" };
      }
      environment.accounts.splice(
        0,
        environment.accounts.length,
        ...accountIds.map((accountId: string) => byId.get(accountId)!),
      );
      return { success: true, accounts: environment.accounts };
    }
    case "getActiveAccount":
      return { ...activePreviewAccount(environment) };
    case "getTabAccount":
      return { ...activePreviewAccount(environment) };
    case "getPendingDappConnectionRequests":
      return [];
    case "getDappConnectionContext":
      return { success: true };
    case "getPendingTxRequests":
      return environment.pendingTxRequests;
    case "getPendingSignatureRequests":
      return environment.pendingSignatureRequests;
    case "getPendingBatchTxRequests":
      return environment.pendingBatchRequests;
    case "getPendingErc7715PermissionRequests":
      return environment.pendingPermissionRequests;
    case "getPendingWatchAssetRequests":
    case "getPendingAddChainRequests":
      return [];
    case "getTxHistory":
      return environment.txHistory;
    case "getTxHistoryPage": {
      const history = environment.txHistory as CompletedTransaction[];
      const filtered = history.filter((tx) =>
        (!message.ownerAddress || tx.tx.from.toLowerCase() === String(message.ownerAddress).toLowerCase()) &&
        (message.chainId == null || tx.chainId === message.chainId),
      );
      const start = message.cursor
        ? Math.max(0, filtered.findIndex((tx) => tx.id === message.cursor.id) + 1)
        : 0;
      const limit = typeof message.limit === "number" ? message.limit : 30;
      const items = filtered.slice(start, start + limit);
      const hasMore = start + items.length < filtered.length;
      const last = items.at(-1);
      return {
        items,
        hasMore,
        nextCursor: hasMore && last
          ? { createdAt: last.createdAt, id: last.id }
          : null,
      };
    }
    case "getTxHistoryItem":
      return (environment.txHistory as CompletedTransaction[])
        .find((tx) => tx.id === message.txId) ?? null;
    case "getTransactionCalldata": {
      const tx = (environment.txHistory as CompletedTransaction[])
        .find((candidate) => candidate.id === message.txId);
      return tx?.tx.data
        ? { success: true, data: tx.tx.data }
        : { success: false, error: "Calldata unavailable in preview" };
    }
    case "resolveHistoryNftMetadata": {
      const tx = (environment.txHistory as CompletedTransaction[])
        .find((candidate) => candidate.id === message.txId);
      const record = message.leg === "destination"
        ? tx?.destAssetChanges
        : tx?.assetChanges;
      const transfer = record?.nftTransfers?.[message.nftIndex];
      return transfer
        ? {
            success: true,
            data: {
              name: transfer.metadata?.name,
              collectionName: transfer.collectionName,
              symbol: transfer.symbol,
              image: transfer.metadata?.image,
              historical: true,
            },
          }
        : { success: false, error: "NFT unavailable in preview" };
    }
    case "getFailedTxResult":
      return null;
    case "checkPendingTxReceipt":
      return { status: "pending" };
    case "walletConnectGetSessions":
      return { success: true, sessions: [], activeChainId: 8453 };
    case "walletConnectSwitchChain":
      return {
        success: true,
        chainId: previewChainIdForName(message?.chainName),
      };
    case "isWalletUnlocked":
      return environment.unlocked;
    case "isSidePanelSupported":
      return { supported: true };
    case "getSidePanelMode":
      return { enabled: environment.storage.sync.sidePanelMode === true };
    case "isAgentPasswordEnabled":
      return { enabled: true };
    case "getPasswordType":
      return { passwordType: "master" };
    case "getOnboardingInitializationStatus":
      return {
        configured: false,
        setupInProgress: false,
        recoveryRequired: false,
      };
    case "beginOnboardingInitialization":
      return {
        success: true,
        initializationId:
          message?.initializationId ?? "preview-onboarding-initialization",
      };
    case "initializeOnboardingCredential":
      return { success: true, passwordType: "master" };
    case "completeOnboardingInitialization":
    case "rollbackOnboardingInitialization":
    case "onboardingComplete":
      return { success: true };
    case "getCachedPassword":
      return { hasCachedPassword: environment.unlocked };
    case "getCachedApiKey":
      return { apiKey: null };
    case "getAutoLockTimeout":
      return {
        timeout:
          environment.storage.sync.autoLockTimeout ??
          DEFAULT_AUTO_LOCK_TIMEOUT_MS,
      };
    case "getClearSigningEnabled":
      return { enabled: true };
    case "checkPremiumStatus":
      return {
        isPremium: false,
        balance: "0",
        sponsoredTransfersEnabled: false,
      };
    case "checkSponsoredTransferStatus":
      return { success: true, hasUnresolved: false };
    case "acknowledgeSponsoredTransfer":
      return { success: true };
    case "getSeedGroups":
      return environment.seedGroups;
    case "generateMnemonic":
      return {
        success: true,
        // Public Anvil mnemonic: deterministic preview content, never a user
        // secret and never used for signing in the preview harness.
        mnemonic:
          "test test test test test test test test test test test junk",
      };
    case "previewSeedAddresses": {
      const start = Number(message?.start ?? 0);
      const count = Math.max(0, Math.min(Number(message?.count ?? 5), 20));
      return {
        success: true,
        items: Array.from({ length: count }, (_, offset) => {
          const index = start + offset;
          return {
            index,
            address: `0x${(index + 1).toString(16).padStart(40, "0")}`,
            exists: message?.seedGroupId === "preview-seed" && index === 0,
          };
        }),
      };
    }
    case "addSeedPhraseGroup": {
      const account =
        environment.accounts.find((candidate) => candidate.type === "seedPhrase") ??
        {
          id: "preview-seed-0",
          type: "seedPhrase",
          address: "0x0000000000000000000000000000000000000001",
          displayName: message?.accountDisplayName || "Seed #1 · #0",
          seedGroupId: "preview-seed",
          derivationIndex: 0,
          createdAt: PREVIEW_EPOCH_MS,
        };
      return {
        success: true,
        mnemonic:
          "test test test test test test test test test test test junk",
        group: environment.seedGroups[0],
        account,
        accounts: [account],
      };
    }
    case "deriveSeedAccount":
      return {
        success: true,
        accounts: (message?.indices ?? []).map((index: number) => ({
          id: `preview-seed-${index}`,
          type: "seedPhrase",
          address: `0x${(index + 1).toString(16).padStart(40, "0")}`,
          displayName: `Seed #1 · #${index}`,
          seedGroupId: "preview-seed",
          derivationIndex: index,
          createdAt: PREVIEW_EPOCH_MS,
        })),
      };
    case "getErc7715PermissionGrantsForAccount":
      return { success: true, grants: [] };
    case "getPasskeyUnlockStatus":
      if (route === "unlock" && scenario === "biometric-configured") {
        return {
          configured: true,
          rpId: "extension",
          credentialId: "preview-passkey-credential",
          prfSalt: "cHJldmlldy1wcmYtc2FsdA==",
          authCeremonyEpoch: "preview-auth-ceremony",
        };
      }
      return {
        configured: false,
        rpId: "extension",
        authCeremonyEpoch: "preview-auth-ceremony",
      };
    case "canSetupPasskeyUnlock":
    case "verifyPasskeySetupPassword":
      return {
        success: true,
        authCeremonyEpoch: "preview-auth-ceremony",
      };
    case "setupPasskeyUnlock":
    case "setupPasskeyUnlockWithPassword":
    case "unlockWithPasskey":
    case "removePasskeyUnlock":
      return { success: true };
    case "unlockWallet":
      environment.unlocked = true;
      return { success: true };
    case "tryRestoreSession":
      environment.unlocked = true;
      return true;
    case "lockWallet":
      environment.unlocked = false;
      return { success: true };
    case "migrateFromLegacy":
      return { migrated: false };
    case "resetExtension":
      return { success: true };
    case "setActiveAccount": {
      const next = environment.accounts.find(
        (account) => account.id === message?.accountId,
      );
      if (!next) {
        return { success: false, error: "Preview account not found" };
      }
      environment.activeAccount = next;
      environment.storage.sync.activeAccountId = next.id;
      environment.storage.sync.address = next.address;
      environment.storage.sync.displayAddress =
        next.displayName || next.address;
      return { success: true };
    }
    case "updateAccountDisplayName": {
      const account = environment.accounts.find(
        (candidate) => candidate.id === message?.accountId,
      );
      if (!account) return { success: false, error: "Preview account not found" };
      account.displayName = String(message?.displayName ?? "").trim() || undefined;
      return { success: true };
    }
    case "setSidePanelMode":
      environment.storage.sync.sidePanelMode = message?.enabled === true;
      return {
        success: true,
        sidePanelWorks: true,
      };
    case "setAutoLockTimeout":
      environment.storage.sync.autoLockTimeout =
        message?.timeout ?? DEFAULT_AUTO_LOCK_TIMEOUT_MS;
      return { success: true };
    case "setClearSigningEnabled":
      return { success: true };
    case "estimateGas":
    case "estimateForceInclusionGas":
      return previewGasEstimate;
    case "estimateBatchGasSequential":
      return (message?.calls ?? []).map((_: unknown, index: number) => ({
        ...previewGasEstimate,
        gasLimit: String(Number(previewGasEstimate.gasLimit) + index * 24_000),
        estimatedCostWei: String(
          BigInt(Number(previewGasEstimate.gasLimit) + index * 24_000) *
            BigInt(previewGasEstimate.maxFeePerGas),
        ),
      }));
    case "simulateAssetChanges":
    case "simulateBatchAssetChanges":
    case "simulateBatchAssetChangesNonAtomic":
      if (
        scenario === "simulation-error" ||
        (route === "cross-batch" && scenario === "error")
      ) {
        return {
          ...previewSimulationResult,
          txSuccess: true,
          simulationFailed: true,
          simulationError: "Deterministic preview simulation unavailable",
          nativeChange: null,
          tokenChanges: [],
        };
      }
      return previewSimulationResult;
    case "retryTokenMetadata":
      return { tokenChanges: previewSimulationResult.tokenChanges };
    case "fetchTokenInfo":
      return {
        success: true,
        data: {
          name: "USD Coin",
          symbol: "USDC",
          decimals: 6,
        },
      };
    case "fetchSwapTokenList":
      return {
        success: true,
        data: [
          {
            address: "0xBa5ED0000e1CA9136a695f0a848012A16008B032",
            name: "WalletChan",
            symbol: "WCHAN",
            decimals: 18,
            logoURI: previewAssets.brand.walletChan,
          },
          {
            address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
            name: "USD Coin",
            symbol: "USDC",
            decimals: 6,
            logoURI: previewAssets.tokens.usdc,
          },
        ],
      };
    case "fetchNativePrice":
      return {
        success: true,
        priceUsd: message?.chainId === 8453 ? 1749.69 : 3600,
      };
    case "fetchTokenPrice":
      return {
        success: true,
        priceUsd: String(message?.address || "").toLowerCase() === "native"
          ? 1749.69
          : 1,
      };
    case "getTokenBalanceWei":
      return {
        success: true,
        balanceWei: "2812260000000000000",
      };
    case "fetchSwapPrice":
      return {
        success: true,
        data: {
          buyAmount: "873420000",
          sellAmount: String(message?.sellAmount ?? "500000000000000000"),
          buyToken: String(message?.buyToken ?? ""),
          sellToken: String(message?.sellToken ?? ""),
          gas: "180000",
          gasPrice: "120000000",
          totalNetworkFee: "21600000000000",
          liquidityAvailable: true,
          minBuyAmount: "829749000",
          allowanceTarget: "0x111111125421cA6dc452d289314280a0f8842A65",
          issues: {},
          fees: {},
          route: {
            fills: [
              {
                from: String(message?.sellToken ?? "ETH"),
                to: String(message?.buyToken ?? "USDC"),
                source: "Uniswap_V3",
                proportionBps: "10000",
              },
            ],
          },
        },
      };
    case "fetchBridgeQuote": {
      const outputToken = {
        address: String(message?.outputToken ?? ""),
        name: "USD Coin",
        symbol: "USDC",
        decimals: 6,
        chainId: Number(message?.destinationChainId ?? 42161),
        logoURI: previewAssets.tokens.usdc,
      };
      return {
        success: true,
        data: {
          success: true,
          result: {
            input: {
              token: {
                address: String(message?.inputToken ?? ""),
                name: "Ether",
                symbol: "ETH",
                decimals: 18,
                chainId: Number(message?.originChainId ?? 8453),
              },
              amount: String(message?.inputAmount ?? "500000000000000000"),
              valueInUsd: 874.85,
            },
            manualRoutes: [
              {
                output: {
                  token: outputToken,
                  amount: "869600000",
                  minAmountOut: "826120000",
                  valueInUsd: 869.6,
                },
                quoteId: "preview-bridge-quote",
                quoteExpiry: Math.floor(PREVIEW_EPOCH_MS / 1000) + 300,
                gasFee: {
                  feesInUsd: 0.12,
                  gasToken: {
                    address: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
                    name: "Ether",
                    symbol: "ETH",
                    decimals: 18,
                    chainId: Number(message?.originChainId ?? 8453),
                  },
                },
                routeDetails: { name: "Socket" },
                estimatedTime: 90,
                approvalData: null,
                txData: {
                  to: "0x111111125421cA6dc452d289314280a0f8842A65",
                  data: "0x12345678",
                  value: "500000000000000000",
                  chainId: Number(message?.originChainId ?? 8453),
                  gas: "240000",
                },
              },
            ],
          },
          feeBps: "50",
          isPremiumFee: false,
        },
      };
    }
    case "resolveTokenMetadata":
      if (route === "permission" && scenario === "metadata-unverified") {
        return { success: false, data: null };
      }
      return {
        success: true,
        data: {
          name:
            String(message?.tokenAddress || "").toLowerCase() === "native"
              ? "Ether"
              : "USD Coin",
          symbol:
            String(message?.tokenAddress || "").toLowerCase() === "native"
              ? "ETH"
              : "USDC",
          decimals:
            String(message?.tokenAddress || "").toLowerCase() === "native"
              ? 18
              : 6,
          logoUrl:
            String(message?.tokenAddress || "").toLowerCase() === "native"
              ? previewAssets.chains.ethereum
              : previewAssets.tokens.usdc,
        },
      };
    case "resolveCoinGeckoNativeAssets":
      return {
        success: true,
        data: (message?.requests ?? []).map(() => ({
          priceUsd: 1749.69,
          logoUrl: previewAssets.chains.ethereum,
        })),
      };
    case "resolveCoinGeckoErc20Prices":
      return {
        success: true,
        data: (message?.requests ?? []).map(
          (request: { chainId: number; contractAddress: string }) => ({
            ...request,
            priceUsd: 1,
          }),
        ),
      };
    case "getDelegationStatus":
      return {
        success: true,
        delegate: "0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B",
        source: "default",
        needsAuthorization: false,
        onchainDelegate: "0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B",
        customDelegate: null,
      };
    case "probeDelegateContract":
      return { success: true, supports7821: true };
    case "initiateSetDelegation":
    case "initiateRevokeDelegation":
      return { success: true, txId: "preview-delegation-tx" };
    case "revealPrivateKey":
      return {
        success: true,
        privateKey:
          "0x1111111111111111111111111111111111111111111111111111111111111111",
      };
    case "revealSeedPhrase":
      return {
        success: true,
        mnemonic:
          "test test test test test test test test test test test junk",
      };
    case "addPrivateKeyAccount":
    case "addBankrAccount":
    case "addImpersonatorAccount":
      return { success: true };
    case "addCustomToken": {
      const contractAddress = String(message?.contractAddress ?? "").toLowerCase();
      if (!/^0x[a-f0-9]{40}$/.test(contractAddress)) {
        return { success: false, error: "Invalid preview token address" };
      }
      const tokens = previewCustomTokens(environment);
      const key = `${Number(message?.chainId)}-${contractAddress}`;
      if (!tokens.some((token) => `${token.chainId}-${token.contractAddress}` === key)) {
        environment.storage.local.customTokens = [
          ...tokens,
          {
            contractAddress,
            chainId: Number(message?.chainId),
            symbol: String(message?.symbol ?? "TOKEN"),
            name: String(message?.name ?? "Preview token"),
            decimals: Number(message?.decimals ?? 18),
            addedAt: PREVIEW_EPOCH_MS,
          },
        ];
      }
      return { success: true };
    }
    case "updateCustomToken": {
      const contractAddress = String(message?.contractAddress ?? "").toLowerCase();
      const chainId = Number(message?.chainId);
      environment.storage.local.customTokens = previewCustomTokens(environment).map(
        (token) =>
          token.chainId === chainId && token.contractAddress === contractAddress
            ? {
                ...token,
                name: String(message?.name ?? token.name),
                symbol: String(message?.symbol ?? token.symbol),
                decimals: Number(message?.decimals ?? token.decimals),
              }
            : token,
      );
      return { success: true };
    }
    case "removeCustomToken": {
      const contractAddress = String(message?.contractAddress ?? "").toLowerCase();
      const chainId = Number(message?.chainId);
      environment.storage.local.customTokens = previewCustomTokens(environment).filter(
        (token) =>
          token.chainId !== chainId || token.contractAddress !== contractAddress,
      );
      return { success: true };
    }
    case "getTransactionNonce":
      return { success: true, nonce: 42 };
    case "prepareTransactionReplacement":
      return { success: true, txRequest: { id: "preview-replacement" } };
    case "confirmTransactionAsync":
    case "confirmTransactionAsyncPK":
    case "confirmTransactionAsyncLedger":
    case "confirmSignatureRequest":
    case "confirmBatchTransactionAsync":
    case "confirmBatchTransactionAsyncPK":
    case "confirmErc7715PermissionRequest":
    case "rejectTransaction":
    case "rejectSignatureRequest":
    case "rejectBatchTransaction":
    case "rejectErc7715PermissionRequest":
    case "addToCrossDappBatch":
    case "addCallsToCrossDappBatch":
    case "updatePendingTxRequestData":
    case "updateCallInPendingBatch":
    case "splitBatchIntoIndividualTxs":
    case "setArcBrowser":
    case "clearNonceCache":
    case "clearTxHistory":
    case "clearTxHistoryForAddresses":
    case "verifyMasterPassword":
    case "changePassword":
    case "setAgentPassword":
    case "removeAgentPassword":
    case "saveBankrApiKeyAndAddress":
    case "renameSeedGroup":
    case "removeAccount":
    case "setNetworkHidden":
    case "deleteNetwork":
    case "updateNetwork":
    case "addNetwork":
    case "confirmAddChain":
    case "rejectAddChain":
    case "confirmWatchAsset":
    case "rejectWatchAsset":
    case "removeCallFromPendingBatch":
    case "rejectCrossDappBatch":
    case "initiateErc7715PermissionRevoke":
    case "openPopupWindow":
      return { success: true };
    case "ens-probe-kubo":
      return { ok: true, reachable: false };
    case "ens-probe-kubo-api":
      return {
        ok: true,
        probe: { ok: false, kind: { kind: "unreachable" } },
      };
    default:
      return unknownPreviewMessage(message, logger);
  }
}

export interface CreatePreviewChromeOptions {
  schedule?: (callback: () => void) => void;
  onThemeChange?: (theme: string) => void;
  logger?: PreviewChromeLogger;
}

export function createPreviewChrome(
  href: string,
  options: CreatePreviewChromeOptions = {},
) {
  const environment = createPreviewEnvironment(href);
  const storageListeners = new Set<StorageListener>();
  const runtimeMessageListeners = new Set<(...args: unknown[]) => void>();
  const schedule = options.schedule ?? ((callback) => queueMicrotask(callback));
  const logger = options.logger ?? console;
  const activeTab = {
    id: 1,
    url: "https://app.uniswap.org/swap",
    active: true,
    windowId: 1,
  };

  const shouldHoldRuntimeResponse = (message: any): boolean => {
    const { route, scenario } = environment.parsed.state;
    const type = String(message?.type ?? "");

    if (scenario === "loading") {
      if (route === "tx") {
        return type === "estimateGas" || type === "simulateAssetChanges";
      }
      if (route === "batch" || route === "cross-batch") {
        return (
          type === "estimateBatchGasSequential" ||
          type === "simulateBatchAssetChanges" ||
          type === "simulateBatchAssetChangesNonAtomic"
        );
      }
    }

    if (
      route === "permission" &&
      scenario === "metadata-loading" &&
      type === "resolveTokenMetadata"
    ) {
      return true;
    }

    if (scenario !== "submitting") return false;
    if (route === "signature") return type === "confirmSignatureRequest";
    if (route === "permission") {
      return type === "confirmErc7715PermissionRequest";
    }
    return false;
  };

  const previewChrome = {
    runtime: {
      id: "walletchan-preview",
      lastError: null,
      getManifest: () => ({ version: extensionPackage.version }),
      getURL: (path: string) => `/${path.replace(/^\//, "")}`,
      connect: () => ({
        name: "preview-port",
        disconnect: () => {},
        onDisconnect: { addListener: () => {}, removeListener: () => {} },
        postMessage: () => {},
      }),
      sendMessage: (message: any, callback?: (response: any) => void) => {
        if (shouldHoldRuntimeResponse(message)) {
          return new Promise<never>(() => {});
        }
        const response = responseForPreviewMessage(
          environment,
          message,
          logger,
        );
        if (callback) schedule(() => callback(response));
        if (
          response &&
          typeof response === "object" &&
          "success" in response &&
          response.success === true
        ) {
          const contactMutation = [
            "createAddressContact",
            "updateAddressContactLabel",
            "removeAddressContact",
            "reorderAddressContacts",
          ].includes(String(message?.type));
          if (contactMutation && "contacts" in response) {
            schedule(() => {
              for (const listener of runtimeMessageListeners) {
                listener(
                  {
                    type: "addressContactsUpdated",
                    contacts: response.contacts,
                  },
                  {},
                  () => {},
                );
              }
            });
          }
          if (message?.type === "updateAccountDisplayName") {
            schedule(() => {
              for (const listener of runtimeMessageListeners) {
                listener({ type: "accountsUpdated" }, {}, () => {});
              }
            });
          }
        }
        return Promise.resolve(response);
      },
      onMessage: {
        addListener: (listener: (...args: unknown[]) => void) => {
          runtimeMessageListeners.add(listener);
        },
        removeListener: (listener: (...args: unknown[]) => void) => {
          runtimeMessageListeners.delete(listener);
        },
      },
    },
    storage: {
      local: makeStorageArea(
        environment,
        storageListeners,
        "local",
        schedule,
        options.onThemeChange,
      ),
      sync: makeStorageArea(
        environment,
        storageListeners,
        "sync",
        schedule,
      ),
      session: makeStorageArea(
        environment,
        storageListeners,
        "session",
        schedule,
      ),
      onChanged: {
        addListener: (listener: StorageListener) => storageListeners.add(listener),
        removeListener: (listener: StorageListener) => storageListeners.delete(listener),
      },
    },
    tabs: {
      query: (
        queryInfo: chrome.tabs.QueryInfo,
        callback?: (tabs: chrome.tabs.Tab[]) => void,
      ) => {
        const tabs = queryInfo?.url ? [] : [activeTab];
        if (callback) schedule(() => callback(tabs as chrome.tabs.Tab[]));
        return Promise.resolve(tabs as chrome.tabs.Tab[]);
      },
      create: () => Promise.resolve({ id: 2 }),
      update: () => Promise.resolve({ id: 1 }),
      remove: () => Promise.resolve(),
      sendMessage: (
        _tabId: number,
        message: { type?: string },
        callback?: (response: unknown) => void,
      ) => {
        const current = activePreviewAccount(environment);
        const response =
          message?.type === "getInfo"
            ? {
                address: current.address,
                displayAddress: current.displayName || current.address,
                chainName: environment.storage.sync.chainName || "Base",
              }
            : message?.type === "setAccount" || message?.type === "setChainId"
              ? { success: true }
              : unknownPreviewMessage(message, logger);
        if (callback) schedule(() => callback(response));
        return Promise.resolve(response);
      },
      onActivated: {
        addListener: () => {},
        removeListener: () => {},
      },
      onUpdated: {
        addListener: () => {},
        removeListener: () => {},
      },
    },
    windows: {
      getCurrent: () =>
        Promise.resolve({
          id: 1,
          type:
            environment.parsed.state.frame === "window" ? "popup" : "normal",
        }),
      update: () => Promise.resolve({ id: 1 }),
    },
    sidePanel: {
      open: () => Promise.resolve(),
    },
    action: {
      setBadgeText: () => Promise.resolve(),
      setBadgeBackgroundColor: () => Promise.resolve(),
    },
    notifications: {
      create: () => Promise.resolve("preview-notification"),
    },
  };

  return { previewChrome, environment };
}

const PREVIEW_FETCH_MARKER = "__walletchanPreviewFetch";

export function installPreviewChrome() {
  if (typeof chrome !== "undefined" && chrome.runtime?.id) return;

  const href = window.location.href;
  const { previewChrome, environment } = createPreviewChrome(href, {
    schedule: (callback) => window.setTimeout(callback, 0),
    onThemeChange: (theme) => {
      document.documentElement.dataset.theme = theme;
      window.localStorage.setItem(SELECTED_THEME_STORAGE_KEY, theme);
    },
  });

  for (const warning of environment.parsed.warnings) {
    console.warn(`[PreviewChrome] ${warning}`);
  }

  (globalThis as typeof globalThis & { chrome: typeof chrome }).chrome =
    previewChrome as unknown as typeof chrome;

  const currentFetch = globalThis.fetch as typeof fetch & {
    [PREVIEW_FETCH_MARKER]?: boolean;
  };
  if (!currentFetch?.[PREVIEW_FETCH_MARKER]) {
    const previewFetch = createPreviewFetch(undefined, environment) as typeof fetch & {
      [PREVIEW_FETCH_MARKER]?: boolean;
    };
    previewFetch[PREVIEW_FETCH_MARKER] = true;
    globalThis.fetch = previewFetch;
  }
}
