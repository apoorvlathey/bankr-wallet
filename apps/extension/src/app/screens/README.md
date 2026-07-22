# Application screen adapters

- `WaitingForOnboardingScreen.tsx` renders the setup handoff and owns only the
  browser-tab effect needed to reopen/focus onboarding.
- `CrossDappBatchRequestScreen.tsx` owns the cross-dapp confirmation shell and
  delegates request routing and decisions to App-provided callbacks.
- `PrivacyActionRoute.tsx` owns the shared extension frame and lazy boundary for
  Shield, Unshield, and deposit status while App retains route/auth/activity
  decisions.
- `TransactionDetailRoute.tsx` owns the shared extension frame and lazy
  boundary for ordinary and Unshield transaction-detail screens; both receive
  App-owned back and follow-up callbacks.

Screen adapters receive route state from `App.tsx`; they do not subscribe to
wallet storage or own request/account routing.
