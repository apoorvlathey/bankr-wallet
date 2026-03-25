# WalletChan OS

The `/os` page (subdomain: `os.walletchan.com`) presents a Windows 95-style desktop OS interface — "WalletChan OS" — positioning it as a Web3 Operating System.

## Current State (Phase 1 + Phase 2 — Shipped)

### Architecture
- Dark desktop with rich gradient wallpaper + Bauhaus geometric overlay (color washes, dots, crosshatch)
- Dark translucent menu bar at top (WalletChan OS branding + $WCHAN MCap + Buy/Sell + ConnectButton)
- Dark translucent taskbar at bottom (Start button + window buttons + clock)
- Desktop icons for installed dapps + App Store shortcut
- Right-side system icons: Swap WCHAN (yellow bg) + Stake (blue bg, APY badge)
- Drag-to-reorder desktop icons (HTML5 drag-and-drop)
- Draggable/resizable windows using `react-rnd`, macOS-style traffic light buttons (close/min/max)
- Per-window URL bar with external link, Share button (copy link), Chain dropdown
- Install button in title bar for non-installed dapps opened via URL params
- Iframe state preserved on minimize (visibility: hidden, not unmount)
- Iframe focus detection (blur event) to bring clicked window to front
- System windows: Swap WCHAN (SwapWchanPanel), Stake (StakingPanel) — render React components, not iframes
- Custom URL dapps: install via App Store URL input, persist to localStorage, desktop icon + context menu
- Start Menu with vertical branding strip, installed apps, App Store, About
- WalletChan Mascot with speech bubbles, cycling tips, Framer Motion animations, dismissable
- About Dialog (Win95 style: icon, version, tagline, OK button)
- Context Menu: right-click desktop (App Store, About), right-click icon (Open, Uninstall)
- ⚡ badge on auto-connect dapp icons
- `localStorage` persistence for installed apps, custom apps, window positions/sizes, focused window (`@wchan/os-state`)
- Hydration-safe initialization (defaults on server, localStorage in useEffect)
- CSS breakpoint switching (no useBreakpointValue) to avoid white flash
- Cascade offset for new windows (40px diagonal, cycling every 8)

### Key Files
| File | Purpose |
|------|---------|
| `app/os/os/types.ts` | WindowState, CustomApp, DesktopPersistedState, defaults |
| `app/os/os/win95styles.ts` | Style constants, border helpers, button styles, gradient wallpaper |
| `app/os/os/useDesktopState.ts` | Core state hook: windows, focus, install/uninstall, reorder, persistence |
| `app/os/os/Desktop.tsx` | Desktop surface: icon grid, windows layer, context menu, mascot, about dialog |
| `app/os/os/Win95Window.tsx` | Draggable/resizable window with traffic lights, URL bar, chain selector, share |
| `app/os/os/Taskbar.tsx` | Bottom bar: Start button + Start Menu, window buttons, system tray |
| `app/os/os/MenuBar.tsx` | Top bar: WalletChan OS branding + $WCHAN MCap + Buy/Sell + ConnectButton |
| `app/os/os/StartMenu.tsx` | Classic Win95 Start Menu with vertical branding strip |
| `app/os/os/DesktopIcon.tsx` | Desktop shortcut icon (double-click, drag-reorder, ⚡ badge) |
| `app/os/os/AppStoreContent.tsx` | App Store window content (search/filter/install grid, custom URL card) |
| `app/os/os/SwapWchanPanel.tsx` | Standalone WCHAN buy/sell panel (reuses WchanBuyContent) |
| `app/os/os/StakingPanel.tsx` | Standalone staking UI (deposit/withdraw/claim) |
| `app/os/os/AboutDialog.tsx` | Win95-style About dialog |
| `app/os/os/ContextMenu.tsx` | Right-click context menu (desktop + icon) |
| `app/os/os/WalletChanMascot.tsx` | Animated mascot with tips speech bubble |
| `app/os/components/IframeContent.tsx` | Extracted iframe rendering (used by both windows and mobile) |
| `app/os/components/IframeApp.tsx` | Fullscreen iframe wrapper (mobile fallback) |

### URL Parameters
`?url=<dapp-url>&chainId=<number>` — auto-opens the dapp in a window on page load.

### Mobile
Below `md` breakpoint: simple icon grid + fullscreen IframeApp. No windowing.
