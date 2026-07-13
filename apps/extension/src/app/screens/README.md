# Application screen adapters

- `WaitingForOnboardingScreen.tsx` renders the setup handoff and owns only the
  browser-tab effect needed to reopen/focus onboarding.

Screen adapters receive route state from `App.tsx`; they do not subscribe to
wallet storage or own request/account routing.
