export const ONBOARDING_OWNER_SESSION_KEY = "walletchanOnboardingOwner";

export function isArcBrowser(): boolean {
  try {
    const title = getComputedStyle(document.documentElement).getPropertyValue(
      "--arc-palette-title",
    );
    return !!title && title.trim().length > 0;
  } catch {
    return false;
  }
}

export function getOrCreateOnboardingOwnerId(): string {
  try {
    const existing = sessionStorage.getItem(ONBOARDING_OWNER_SESSION_KEY);
    if (existing) return existing;
    const created = crypto.randomUUID();
    sessionStorage.setItem(ONBOARDING_OWNER_SESSION_KEY, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}
