/** Trusted renderer heartbeat for the MV3 background service worker. */

export const UI_KEEPALIVE_HEARTBEAT_MS = 20_000;

export type UiKeepalivePort = Pick<chrome.runtime.Port, "postMessage">;

type IntervalHandle = ReturnType<typeof globalThis.setInterval>;

export interface UiKeepaliveHeartbeatOptions {
  setInterval?: (
    callback: () => void,
    milliseconds: number,
  ) => IntervalHandle;
  clearInterval?: (handle: IntervalHandle) => void;
  onError?: () => void;
}

/**
 * Chrome 114+ does not treat opening a long-lived port as worker activity.
 * Send an immediate, then sub-30-second, secret-free pulse while trusted wallet
 * UI is open. This keeps the worker alive without refreshing auth timestamps
 * or an authenticated finite passkey deadline.
 */
export function startUiKeepaliveHeartbeat(
  port: UiKeepalivePort,
  options: UiKeepaliveHeartbeatOptions = {},
): () => void {
  const schedule = options.setInterval ?? globalThis.setInterval;
  const cancel = options.clearInterval ?? globalThis.clearInterval;
  let stopped = false;
  let interval: IntervalHandle | null = null;

  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    if (interval !== null) cancel(interval);
    interval = null;
  };

  const pulse = (): void => {
    if (stopped) return;
    try {
      port.postMessage({ type: "wallet-ui-keepalive" });
    } catch {
      stop();
      options.onError?.();
    }
  };

  interval = schedule(pulse, UI_KEEPALIVE_HEARTBEAT_MS);
  pulse();
  return stop;
}
