import type { CliConfig } from "./cli.js";
import { MetaMaskConnectBridge } from "./metamaskConnect.js";
import type {
  SessionBatchingInfo,
  SessionDisconnectInfo,
  SessionDisconnectListener,
  SessionInfo,
  SessionProposal,
  WalletBridge,
  WalletTransport,
} from "./walletBridge.js";
import { WalletConnectBridge } from "./walletConnect.js";

export class WalletBridgeManager implements WalletBridge {
  private current: WalletBridge;
  private disconnectUnsubscribe: (() => void) | null = null;
  private readonly disconnectListeners = new Set<SessionDisconnectListener>();

  constructor(private readonly config: CliConfig) {
    this.current = this.createBridge(config.walletTransport, config.forceNewSession);
    this.attachCurrentDisconnect();
  }

  get connected(): boolean {
    return this.current.connected;
  }

  get sessionTopic(): string | null {
    return this.current.sessionTopic;
  }

  get transport(): WalletTransport {
    return this.current.transport;
  }

  async switchTransport(
    transport: WalletTransport,
    options: { forceNewSession?: boolean; account?: string; forceRequest?: boolean } = {},
  ): Promise<SessionInfo | null> {
    if (transport === this.current.transport) {
      if (options.forceNewSession) {
        await this.current.disconnectStored("WalletChan RPC pairing transport was reset by request");
      }
      if (options.account || options.forceRequest) {
        return this.requestAccount({
          account: options.account,
          forceRequest: options.forceRequest,
        });
      }
      return this.current.connected ? this.current.getSessionInfo() : null;
    }

    this.disconnectUnsubscribe?.();
    this.disconnectUnsubscribe = null;
    this.current.close();
    this.current = this.createBridge(transport, options.forceNewSession === true);
    this.attachCurrentDisconnect();
    const session = await this.current.init();
    if (options.account || options.forceRequest) {
      return this.requestAccount({
        account: options.account,
        forceRequest: options.forceRequest,
      });
    }
    return session;
  }

  close(): void {
    this.current.close();
  }

  createSessionProposal(): Promise<SessionProposal> {
    return this.current.createSessionProposal();
  }

  disconnectStored(message?: string): Promise<void> {
    return this.current.disconnectStored(message);
  }

  getAccounts(chainId?: number): string[] {
    return this.current.getAccounts(chainId);
  }

  getBatchingInfo(): SessionBatchingInfo {
    return this.current.getBatchingInfo();
  }

  getPairingUri(): Promise<string | null> {
    return this.current.getPairingUri();
  }

  getSessionInfo(): SessionInfo {
    return this.current.getSessionInfo();
  }

  init(): Promise<SessionInfo | null> {
    return this.current.init();
  }

  onDisconnect(listener: SessionDisconnectListener): () => void {
    this.disconnectListeners.add(listener);
    return () => {
      this.disconnectListeners.delete(listener);
    };
  }

  request(chainId: number, method: string, params: unknown[]): Promise<unknown> {
    return this.current.request(chainId, method, params);
  }

  requestAccount(options: { account?: string; forceRequest?: boolean } = {}): Promise<SessionInfo> {
    if (!this.current.requestAccount) {
      throw new Error(`${this.current.transport} does not support account-specific connection requests`);
    }
    return this.current.requestAccount(options);
  }

  supportsBatching(): boolean {
    return this.current.supportsBatching();
  }

  supportsMethod(method: string): boolean {
    return this.current.supportsMethod(method);
  }

  private createBridge(transport: WalletTransport, forceNewSession: boolean): WalletBridge {
    if (transport === "metamask-connect") {
      return new MetaMaskConnectBridge({
        chains: this.config.chains,
        forceNewSession,
        host: this.config.host,
        includeBatching: this.config.includeBatching,
        port: this.config.port,
        requestTimeoutSeconds: this.config.requestTimeoutSeconds,
      });
    }

    return new WalletConnectBridge({
      chains: this.config.chains,
      forceNewSession,
      host: this.config.host,
      includeBatching: this.config.includeBatching,
      port: this.config.port,
      projectId: this.config.projectId,
      requestTimeoutSeconds: this.config.requestTimeoutSeconds,
    });
  }

  private attachCurrentDisconnect(): void {
    this.disconnectUnsubscribe = this.current.onDisconnect((info) => {
      this.emitDisconnect(info);
    });
  }

  private emitDisconnect(info: SessionDisconnectInfo): void {
    for (const listener of this.disconnectListeners) {
      listener(info);
    }
  }
}
