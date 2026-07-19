/** Detect Arc through the browser-provided palette CSS variable. */
export function isArcBrowser(): boolean {
  try {
    const title = getComputedStyle(document.documentElement).getPropertyValue(
      "--arc-palette-title",
    );
    return title.trim().length > 0;
  } catch {
    return false;
  }
}
