/** Detect Arc from its injected palette title variable. */
export function isArcBrowser(): boolean {
  try {
    const arcPaletteTitle = getComputedStyle(
      document.documentElement,
    ).getPropertyValue("--arc-palette-title");
    return Boolean(arcPaletteTitle.trim());
  } catch {
    return false;
  }
}
