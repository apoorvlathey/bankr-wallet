# Windowing boundary tests

This directory freezes popup/side-panel behavior independently of transaction
and background routing:

- `policy.test.ts` covers Chrome/Brave API capability detection, partial-API and
  Firefox fallback, popup-path selection, startup defaults, Arc suppression,
  and fullscreen request policy.
- `modeEffects.test.ts` freezes sync-storage/action-popup effect order,
  detached-popup-before-panel-close transitions, and startup fallbacks.
- `requestSurface.test.ts` covers sender-window targeting, existing-view ping,
  600 ms side-panel verification, `getContexts` fallback, and popup fallback.
- `popupWindow.test.ts` covers existing-window reuse plus multi-monitor and
  constrained-work-area geometry.
- `architecture.test.ts` freezes the two historical facade identities, one-way
  dependencies, domain layout, and per-file audit budgets.

No module in this domain may own request authorization or pending-request
state. It receives an already-authorized need to present WalletChan and owns
only browser capability, display-mode preference, and Chrome window effects.
