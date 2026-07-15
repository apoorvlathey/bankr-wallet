type OnboardingTabListener = (tabId: number) => void;

/** Opens onboarding once, focusing an existing tab when recovery already started. */
export async function openOrFocusOnboarding(
  onTab?: OnboardingTabListener,
): Promise<void> {
  const onboardingUrl = chrome.runtime.getURL("onboarding.html");
  const existingTabs = await chrome.tabs.query({ url: onboardingUrl });
  const existingTab = existingTabs[0];

  if (existingTab?.id) {
    await chrome.tabs.update(existingTab.id, { active: true });
    if (typeof existingTab.windowId === "number") {
      await chrome.windows.update(existingTab.windowId, { focused: true });
    }
    onTab?.(existingTab.id);
    return;
  }

  const tab = await chrome.tabs.create({ url: onboardingUrl });
  if (tab.id) onTab?.(tab.id);
}
