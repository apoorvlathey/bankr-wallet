import { BANNER_HEIGHT_PX } from "./styles";

export function applyBannerBodyOffset(target = BANNER_HEIGHT_PX): void {
  const apply = () => {
    if (!document.body) return false;
    const current = parseFloat(getComputedStyle(document.body).marginTop) || 0;
    document.body.style.marginTop = `${Math.max(current, target)}px`;
    return true;
  };
  if (apply()) return;
  const observer = new MutationObserver(() => {
    if (apply()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true });
}
