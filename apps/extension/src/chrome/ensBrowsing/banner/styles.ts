import type { BannerTheme } from "./types";

export const BANNER_HEIGHT_PX = 44;

export function createBannerStyles(theme: BannerTheme): HTMLStyleElement {
  const isMidnight = theme.themeId === "midnight";
  const radius = isMidnight ? "4px" : "0";
  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .bar {
      display: flex; align-items: center; gap: 12px;
      height: ${BANNER_HEIGHT_PX}px; padding: 0 14px;
      box-sizing: border-box; background: #121212; color: #FFFFFF;
      border-bottom: 2px solid #000000; box-shadow: 0 2px 0 0 #000000;
      font: 500 12px/1 "Outfit", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      -webkit-font-smoothing: antialiased; letter-spacing: 0.02em;
    }
    .left, .right {
      display: inline-flex; align-items: center; gap: 10px;
      flex: 1 1 0; min-width: 0;
    }
    .right { justify-content: flex-end; }
    .brand-link {
      all: unset; display: inline-flex; align-items: center; gap: 10px;
      flex: none; height: 32px; padding: 0 6px 0 0;
      border-radius: ${isMidnight ? "6px" : "0"}; color: inherit;
      cursor: pointer; text-decoration: none;
      transition: background-color 150ms;
    }
    .brand-link:hover, .brand-link:focus-visible {
      background: rgba(255,255,255,0.06); outline: none;
    }
    .brand { display: inline-flex; align-items: center; gap: 8px; flex: none; }
    .brand img {
      width: 26px; height: 26px; display: block;
      border-radius: ${theme.isDark ? "4px" : "0"}; flex: none;
    }
    .label {
      font-weight: 700; color: #A8A8A8; text-transform: uppercase;
      letter-spacing: 0.08em; font-size: 10px; white-space: nowrap;
    }
    .identity {
      display: inline-flex; align-items: center; gap: 8px;
      flex: 0 1 520px; min-width: 0; height: 26px; padding: 0 12px;
      background: rgba(0,0,0,0.25); border: 1px solid #000000;
      border-radius: ${isMidnight ? "13px" : "0"};
      transition: border-color 150ms, background-color 150ms;
    }
    .identity:hover { background: rgba(0,0,0,0.35); }
    .identity:focus-within {
      background: rgba(0,0,0,0.5); border-color: ${theme.accent};
    }
    .magnifier {
      width: 12px; height: 12px; color: #A8A8A8;
      flex: none; display: block;
    }
    .urlfield {
      flex: 1 1 auto; min-width: 0;
      font: 500 12px/1 "JetBrains Mono", "SF Mono", Menlo, Consolas, ui-monospace, monospace;
      color: #FFFFFF; text-align: center; white-space: nowrap;
      overflow: hidden; text-overflow: ellipsis; outline: none; cursor: text;
    }
    .urlfield:empty::before { content: attr(data-placeholder); color: #A8A8A8; }
    .urlfield .u-host { color: #FFFFFF; font-weight: 700; }
    .urlfield .u-path { color: #A8A8A8; }
    .urlfield::selection, .urlfield *::selection {
      background: ${theme.accent}; color: #121212;
    }
    .identity:has(.urlfield.shake) { border-color: #f43f5e; }
    .urlfield.shake { animation: shake 0.4s ease; }
    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-3px); }
      75% { transform: translateX(3px); }
    }
    .updated {
      background: ${theme.accent}; color: #121212; font-weight: 700;
      padding: 4px 10px; cursor: pointer; border: 2px solid #000000;
      font-size: 11px; border-radius: ${radius};
    }
    .star-btn {
      all: unset; display: inline-flex; align-items: center;
      justify-content: center; width: 22px; height: 22px; flex: none;
      border-radius: ${radius}; color: #A8A8A8; cursor: pointer;
      transition: background-color 150ms, color 150ms;
    }
    .star-btn svg { width: 14px; height: 14px; display: block; }
    .star-btn:hover, .star-btn:focus-visible {
      background: rgba(255,255,255,0.08); color: #FFFFFF; outline: none;
    }
    .star-btn.favorited { color: ${theme.accent}; }
    .ens-history-link {
      all: unset; display: inline-flex; align-items: center;
      height: 22px; padding: 0 10px; border-radius: ${radius};
      color: #A8A8A8; cursor: pointer; font: 500 11px/1 inherit;
      text-decoration: none; transition: background-color 150ms, color 150ms;
    }
    .ens-history-link:hover {
      background: rgba(255,255,255,0.08); color: #FFFFFF;
    }
    .menu-wrap { position: relative; flex: none; }
    .menu-btn {
      all: unset; display: inline-flex; align-items: center;
      justify-content: center; width: 26px; height: 26px;
      border-radius: ${radius}; color: #A8A8A8; cursor: pointer;
      font-size: 18px; line-height: 1;
      transition: background-color 150ms, color 150ms;
    }
    .menu-btn:hover { background: rgba(255,255,255,0.08); color: #FFFFFF; }
    .menu {
      position: absolute; top: calc(100% + 6px); right: 0; display: none;
      min-width: 230px; background: #121212; color: #FFFFFF;
      border: 2px solid #000000; border-radius: ${isMidnight ? "6px" : "0"};
      padding: 4px; box-shadow: 0 2px 0 0 #000000; z-index: 1;
    }
    .menu.open { display: block; }
    .menu button {
      all: unset; display: flex; align-items: center; gap: 10px;
      width: 100%; box-sizing: border-box; padding: 8px 10px;
      border-radius: ${radius}; font: 500 12px/1.3 inherit;
      color: #FFFFFF; cursor: pointer; text-align: left;
      transition: background-color 150ms;
    }
    .menu button:hover { background: rgba(255,255,255,0.08); }
    .menu button svg {
      width: 14px; height: 14px; flex: none; display: block; color: #A8A8A8;
    }
    .copy-toast {
      display: none; color: ${theme.accent}; font-weight: 700;
      font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em;
    }
    .copy-toast.show { display: inline; }
  `;
  return style;
}
