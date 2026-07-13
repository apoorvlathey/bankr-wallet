import { KNOWN_CHAINS } from "@/constants/knownChains.generated";
import {
  getResolvedChains,
  getStoredNetworksInfo,
  getVisibleChains,
} from "@/lib/chains";
import type {
  WalletConnectProposalRejection,
  WalletConnectRequestedChain,
} from "@/types/walletConnect";
import type { AccountType } from "../types";
import {
  WALLETCONNECT_SUPPORTED_METHODS,
  boundedWalletConnectText,
  chainIdFromCaip2,
  sanitizeWalletConnectMetadataUrl,
} from "./sessionPolicy";
import { sanitizeUntrustedImageUrl } from "@/lib/remoteImagePolicy";

type WalletConnectNamespace = {
  chains?: string[];
  methods?: string[];
  events?: string[];
};

type WalletConnectProposalParams = {
  requiredNamespaces?: Record<string, WalletConnectNamespace>;
  optionalNamespaces?: Record<string, WalletConnectNamespace>;
};

type WalletConnectSupportedNamespace = {
  chains: string[];
  accounts: string[];
  methods: string[];
  events: string[];
};

export type WalletConnectSupportedNamespaces = Record<
  string,
  WalletConnectSupportedNamespace
>;

type WalletConnectApprovedNamespace = {
  accounts?: unknown;
  chains?: unknown;
  methods?: unknown;
};

export async function buildProposalRejection(
  proposal: any,
  accountType: AccountType,
  error: unknown,
): Promise<WalletConnectProposalRejection> {
  const networksInfo = await getStoredNetworksInfo();
  const allChains = getResolvedChains(networksInfo);
  const visibleChains = getVisibleChains(networksInfo, accountType);
  const requestedChainIds = getProposalRequestedChainIds(proposal.params);
  const requestedChains = requestedChainIds.map((chainId) =>
    getRequestedChainMetadata(
      chainId,
      allChains.find((chain) => chain.chainId === chainId),
    ),
  );
  const requestedMethods = getProposalRequestedMethods(proposal.params);
  const configuredChainIds = new Set(allChains.map((chain) => chain.chainId));
  const visibleChainIds = new Set(visibleChains.map((chain) => chain.chainId));
  const unavailableChainIds = requestedChainIds.filter(
    (chainId) => !visibleChainIds.has(chainId),
  );
  const unconfiguredChains = requestedChainIds
    .filter((chainId) => !configuredChainIds.has(chainId))
    .map((chainId) => getRequestedChainMetadata(chainId));
  const metadata = getProposalMetadata(proposal.params);
  const fallbackError = boundedWalletConnectText(
    error instanceof Error ? error.message : undefined,
    "Failed to approve session",
    500,
  );

  return {
    id: typeof proposal?.id === "number" ? proposal.id : Date.now(),
    name: metadata.name,
    url: metadata.url,
    icon: metadata.icon,
    error: getProposalRejectionMessage({
      accountType,
      fallbackError,
      requestedChainIds,
      unavailableChainIds,
      unconfiguredChains,
      requestedMethods,
    }),
    requestedChains,
    requestedChainIds,
    unavailableChainIds,
    unconfiguredChains,
    requestedMethods,
  };
}

export function normalizeWalletConnectProposal(
  proposal: WalletConnectProposalParams | undefined,
  supportedNamespaces: WalletConnectSupportedNamespaces,
): any {
  return {
    ...proposal,
    requiredNamespaces: fillMissingChains(
      proposal?.requiredNamespaces,
      supportedNamespaces,
    ),
    optionalNamespaces: fillMissingChains(
      proposal?.optionalNamespaces,
      supportedNamespaces,
    ),
  };
}

export function hasApprovedNamespaces(
  namespaces: Record<string, WalletConnectApprovedNamespace>,
): boolean {
  return Object.values(namespaces).some(
    (namespace) =>
      Array.isArray(namespace.accounts) &&
      namespace.accounts.length > 0 &&
      Array.isArray(namespace.chains) &&
      namespace.chains.length > 0 &&
      Array.isArray(namespace.methods) &&
      namespace.methods.length > 0,
  );
}

function getProposalMetadata(params: any): {
  name: string;
  url: string;
  icon: string | null;
} {
  const metadata = params?.proposer?.metadata || {};
  const icons = Array.isArray(metadata.icons)
    ? metadata.icons
        .slice(0, 5)
        .map(sanitizeUntrustedImageUrl)
        .filter((icon: string | null): icon is string => icon !== null)
    : [];
  return {
    name: boundedWalletConnectText(
      metadata.name,
      "WalletConnect Dapp",
      200,
    ),
    url: sanitizeWalletConnectMetadataUrl(metadata.url),
    icon: icons[0] || null,
  };
}

