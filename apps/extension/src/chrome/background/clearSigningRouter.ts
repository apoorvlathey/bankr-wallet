/** Trusted-wallet clear-signing descriptor and preference transport. */

export const BACKGROUND_CLEAR_SIGNING_MESSAGE_TYPES = [
  "GET_CLEAR_SIGNING_DESCRIPTOR",
  "INVALIDATE_CLEAR_SIGNING_CACHE",
  "getClearSigningEnabled",
  "setClearSigningEnabled",
] as const;

export type BackgroundClearSigningRouteResult =
  | { handled: false }
  | { handled: true; keepChannelOpen: true };

export type BackgroundClearSigningDependencies = {
  getDescriptor: (message: any) => Promise<any>;
  invalidateCache: () => Promise<any>;
  getEnabled: () => Promise<boolean>;
  setEnabled: (enabled: boolean) => Promise<void>;
};

const HANDLED_ASYNC: BackgroundClearSigningRouteResult = {
  handled: true,
  keepChannelOpen: true,
};

export function createBackgroundClearSigningMessageRouter(
  dependencies: BackgroundClearSigningDependencies,
): (
  message: any,
  sendResponse: (response?: any) => void,
) => BackgroundClearSigningRouteResult {
  return (message, sendResponse) => {
    switch (message?.type) {
      case "GET_CLEAR_SIGNING_DESCRIPTOR":
        dependencies
          .getDescriptor(message)
          .then(sendResponse)
          .catch((error) =>
            sendResponse({
              descriptor: null,
              enabled: true,
              error: error?.message,
            }),
          );
        return HANDLED_ASYNC;
      case "INVALIDATE_CLEAR_SIGNING_CACHE":
        dependencies
          .invalidateCache()
          .then((result) => sendResponse({ success: true, ...result }))
          .catch((error) =>
            sendResponse({ success: false, error: error?.message }),
          );
        return HANDLED_ASYNC;
      case "getClearSigningEnabled":
        dependencies
          .getEnabled()
          .then((enabled) => sendResponse({ enabled }))
          .catch((error) =>
            sendResponse({ enabled: true, error: error?.message }),
          );
        return HANDLED_ASYNC;
      case "setClearSigningEnabled":
        dependencies
          .setEnabled(!!message.value)
          .then(() => sendResponse({ success: true }))
          .catch((error) =>
            sendResponse({ success: false, error: error?.message }),
          );
        return HANDLED_ASYNC;
      default:
        return { handled: false };
    }
  };
}
