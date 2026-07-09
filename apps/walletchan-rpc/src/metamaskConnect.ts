import type { RuntimeChain } from "./chains.js";
import { toHexChainId } from "./chains.js";
import { withSpinner } from "./logger.js";
import type {
  SessionBatchingInfo,
  SessionDisconnectInfo,
  SessionDisconnectListener,
  SessionInfo,
  SessionProposal,
  WalletBridge,
  WalletTransport,
} from "./walletBridge.js";

const WALLETCHAN_ICON_URL = "https://walletchan.com/images/walletchan-icon.png";
const PAIRING_URI_TTL_MS = 4 * 60 * 1000;
const PAIRING_URI_WAIT_MS = 15_000;

const BASE_METHODS = [
  "eth_sendTransaction",
  "personal_sign",
  "eth_signTypedData_v3",
  "eth_signTypedData_v4",
];

const BATCH_METHODS = [
  "wallet_getCapabilities",
  "wallet_sendCalls",
  "wallet_getCallsStatus",
  "wallet_showCallsStatus",
];

const APPROVAL_METHODS = new Set([
  "eth_sendTransaction",
  "personal_sign",
  "eth_signTypedData_v3",
  "eth_signTypedData_v4",
  "wallet_sendCalls",
]);

interface Eip1193Provider {
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
  off?: (event: string, listener: (...args: unknown[]) => void) => void;
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
}

interface MetaMaskConnectClient {
  connect: (options?: {
    account?: string;
    chainIds?: string[];
    forceRequest?: boolean;
  }) => Promise<{ accounts?: string[]; chainId?: string }>;
  disconnect?: () => Promise<void>;
  getAccount?: () => string | undefined;
  getProvider: () => Eip1193Provider;
  accounts?: string[];
  selectedAccount?: string;
}

interface MetaMaskConnectModule {
  createEVMClient: (options: {
    dapp: { name: string; url: string; iconUrl: string };
    api: { supportedNetworks: Record<string, string> };
    ui: { headless: boolean; preferExtension: boolean; showInstallModal: boolean };
    eventHandlers?: { displayUri?: (uri: string) => void; disconnect?: () => void };
    analytics?: { enabled: boolean };
  }) => Promise<MetaMaskConnectClient>;
}

export interface MetaMaskConnectBridgeConfig {
  chains: RuntimeChain[];
  forceNewSession: boolean;
  host: string;
  includeBatching: boolean;
  port: number;
  requestTimeoutSeconds: number;
}

export class MetaMaskConnectBridge implements WalletBridge {
  private accounts: string[] = [];
  private client: MetaMaskConnectClient | null = null;
  private readonly disconnectListeners = new Set<SessionDisconnectListener>();
  private pairingListener: ((uri: string) => void) | null = null;
  private pendingProposal: SessionProposal | null = null;
  private topic: string | null = null;

  constructor(private readonly config: MetaMaskConnectBridgeConfig) {}

  get connected(): boolean {
    return this.accounts.length > 0;
  }

  get sessionTopic(): string | null {
    return this.topic;
  }

  get transport(): WalletTransport {
    return "metamask-connect";
  }

  async init(): Promise<SessionInfo | null> {
    const mod = await import("@metamask/connect-evm") as MetaMaskConnectModule;
    this.client = await mod.createEVMClient({
      dapp: {
        name: "WalletChan RPC",
        url: `http://${this.config.host}:${this.config.port}`,
        iconUrl: WALLETCHAN_ICON_URL,
      },
      api: {
        supportedNetworks: Object.fromEntries(
          this.config.chains.map((chain) => [toHexChainId(chain.chainId), chain.rpcUrl]),
        ),
      },
      ui: {
        headless: true,
        preferExtension: false,
        showInstallModal: false,
      },
      eventHandlers: {
        displayUri: (uri) => this.pairingListener?.(uri),
        disconnect: () => this.clearSession("MetaMask Connect session was disconnected."),
      },
      analytics: { enabled: false },
    });

    this.attachListeners();
    if (this.config.forceNewSession) {
      await this.disconnectStored("WalletChan RPC started with --force-new-session");
      return null;
    }

    return this.restoreStoredSession();
  }

