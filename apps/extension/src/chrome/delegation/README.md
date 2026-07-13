# EIP-7702 delegation audit domain

Stable root paths are export-only compatibility facades:

- `delegationHandlers.ts`
- `delegationStorage.ts`
- `delegatedAuthorityPolicy.ts`

Focused ownership:

- `types.ts` and `constants.ts` contain response contracts, zero/default
  delegate identities, and the released 50,000 gas limit.
- `status.ts` resolves the exact onchain/default/custom view; `probe.ts` owns
  explicit ERC-7821 compatibility probes.
- `requestConstruction.ts` is the pure self-call request factory.
- `requestQueue.ts` persists before notifying the open wallet UI. Custom Set
  requests hold `WALLET_SECRET_OPERATION_LOCK_KEY` and pass the captured auth
  epoch into pending-request storage for a final master check.
- `setRequest.ts` owns PK/seed eligibility, target validation, custom master
  capture, submit-time ERC-7821 re-probe, and stale-auth error mapping.
- `revokeRequest.ts` owns routine agent-capable zero-delegate requests.
- `authorityPolicy.ts` distinguishes canonical-default automatic repair from
  persistent custom authority and is shared by ERC-7715/local broadcast paths.
- `storage.ts` owns only the lowercase `customDelegates` UI mirror and
  serializes every mutation under `local:customDelegates`.

The mirror is never a signing input. Runtime execution trusts live EOA code and
the canonical default registry. Handlers enqueue pinned internal requests; they
do not sign or broadcast.
