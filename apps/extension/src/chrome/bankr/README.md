# Bankr remote-authority audit domain

Bankr API credentials authorize a remote signer. Review this directory in
dependency order:

1. `response.ts` — bounded response/error schemas; no storage or network.
2. `transport.ts` — redirect-denying, deadline/byte-bounded Bankr HTTP text
   transport and transport-error normalization.
3. `signing.ts` — personal/typed-data request mapping plus recovered-signer
   verification. Raw `eth_sign` remains rejected.
4. `submission.ts` — reviewed signer challenge, gas-field omission, secret-lock
   start boundary, and ambiguous irreversible-submit outcomes.
5. `jobs.ts` — bounded job IDs, polling, cancellation, and normalized status.
6. `credentialBinding.ts` — non-secret tags over authenticated ciphertext
   generations for pending requests.
7. `pendingAuthorization.ts` — final pinned account/origin/credential gate before
   submission starts.
8. `chat/` — Bankr-agent prompt transport, durable chat records, and background
   polling orchestration.

`client.ts` is an export-only aggregate within this domain. Bankr and chat have
no Chrome-root implementation or compatibility files; callers import focused
`bankr/*` modules.

## Dependency direction

```text
response → transport
   ↓          ↓
signing → submission
   ↓
jobs → chat/client

credential binding + pending account policy → pending authorization
```

Response validation never imports fetch, Chrome storage, sessions, or account
state. The transport cannot inspect wallets or pending requests. The API key is
never persisted here; credential ciphertext remains owned by the existing
crypto/auth storage boundary.
