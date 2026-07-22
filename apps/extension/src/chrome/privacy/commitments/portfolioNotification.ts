export const PRIVACY_PORTFOLIO_UPDATED_MESSAGE = "privacyPortfolioUpdated";

/** Tell open wallet surfaces that the durable private aggregate changed. */
export function notifyPrivacyPortfolioUpdated(): void {
  if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) return;
  chrome.runtime.sendMessage({
    type: PRIVACY_PORTFOLIO_UPDATED_MESSAGE,
  }).catch(() => {
    // Open extension views are optional.
  });
}