  async createSessionProposal(): Promise<SessionProposal> {
    const pending = this.getPendingProposal();
    if (!this.connected && pending) return pending;

    let resolveUri: (uri: string) => void;
    const uriPromise = new Promise<string>((resolve) => {
      resolveUri = resolve;
    });
    this.pairingListener = (uri) => resolveUri(uri);

    let proposal: SessionProposal;
    const approvalPromise = this.connect(false)
      .finally(() => {
        this.pairingListener = null;
        if (this.pendingProposal === proposal) {
          this.pendingProposal = null;
        }
      });
    void approvalPromise.catch(() => undefined);

    const uri = await Promise.race([
      uriPromise,
      approvalPromise.then(() => ""),
      sleep(PAIRING_URI_WAIT_MS).then(() => ""),
    ]);
    if (!uri) {
      throw new Error("MetaMask Connect did not emit a pairing URI before the connection completed or timed out");
    }

    proposal = {
      uri,
      approval: () => approvalPromise,
      createdAt: Date.now(),
    };
    this.pendingProposal = proposal;
    return proposal;
  }

  async requestAccount(
    options: { account?: string; forceRequest?: boolean } = {},
  ): Promise<SessionInfo> {
    return this.connect(options.forceRequest === true, normalizeAddress(options.account));
  }

  async getPairingUri(): Promise<string | null> {
    if (this.connected) return null;
    const proposal = await this.createSessionProposal();
    return proposal.uri;
  }

  async request(chainId: number, method: string, params: unknown[]): Promise<unknown> {
    const provider = this.getProvider();
    this.refreshAccountsFromClient();
    await this.switchProviderChain(chainId);
    const sendRequest = () => provider.request({ method, params });
    if (!APPROVAL_METHODS.has(method)) return sendRequest();
    return withSpinner(
      formatApprovalMessage(method, this.getChainLabel(chainId)),
      sendRequest,
    );
  }

  getAccounts(): string[] {
    this.refreshAccountsFromClient();
    return [...this.accounts];
  }

  getBatchingInfo(): SessionBatchingInfo {
    return {
      requested: this.config.includeBatching,
      supported: false,
      mode: this.connected ? "sequential_fallback" : "disconnected",
      approvedMethods: [],
      missingMethods: this.config.includeBatching ? [...BATCH_METHODS] : [],
    };
  }

  supportsBatching(): boolean {
    return false;
  }

  supportsMethod(method: string): boolean {
    return BASE_METHODS.includes(method);
  }

  onDisconnect(listener: SessionDisconnectListener): () => void {
    this.disconnectListeners.add(listener);
    return () => {
      this.disconnectListeners.delete(listener);
    };
  }

  getSessionInfo(): SessionInfo {
    this.refreshAccountsFromClient();
    if (!this.connected) {
      throw new Error("MetaMask Connect session is not connected");
    }
    return {
      accounts: this.getAccounts(),
      batching: this.getBatchingInfo(),
      methods: [...BASE_METHODS],
      peerName: "MetaMask",
      peerUrl: "https://metamask.io",
      topic: this.topic || "metamask-connect",
      transport: this.transport,
    };
  }

  async disconnectStored(_message = "WalletChan RPC stopped"): Promise<void> {
    await this.client?.disconnect?.().catch(() => undefined);
    this.pendingProposal = null;
    this.clearSession();
  }

  close(): void {
    this.accounts = [];
    this.pendingProposal = null;
    this.topic = null;
  }

  private async connect(forceRequest: boolean, account?: string | null): Promise<SessionInfo> {
    const result = await this.getClient().connect({
      account: account || undefined,
      chainIds: this.config.chains.map((chain) => toHexChainId(chain.chainId)),
      forceRequest,
    });
    this.accounts = this.prioritizeSelectedAccount(normalizeAccounts(result.accounts));
    if (this.accounts.length === 0) {
      this.accounts = this.prioritizeSelectedAccount(normalizeAccounts(await this.getProvider().request({
        method: "eth_accounts",
        params: [],
      }).catch(() => [])));
    }
    if (this.accounts.length === 0) {
      throw new Error("MetaMask Connect did not approve any EVM accounts");
    }
    this.topic = `metamask-connect-${Date.now()}`;
    return this.getSessionInfo();
  }

