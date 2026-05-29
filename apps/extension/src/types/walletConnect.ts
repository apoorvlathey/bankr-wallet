export interface WalletConnectSessionSummary {
  topic: string;
  name: string;
  url: string;
  description?: string;
  icons: string[];
  chains: number[];
  accounts: string[];
  expiry?: number;
}

export interface WalletConnectSessionsResponse {
  success: boolean;
  sessions: WalletConnectSessionSummary[];
  activeChainId?: number | null;
  error?: string;
  missingProjectId?: boolean;
}

export interface WalletConnectRequestedChain {
  chainId: number;
  name?: string;
  rpcUrl?: string;
  explorer?: string;
  nativeCurrency?: { name: string; symbol: string; decimals: number };
}

export interface WalletConnectProposalRejection {
  id: number;
  name: string;
  url: string;
  icon: string | null;
  error: string;
  requestedChains: WalletConnectRequestedChain[];
  requestedChainIds: number[];
  unavailableChainIds: number[];
  unconfiguredChains: WalletConnectRequestedChain[];
  requestedMethods: string[];
}

export interface WalletConnectAddChainContext {
  dappName?: string;
}

export interface WalletConnectRetryNotice {
  dappName?: string;
  chainName: string;
  chainId: number;
}
