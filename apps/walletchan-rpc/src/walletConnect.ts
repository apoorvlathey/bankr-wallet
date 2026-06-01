import { accessSync, constants, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Core } from "@walletconnect/core";
import { SignClient } from "@walletconnect/sign-client";
import type { RuntimeChain } from "./chains.js";
import { toCaip2 } from "./chains.js";
import { withSpinner } from "./logger.js";

const WALLETCHAN_ICON_URL = "https://walletchan.com/images/walletchan-icon.png";

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

const REQUIRED_BATCH_METHODS = [
  "wallet_sendCalls",
  "wallet_getCallsStatus",
];

const WALLETCONNECT_EVENTS = ["chainChanged", "accountsChanged"];
const PAIRING_URI_TTL_MS = 4 * 60 * 1000;
const APPROVAL_METHODS = new Set([
  "eth_sendTransaction",
  "personal_sign",
  "eth_signTypedData_v3",
  "eth_signTypedData_v4",
  "wallet_sendCalls",
]);

type SignClientInstance = Awaited<ReturnType<typeof SignClient.init>>;
type Session = SignClientInstance["session"]["values"][number];

interface SessionProposal {
  uri: string;
  approval: () => Promise<SessionInfo>;
  createdAt: number;
}

export interface WalletConnectBridgeConfig {
  chains: RuntimeChain[];
  forceNewSession: boolean;
  host: string;
  includeBatching: boolean;
  port: number;
  projectId: string;
  requestTimeoutSeconds: number;
}

export interface SessionInfo {
  accounts: string[];
  batching: SessionBatchingInfo;
  methods: string[];
  peerName: string;
  peerUrl: string;
  topic: string;
}

export interface SessionBatchingInfo {
  requested: boolean;
  supported: boolean;
  mode: "erc5792" | "sequential_fallback" | "disconnected";
  approvedMethods: string[];
  missingMethods: string[];
}

export interface SessionDisconnectInfo {
  reason: string;
  topic: string;
}

type SessionDisconnectListener = (info: SessionDisconnectInfo) => void;

export class WalletConnectBridge {
  private client: SignClientInstance | null = null;
  private readonly disconnectListeners = new Set<SessionDisconnectListener>();
  private session: Session | null = null;
  private batchingInfo: SessionBatchingInfo;
  private pendingProposal: SessionProposal | null = null;
  private readonly methods: string[];

  constructor(private readonly config: WalletConnectBridgeConfig) {
    this.methods = config.includeBatching
      ? [...BASE_METHODS, ...BATCH_METHODS]
      : [...BASE_METHODS];
    this.batchingInfo = disconnectedBatchingInfo(config.includeBatching);
  }

  get connected(): boolean {
    return this.getConnectedSession() !== null;
  }

  get sessionTopic(): string | null {
    return this.getConnectedSession()?.topic || null;
  }

  getBatchingInfo(): SessionBatchingInfo {
    this.getConnectedSession();
    return this.batchingInfo;
  }

  supportsBatching(): boolean {
    return this.getBatchingInfo().supported;
  }

  supportsMethod(method: string): boolean {
    const session = this.getConnectedSession();
    if (!session) return false;
    return getSessionMethodSet(session).has(method);
  }

  onDisconnect(listener: SessionDisconnectListener): () => void {
    this.disconnectListeners.add(listener);
    return () => {
      this.disconnectListeners.delete(listener);
    };
  }

  async init(): Promise<SessionInfo | null> {
    process.env.DISABLE_GLOBAL_CORE ||= "true";

    const core = new Core({
      projectId: this.config.projectId,
      customStoragePrefix: `walletchan-rpc-${this.config.host}-${this.config.port}`,
      storageOptions: { database: getStorageBase(this.config.host, this.config.port) },
      logger: "error",
      telemetryEnabled: false,
    });

    this.client = await SignClient.init({
      core,
      metadata: {
        name: "WalletChan RPC",
        description: "Local JSON-RPC proxy for WalletChan and WalletConnect wallets",
        url: `http://${this.config.host}:${this.config.port}`,
        icons: [WALLETCHAN_ICON_URL],
      },
    });

    this.attachListeners();
    if (this.config.forceNewSession) {
      await this.disconnectStoredSessions("WalletChan RPC started with --force-new-session");
      return null;
    }

    return this.restoreStoredSession();
  }

