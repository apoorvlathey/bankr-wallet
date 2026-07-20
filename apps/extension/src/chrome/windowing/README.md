# Extension windowing audit domain

This domain owns how an already-authorized WalletChan request is presented. It
does not authorize requests, read pending-request payloads, or touch wallet
secrets.

- `browserCapabilities.ts` detects the complete Chromium side-panel API without
  vendor allowlisting and owns the Firefox-safe `POPUP_PATH` constant.
- `modePolicy.ts` contains pure runtime, startup, and fullscreen policies.
- `chromeAdapter.ts` is the sole Chrome storage/action/window effect adapter.
- `modeTransitions.ts` preserves `sidePanelMode`/`isArcBrowser` semantics,
  action-popup ordering, and detached-popup-before-panel-close transitions.
- `initialization.ts` disables `openPanelOnActionClick` and restores the stored
  mode safely at service-worker startup.
- `requestSidePanel.ts` performs existing-view ping, side-panel opening, the
  600 ms verification delay, and `getContexts`/ping fallback.
- `popupGeometry.ts` owns fixed size and same-monitor work-area clamping.
- `popupWindow.ts` owns existing-window reuse, focus, placement, and creation.
- `providerRequestSurface.ts` owns the synchronous,
  user-activation-preserving side-panel open effect for transaction, batch,
  signature, and ERC-7715 approval requests. It also owns the window-scoped,
  one-shot cold-renderer request hint and the fullscreen notification fallback
  used when Chrome has already consumed the gesture.
- `requestSurface.ts` resolves the sender window and selects the verified panel
  or popup fallback.
- `types.ts` contains the small shared contracts.

`../sidepanelManager.ts` and `../extensionPopup.ts` are export-only historical
facades. New implementations and tests must import this domain directly.

Chrome and Brave are side-panel-capable when both required API methods exist.
Arc remains popup-only through the separately detected `isArcBrowser` policy;
Firefox remains popup-only because it does not expose `chrome.sidePanel`.

`sidePanelVerified` remains a released legacy sync-storage field, but runtime
windowing does not read or write it. Do not delete, reinterpret, or restore it
without a separately reviewed storage migration and browser-compatibility
change. `sidePanelMode` and `isArcBrowser` retain their released shapes.
