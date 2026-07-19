/** Trusted-wallet-UI transport for Ledger pairing and account discovery. */

export const BACKGROUND_LEDGER_MESSAGE_TYPES = [
  "ledgerConnect",
  "ledgerScan",
  "ledgerCancel",
  "addLedgerAccounts",
  "getLedgerDevices",
] as const;

export type BackgroundLedgerRouteResult =
  | { handled: false }
  | { handled: true; keepChannelOpen: boolean };

export interface BackgroundLedgerDependencies {
  handleLedgerConnect(message: Record<string, unknown>): Promise<any>;
  handleLedgerScan(message: Record<string, unknown>): Promise<any>;
  handleLedgerCancel(message: Record<string, unknown>): Promise<any>;
  handleAddLedgerAccounts(message: Record<string, unknown>): Promise<any[]>;
  handleGetLedgerDevices(): Promise<any>;
}

const HANDLED_ASYNC: BackgroundLedgerRouteResult = {
  handled: true,
  keepChannelOpen: true,
};

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function createBackgroundLedgerMessageRouter(
  dependencies: BackgroundLedgerDependencies,
): (
  message: any,
  sendResponse: (response?: any) => void,
) => BackgroundLedgerRouteResult {
  return (message, sendResponse) => {
    const fail = (fallback: string) => (error: unknown) =>
      sendResponse({ success: false, error: errorMessage(error, fallback) });
    switch (message?.type) {
      case "ledgerConnect":
        void dependencies
          .handleLedgerConnect(message)
          .then((device) => sendResponse({ success: true, ...device }))
          .catch(fail("Ledger connection failed"));
        return HANDLED_ASYNC;
      case "ledgerScan":
        void dependencies
          .handleLedgerScan(message)
          .then((addresses) => sendResponse({ success: true, addresses }))
          .catch(fail("Ledger address scan failed"));
        return HANDLED_ASYNC;
      case "ledgerCancel":
        void dependencies
          .handleLedgerCancel(message)
          .then(sendResponse)
          .catch(fail("Ledger cancellation failed"));
        return HANDLED_ASYNC;
      case "addLedgerAccounts":
        void dependencies
          .handleAddLedgerAccounts(message)
          .then((accounts) =>
            sendResponse({ success: true, accounts, account: accounts[0] }),
          )
          .catch(fail("Failed to add Ledger accounts"));
        return HANDLED_ASYNC;
      case "getLedgerDevices":
        void dependencies
          .handleGetLedgerDevices()
          .then(sendResponse)
          .catch(fail("Failed to load Ledger devices"));
        return HANDLED_ASYNC;
      default:
        return { handled: false };
    }
  };
}
