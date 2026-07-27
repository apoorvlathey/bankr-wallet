import type { Account, SeedGroup } from "@/chrome/types";
import type { AddressContact } from "@/chrome/contactBook/repository";
import type { PendingTxRequest } from "@/chrome/requests/pendingTxStorage";
import type { PendingSignatureRequest } from "@/chrome/requests/pendingSignatureStorage";
import type { PendingBatchTxRequest } from "@/chrome/erc5792Types";
import type { CrossDappBatch } from "@/chrome/crossDappBatch/storage";
import type { PendingErc7715PermissionRequest } from "@/chrome/pendingErc7715PermissionStorage";
import type { PortfolioResponse } from "@/chrome/portfolio/api";
import { SELECTED_THEME_STORAGE_KEY } from "@/theme";
import { DEFAULT_AUTO_LOCK_TIMEOUT_MS } from "@/constants/securityPolicy";
import {
  PREVIEW_EPOCH_MS,
  createPreviewBatchScenario,
  createPreviewCrossDappBatchScenario,
  createPreviewPermissionScenario,
  createPreviewSignatureScenario,
  createPreviewTxScenario,
  previewAccounts,
  previewNetworkRpcUrls,
  previewNetworks,
  previewCustomToken,
  previewHiddenTokens,
} from "./fixtures";
import {
  createPreviewHomeNetworks,
  createPreviewHomePortfolioResponse,
  createPreviewHomePortfolioSnapshots,
} from "./homePreviewFixtures";
import { previewAssets } from "./previewAssets";
import { previewRpcResponse, type PreviewJsonRpcRequest } from "./previewRpcFixtures";
import { parsePreviewState, type ParsedPreviewState } from "./previewState";
import { resolveSafeHomePreviewAccount } from "./safeHomePreview";
import type { PreviewWalletType } from "./types";
import { getPreviewActivityTransactions } from "./completedTransactionFixture";
export type PreviewStorageAreaName = "local" | "sync" | "session";
export type PreviewStorageRecord = Record<string, unknown>;
export interface PreviewEnvironment {
  parsed: ParsedPreviewState;
  accounts: Account[];
  contacts: AddressContact[];
  activeAccount: Account;
  seedGroups: SeedGroup[];
  pendingTxRequests: PendingTxRequest[];
  pendingSignatureRequests: PendingSignatureRequest[];
  pendingBatchRequests: PendingBatchTxRequest[];
  pendingPermissionRequests: PendingErc7715PermissionRequest[];
  crossDappBatch: CrossDappBatch | null;
  storage: Record<PreviewStorageAreaName, PreviewStorageRecord>;
  unlocked: boolean;
  txHistory: unknown[];
}

