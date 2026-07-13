/**
 * The only extension documents allowed to exercise the wallet UI message API.
 *
 * ENS browsing documents are deliberately web-accessible so normal webpages
 * can navigate to them. They have a separate, message-specific authorization
 * policy in `ensBrowsing/senderAuthorization.ts` and must never inherit wallet
 * UI access merely because their URL uses the extension origin.
 */
const TRUSTED_WALLET_UI_PATHS = new Set(["/index.html", "/onboarding.html"]);

export function isTrustedWalletUiSender(
  sender: chrome.runtime.MessageSender,
  extensionRoot = chrome.runtime.getURL("/"),
): boolean {
  if (!sender.url) return false;
  if (sender.frameId !== undefined && sender.frameId !== 0) return false;

  try {
    const senderUrl = new URL(sender.url);
    const rootUrl = new URL(extensionRoot);
    // URL.origin is `"null"` for non-special schemes in some runtimes
    // (notably moz-extension), so compare the extension scheme + host exactly.
    return (
      senderUrl.protocol === rootUrl.protocol &&
      senderUrl.host === rootUrl.host &&
      TRUSTED_WALLET_UI_PATHS.has(senderUrl.pathname)
    );
  } catch {
    return false;
  }
}
