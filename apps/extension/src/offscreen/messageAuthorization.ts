/** Restricts the Ledger offscreen bridge to the MV3 service worker. */
export function isTrustedLedgerBackgroundSender(
  sender: chrome.runtime.MessageSender,
  extensionRoot = chrome.runtime.getURL("/"),
  extensionId = chrome.runtime.id,
): boolean {
  if (sender.id !== extensionId || sender.tab || !sender.url) return false;

  try {
    const senderUrl = new URL(sender.url);
    const rootUrl = new URL(extensionRoot);
    return (
      senderUrl.protocol === rootUrl.protocol &&
      senderUrl.host === rootUrl.host &&
      senderUrl.pathname === "/static/js/background.js" &&
      senderUrl.search === "" &&
      senderUrl.hash === ""
    );
  } catch {
    return false;
  }
}
