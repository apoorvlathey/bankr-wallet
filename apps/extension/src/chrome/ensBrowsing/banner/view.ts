import { BANNER_HEIGHT_PX, createBannerStyles } from "./styles";
import type { BannerRefs, BannerTheme } from "./types";

export const BANNER_ID = "walletchan-ens-banner";

export function mountedBannerHost(): HTMLDivElement | null {
  return document.getElementById(BANNER_ID) as HTMLDivElement | null;
}

export function buildBanner(theme: BannerTheme): BannerRefs {
  const host = document.createElement("div");
  host.id = BANNER_ID;
  host.style.cssText = [
    "all: initial",
    "position: fixed",
    "top: 0",
    "left: 0",
    "right: 0",
    `height: ${BANNER_HEIGHT_PX}px`,
    "z-index: 2147483647",
    "pointer-events: auto",
    "margin: 0",
    "padding: 0",
    "border: 0",
    "display: block",
  ].join("; ");
  const shadow = host.attachShadow({ mode: "closed" });
  shadow.appendChild(createBannerStyles(theme));

  const bar = document.createElement("div");
  bar.className = "bar";
  const left = document.createElement("span");
  left.className = "left";
  const homeLink = document.createElement("a");
  homeLink.className = "brand-link";
  homeLink.href = chrome.runtime.getURL("browse.html");
  homeLink.title = "Open WalletChan Browser";
  const brand = document.createElement("span");
  brand.className = "brand";
  const brandImg = document.createElement("img");
  brandImg.src = chrome.runtime.getURL("walletchan-icon-white-bg.png");
  brandImg.alt = "WalletChan";
  brand.appendChild(brandImg);
  const label = document.createElement("span");
  label.className = "label";
  label.textContent = "WALLETCHAN · DAPP3";
  homeLink.append(brand, label);
  left.appendChild(homeLink);
  bar.appendChild(left);

  const identity = document.createElement("div");
  identity.className = "identity";
  identity.setAttribute("role", "search");
  const magnifier = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  magnifier.setAttribute("class", "magnifier");
  magnifier.setAttribute("viewBox", "0 0 16 16");
  magnifier.setAttribute("fill", "none");
  magnifier.setAttribute("stroke", "currentColor");
  magnifier.setAttribute("stroke-width", "1.6");
  magnifier.setAttribute("stroke-linecap", "round");
  magnifier.setAttribute("stroke-linejoin", "round");
  magnifier.setAttribute("aria-hidden", "true");
  magnifier.innerHTML =
    '<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5 L14 14"/>';
  identity.appendChild(magnifier);
  const urlInput = document.createElement("div");
  urlInput.className = "urlfield";
  identity.appendChild(urlInput);
  const starBtn = document.createElement("button");
  starBtn.className = "star-btn";
  starBtn.type = "button";
  starBtn.setAttribute("aria-label", "Favorite this dapp");
  starBtn.setAttribute("aria-pressed", "false");
  starBtn.title = "Favorite this dapp";
  starBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 3.5l2.65 5.36 5.92.86-4.28 4.17 1.01 5.89L12 17l-5.3 2.78 1.01-5.89-4.28-4.17 5.92-.86L12 3.5z"/>
    </svg>`;
  identity.appendChild(starBtn);
  bar.appendChild(identity);

  const right = document.createElement("span");
  right.className = "right";
  right.innerHTML = `
    <span class="copy-toast">copied</span>
    <a class="ens-history-link" target="_blank" rel="noopener noreferrer" title="View ENS History">View ENS History</a>
    <span class="menu-wrap">
      <button class="menu-btn" type="button" aria-label="banner menu" title="More options">⋯</button>
      <div class="menu" role="menu">
        <button data-act="copy" type="button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg><span>Copy underlying URL</span>
        </button>
        <button data-act="open-gateway" type="button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/>
            <line x1="10" y1="14" x2="21" y2="3"/>
          </svg><span>Open on eth.limo gateway</span>
        </button>
      </div>
    </span>`;
  bar.appendChild(right);
  shadow.appendChild(bar);
  const query = <T extends Element>(selector: string) =>
    shadow.querySelector(selector) as T;
  return {
    host,
    shadow,
    bar,
    urlInput,
    brandImg,
    right,
    starBtn: query<HTMLButtonElement>(".star-btn"),
    historyLink: query<HTMLAnchorElement>(".ens-history-link"),
    menuBtn: query<HTMLButtonElement>(".menu-btn"),
    menu: query<HTMLDivElement>(".menu"),
    copyItem: query<HTMLButtonElement>('button[data-act="copy"]'),
    openGatewayItem: query<HTMLButtonElement>('button[data-act="open-gateway"]'),
    copyToast: query<HTMLSpanElement>(".copy-toast"),
  };
}
