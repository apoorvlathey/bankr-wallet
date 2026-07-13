import { useCallback, useRef } from "react";

type RuntimeMessage = {
  type: string;
  [key: string]: any;
};

export function useRuntimeMessaging() {
  const keepAlivePortRef = useRef<chrome.runtime.Port | null>(null);
  const reconnectingRef = useRef(false);

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
    if (reconnectingRef.current) return;

    // Disconnect existing port if any
    if (keepAlivePortRef.current) {
      try {
        keepAlivePortRef.current.disconnect();
      } catch {
        // Ignore disconnect errors
      }
    }

    try {
      const port = chrome.runtime.connect({ name: "ui-keepalive" });
      keepAlivePortRef.current = port;

      port.onDisconnect.addListener(() => {
        keepAlivePortRef.current = null;
        // Service worker may have restarted - reconnect after a short delay
        // Only reconnect if extension context is still valid
        if (chrome.runtime?.id) {
          reconnectingRef.current = true;
          setTimeout(() => {
            reconnectingRef.current = false;
            establishKeepalivePort();
          }, 100);
        }
      });
    } catch {
      keepAlivePortRef.current = null;
    }
  }, []);

  return { establishKeepalivePort, sendMessageWithRetry };
}