  async createSessionProposal(): Promise<SessionProposal> {
    const pending = this.getPendingProposal();
    if (!this.connected && pending) return pending;

    const client = this.getClient();
    const chains = this.config.chains.map((chain) => toCaip2(chain.chainId));
    const { uri, approval } = await client.connect({
      optionalNamespaces: {
        eip155: {
          chains,
          methods: this.methods,
          events: WALLETCONNECT_EVENTS,
        },
      },
    });

    if (!uri) {
      throw new Error("WalletConnect did not return a pairing URI");
    }

    let proposal: SessionProposal;
    const approvalPromise = approval()
      .then((session) => {
        this.validateSession(session);
        this.session = session;
        this.batchingInfo = getSessionBatchingInfo(session, this.config.includeBatching);
        return this.getSessionInfo();
      })
      .finally(() => {
        if (this.pendingProposal === proposal) {
          this.pendingProposal = null;
        }
      });
    void approvalPromise.catch(() => undefined);

    proposal = {
      uri,
      approval: () => approvalPromise,
      createdAt: Date.now(),
    };
    this.pendingProposal = proposal;
    return proposal;
  }

  async getPairingUri(): Promise<string | null> {
    if (this.connected) return null;
    const proposal = await this.createSessionProposal();
    return proposal.uri;
  }

  async request(chainId: number, method: string, params: unknown[]): Promise<unknown> {
    const client = this.getClient();
    const session = this.getSession();
    const sendRequest = () => client.request({
      topic: session.topic,
      chainId: toCaip2(chainId),
      request: { method, params },
      expiry: this.config.requestTimeoutSeconds,
    });

    if (!APPROVAL_METHODS.has(method)) {
      return sendRequest();
    }

    return withSpinner(
      formatApprovalMessage(method, this.getChainLabel(chainId)),
      sendRequest,
    );
  }

  getAccounts(chainId?: number): string[] {
    const session = this.getConnectedSession();
    if (!session) return [];
    return getSessionAccounts(session, chainId);
  }

  getSessionInfo(): SessionInfo {
    const session = this.getSession();
    return {
      accounts: this.getAccounts(),
      batching: this.batchingInfo,
      methods: getSessionMethods(session),
      peerName: session.peer?.metadata?.name || "WalletConnect wallet",
      peerUrl: session.peer?.metadata?.url || "",
      topic: session.topic,
    };
  }

  async disconnectStored(message = "WalletChan RPC stopped"): Promise<void> {
    if (!this.client) return;
    await this.disconnectStoredSessions(message);
    this.session = null;
  }

  close(): void {
    this.clearSession();
  }

  private attachListeners(): void {
    const client = this.getClient();
    client.on("session_delete", ({ topic }: { topic: string }) => {
      if (this.session?.topic === topic) {
        this.clearSession("WalletConnect session was closed by the wallet.");
      }
    });
    client.on("session_expire", ({ topic }: { topic: string }) => {
      if (this.session?.topic === topic) {
        this.clearSession("WalletConnect session expired.");
      }
    });
    client.on("session_update", ({ topic }: { topic: string }) => {
      if (this.session?.topic === topic) {
        try {
          this.session = client.session.get(topic);
        } catch {
          this.clearSession("WalletConnect session was removed.");
          return;
        }
        this.getConnectedSession();
      }
    });
    client.on("session_event", (event: {
      topic: string;
      params?: { event?: { name?: string; data?: unknown } };
    }) => {
      if (this.session?.topic !== event.topic) return;
      const sessionEvent = event.params?.event;
      if (sessionEvent?.name === "accountsChanged" && Array.isArray(sessionEvent.data) && sessionEvent.data.length === 0) {
        this.clearSession("WalletConnect session no longer has approved accounts.");
      }
      if (sessionEvent?.name === "disconnect") {
        this.clearSession("WalletConnect session was disconnected by the wallet.");
      }
    });
  }

