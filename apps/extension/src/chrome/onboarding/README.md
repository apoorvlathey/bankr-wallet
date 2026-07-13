# Fresh-wallet onboarding audit domain

`../onboardingInitialization.ts` is the only supported root import path. It is
an export-only compatibility facade over three reviewable layers:

1. `state.ts` — frozen marker codec, authoritative-data detection, structural
   completeness, owner checks, and safe rollback cleanup.
2. `lifecycle.ts` — begin/status/complete/rollback orchestration under the
   wallet-secret and marker locks. It creates no cryptographic material.
3. `credential.ts` — marker-owner-checked first vault-key wrapper and encrypted
   credential commit, followed by master-session hydration.

## Dependency direction

```text
state
  ↓
lifecycle

state → credential

state + lifecycle + credential → root facade → background router
```

`state.ts` does not import either effect orchestrator. `lifecycle.ts` cannot
create or encrypt a vault key, and `credential.ts` cannot complete or roll back
the onboarding transaction. Every persistent mutation remains serialized and
owner-bound.

The storage key and marker shape remain exactly
`onboardingInitialization: { version: 1, id, startedAt }`. Missing markers on
older installs remain normal; this file move introduces no migration and does
not alter any message or storage schema.
