import { useCallback, useEffect, useRef } from "react";
import { startUiKeepaliveHeartbeat } from "@/app/uiKeepalive";

type RuntimeMessage = {
  type: string;
  [key: string]: any;
};

export function useRuntimeMessaging() {
  const keepAlivePortRef = useRef<chrome.runtime.Port | null>(null);
  const stopKeepaliveHeartbeatRef = useRef<(() => void) | null>(null);
  const reconnectingRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disposedRef = useRef(false);

  /**
   * Try to wake up the service worker using chrome.runtime.connect.
   * This is needed for browsers like Arc that don't auto-wake the service worker.
   */
  const wakeUpServiceWorker = useCallback(async (): Promise<boolean> => {
    return new Promise((resolve) => {
      try {
        const port = chrome.runtime.connect({ name: "popup-wake" });
        port.onDisconnect.addListener(() => {
          // Port disconnected, but that's okay - we just needed to wake it up
          resolve(true);
        });
        // Give it a moment then disconnect
        setTimeout(() => {
          try {
            port.disconnect();
          } catch {
            // Ignore disconnect errors
          }
          resolve(true);
        }, 100);
      } catch (error) {
        console.warn("Failed to wake service worker:", error);
        resolve(false);
      }
    });
  }, []);

  /**
   * Send a message to the background script with retry logic.
   * Some browsers (like Arc) may not wake up the service worker immediately.
   */
  const sendMessageWithRetry = useCallback(
    async <T,>(
      message: RuntimeMessage,
      maxRetries = 5,
      delay = 200,
    ): Promise<T | null> => {
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          const response = await new Promise<T | null>((resolve, reject) => {
            chrome.runtime.sendMessage(message, (result) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve(result);
              }
            });
          });
          return response;
        } catch (error) {
          console.warn(`Message attempt ${attempt + 1} failed:`, error);
          if (attempt < maxRetries - 1) {
            // Try to wake up the service worker
            await wakeUpServiceWorker();
            // Wait before retrying, with exponential backoff
            await new Promise((resolve) =>
              setTimeout(resolve, delay * Math.pow(2, attempt)),
            );
          }
        }
      }
      return null;
    },
    [wakeUpServiceWorker],
  );

  /**
   * Establishes and maintains a keepalive port connection to the service worker.
   * Automatically reconnects if the port disconnects (e.g., service worker restarts).
   */
  const establishKeepalivePort = useCallback(() => {
    if (disposedRef.current || reconnectingRef.current) return;

    // Disconnect existing port if any
    const previousPort = keepAlivePortRef.current;
    stopKeepaliveHeartbeatRef.current?.();
    stopKeepaliveHeartbeatRef.current = null;
    keepAlivePortRef.current = null;
    if (previousPort) {
      try {
        previousPort.disconnect();
      } catch {
        // Ignore disconnect errors
      }
    }

    try {
      const port = chrome.runtime.connect({ name: "ui-keepalive" });
      keepAlivePortRef.current = port;

      port.onDisconnect.addListener(() => {
        if (keepAlivePortRef.current !== port) return;
        stopKeepaliveHeartbeatRef.current?.();
        stopKeepaliveHeartbeatRef.current = null;
        keepAlivePortRef.current = null;
        // Service worker may have restarted - reconnect after a short delay
        // Only reconnect if extension context is still valid
        if (!disposedRef.current && chrome.runtime?.id) {
          reconnectingRef.current = true;
          reconnectTimerRef.current = setTimeout(() => {
            reconnectTimerRef.current = null;
            reconnectingRef.current = false;
            establishKeepalivePort();
          }, 100);
        }
      });

      stopKeepaliveHeartbeatRef.current = startUiKeepaliveHeartbeat(port, {
        onError: () => {
          if (keepAlivePortRef.current !== port) return;
          try {
            port.disconnect();
          } catch {
            // onDisconnect owns reconnection when the port is already closed.
          }
        },
      });
    } catch {
      keepAlivePortRef.current = null;
    }
  }, []);

  useEffect(() => {
    disposedRef.current = false;
    return () => {
      disposedRef.current = true;
      reconnectingRef.current = false;
      if (reconnectTimerRef.current !== null) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      stopKeepaliveHeartbeatRef.current?.();
      stopKeepaliveHeartbeatRef.current = null;
      const port = keepAlivePortRef.current;
      keepAlivePortRef.current = null;
      try {
        port?.disconnect();
      } catch {
        // The extension context or port may already be gone.
      }
    };
  }, []);

  return { establishKeepalivePort, sendMessageWithRetry };
}
