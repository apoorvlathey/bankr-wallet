export type WalletTransport = "walletconnect" | "metamask-connect";

export interface SessionBatchingInfo {
  requested: boolean;
  supported: boolean;
  mode: "erc5792" | "sequential_fallback" | "disconnected";
  approvedMethods: string[];
  missingMethods: string[];
}

export interface SessionInfo {
  accounts: string[];
  batching: SessionBatchingInfo;
  methods: string[];
  peerName: string;
  peerUrl: string;
  topic: string;
  transport: WalletTransport;
}

export interface SessionProposal {
  uri: string;
  approval: () => Promise<SessionInfo>;
  createdAt: number;
}

export interface SessionDisconnectInfo {
  reason: string;
  topic: string;
}

export type SessionDisconnectListener = (info: SessionDisconnectInfo) => void;

export interface WalletBridge {
  readonly connected: boolean;
  readonly sessionTopic: string | null;
  readonly transport: WalletTransport;
  close(): void;
  createSessionProposal(): Promise<SessionProposal>;
  disconnectStored(message?: string): Promise<void>;
  getAccounts(chainId?: number): string[];
  getBatchingInfo(): SessionBatchingInfo;
  getPairingUri(): Promise<string | null>;
  getSessionInfo(): SessionInfo;
  init(): Promise<SessionInfo | null>;
  onDisconnect(listener: SessionDisconnectListener): () => void;
  request(chainId: number, method: string, params: unknown[]): Promise<unknown>;
  requestAccount?(options?: { account?: string; forceRequest?: boolean }): Promise<SessionInfo>;
  supportsBatching(): boolean;
  supportsMethod(method: string): boolean;
}
