const KEEPALIVE_INTERVAL_MS = 20_000;
const REQUEST_TIMEOUT_MS = 15_000;
const WARNING_THROTTLE_MS = 60_000;

type WalletConnectKeepaliveKit = {
  core?: {
    relayer?: {
      connected?: boolean;
      connecting?: boolean;
      request?: (request: {
        method: string;
        params: Record<string, unknown>;
      }) => Promise<unknown>;
      handleBatchMessageEvents?: (messages: any[]) => Promise<void>;
      subscriber?: {
        topics?: string[];
        values?: Array<{
          topic?: string;
          relay?: { protocol?: string };
        }>;
      };
    };
  };
  getActiveSessions?: () => Record<string, unknown>;
};

let getWalletKit: (() => WalletConnectKeepaliveKit | null) | null = null;
let keepaliveTimer: ReturnType<typeof setInterval> | null = null;
let keepaliveInFlight = false;
let lastWarningAt = 0;

function getActiveSessionTopics(kit: WalletConnectKeepaliveKit): string[] {
  const sessions = kit.getActiveSessions?.() || {};
  return Object.keys(sessions);
}

function getSubscribedTopics(kit: WalletConnectKeepaliveKit): string[] {
  const subscriber = kit.core?.relayer?.subscriber;
  const topics = new Set<string>();

  for (const topic of subscriber?.topics || []) {
    if (typeof topic === "string" && topic.length > 0) topics.add(topic);
  }

  for (const value of subscriber?.values || []) {
    if (typeof value.topic === "string" && value.topic.length > 0) {
      topics.add(value.topic);
    }
  }

  for (const topic of getActiveSessionTopics(kit)) {
    if (topic.length > 0) topics.add(topic);
  }

  return [...topics];
}

function getRelayProtocol(kit: WalletConnectKeepaliveKit): string {
  const valueProtocol =
    kit.core?.relayer?.subscriber?.values?.find(
      (value) => typeof value.relay?.protocol === "string",
    )?.relay?.protocol;

  return valueProtocol || "irn";
}

function hasActiveSessions(kit: WalletConnectKeepaliveKit): boolean {
  return getActiveSessionTopics(kit).length > 0;
}

function warnKeepaliveFailure(error: unknown): void {
  const now = Date.now();
  if (now - lastWarningAt < WARNING_THROTTLE_MS) return;
  lastWarningAt = now;
  console.warn("[WalletConnect] Relay keepalive failed", error);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("WalletConnect keepalive timed out"));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

async function runKeepaliveTick(): Promise<void> {
  if (keepaliveInFlight) return;

  const kit = getWalletKit?.();
  if (!kit || !hasActiveSessions(kit)) {
    stopWalletConnectKeepalive();
    return;
  }

  const relayer = kit.core?.relayer;
  if (!relayer?.request) return;

  const topics = getSubscribedTopics(kit);
  if (topics.length === 0) return;

  keepaliveInFlight = true;
  try {
    const protocol = getRelayProtocol(kit);
    const response = (await withTimeout(
      relayer.request({
        method: `${protocol}_batchFetchMessages`,
        params: { topics },
      }),
      REQUEST_TIMEOUT_MS,
    )) as { messages?: any[] } | undefined;

    if (
      response?.messages?.length &&
      typeof relayer.handleBatchMessageEvents === "function"
    ) {
      await relayer.handleBatchMessageEvents(response.messages);
    }
  } catch (error) {
    warnKeepaliveFailure(error);
  } finally {
    keepaliveInFlight = false;
  }
}

export function startWalletConnectKeepalive(
  walletKitProvider: () => WalletConnectKeepaliveKit | null,
): void {
  getWalletKit = walletKitProvider;
  if (keepaliveTimer) return;

  keepaliveTimer = setInterval(() => {
    void runKeepaliveTick();
  }, KEEPALIVE_INTERVAL_MS);

  void runKeepaliveTick();
}

export function stopWalletConnectKeepalive(): void {
  if (keepaliveTimer) {
    clearInterval(keepaliveTimer);
    keepaliveTimer = null;
  }
  keepaliveInFlight = false;
}