function accountForWallet(
  accounts: Account[],
  wallet: PreviewWalletType,
): Account {
  const accountType = wallet === "viewOnly" ? "impersonator" : wallet;
  const account = accounts.find((candidate) => candidate.type === accountType);
  if (!account) {
    throw new Error(`[Preview] Missing fixture account for ${wallet}`);
  }
  return account;
}
export function createPreviewEnvironment(href: string): PreviewEnvironment {
  const parsed = parsePreviewState(href);
  const accounts = previewAccounts.map((account) => ({ ...account }));
  const { route, scenario } = parsed.state;
  const activeAccount = resolveSafeHomePreviewAccount(accounts, route, scenario) ??
    accountForWallet(accounts, parsed.state.wallet);
  const scenarioWallet = scenario === "impersonator-disabled"
    ? "viewOnly"
    : parsed.state.wallet;
  const pendingTxRequests =
    route === "tx" ? [createPreviewTxScenario(scenarioWallet, scenario)] : [];
  const pendingSignatureRequests =
    route === "signature"
      ? [createPreviewSignatureScenario(scenarioWallet, scenario)]
      : [];
  const pendingBatchRequests =
    route === "batch"
      ? [createPreviewBatchScenario(scenarioWallet, scenario)]
      : [];
  const pendingPermissionRequests =
    route === "permission"
      ? [createPreviewPermissionScenario(parsed.state.wallet, scenario)]
      : [];
  const crossDappBatch =
    route === "cross-batch"
      ? createPreviewCrossDappBatchScenario(scenarioWallet, scenario)
      : null;
  const local: PreviewStorageRecord = {
    [SELECTED_THEME_STORAGE_KEY]: parsed.state.theme,
    networkRpcUrls: previewNetworkRpcUrls,
    // App.tsx only checks presence during startup. This intentionally is not a
    // decryptable credential and is never returned by the runtime shim.
    encryptedApiKeyVault: { previewOnly: true },
    bungeeChains: {
      fetchedAt: Number.MAX_SAFE_INTEGER,
      chains: [
        {
          chainId: 1,
          name: "Ethereum",
          icon: previewAssets.chains.ethereum,
          sendingEnabled: true,
          receivingEnabled: true,
        },
        {
          chainId: 8453,
          name: "Base",
          icon: previewAssets.chains.base,
          sendingEnabled: true,
          receivingEnabled: true,
        },
        {
          chainId: 42161,
          name: "Arbitrum",
          icon: previewAssets.chains.arbitrum,
          sendingEnabled: true,
          receivingEnabled: true,
        },
        {
          chainId: 137,
          name: "Polygon",
          icon: previewAssets.chains.polygon,
          sendingEnabled: true,
          receivingEnabled: true,
        },
      ],
    },
    "bungeeTokens:8453": {
      fetchedAt: Number.MAX_SAFE_INTEGER,
      tokens: scenario === "empty"
        ? []
        : [
            {
              address: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
              name: "Ether",
              symbol: "ETH",
              decimals: 18,
              logoURI:
                scenario === "missing-logo"
                  ? undefined
                  : previewAssets.chains.ethereum,
              chainId: 8453,
            },
            {
              address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
              name: "USD Coin",
              symbol: "USDC",
              decimals: 6,
              logoURI:
                scenario === "missing-logo"
                  ? undefined
                  : previewAssets.tokens.usdc,
              chainId: 8453,
            },
            ...(scenario === "stress"
              ? Array.from({ length: 18 }, (_, index) => ({
                  address: `0x${(index + 16).toString(16).padStart(40, "0")}`,
                  name: `Treasury settlement asset with a long descriptive name ${index + 1}`,
                  symbol: `LONG${index + 1}`,
                  decimals: 18,
                  logoURI: undefined,
                  chainId: 8453,
                }))
              : []),
          ],
    },
    "bungeeTokens:42161": {
      fetchedAt: Number.MAX_SAFE_INTEGER,
      tokens: [
        {
          address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
          name: "USD Coin",
          symbol: "USDC",
          decimals: 6,
          logoURI: previewAssets.tokens.usdc,
          chainId: 42161,
        },
      ],
    },
    customTokens: [{ ...previewCustomToken }],
    hiddenPortfolioTokens:
      route === "token-management" && parsed.state.scenario === "hidden"
        ? previewHiddenTokens.map((token) => ({ ...token }))
        : [],
  };
  if (route === "home") {
    local.portfolioSnapshotsV2 = {
      [activeAccount.address.toLowerCase()]:
        createPreviewHomePortfolioSnapshots(),
    };
  }
  if (route === "home" && scenario === "private") local.walletHomeModeV1 = "private";
  if (route === "onboarding") {
    delete local.encryptedApiKeyVault;
    delete local.encryptedApiKey;
  }
  if (crossDappBatch) local.crossDappBatch = crossDappBatch;
  return {
    parsed,
    accounts,
    contacts: [
      {
        address: "0xb06a00000000000000000000000000000000dac2",
        label: "Treasury recipient",
      },
    ],
    activeAccount,
    seedGroups: [
      {
        id: "preview-seed",
        name: "Seed #1",
        createdAt: PREVIEW_EPOCH_MS - 21_600_000,
        accountCount: 1,
      },
    ],
    pendingTxRequests,
    pendingSignatureRequests,
    pendingBatchRequests,
    pendingPermissionRequests,
    crossDappBatch,
    storage: {
      local,
      sync: {
        networksInfo:
          route === "home" ? createPreviewHomeNetworks(previewNetworks) : previewNetworks,
        address: activeAccount.address,
        displayAddress: activeAccount.displayName || activeAccount.address,
        chainName: "Base",
        activeAccountId: activeAccount.id,
        defaultGasTier: "standard",
        autoLockTimeout: DEFAULT_AUTO_LOCK_TIMEOUT_MS,
        hidePortfolioValue: false,
        sidePanelMode: parsed.state.frame === "sidepanel",
      },
      session: {},
    },
    unlocked: route !== "unlock" && route !== "onboarding",
    txHistory:
      route === "portfolio"
        ? getPreviewActivityTransactions().map((tx) => {
            return {
              ...tx,
              tx: { ...tx.tx, from: activeAccount.address },
              accountId: activeAccount.id,
              accountType: activeAccount.type,
            };
          })
        : [],
  };
}
export const previewPortfolioResponse: PortfolioResponse = {
  tokens: [
    {
      symbol: "ETH",
      name: "Ether",
      contractAddress: "native",
      chainId: 8453,
      decimals: 18,
      balance: "2.81226",
      balanceFormatted: "2.81226",
      priceUsd: 1749.69,
      valueUsd: 4920.58,
      logoUrl: previewAssets.chains.ethereum,
    },
    {
      symbol: "USDC",
      name: "USD Coin",
      contractAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      chainId: 8453,
      decimals: 6,
      balance: "321.123",
      balanceFormatted: "321.123",
      priceUsd: 1,
      valueUsd: 321.123,
      logoUrl: previewAssets.tokens.usdc,
    },
  ],
  defiPositions: [],
  totalValueUsd: 5241.703,
};

