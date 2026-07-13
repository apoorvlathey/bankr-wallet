import type { Account, SeedGroup } from "@/chrome/types";
import type { PendingTxRequest } from "@/chrome/pendingTxStorage";
import type { PendingSignatureRequest } from "@/chrome/pendingSignatureStorage";
import type { PendingBatchTxRequest } from "@/chrome/erc5792Types";
import type { CrossDappBatch } from "@/chrome/crossDappBatchStorage";
import type { PendingErc7715PermissionRequest } from "@/chrome/pendingErc7715PermissionStorage";
import type { PortfolioResponse } from "@/chrome/portfolioApi";
import { DEFAULT_NETWORKS } from "@/constants/networks";
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
  previewCustomToken,
  previewHiddenTokens,
} from "./fixtures";
import { previewAssets } from "./previewAssets";
import { parsePreviewState, type ParsedPreviewState } from "./previewState";
import type { PreviewWalletType } from "./types";
import { getPreviewCompletedTransaction } from "./completedTransactionFixture";

export type PreviewStorageAreaName = "local" | "sync" | "session";
export type PreviewStorageRecord = Record<string, unknown>;

export interface PreviewEnvironment {
  parsed: ParsedPreviewState;
  accounts: Account[];
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
  const activeAccount = accountForWallet(accounts, parsed.state.wallet);
  const { route, scenario } = parsed.state;
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
  if (route === "onboarding") {
    delete local.encryptedApiKeyVault;
    delete local.encryptedApiKey;
  }
  if (crossDappBatch) local.crossDappBatch = crossDappBatch;

  return {
    parsed,
    accounts,
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
        networksInfo: DEFAULT_NETWORKS,
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
        ? ["confirmed", "pending", "failed"].map((scenario) => {
            const tx = getPreviewCompletedTransaction(scenario);
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

interface PreviewJsonRpcRequest {
  id?: unknown;
  method?: string;
  params?: unknown[];
}

const MULTICALL3_ADDRESS = "0xca11bde05977b3631167028862be2a173976ca11";
const PREVIEW_ETH_BALANCE = 2_812_260_000_000_000_000n;
const PREVIEW_USDC_BALANCE = 321_123_000n;

function quantity(value: bigint): `0x${string}` {
  return `0x${value.toString(16)}`;
}

function uint256(value: bigint): `0x${string}` {
  return `0x${value.toString(16).padStart(64, "0")}`;
}

function previewRpcResponse(request: PreviewJsonRpcRequest) {
  const base = { jsonrpc: "2.0", id: request.id ?? null };

  if (request.method === "eth_getBalance") {
    return { ...base, result: quantity(PREVIEW_ETH_BALANCE) };
  }

  if (request.method === "eth_call") {
    const call = request.params?.[0] as { to?: string } | undefined;
    if (call?.to?.toLowerCase() === MULTICALL3_ADDRESS) {
      // Force viem down its production single-call fallback path. Those calls
      // are simpler to model deterministically than Multicall3's tuple output.
      return {
        ...base,
        error: { code: -32000, message: "Preview multicall fallback" },
      };
    }
    return { ...base, result: uint256(PREVIEW_USDC_BALANCE) };
  }

  if (request.method === "eth_chainId") {
    return { ...base, result: "0x2105" };
  }

  if (request.method === "eth_blockNumber") {
    return { ...base, result: "0x15f90a0" };
  }

  return { ...base, result: "0x0" };
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
      return jsonResponse(getPreviewPortfolioResponse(scenario));
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
            ? request.map(previewRpcResponse)
            : previewRpcResponse(request),
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
