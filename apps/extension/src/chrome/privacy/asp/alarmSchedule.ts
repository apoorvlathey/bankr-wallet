export const PRIVACY_ASP_REFRESH_ALARM = "walletchan-privacy-asp-refresh";
export const PRIVACY_ASP_REFRESH_DELAY_MINUTES = 2;

/** Schedule one bounded retry instead of keeping the MV3 worker alive. */
export function schedulePrivacyAspRefresh(): void {
  chrome.alarms.create(PRIVACY_ASP_REFRESH_ALARM, {
    delayInMinutes: PRIVACY_ASP_REFRESH_DELAY_MINUTES,
  });
}

export function clearPrivacyAspRefresh(): void {
  void chrome.alarms.clear(PRIVACY_ASP_REFRESH_ALARM);
}