const previewHomePortfolioResponse = createPreviewHomePortfolioResponse(
  previewPortfolioResponse,
  previewCustomToken,
);

export function getPreviewPortfolioResponse(scenario: string): PortfolioResponse {
  if (scenario === "portfolio-empty" || scenario === "empty") {
    return { tokens: [], defiPositions: [], totalValueUsd: 0 };
  }
  if (scenario === "stress") {
    const stressTokens = Array.from({ length: 16 }, (_, index) => ({
      symbol: `ASSET${index + 1}`,
      name: `Institutional treasury settlement position ${index + 1}`,
      contractAddress: `0x${(index + 64).toString(16).padStart(40, "0")}`,
      chainId: 8453,
      decimals: 18,
      balance: `${987_654_321 - index * 12_345}.123456789`,
      balanceFormatted: `${987_654_321 - index * 12_345}.123456789`,
      priceUsd: 1 + index / 10,
      valueUsd: 987_654 - index * 12_345,
      logoUrl: index % 3 === 0 ? undefined : previewAssets.brand.walletChan,
    }));
    return {
      tokens: [...previewPortfolioResponse.tokens, ...stressTokens],
      defiPositions: [],
      totalValueUsd: stressTokens.reduce(
        (total, token) => total + token.valueUsd,
        previewPortfolioResponse.totalValueUsd,
      ),
    };
  }
  return previewPortfolioResponse;
}
function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/**
 * Preview network boundary. The production portfolio component may mount in
 * the harness, but it must never contact WalletChan APIs or an RPC endpoint.
 */
export function createPreviewFetch(
  reportBlocked: (message: string) => void = (message) => console.error(message),
  environment?: PreviewEnvironment,
): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const rawUrl = requestUrl(input);
    const url = new URL(rawUrl, "http://preview.local");

    if (
      url.origin === "https://api.4byte.sourcify.dev" &&
      url.pathname === "/signature-database/v1/lookup" &&
      url.searchParams.get("function") === "0x12aa3caf"
    ) {
      return jsonResponse({
        ok: true,
        result: {
          function: {
            "0x12aa3caf": [
              {
                name: "swap(address,(address,address,address,address,uint256,uint256,uint256),bytes,bytes)",
                filtered: false,
              },
            ],
          },
        },
      });
    }

    if (url.pathname === "/api/portfolio") {
      const scenario = environment?.parsed.state.scenario ?? "default";
      if (
        scenario === "portfolio-loading" ||
        (environment?.parsed.state.route === "portfolio" && scenario === "loading")
      ) {
        return new Promise<Response>(() => {});
      }
      if (scenario === "portfolio-error" || scenario === "error") {
        return new Response(
          JSON.stringify({ error: "Deterministic preview portfolio failure" }),
          {
            status: 503,
            headers: { "content-type": "application/json" },
          },
        );
      }
      return jsonResponse(
        environment?.parsed.state.route === "home"
          ? previewHomePortfolioResponse
          : getPreviewPortfolioResponse(scenario),
      );
    }

    const body = typeof init?.body === "string" ? init.body : "";
    if (body.includes('"jsonrpc"')) {
      try {
        const request = JSON.parse(body) as
          | PreviewJsonRpcRequest
          | PreviewJsonRpcRequest[];
        const scenario = environment?.parsed.state.scenario;
        if (scenario === "portfolio-error" || scenario === "error") {
          const failure = (entry: PreviewJsonRpcRequest) => ({
            jsonrpc: "2.0",
            id: entry.id ?? null,
            error: {
              code: -32000,
              message: "Deterministic preview RPC failure",
            },
          });
          return jsonResponse(
            Array.isArray(request) ? request.map(failure) : failure(request),
          );
        }
        return jsonResponse(
          Array.isArray(request)
            ? request.map((entry) =>
              previewRpcResponse(entry, previewCustomToken.contractAddress))
            : previewRpcResponse(request, previewCustomToken.contractAddress),
        );
      } catch {
        return jsonResponse({
          jsonrpc: "2.0",
          id: null,
          error: { code: -32700, message: "Invalid preview RPC request" },
        });
      }
    }

    const message = `[Preview] Blocked live fetch: ${url.href}`;
    reportBlocked(message);
    throw new Error(message);
  }) as typeof fetch;
}