  private validateSession(session: Session): void {
    const approvedMethods = getSessionMethodSet(session);
    const approvedChains = getSessionChainSet(session);
    const requestedChains = this.config.chains.map((chain) => toCaip2(chain.chainId));

    const missingChains = requestedChains.filter((chain) => !approvedChains.has(chain));
    if (missingChains.length > 0) {
      throw new Error(`Wallet did not approve chains: ${missingChains.join(", ")}`);
    }

    const missingMethods = BASE_METHODS.filter((method) => !approvedMethods.has(method));
    if (missingMethods.length > 0) {
      throw new Error(`Wallet did not approve methods: ${missingMethods.join(", ")}.`);
    }

    if (getSessionAccounts(session).length === 0) {
      throw new Error("Wallet did not approve any EVM accounts");
    }

    this.batchingInfo = getSessionBatchingInfo(session, this.config.includeBatching);
  }

  private restoreStoredSession(): SessionInfo | null {
    const sessions = Array.from(this.getClient().session.values).reverse();
    for (const session of sessions) {
      if (isSessionExpired(session)) continue;
      try {
        this.validateSession(session);
        this.session = session;
        this.batchingInfo = getSessionBatchingInfo(session, this.config.includeBatching);
        return this.getSessionInfo();
      } catch {
        // A stored session may not match the current chain/method request.
        // Keep it stored; --force-new-session is the explicit cleanup path.
      }
    }
    return null;
  }

  private getPendingProposal(): SessionProposal | null {
    if (!this.pendingProposal) return null;
    if (Date.now() - this.pendingProposal.createdAt <= PAIRING_URI_TTL_MS) {
      return this.pendingProposal;
    }
    this.pendingProposal = null;
    return null;
  }

  private getConnectedSession(): Session | null {
    if (!this.session) return null;
    if (this.client && this.session.topic) {
      try {
        this.session = this.client.session.get(this.session.topic);
      } catch {
        this.clearSession("WalletConnect session was removed.");
        return null;
      }
    }
    if (isSessionExpired(this.session)) {
      this.clearSession("WalletConnect session expired.");
      return null;
    }
    try {
      this.validateSession(this.session);
      this.batchingInfo = getSessionBatchingInfo(this.session, this.config.includeBatching);
      return this.session;
    } catch (error) {
      this.clearSession(error instanceof Error ? error.message : "WalletConnect session is no longer valid.");
      return null;
    }
  }

  private clearSession(reason?: string): void {
    const previousTopic = this.session?.topic;
    this.session = null;
    this.batchingInfo = disconnectedBatchingInfo(this.config.includeBatching);
    if (reason && previousTopic) {
      this.emitDisconnect({ reason, topic: previousTopic });
    }
  }

  private emitDisconnect(info: SessionDisconnectInfo): void {
    for (const listener of this.disconnectListeners) {
      listener(info);
    }
  }

  private async disconnectStoredSessions(message: string): Promise<void> {
    const client = this.getClient();
    const topics = new Set<string>();

    for (const session of client.session.values) {
      if (session.topic) topics.add(session.topic);
    }

    const pairings = (client.pairing?.values || []) as Array<{ topic?: string }>;
    for (const pairing of pairings) {
      if (pairing.topic) topics.add(pairing.topic);
    }

    await Promise.all(
      Array.from(topics).map((topic) => this.disconnectTopic(topic, message)),
    );
  }

  private async disconnectTopic(topic: string, message: string): Promise<void> {
    const client = this.getClient();
    try {
      await client.disconnect({
        topic,
        reason: { code: 6000, message },
      });
    } catch {
      // Stale topics are best-effort cleanup only.
    }
  }

