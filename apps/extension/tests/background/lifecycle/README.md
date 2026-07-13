# Background lifecycle tests

The lifecycle suite mirrors `src/chrome/background/lifecycle/` and freezes:

- lifecycle module inventory and audit-size ceilings;
- root registration order around the still-inline ordered message pipeline;
- suspend, expiry, stale-result, cache-prune, badge, and auto-lock startup order;
- install/update migration and fresh-install ordering;
- transaction/bridge/force/ENS/WalletConnect recovery order;
- tab-account, action fallback, trusted-port, and notification-click behavior.

Domain services retain their own tests. These tests cover only registration,
argument forwarding, effect ordering, and fail-safe fallback behavior.
