# Background lifecycle audit map

These modules register Chrome/service-worker lifecycle callbacks or run the
released immediate startup sequence. They receive domain effects explicitly;
none owns wallet business policy.

Review in service-worker execution order:

1. `storageAuthLock.ts` — permission-lock and auto-lock cache refresh.
2. `tabAccounts.ts` — activated/updated/removed/replaced tab account scope and
   the account-to-tab compatibility message.
3. `maintenance.ts` — suspend secret clearing, one-minute cleanup for
   short-lived WalletConnect claims and already-terminal response routes,
   stale-result cleanup, cache pruning, bundle cleanup, badge init, and
   auto-lock cache hydration. User-review prompts are never age-pruned.
4. `installUpdate.ts` — install defaults/theme/onboarding plus idempotent legacy
   account and Optimism registry migrations.
5. `startupRecovery.ts` — sidepanel initialization, transaction/bridge/force
   recovery, ENS/WalletConnect startup, and browser-startup WalletConnect init.
6. `actionFallback.ts` — action-click sidepanel verification and popup fallback.
7. `trustedUiPorts.ts` — exact-sender wake/keepalive ports.
8. `../composition/lifecycle.ts` registers the ordered `../messagePipeline.ts` listener.
9. `notificationClicks.ts` — explorer navigation, transaction-error popup, and
   notification cleanup.

Lifecycle composition calls these registration/start functions in that exact
order. Tests freeze both registration order and immediate startup effect order.
