import { mountedBannerHost } from "./view";

/** Register the single trusted background push consumed by the banner. */
export function registerContentUpdateListener(): void {
  chrome.runtime.onMessage.addListener((message) => {
    if (!message || typeof message !== "object") return;
    const record = message as Record<string, unknown>;
    if (record.type !== "ens-content-updated") return;
    const host = mountedBannerHost();
    if (!host || !host.shadowRoot) return;
    const right = host.shadowRoot.querySelector(".right");
    if (!right || right.querySelector(".updated")) return;
    const button = document.createElement("button");
    button.className = "updated";
    button.textContent = "Updated — reload";
    button.addEventListener("click", () => {
      const url =
        typeof record.gatewayUrl === "string" ? record.gatewayUrl : null;
      if (url) location.replace(url);
      else location.reload();
    });
    right.appendChild(button);
  });
}
