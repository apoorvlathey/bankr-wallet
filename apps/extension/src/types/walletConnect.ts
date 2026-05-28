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