function getProposalRequestedChainIds(
  params: WalletConnectProposalParams | undefined,
): number[] {
  const chains = new Set<number>();
  const maxRequestedChains = 100;
  for (const namespace of [
    params?.requiredNamespaces,
    params?.optionalNamespaces,
  ]) {
    for (const [key, value] of Object.entries(namespace || {})) {
      const keyChainId = chainIdFromCaip2(key);
      if (keyChainId) chains.add(keyChainId);
      for (const chain of value.chains || []) {
        if (chains.size >= maxRequestedChains) break;
        const chainId = chainIdFromCaip2(chain);
        if (chainId) chains.add(chainId);
      }
      if (chains.size >= maxRequestedChains) break;
    }
    if (chains.size >= maxRequestedChains) break;
  }
  return Array.from(chains);
}

function getProposalRequestedMethods(
  params: WalletConnectProposalParams | undefined,
): string[] {
  const methods = new Set<string>();
  const maxRequestedMethods = 100;
  for (const namespace of [
    params?.requiredNamespaces,
    params?.optionalNamespaces,
  ]) {
    for (const value of Object.values(namespace || {})) {
      for (const method of value.methods || []) {
        if (methods.size >= maxRequestedMethods) break;
        if (typeof method === "string" && method.length <= 128) {
          methods.add(method);
        }
      }
      if (methods.size >= maxRequestedMethods) break;
    }
    if (methods.size >= maxRequestedMethods) break;
  }
  return Array.from(methods);
}

function getRequestedChainMetadata(
  chainId: number,
  configured?: {
    name: string;
    rpcUrl: string;
    explorer: string;
    nativeCurrency: { name: string; symbol: string; decimals: number };
  },
): WalletConnectRequestedChain {
  const known = KNOWN_CHAINS[chainId];
  return {
    chainId,
    name: configured?.name ?? known?.name,
    rpcUrl: configured?.rpcUrl ?? known?.defaultRpc,
    explorer: configured?.explorer ?? known?.explorer,
    nativeCurrency: configured?.nativeCurrency ?? known?.nativeCurrency,
  };
}

function getProposalRejectionMessage({
  accountType,
  fallbackError,
  requestedChainIds,
  unavailableChainIds,
  unconfiguredChains,
  requestedMethods,
}: {
  accountType: AccountType;
  fallbackError: string;
  requestedChainIds: number[];
  unavailableChainIds: number[];
  unconfiguredChains: WalletConnectRequestedChain[];
  requestedMethods: string[];
}): string {
  if (unconfiguredChains.length > 0) {
    return `WalletChan needs ${formatList(
      unconfiguredChains.map(formatChainLabel),
    )} added before connecting to this dapp.`;
  }
  if (unavailableChainIds.length > 0) {
    if (accountType === "bankr") {
      return `This dapp requested chain ID ${formatList(
        unavailableChainIds,
      )}, which is not available for Bankr API accounts. Switch to a private key or seed phrase account, or use a Bankr-supported chain.`;
    }
    return `This dapp requested chain ID ${formatList(
      unavailableChainIds,
    )}, but it is hidden or unavailable in WalletChan.`;
  }
  if (
    requestedMethods.length > 0 &&
    !requestedMethods.some((method) =>
      WALLETCONNECT_SUPPORTED_METHODS.includes(method),
    )
  ) {
    return `This dapp requested unsupported WalletConnect method ${formatList(
      requestedMethods,
    )}.`;
  }
  if (requestedChainIds.length > 0) return fallbackError;
  return "This dapp did not request any WalletConnect namespace WalletChan can approve.";
}

function formatChainLabel(chain: WalletConnectRequestedChain): string {
  return chain.name
    ? `${chain.name} (chain ID ${chain.chainId})`
    : `chain ID ${chain.chainId}`;
}

function fillMissingChains(
  namespaces: Record<string, WalletConnectNamespace> | undefined,
  supportedNamespaces: WalletConnectSupportedNamespaces,
): Record<string, WalletConnectNamespace> {
  if (!namespaces) return {};

  return Object.fromEntries(
    Object.entries(namespaces).map(([key, namespace]) => {
      const supported = supportedNamespaces[getBaseNamespaceKey(key)];
      if (
        !supported ||
        key.includes(":") ||
        (Array.isArray(namespace.chains) && namespace.chains.length > 0)
      ) {
        return [key, namespace];
      }

      return [key, { ...namespace, chains: supported.chains }];
    }),
  );
}

function getBaseNamespaceKey(key: string): string {
  return key.split(":")[0];
}

function formatList(values: Array<number | string>): string {
  return values.join(", ");
}