  private attachListeners(): void {
    const provider = this.getProvider();
    provider.on?.("accountsChanged", (accounts) => {
      this.accounts = this.prioritizeSelectedAccount(normalizeAccounts(accounts));
      if (this.accounts.length === 0) {
        this.clearSession("MetaMask Connect session no longer has approved accounts.");
      }
    });
    provider.on?.("disconnect", () => {
      this.clearSession("MetaMask Connect session was disconnected.");
    });
  }

  private async restoreStoredSession(): Promise<SessionInfo | null> {
    const provider = this.getProvider();
    const accounts = this.prioritizeSelectedAccount(normalizeAccounts(await provider.request({
      method: "eth_accounts",
      params: [],
    }).catch(() => [])));
    if (accounts.length === 0) return null;
    this.accounts = accounts;
    this.topic = `metamask-connect-${Date.now()}`;
    return this.getSessionInfo();
  }

  private async switchProviderChain(chainId: number): Promise<void> {
    await this.getProvider().request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: toHexChainId(chainId) }],
    });
  }

  private clearSession(reason?: string): void {
    const previousTopic = this.topic;
    this.accounts = [];
    this.topic = null;
    if (reason && previousTopic) {
      this.emitDisconnect({ reason, topic: previousTopic });
    }
  }

  private emitDisconnect(info: SessionDisconnectInfo): void {
    for (const listener of this.disconnectListeners) {
      listener(info);
    }
  }

  private getPendingProposal(): SessionProposal | null {
    if (!this.pendingProposal) return null;
    if (Date.now() - this.pendingProposal.createdAt <= PAIRING_URI_TTL_MS) {
      return this.pendingProposal;
    }
    this.pendingProposal = null;
    return null;
  }

  private getClient(): MetaMaskConnectClient {
    if (!this.client) {
      throw new Error("MetaMask Connect client is not initialized");
    }
    return this.client;
  }

  private getProvider(): Eip1193Provider {
    return this.getClient().getProvider();
  }

  private refreshAccountsFromClient(): void {
    if (!this.client) return;
    const clientAccounts = normalizeAccounts(this.client.accounts);
    const selected = normalizeAddress(this.client.getAccount?.()) ||
      normalizeAddress(this.client.selectedAccount);

    if (clientAccounts.length > 0) {
      this.accounts = this.prioritizeSelectedAccount(clientAccounts, selected);
      return;
    }

    if (selected) {
      this.accounts = this.prioritizeSelectedAccount(this.accounts, selected);
    }
  }

  private prioritizeSelectedAccount(accounts: string[], selected?: string | null): string[] {
    const account = selected || normalizeAddress(this.client?.getAccount?.()) ||
      normalizeAddress(this.client?.selectedAccount);
    if (!account) return accounts;
    const withoutSelected = accounts.filter((entry) => entry !== account);
    return [account, ...withoutSelected];
  }

  private getChainLabel(chainId: number): string {
    const chain = this.config.chains.find((configured) => configured.chainId === chainId);
    return chain ? `${chain.name} (${chain.chainId})` : `chain ${chainId}`;
  }
}

function normalizeAccounts(value: unknown): string[] {
  return Array.isArray(value)
    ? value
      .filter((account): account is string => typeof account === "string" && /^0x[a-fA-F0-9]{40}$/.test(account))
      .map((account) => account.toLowerCase())
    : [];
}

function normalizeAddress(value: unknown): string | null {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value)
    ? value.toLowerCase()
    : null;
}

function formatApprovalMessage(method: string, chainLabel: string): string {
  return `Waiting for MetaMask approval: ${method} on ${chainLabel}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
