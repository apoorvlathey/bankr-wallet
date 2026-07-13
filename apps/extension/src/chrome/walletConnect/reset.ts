export const WALLETCONNECT_STORAGE_NAMESPACE_KEY =
  "walletConnectStorageNamespace";

const WALLETCONNECT_RESET_NAMESPACE_PREFIX = "wallet-reset-";
const WALLETCONNECT_RESET_NAMESPACE_PATTERN =
  /^wallet-reset-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_STEP_TIMEOUT_MS = 2_000;

type WalletConnectResetCore = {
  storage: {
    getKeys(): Promise<string[]>;
    removeItem(key: string): Promise<void>;
  };
  pairing: {
    getPairings(): Array<{ topic?: unknown }>;
    disconnect(params: { topic: string }): Promise<void>;
  };
  heartbeat: {
    stop(): void;
  };
  relayer: {
    transportClose(): Promise<void>;
  };
};

type WalletConnectResetKit = {
  core: WalletConnectResetCore;
  getActiveSessions(): Record<string, unknown> | null | undefined;
  disconnectSession(params: {
    topic: string;
    reason: { code: number; message: string };
  }): Promise<void>;
};

export type WalletConnectResetSummary = {
  sessionsDisconnected: number;
  pairingsDisconnected: number;
  storageKeysRemoved: number;
  warnings: string[];
};

export function createWalletConnectStorageNamespace(
  uuid = crypto.randomUUID(),
): string {
  return `${WALLETCONNECT_RESET_NAMESPACE_PREFIX}${uuid}`;
}

/**
 * `undefined` deliberately means the legacy, un-prefixed WalletConnect store.
 * Existing users must continue using that store until they explicitly reset.
 * `null` means a present but malformed value and must be replaced fail-closed.
 */
export function parseWalletConnectStorageNamespace(
  value: unknown,
): string | undefined | null {
  if (typeof value === "undefined") return undefined;
  if (
    typeof value === "string" &&
    WALLETCONNECT_RESET_NAMESPACE_PATTERN.test(value)
  ) {
    return value;
  }
  return null;
}

async function runBestEffortStep(
  label: string,
  action: () => void | Promise<void>,
  warnings: string[],
  timeoutMs: number,
): Promise<boolean> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.resolve().then(action),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`${label} timed out`)),
          timeoutMs,
        );
      }),
    ]);
    return true;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown error";
    warnings.push(`${label}: ${detail}`);
    return false;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

/**
 * Retires all WalletConnect resources belonging to the wallet being reset.
 * Relay notification is best-effort; local transport shutdown and SDK storage
 * purge still run if a peer is offline or a disconnect publish fails.
 */
export async function teardownWalletConnectSdkState(
  core: WalletConnectResetCore,
  kit?: WalletConnectResetKit | null,
  options: { timeoutMs?: number; purgeStorage?: boolean } = {},
): Promise<WalletConnectResetSummary> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_STEP_TIMEOUT_MS;
  const warnings: string[] = [];
  let sessionsDisconnected = 0;
  let pairingsDisconnected = 0;
  let storageKeysRemoved = 0;

  if (kit) {
    let sessionTopics: string[] = [];
    try {
      sessionTopics = Object.keys(kit.getActiveSessions() || {});
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unknown error";
      warnings.push(`read active sessions: ${detail}`);
    }

    await Promise.all(
      sessionTopics.map(async (topic, index) => {
        const disconnected = await runBestEffortStep(
          `disconnect session ${index + 1}`,
          () =>
            kit.disconnectSession({
              topic,
              reason: { code: 6000, message: "Wallet was reset" },
            }),
          warnings,
          timeoutMs,
        );
        if (disconnected) sessionsDisconnected += 1;
      }),
    );

    let pairingTopics: string[] = [];
    try {
      pairingTopics = core.pairing
        .getPairings()
        .map((pairing) => pairing.topic)
        .filter((topic): topic is string => typeof topic === "string");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unknown error";
      warnings.push(`read pairings: ${detail}`);
    }

    await Promise.all(
      pairingTopics.map(async (topic, index) => {
        const disconnected = await runBestEffortStep(
          `disconnect pairing ${index + 1}`,
          () => core.pairing.disconnect({ topic }),
          warnings,
          timeoutMs,
        );
        if (disconnected) pairingsDisconnected += 1;
      }),
    );
  }

  await runBestEffortStep(
    "stop heartbeat",
    () => core.heartbeat.stop(),
    warnings,
    timeoutMs,
  );
  await runBestEffortStep(
    "close relay transport",
    () => core.relayer.transportClose(),
    warnings,
    timeoutMs,
  );

  if (options.purgeStorage !== false) {
    let storageKeys: string[] = [];
    try {
      storageKeys = await core.storage.getKeys();
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unknown error";
      warnings.push(`read SDK storage: ${detail}`);
    }

    await Promise.all(
      storageKeys.map(async (key, index) => {
        const removed = await runBestEffortStep(
          `remove SDK storage key ${index + 1}`,
          () => core.storage.removeItem(key),
          warnings,
          timeoutMs,
        );
        if (removed) storageKeysRemoved += 1;
      }),
    );
  }

  return {
    sessionsDisconnected,
    pairingsDisconnected,
    storageKeysRemoved,
    warnings,
  };
}