  private getClient(): SignClientInstance {
    if (!this.client) {
      throw new Error("WalletConnect client is not initialized");
    }
    return this.client;
  }

  private getSession(): Session {
    const session = this.getConnectedSession();
    if (!session) {
      throw new Error("WalletConnect session is not connected");
    }
    return session;
  }

  private getChainLabel(chainId: number): string {
    const chain = this.config.chains.find((configured) => configured.chainId === chainId);
    return chain ? `${chain.name} (${chain.chainId})` : `chain ${chainId}`;
  }
}

function formatApprovalMessage(method: string, chainLabel: string): string {
  return `Waiting for wallet approval: ${method} on ${chainLabel}`;
}

function isSessionExpired(session: Session): boolean {
  const expiry = (session as { expiry?: unknown }).expiry;
  return typeof expiry === "number" && expiry <= Math.floor(Date.now() / 1000);
}

function getSessionAccounts(session: Session, chainId?: number): string[] {
  const accounts = session.namespaces?.eip155?.accounts || [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const account of accounts) {
    if (typeof account !== "string") continue;
    const [namespace, rawChainId, address] = account.split(":");
    if (namespace !== "eip155" || !address) continue;
    if (chainId && Number(rawChainId) !== chainId) continue;
    const normalized = address.toLowerCase();
    if (!seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }
  return result;
}

function getSessionMethods(session: Session): string[] {
  return Array.from(getSessionMethodSet(session)).sort();
}

function getSessionMethodSet(session: Session): Set<string> {
  return new Set(
    (session.namespaces?.eip155?.methods || [])
      .filter((method): method is string => typeof method === "string"),
  );
}

function getSessionBatchingInfo(session: Session, requested: boolean): SessionBatchingInfo {
  const approvedMethods = getSessionMethodSet(session);
  const missingMethods = BATCH_METHODS.filter((method) => !approvedMethods.has(method));
  const supported = requested &&
    REQUIRED_BATCH_METHODS.every((method) => approvedMethods.has(method));
  return {
    requested,
    supported,
    mode: supported ? "erc5792" : "sequential_fallback",
    approvedMethods: BATCH_METHODS.filter((method) => approvedMethods.has(method)),
    missingMethods,
  };
}

function disconnectedBatchingInfo(requested: boolean): SessionBatchingInfo {
  return {
    requested,
    supported: false,
    mode: "disconnected",
    approvedMethods: [],
    missingMethods: requested ? [...BATCH_METHODS] : [],
  };
}

function getSessionChainSet(session: Session): Set<string> {
  const chains = new Set<string>();
  for (const chain of session.namespaces?.eip155?.chains || []) {
    if (typeof chain === "string") chains.add(chain);
  }
  for (const account of session.namespaces?.eip155?.accounts || []) {
    if (typeof account !== "string") continue;
    const [namespace, chainId] = account.split(":");
    if (namespace === "eip155" && chainId) {
      chains.add(`${namespace}:${chainId}`);
    }
  }
  return chains;
}

function getStorageBase(host: string, port: number): string {
  const storageRoot =
    process.env.WALLETCHAN_RPC_STORAGE_DIR ||
    join(tmpdir(), `walletchan-rpc-${getStorageScope()}`);
  const storageDir = join(storageRoot, `${sanitizeStorageSegment(host)}-${port}`);
  mkdirSync(storageDir, { recursive: true, mode: 0o700 });
  accessSync(storageDir, constants.R_OK | constants.W_OK | constants.X_OK);
  return storageDir;
}

function getStorageScope(): string {
  if (typeof process.getuid === "function") {
    return `uid-${process.getuid()}`;
  }
  return sanitizeStorageSegment(process.env.USER || process.env.USERNAME || "default");
}

function sanitizeStorageSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9.-]/g, "_");
}
